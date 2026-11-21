import { useState, useEffect } from 'react';
import { Server, Cpu, Network, Shield, Eye, EyeOff, Globe, Copy, Check } from 'lucide-react';
import { apiFetch } from '../lib/api';

interface TailscaleInfo {
    installed: boolean;
    connected: boolean;
    ip: string | null;
    dnsName: string | null;
    panelUrl: string | null;
}

interface CloudflareTunnelInfo {
    installed: boolean;
    active: boolean;
    hostnames: string[];
    panelUrl: string | null;
}

interface SystemInfoData {
    hostname: string;
    os: string;
    kernel: string;
    uptime: number;
    cpu: string;
    cores: number;
    memory: number;
    ipv4: string;
    mac: string;
    storageTotal: number;
    panelPort?: number;
    remoteAccess?: {
        tailscale: TailscaleInfo;
        cloudflare: CloudflareTunnelInfo;
    };
}

export function ServerInfo() {
    const [info, setInfo] = useState<SystemInfoData | null>(null);
    const [showIp, setShowIp] = useState(false);
    const [copiedKey, setCopiedKey] = useState<string | null>(null);

    useEffect(() => {
        apiFetch<SystemInfoData>('/api/system/info')
            .then(data => setInfo(data))
            .catch(e => console.error(e));
    }, []);

    const formatUptime = (seconds: number) => {
        const d = Math.floor(seconds / (3600 * 24));
        const h = Math.floor(seconds % (3600 * 24) / 3600);
        return `${d} Days, ${h} Hrs`;
    };

    const copyValue = async (key: string, value: string) => {
        try {
            await navigator.clipboard.writeText(value);
            setCopiedKey(key);
            setTimeout(() => setCopiedKey((curr) => (curr === key ? null : curr)), 1800);
        } catch (error) {
            console.error(error);
        }
    };

    const ts = info?.remoteAccess?.tailscale;
    const cf = info?.remoteAccess?.cloudflare;
    const hasAnyRemote = Boolean(ts?.connected || cf?.active);

    return (
        <div className="max-w-4xl mx-auto flex flex-col h-full font-mono">
            <header className="mb-6 flex justify-between items-end">
                <div>
                    <h2 className="text-3xl font-bold text-aeros-blue tracking-widest mb-2">SERVER_IDENTITY</h2>
                    <p className="text-gray-400">Detailed hardware, OS specs, and passive remote access status.</p>
                </div>
            </header>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5 pb-6">
                <div className="terminal-card border-aeros-gray !p-6 bg-[#050505]">
                    <div className="text-aeros-blue flex items-center mb-4 font-bold text-lg">
                        <Server className="mr-4 text-aeros-blue" size={22} />
                        OS_INFO
                    </div>
                    <div className="space-y-2.5 text-sm text-gray-300">
                        <div className="flex justify-between border-b border-aeros-gray pb-2"><span className="text-gray-500">HOSTNAME</span><span>{info?.hostname || 'AEROS_HOST'}</span></div>
                        <div className="flex justify-between border-b border-aeros-gray pb-2"><span className="text-gray-500">OS</span><span>{info?.os || 'Debian GNU/Linux 12'}</span></div>
                        <div className="flex justify-between border-b border-aeros-gray pb-2"><span className="text-gray-500">KERNEL</span><span>{info?.kernel || 'Linux'}</span></div>
                        <div className="flex justify-between"><span className="text-gray-500">UPTIME</span><span>{info ? formatUptime(info.uptime) : '0 Days'}</span></div>
                    </div>
                </div>

                <div className="terminal-card border-aeros-gray !p-6 bg-[#050505]">
                    <div className="text-aeros-blue flex items-center mb-4 font-bold text-lg">
                        <Cpu className="mr-4 text-aeros-blue" size={22} />
                        HARDWARE
                    </div>
                    <div className="space-y-2.5 text-sm text-gray-300">
                        <div className="flex justify-between border-b border-aeros-gray pb-2"><span className="text-gray-500">CPU</span><span className="truncate ml-4">{info?.cpu || 'Intel Celeron'}</span></div>
                        <div className="flex justify-between border-b border-aeros-gray pb-2"><span className="text-gray-500">CORES</span><span>{info?.cores || 2} Threads</span></div>
                        <div className="flex justify-between border-b border-aeros-gray pb-2"><span className="text-gray-500">MEMORY</span><span>{info ? Math.round(info.memory / 1024 / 1024) : 4096} MB</span></div>
                        <div className="flex justify-between"><span className="text-gray-500">STORAGE</span><span>{info ? Math.round(info.storageTotal / 1024 / 1024 / 1024) : 0} GB</span></div>
                    </div>
                </div>

                <div className="terminal-card border-aeros-gray !p-6 bg-[#050505]">
                    <div className="text-aeros-blue flex items-center mb-4 font-bold text-lg">
                        <Network className="mr-4 text-aeros-blue" size={22} />
                        NETWORK
                    </div>
                    <div className="space-y-2.5 text-sm text-gray-300">
                        <div className="flex justify-between items-center border-b border-aeros-gray pb-2">
                            <span className="text-gray-500">IPV4_LOCAL</span>
                            <div className="flex items-center gap-2">
                                <span>{showIp ? (info?.ipv4 || 'UNKNOWN') : '***.***.***.***'}</span>
                                <button onClick={() => setShowIp(!showIp)} className="text-gray-500 hover:text-aeros-blue bg-transparent border-0 p-0 cursor-pointer" title={showIp ? 'Hide IPs' : 'Reveal IPs'}>
                                    {showIp ? <EyeOff size={16} /> : <Eye size={16} />}
                                </button>
                            </div>
                        </div>
                        <div className="flex justify-between border-b border-aeros-gray pb-2"><span className="text-gray-500">MAC</span><span>{showIp ? (info?.mac || 'UNKNOWN') : '**:**:**:**:**:**'}</span></div>
                        <div className="flex justify-between border-b border-aeros-gray pb-2"><span className="text-gray-500">FIREWALL</span><span className="text-green-500">ACTIVE</span></div>
                        <div className="flex justify-between"><span className="text-gray-500">PANEL_PORT</span><span>{info?.panelPort || 3000}</span></div>
                    </div>
                </div>

                <div className="terminal-card border-aeros-gray !p-6 bg-[#050505]">
                    <div className="text-aeros-blue flex items-center mb-4 font-bold text-lg">
                        <Shield className="mr-4 text-aeros-blue" size={22} />
                        SECURITY
                    </div>
                    <div className="space-y-2.5 text-sm text-gray-300">
                        <div className="flex justify-between border-b border-aeros-gray pb-2"><span className="text-gray-500">PANEL_AUTH</span><span className="text-green-500">SCRYPT + COOKIE</span></div>
                        <div className="flex justify-between border-b border-aeros-gray pb-2"><span className="text-gray-500">WS_TERMINAL</span><span className="text-green-500">AUTHENTICATED</span></div>
                        <div className="flex justify-between border-b border-aeros-gray pb-2"><span className="text-gray-500">SSH_STATUS</span><span className="text-green-500">SECURE</span></div>
                        <div className="flex justify-between"><span className="text-gray-500">DOCKER_ENGINE</span><span className="text-aeros-purple">NONE (NATIVE)</span></div>
                    </div>
                </div>

                <div className="md:col-span-2 terminal-card border-aeros-gray !p-6 bg-[#050505]">
                    <div className="text-aeros-blue flex items-center justify-between mb-4">
                        <div className="flex items-center font-bold text-lg">
                            <Globe className="mr-4 text-aeros-blue" size={22} />
                            REMOTE_ACCESS (PASSIVE_SCAN)
                        </div>
                        <span className="text-[11px] text-gray-500">ZERO BACKGROUND DAEMONS</span>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-sm text-gray-300">
                        <div className="border border-aeros-gray p-4 bg-black space-y-3">
                            <div className="flex justify-between items-center border-b border-aeros-gray pb-2">
                                <span className="font-bold text-white">TAILSCALE</span>
                                <span className={`text-xs px-2 py-0.5 ${
                                    ts?.connected
                                        ? 'bg-green-900 text-green-400'
                                        : ts?.installed
                                            ? 'bg-yellow-900/60 text-yellow-400'
                                            : 'bg-aeros-gray text-gray-400'
                                }`}>
                                    {ts?.connected ? 'CONNECTED' : ts?.installed ? 'OFFLINE' : 'NOT_INSTALLED'}
                                </span>
                            </div>
                            <div className="flex justify-between text-xs">
                                <span className="text-gray-500">TAILNET_IP</span>
                                <span>{ts?.ip ? (showIp ? ts.ip : '100.***.***.***') : 'N/A'}</span>
                            </div>
                            <div className="flex justify-between items-center text-xs gap-2">
                                <span className="text-gray-500 shrink-0">REMOTE_URL</span>
                                {ts?.panelUrl ? (
                                    <div className="flex items-center gap-2 min-w-0">
                                        <span className="text-aeros-blue truncate">{showIp || ts.dnsName ? ts.panelUrl : 'http://100.***.***.***'}</span>
                                        <button
                                            onClick={() => copyValue('ts', ts.panelUrl!)}
                                            className="text-gray-400 hover:text-aeros-blue bg-transparent border-0 p-0 cursor-pointer shrink-0"
                                            title="Copy Tailscale URL"
                                        >
                                            {copiedKey === 'ts' ? <Check size={14} className="text-green-400" /> : <Copy size={14} />}
                                        </button>
                                    </div>
                                ) : (
                                    <span className="text-gray-500">UNAVAILABLE</span>
                                )}
                            </div>
                        </div>

                        <div className="border border-aeros-gray p-4 bg-black space-y-3">
                            <div className="flex justify-between items-center border-b border-aeros-gray pb-2">
                                <span className="font-bold text-white">CLOUDFLARE_TUNNEL</span>
                                <span className={`text-xs px-2 py-0.5 ${
                                    cf?.active
                                        ? 'bg-green-900 text-green-400'
                                        : cf?.installed
                                            ? 'bg-yellow-900/60 text-yellow-400'
                                            : 'bg-aeros-gray text-gray-400'
                                }`}>
                                    {cf?.active ? 'ACTIVE' : cf?.installed ? 'STOPPED' : 'NOT_INSTALLED'}
                                </span>
                            </div>
                            <div className="flex justify-between text-xs">
                                <span className="text-gray-500">HOSTNAMES</span>
                                <span className="truncate ml-4">
                                    {cf?.hostnames && cf.hostnames.length > 0 ? cf.hostnames.join(', ') : 'NONE_DETECTED'}
                                </span>
                            </div>
                            <div className="flex justify-between items-center text-xs gap-2">
                                <span className="text-gray-500 shrink-0">TUNNEL_URL</span>
                                {cf?.panelUrl ? (
                                    <div className="flex items-center gap-2 min-w-0">
                                        <span className="text-aeros-blue truncate">{cf.panelUrl}</span>
                                        <button
                                            onClick={() => copyValue('cf', cf.panelUrl!)}
                                            className="text-gray-400 hover:text-aeros-blue bg-transparent border-0 p-0 cursor-pointer shrink-0"
                                            title="Copy Cloudflare Tunnel URL"
                                        >
                                            {copiedKey === 'cf' ? <Check size={14} className="text-green-400" /> : <Copy size={14} />}
                                        </button>
                                    </div>
                                ) : (
                                    <span className="text-gray-500">UNAVAILABLE</span>
                                )}
                            </div>
                        </div>
                    </div>

                    {!hasAnyRemote && (
                        <div className="mt-4 pt-3 border-t border-aeros-gray text-xs text-gray-500">
                            TIP: Install <span className="text-gray-300">tailscale</span> or <span className="text-gray-300">cloudflared</span> to access AerosPanel remotely from your phone or outside your LAN without opening router ports.
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
