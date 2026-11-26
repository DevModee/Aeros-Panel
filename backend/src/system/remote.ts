import { execFile } from 'child_process';
import fs from 'fs';
import os from 'os';
import { promisify } from 'util';
import { getServiceStatus } from './systemd';
import { detectCaddy, type CaddyInfo } from './caddy';

const execFileAsync = promisify(execFile);

export interface TailscaleInfo {
    installed: boolean;
    connected: boolean;
    ip: string | null;
    dnsName: string | null;
    panelUrl: string | null;
}

export interface CloudflareTunnelInfo {
    installed: boolean;
    active: boolean;
    hostnames: string[];
    panelUrl: string | null;
}

export interface RemoteAccessInfo {
    tailscale: TailscaleInfo;
    cloudflare: CloudflareTunnelInfo;
    caddy: CaddyInfo;
}

function findTailscaleInterfaceIp(): string | null {
    const interfaces = os.networkInterfaces();
    for (const [name, entries] of Object.entries(interfaces)) {
        if (!entries) continue;
        if (!name.toLowerCase().includes('tailscale') && !name.startsWith('utun')) continue;
        for (const iface of entries) {
            if (iface.family === 'IPv4' && !iface.internal && iface.address.startsWith('100.')) {
                return iface.address;
            }
        }
    }
    return null;
}

function binaryExistsOnDisk(paths: string[]): boolean {
    return paths.some((p) => {
        try {
            return fs.existsSync(p);
        } catch {
            return false;
        }
    });
}

async function detectTailscale(panelPort: number): Promise<TailscaleInfo> {
    const ifaceIp = findTailscaleInterfaceIp();

    try {
        const { stdout } = await execFileAsync('tailscale', ['status', '--json'], { timeout: 1500 });
        const parsed = JSON.parse(stdout);
        const connected = parsed?.BackendState === 'Running';
        const ipList: string[] = Array.isArray(parsed?.Self?.TailscaleIPs) ? parsed.Self.TailscaleIPs : [];
        const ipv4 = ipList.find((addr) => /^\d+\.\d+\.\d+\.\d+$/.test(addr)) || ifaceIp || null;
        const rawDns = typeof parsed?.Self?.DNSName === 'string' ? parsed.Self.DNSName.replace(/\.$/, '') : '';
        const dnsName = rawDns || null;
        const host = dnsName || ipv4;
        const panelUrl = connected && host ? `http://${host}:${panelPort}` : null;

        return {
            installed: true,
            connected,
            ip: ipv4,
            dnsName,
            panelUrl
        };
    } catch (error: any) {
        const installed =
            error?.code !== 'ENOENT' ||
            binaryExistsOnDisk(['/usr/bin/tailscale', '/usr/local/bin/tailscale']);

        if (ifaceIp) {
            return {
                installed: true,
                connected: true,
                ip: ifaceIp,
                dnsName: null,
                panelUrl: `http://${ifaceIp}:${panelPort}`
            };
        }

        return {
            installed,
            connected: false,
            ip: null,
            dnsName: null,
            panelUrl: null
        };
    }
}

function parseCloudflaredConfig(panelPort: number): { hostnames: string[]; panelUrl: string | null } {
    const candidatePaths = [
        '/etc/cloudflared/config.yml',
        '/etc/cloudflared/config.yaml',
        '/root/.cloudflared/config.yml'
    ];

    let raw = '';
    for (const filePath of candidatePaths) {
        try {
            if (fs.existsSync(filePath)) {
                raw = fs.readFileSync(filePath, 'utf8');
                break;
            }
        } catch {}
    }

    if (!raw) {
        return { hostnames: [], panelUrl: null };
    }

    const hostnames: string[] = [];
    let matchedPanelHost: string | null = null;
    let currentHost: string | null = null;

    for (const line of raw.split(/\r?\n/)) {
        const hostMatch = line.match(/^\s*-?\s*hostname:\s*['"]?([a-zA-Z0-9.-]+)['"]?\s*$/);
        if (hostMatch && hostMatch[1]) {
            currentHost = hostMatch[1];
            if (!hostnames.includes(currentHost)) {
                hostnames.push(currentHost);
            }
            continue;
        }

        const serviceMatch = line.match(/^\s*service:\s*['"]?([^\s'"]+)['"]?\s*$/);
        if (serviceMatch && serviceMatch[1] && currentHost) {
            const svc = serviceMatch[1];
            if (svc.includes(`:${panelPort}`)) {
                matchedPanelHost = currentHost;
            }
        }
    }

    const chosenHost = matchedPanelHost || hostnames[0] || null;
    return {
        hostnames,
        panelUrl: chosenHost ? `https://${chosenHost}` : null
    };
}

async function detectCloudflareTunnel(panelPort: number): Promise<CloudflareTunnelInfo> {
    let installed = binaryExistsOnDisk(['/usr/bin/cloudflared', '/usr/local/bin/cloudflared']);

    if (!installed) {
        try {
            await execFileAsync('cloudflared', ['--version'], { timeout: 1200 });
            installed = true;
        } catch (error: any) {
            installed = error?.code !== 'ENOENT';
        }
    }

    if (!installed) {
        return {
            installed: false,
            active: false,
            hostnames: [],
            panelUrl: null
        };
    }

    const status = await getServiceStatus('cloudflared');
    const active = status === 'active';
    const { hostnames, panelUrl } = parseCloudflaredConfig(panelPort);

    return {
        installed: true,
        active,
        hostnames,
        panelUrl: active ? panelUrl : null
    };
}

// Probing spawns up to four processes (tailscale, cloudflared, caddy, systemctl). Spawning blocks the
// event loop, so concurrent /system/info requests starved every other route under load.
// Cache lazily (no timer) and share one in-flight probe between callers.
const REMOTE_INFO_TTL_MS = 30_000;
let cachedRemoteInfo: { port: number; at: number; value: Promise<RemoteAccessInfo> } | null = null;

export function invalidateRemoteAccessInfo(): void {
    cachedRemoteInfo = null;
}

export function getRemoteAccessInfo(panelPort: number): Promise<RemoteAccessInfo> {
    const now = Date.now();
    if (cachedRemoteInfo && cachedRemoteInfo.port === panelPort && now - cachedRemoteInfo.at < REMOTE_INFO_TTL_MS) {
        return cachedRemoteInfo.value;
    }

    const value = probeRemoteAccess(panelPort);
    cachedRemoteInfo = { port: panelPort, at: now, value };
    value.catch(() => {
        if (cachedRemoteInfo?.value === value) cachedRemoteInfo = null;
    });
    return value;
}

async function probeRemoteAccess(panelPort: number): Promise<RemoteAccessInfo> {
    const [tailscale, cloudflare, caddy] = await Promise.all([
        detectTailscale(panelPort),
        detectCloudflareTunnel(panelPort),
        detectCaddy()
    ]);

    return { tailscale, cloudflare, caddy };
}
