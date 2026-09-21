import { Server, Cpu, Network, Shield } from 'lucide-react';

export function ServerInfo() {
    return (
        <div className="max-w-4xl mx-auto flex flex-col h-full font-mono">
            <header className="mb-6 flex justify-between items-end">
                <div>
                    <h2 className="text-3xl font-bold text-aeros-blue tracking-widest mb-2">SERVER_IDENTITY</h2>
                    <p className="text-gray-400">Detailed hardware and OS specs.</p>
                </div>
            </header>

            <div className="grid grid-cols-2 gap-6">
                <div className="terminal-card border-aeros-gray p-6">
                    <header className="text-aeros-blue flex items-center mb-4">
                        <Server className="mr-2" size={18} />
                        OS_INFO
                    </header>
                    <div className="space-y-2 text-sm text-gray-300">
                        <div className="flex justify-between border-b border-aeros-gray pb-2"><span className="text-gray-500">HOSTNAME</span><span>AEROS_HOST_01</span></div>
                        <div className="flex justify-between border-b border-aeros-gray pb-2"><span className="text-gray-500">OS</span><span>Debian GNU/Linux 12 (bookworm)</span></div>
                        <div className="flex justify-between border-b border-aeros-gray pb-2"><span className="text-gray-500">KERNEL</span><span>Linux 6.1.0-21-amd64</span></div>
                        <div className="flex justify-between"><span className="text-gray-500">UPTIME</span><span>24 Days, 12 Hrs</span></div>
                    </div>
                </div>

                <div className="terminal-card border-aeros-gray p-6">
                    <header className="text-aeros-blue flex items-center mb-4">
                        <Cpu className="mr-2" size={18} />
                        HARDWARE
                    </header>
                    <div className="space-y-2 text-sm text-gray-300">
                        <div className="flex justify-between border-b border-aeros-gray pb-2"><span className="text-gray-500">CPU</span><span>Intel Celeron N4020</span></div>
                        <div className="flex justify-between border-b border-aeros-gray pb-2"><span className="text-gray-500">CORES</span><span>2 Threads</span></div>
                        <div className="flex justify-between border-b border-aeros-gray pb-2"><span className="text-gray-500">MEMORY</span><span>4096 MB DDR4</span></div>
                        <div className="flex justify-between"><span className="text-gray-500">STORAGE</span><span>64GB eMMC</span></div>
                    </div>
                </div>
                
                <div className="terminal-card border-aeros-gray p-6">
                    <header className="text-aeros-blue flex items-center mb-4">
                        <Network className="mr-2" size={18} />
                        NETWORK
                    </header>
                    <div className="space-y-2 text-sm text-gray-300">
                        <div className="flex justify-between border-b border-aeros-gray pb-2"><span className="text-gray-500">IPV4_LOCAL</span><span>192.168.18.14</span></div>
                        <div className="flex justify-between border-b border-aeros-gray pb-2"><span className="text-gray-500">MAC</span><span>00:1A:2B:3C:4D:5E</span></div>
                        <div className="flex justify-between border-b border-aeros-gray pb-2"><span className="text-gray-500">FIREWALL</span><span className="text-green-500">UFW ACTIVE</span></div>
                        <div className="flex justify-between"><span className="text-gray-500">PORTS</span><span>22, 80, 443, 3000</span></div>
                    </div>
                </div>

                <div className="terminal-card border-aeros-gray p-6">
                    <header className="text-aeros-blue flex items-center mb-4">
                        <Shield className="mr-2" size={18} />
                        SECURITY
                    </header>
                    <div className="space-y-2 text-sm text-gray-300">
                        <div className="flex justify-between border-b border-aeros-gray pb-2"><span className="text-gray-500">SSH_STATUS</span><span className="text-green-500">SECURE</span></div>
                        <div className="flex justify-between border-b border-aeros-gray pb-2"><span className="text-gray-500">ROOT_LOGIN</span><span className="text-red-500">ENABLED</span></div>
                        <div className="flex justify-between border-b border-aeros-gray pb-2"><span className="text-gray-500">FAIL2BAN</span><span className="text-yellow-500">DISABLED</span></div>
                        <div className="flex justify-between"><span className="text-gray-500">SELINUX</span><span>PERMISSIVE</span></div>
                    </div>
                </div>
            </div>
        </div>
    );
}
