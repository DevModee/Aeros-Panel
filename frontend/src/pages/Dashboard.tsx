import { useCallback, useEffect, useState } from 'react';
import { ProgressBar } from '../components/ProgressBar';
import { Activity, Cpu, RefreshCw, Server, Thermometer } from 'lucide-react';
import { apiFetch } from '../lib/api';

interface SystemMetrics {
    cpu: { usage: number; cores: number };
    memory: { total: number; used: number; percentage: number };
    storage: { total: number; used: number; percentage: number };
    thermal: { temperature: number | null };
    battery: { percentage: number | null; status: string };
}

interface ProjectSummary {
    id: number;
    name: string;
    service_name: string;
    status: string;
}

interface DashboardProps {
    onNavigate?: (path: string) => void;
}

export function Dashboard({ onNavigate }: DashboardProps) {
    const [metrics, setMetrics] = useState<SystemMetrics | null>(null);
    const [projects, setProjects] = useState<ProjectSummary[]>([]);
    const [refreshing, setRefreshing] = useState(false);

    const loadDashboardData = useCallback(async () => {
        const [metricsData, projectsData] = await Promise.all([
            apiFetch<SystemMetrics>('/api/system/metrics'),
            apiFetch<ProjectSummary[]>('/api/projects')
        ]);
        setMetrics(metricsData);
        setProjects(projectsData);
    }, []);

    const handleManualRefresh = async () => {
        setRefreshing(true);
        try {
            await loadDashboardData();
        } catch (error) {
            console.error(error);
        } finally {
            setRefreshing(false);
        }
    };

    useEffect(() => {
        let active = true;
        const sync = () => {
            Promise.all([
                apiFetch<SystemMetrics>('/api/system/metrics'),
                apiFetch<ProjectSummary[]>('/api/projects')
            ])
                .then(([metricsData, projectsData]) => {
                    if (!active) return;
                    setMetrics(metricsData);
                    setProjects(projectsData);
                })
                .catch((error) => console.error(error));
        };

        sync();
        const interval = setInterval(sync, 5000);
        return () => {
            active = false;
            clearInterval(interval);
        };
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
    const activeCount = projects.filter((p) => p.status === 'active').length;
    const inactiveCount = projects.length - activeCount;

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
                <div className="col-span-1 terminal-card border-aeros-gray !p-8 bg-[#050505]">
                    <div className="text-aeros-blue flex items-center mb-6 font-bold text-lg">
                        <Cpu className="mr-4" size={22} />
                        RESOURCE_MONITOR
                    </div>
                    <div className="space-y-4">
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

                <div className="col-span-1 terminal-card border-aeros-gray !p-8 bg-[#050505]">
                    <div className="text-aeros-blue flex items-center mb-6 font-bold text-lg">
                        <Thermometer className="mr-4" size={22} />
                        POWER_&_THERMAL
                    </div>
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

                <div className="col-span-1 terminal-card border-aeros-gray flex flex-col !p-8 bg-[#050505]">
                    <div className="flex items-center justify-between mb-6">
                        <div className="text-aeros-blue flex items-center font-bold text-lg">
                            <Server className="mr-4" size={22} />
                            ACTIVE_SERVICES
                        </div>
                        <button
                            type="button"
                            onClick={handleManualRefresh}
                            disabled={refreshing}
                            title="Refresh services and metrics"
                            className="bg-transparent border border-aeros-gray text-gray-400 hover:border-aeros-blue hover:text-aeros-blue transition-colors cursor-pointer p-1.5 disabled:opacity-50"
                        >
                            <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} />
                        </button>
                    </div>

                    <div className="grid grid-cols-3 gap-2 mb-4 text-xs border border-aeros-gray p-2.5 bg-[#0a0a0a]">
                        <div>
                            <div className="text-gray-500 text-[10px]">TOTAL</div>
                            <div className="text-white font-bold">{projects.length}</div>
                        </div>
                        <div>
                            <div className="text-gray-500 text-[10px]">ACTIVE</div>
                            <div className="text-green-500 font-bold">{activeCount}</div>
                        </div>
                        <div>
                            <div className="text-gray-500 text-[10px]">INACTIVE</div>
                            <div className={inactiveCount > 0 ? 'text-yellow-500 font-bold' : 'text-gray-400 font-bold'}>
                                {inactiveCount}
                            </div>
                        </div>
                    </div>

                    <div className="space-y-2 flex-1 overflow-y-auto max-h-40 pr-1 text-xs">
                        {projects.length === 0 ? (
                            <div className="text-gray-500 py-3">NO_SERVICES_CONFIGURED</div>
                        ) : (
                            projects.slice(0, 5).map((project) => (
                                <div
                                    key={project.id}
                                    className="flex items-center justify-between border-b border-aeros-gray/60 pb-1.5"
                                >
                                    <span className="text-gray-300 truncate mr-2" title={project.service_name}>
                                        {project.service_name}
                                    </span>
                                    <span
                                        className={`uppercase text-[11px] shrink-0 ${
                                            project.status === 'active'
                                                ? 'text-green-500'
                                                : project.status === 'failed'
                                                    ? 'text-error-color'
                                                    : 'text-gray-500'
                                        }`}
                                    >
                                        {project.status}
                                    </span>
                                </div>
                            ))
                        )}
                    </div>

                    {onNavigate && (
                        <button
                            type="button"
                            onClick={() => onNavigate('projects')}
                            className="mt-4 w-full bg-transparent border border-aeros-gray text-gray-300 hover:border-aeros-blue hover:text-aeros-blue transition-colors cursor-pointer text-[11px] px-3 py-2 font-mono"
                        >
                            MANAGE_PROJECTS
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
}
