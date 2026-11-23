import { execFile } from 'child_process';
import fs from 'fs';
import { promises as fsp } from 'fs';
import path from 'path';
import { promisify } from 'util';
import { assertManageableServiceName, getServiceStatus } from './systemd';

const execFileAsync = promisify(execFile);

const CADDY_CONF_DIR = '/etc/caddy/conf.d';
const DOMAIN_PATTERN = /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;

export interface CaddyRoute {
    serviceName: string;
    domain: string;
    port: number;
}

export interface CaddyInfo {
    installed: boolean;
    active: boolean;
    routes: CaddyRoute[];
}

export function validateDomain(rawDomain: string): string {
    const domain = rawDomain.trim().toLowerCase();
    if (!DOMAIN_PATTERN.test(domain)) {
        throw new Error('Invalid domain name. Use a valid FQDN (e.g. app.example.com).');
    }
    return domain;
}

export function validatePort(rawPort: unknown): number {
    const port = typeof rawPort === 'number' ? rawPort : Number(String(rawPort ?? '').trim());
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
        throw new Error('Port must be an integer between 1 and 65535.');
    }
    return port;
}

export function getCaddySnippetPath(serviceName: string): string {
    assertManageableServiceName(serviceName);
    return path.posix.join(CADDY_CONF_DIR, `aeros-${serviceName}.caddy`);
}

export function generateCaddySnippet(rawDomain: string, rawPort: unknown): {
    domain: string;
    port: number;
    content: string;
} {
    const domain = validateDomain(rawDomain);
    const port = validatePort(rawPort);
    const content = [
        '# Managed by AerosPanel',
        `${domain} {`,
        `    reverse_proxy 127.0.0.1:${port}`,
        '}',
        ''
    ].join('\n');

    return { domain, port, content };
}

function readManagedRoutes(): CaddyRoute[] {
    if (process.platform !== 'linux' || !fs.existsSync(CADDY_CONF_DIR)) {
        return [];
    }

    const routes: CaddyRoute[] = [];
    try {
        const files = fs.readdirSync(CADDY_CONF_DIR);
        for (const file of files) {
            const match = /^aeros-(.+)\.caddy$/.exec(file);
            if (!match) continue;
            const serviceName = match[1];
            const raw = fs.readFileSync(path.posix.join(CADDY_CONF_DIR, file), 'utf8');
            const domainMatch = /^([a-z0-9.-]+)\s*\{/m.exec(raw);
            const portMatch = /reverse_proxy\s+127\.0\.0\.1:(\d+)/.exec(raw);
            if (domainMatch && portMatch) {
                routes.push({
                    serviceName,
                    domain: domainMatch[1],
                    port: Number(portMatch[1])
                });
            }
        }
    } catch {}

    return routes;
}

export async function detectCaddy(): Promise<CaddyInfo> {
    let installed = ['/usr/bin/caddy', '/usr/local/bin/caddy'].some((p) => {
        try {
            return fs.existsSync(p);
        } catch {
            return false;
        }
    });

    if (!installed) {
        try {
            await execFileAsync('caddy', ['version'], { timeout: 1200 });
            installed = true;
        } catch (error: any) {
            installed = error?.code !== 'ENOENT';
        }
    }

    if (!installed) {
        return { installed: false, active: false, routes: [] };
    }

    const status = await getServiceStatus('caddy');
    const active = status === 'active';
    return {
        installed: true,
        active,
        routes: active ? readManagedRoutes() : []
    };
}

export async function applyCaddyRoute(
    serviceName: string,
    rawDomain: string,
    rawPort: unknown
): Promise<{ domain: string; port: number; snippetPath: string }> {
    const snippetPath = getCaddySnippetPath(serviceName);
    const { domain, port, content } = generateCaddySnippet(rawDomain, rawPort);

    if (process.platform !== 'linux') {
        throw new Error('Caddy integration requires a Linux host with an active caddy service.');
    }

    const status = await getServiceStatus('caddy');
    if (status !== 'active') {
        throw new Error('Caddy service is not active on this host.');
    }

    await fsp.mkdir(CADDY_CONF_DIR, { recursive: true });
    await fsp.writeFile(snippetPath, content, { mode: 0o644 });
    await execFileAsync('systemctl', ['reload', 'caddy'], { timeout: 10000 });

    return { domain, port, snippetPath };
}

export async function removeCaddyRoute(serviceName: string): Promise<void> {
    const snippetPath = getCaddySnippetPath(serviceName);
    if (process.platform !== 'linux') {
        return;
    }

    try {
        await fsp.unlink(snippetPath);
    } catch (error: any) {
        if (error?.code === 'ENOENT') {
            return;
        }
        throw error;
    }

    const status = await getServiceStatus('caddy');
    if (status === 'active') {
        await execFileAsync('systemctl', ['reload', 'caddy'], { timeout: 10000 });
    }
}
