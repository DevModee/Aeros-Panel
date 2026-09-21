import { useEffect, useState } from 'react';
import { ProgressBar } from '../components/ProgressBar';
import { Activity, Cpu, HardDrive, Thermometer } from 'lucide-react';

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
                const response = await fetch(`http://${window.location.hostname}:3000/api/system/metrics`);
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
            <div className="flex items-center justify-center h-full text-aeros-blue font-mono">
                <Activity className="animate-spin mr-3" />
                INIT_SYSTEM_MONITOR...
            </div>
        );
    }

    const tempColor = !metrics.thermal.temperature ? 'text-gray-500' : metrics.thermal.temperature > 80 ? 'text-error-color' : 'text-aeros-blue';
    const batteryColor = metrics.battery.status === 'DISCHARGING' ? 'text-yellow-500' : 'text-green-500';

    return (
        <div className="max-w-6xl mx-auto font-mono">
            <header className="mb-8 flex justify-between items-end">
                <div>
                    <h2 className="text-3xl font-bold text-aeros-blue tracking-widest mb-2">SYSTEM DASHBOARD</h2>
                    <p className="text-gray-400">Welcome back, Administrator. All systems nominal. Ready for input.</p>
                </div>
                <div className="text-6xl font-bold text-aeros-gray">01</div>
            </header>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="col-span-1 terminal-card border-aeros-gray">
                    <header className="text-aeros-blue flex items-center">
                        <Cpu className="mr-2" size={18} />
                        RESOURCE_MONITOR
                    </header>
                    <div className="p-4 space-y-4">
                        <ProgressBar 
                            label={`CPU CORE 0 [${metrics.cpu.cores} THREADS]`} 
                            value={metrics.cpu.usage} 
                            color="text-aeros-blue" 
                        />
                        <ProgressBar 
                            label="MEMORY (RAM)" 
                            value={metrics.memory.percentage} 
                            details={`${Math.round(metrics.memory.used / 1024 / 1024)}MB / ${Math.round(metrics.memory.total / 1024 / 1024)}MB`}
                            color="text-yellow-500" 
                        />
                        <ProgressBar 
                            label="STORAGE" 
                            value={metrics.storage.percentage} 
                            details={`${Math.round(metrics.storage.used / 1024 / 1024 / 1024)}GB / ${Math.round(metrics.storage.total / 1024 / 1024 / 1024)}GB`}
                            color="text-error-color" 
                        />
                    </div>
                </div>

                <div className="col-span-1 terminal-card border-aeros-gray">
                    <header className="text-aeros-blue flex items-center">
                        <Thermometer className="mr-2" size={18} />
                        POWER_&_THERMAL
                    </header>
                    <div className="p-4 space-y-6">
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

                <div className="col-span-1 terminal-card border-aeros-gray flex flex-col">
                    <header className="text-aeros-blue flex items-center">
                        <HardDrive className="mr-2" size={18} />
                        SYSTEM_COMMANDS
                    </header>
                    <div className="p-4 grid grid-cols-2 gap-4 mt-auto">
                        <button className="w-full bg-transparent border border-aeros-gray text-gray-300 hover:border-aeros-blue hover:text-aeros-blue transition-colors cursor-pointer text-xs p-2 font-mono">REBOOT_SYS</button>
                        <button className="w-full bg-transparent border border-aeros-gray text-gray-300 hover:border-aeros-blue hover:text-aeros-blue transition-colors cursor-pointer text-xs p-2 font-mono">PANEL_RESTART</button>
                        <button className="w-full bg-transparent border border-aeros-gray text-gray-300 hover:border-aeros-blue hover:text-aeros-blue transition-colors cursor-pointer text-xs p-2 font-mono">CLEAR_CACHE</button>
                        <button className="w-full bg-transparent border border-error-color text-error-color hover:bg-error-color hover:text-white transition-colors cursor-pointer text-xs p-2 font-mono">EMERGENCY_STOP</button>
                    </div>
                </div>
            </div>
        </div>
    );
}
