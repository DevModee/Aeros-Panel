import React, { useEffect, useState } from 'react';
import { ProgressBar } from '../components/ProgressBar';
import { Activity, Cpu, HardDrive, Battery, Thermometer } from 'lucide-react';

interface SystemMetrics {
    cpu: { usage: number; cores: number };
    memory: { total: number; used: number; percentage: number };
    storage: { total: number; used: number; percentage: number };
    thermal: { temperature: number | null };
    battery: { percentage: number | null; status: string };
}

export function Dashboard() {
    const [metrics, setMetrics] = useState<SystemMetrics | null>(null);

    useEffect(() => {
        const fetchMetrics = async () => {
            try {
                const response = await fetch('http://localhost:3000/api/system/metrics');
                const data = await response.json();
                setMetrics(data);
            } catch (error) {
                console.error(error);
            }
        };

        fetchMetrics();
        const interval = setInterval(fetchMetrics, 5000);
        return () => clearInterval(interval);
    }, []);

    if (!metrics) {
        return (
            <div className="flex items-center justify-center h-full text-cyan-500 font-mono">
                <Activity className="animate-spin mr-3" />
                INIT_SYSTEM_MONITOR...
            </div>
        );
    }

    const tempColor = !metrics.thermal.temperature ? 'text-gray-500' : metrics.thermal.temperature > 80 ? 'text-red-500' : 'text-cyan-500';
    const batteryColor = metrics.battery.status === 'DISCHARGING' ? 'text-yellow-500' : 'text-neon-green';

    return (
        <div className="max-w-6xl mx-auto font-mono">
            <header className="mb-8 border-b border-panel-border pb-6 flex justify-between items-end">
                <div>
                    <h2 className="text-3xl font-bold text-cyan-500 tracking-widest mb-2">SYSTEM DASHBOARD</h2>
                    <p className="text-gray-400">Welcome back, Administrator. All systems nominal. Ready for input.</p>
                </div>
                <div className="text-6xl font-bold text-panel-border">01</div>
            </header>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="col-span-1 border border-panel-border bg-black p-5">
                    <h3 className="text-cyan-500 mb-6 flex items-center border-b border-panel-border pb-2">
                        <Cpu className="mr-2" size={18} />
                        RESOURCE_MONITOR
                    </h3>
                    <ProgressBar label={`CPU CORE 0 [${metrics.cpu.cores} THREADS]`} value={metrics.cpu.usage} color="text-cyan-500" />
                    <ProgressBar label="MEMORY (RAM)" value={metrics.memory.percentage} color="text-yellow-500" />
                    <ProgressBar label="STORAGE" value={metrics.storage.percentage} color="text-red-500" />
                </div>

                <div className="col-span-1 border border-panel-border bg-black p-5">
                    <h3 className="text-cyan-500 mb-6 flex items-center border-b border-panel-border pb-2">
                        <Thermometer className="mr-2" size={18} />
                        POWER_&_THERMAL
                    </h3>
                    <div className="space-y-6">
                        <div>
                            <div className="flex justify-between mb-2 text-sm text-gray-400">
                                <span>THERMAL_ZONE_0</span>
                                <span className={tempColor}>{metrics.thermal.temperature ? `${metrics.thermal.temperature}°C` : 'N/A'}</span>
                            </div>
                        </div>
                        <div>
                            <div className="flex justify-between mb-2 text-sm text-gray-400">
                                <span>BATTERY_STATUS</span>
                                <span className={batteryColor}>{metrics.battery.status}</span>
                            </div>
                            <ProgressBar label="CHARGE_LEVEL" value={metrics.battery.percentage || 0} color={batteryColor} />
                        </div>
                    </div>
                </div>

                <div className="col-span-1 border border-panel-border bg-black p-5 flex flex-col">
                    <h3 className="text-cyan-500 mb-6 flex items-center border-b border-panel-border pb-2">
                        <HardDrive className="mr-2" size={18} />
                        QUICK_ACTIONS
                    </h3>
                    <div className="grid grid-cols-2 gap-4 mt-auto">
                        <button className="border border-panel-border text-gray-300 hover:text-cyan-500 hover:border-cyan-500 py-3 transition-colors">INIT</button>
                        <button className="border border-panel-border text-gray-300 hover:text-neon-green hover:border-neon-green py-3 transition-colors">SAVE</button>
                        <button className="border border-panel-border text-gray-300 hover:text-yellow-500 hover:border-yellow-500 py-3 transition-colors">PAUSE</button>
                        <button className="border border-panel-border text-gray-300 hover:text-red-500 hover:border-red-500 py-3 transition-colors">KILL</button>
                    </div>
                </div>
            </div>
        </div>
    );
}
