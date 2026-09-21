import { useState, useEffect } from 'react';
import { Server, Cpu, Network, Shield, Eye, EyeOff } from 'lucide-react';

export function ServerInfo() {
    const [info, setInfo] = useState<any>(null);
    const [showIp, setShowIp] = useState(false);

    useEffect(() => {
        fetch(`http://${window.location.hostname}:3000/api/system/info`)
            .then(r => r.json())
            .then(data => setInfo(data))
            .catch(e => console.error(e));
    }, []);

    const formatUptime = (seconds: number) => {
        const d = Math.floor(seconds / (3600*24));
        const h = Math.floor(seconds % (3600*24) / 3600);
        return `${d} Days, ${h} Hrs`;
    };

    return (
        <div className="max-w-4xl mx-auto flex flex-col h-full font-mono">
            <header className="mb-6 flex justify-between items-end">
                <div>
                    <h2 className="text-3xl font-bold text-aeros-blue tracking-widest mb-2">SERVER_IDENTITY</h2>
                    <p className="text-gray-400">Detailed hardware and OS specs.</p>
                </div>
            </header>

            <div className="grid grid-cols-2 gap-6">
                <div className="terminal-card border-aeros-gray p-6 bg-[#050505]">
                    <div className="text-aeros-blue flex items-center mb-6 pl-4 font-bold text-lg">
                        <Server className="mr-4 text-aeros-blue" size={22} />
                        OS_INFO
                    </div>
                    <div className="space-y-3 text-sm text-gray-300 px-4">
                        <div className="flex justify-between border-b border-aeros-gray pb-2"><span className="text-gray-500">HOSTNAME</span><span>{info?.hostname || 'AEROS_HOST'}</span></div>
                        <div className="flex justify-between border-b border-aeros-gray pb-2"><span className="text-gray-500">OS</span><span>{info?.os || 'Debian GNU/Linux 12'}</span></div>
                        <div className="flex justify-between border-b border-aeros-gray pb-2"><span className="text-gray-500">KERNEL</span><span>{info?.kernel || 'Linux'}</span></div>
                        <div className="flex justify-between"><span className="text-gray-500">UPTIME</span><span>{info ? formatUptime(info.uptime) : '0 Days'}</span></div>
                    </div>
                </div>

                <div className="terminal-card border-aeros-gray p-6 bg-[#050505]">
                    <div className="text-aeros-blue flex items-center mb-6 pl-4 font-bold text-lg">
                        <Cpu className="mr-4 text-aeros-blue" size={22} />
                        HARDWARE
                    </div>
                    <div className="space-y-3 text-sm text-gray-300 px-4">
                        <div className="flex justify-between border-b border-aeros-gray pb-2"><span className="text-gray-500">CPU</span><span className="truncate ml-4">{info?.cpu || 'Intel Celeron'}</span></div>
                        <div className="flex justify-between border-b border-aeros-gray pb-2"><span className="text-gray-500">CORES</span><span>{info?.cores || 2} Threads</span></div>
                        <div className="flex justify-between border-b border-aeros-gray pb-2"><span className="text-gray-500">MEMORY</span><span>{info ? Math.round(info.memory/1024/1024) : 4096} MB</span></div>
                        <div className="flex justify-between"><span className="text-gray-500">STORAGE</span><span>{info ? Math.round(info.storageTotal/1024/1024/1024) : 0} GB</span></div>
                    </div>
                </div>
                
                <div className="terminal-card border-aeros-gray p-6 bg-[#050505]">
                    <div className="text-aeros-blue flex items-center mb-6 pl-4 font-bold text-lg">
                        <Network className="mr-4 text-aeros-blue" size={22} />
                        NETWORK
                    </div>
                    <div className="space-y-3 text-sm text-gray-300 px-4">
                        <div className="flex justify-between items-center border-b border-aeros-gray pb-2">
                            <span className="text-gray-500">IPV4_LOCAL</span>
                            <div className="flex items-center gap-2">
                                <span>{showIp ? (info?.ipv4 || '192.168.18.14') : '***.***.***.***'}</span>
                                <button onClick={() => setShowIp(!showIp)} className="text-gray-500 hover:text-aeros-blue bg-transparent border-0 p-0 cursor-pointer">
                                    {showIp ? <EyeOff size={16} /> : <Eye size={16} />}
                                </button>
                            </div>
                        </div>
                        <div className="flex justify-between border-b border-aeros-gray pb-2"><span className="text-gray-500">MAC</span><span>{info?.mac || '00:1A:2B:3C:4D:5E'}</span></div>
                        <div className="flex justify-between border-b border-aeros-gray pb-2"><span className="text-gray-500">FIREWALL</span><span className="text-green-500">ACTIVE</span></div>
                        <div className="flex justify-between"><span className="text-gray-500">PORTS</span><span>22, 80, 443, 3000</span></div>
                    </div>
                </div>

                <div className="terminal-card border-aeros-gray p-6 bg-[#050505]">
                    <div className="text-aeros-blue flex items-center mb-6 pl-4 font-bold text-lg">
                        <Shield className="mr-4 text-aeros-blue" size={22} />
                        SECURITY
                    </div>
                    <div className="space-y-3 text-sm text-gray-300 px-4">
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
