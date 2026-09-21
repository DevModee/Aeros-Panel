import { useState, useEffect, useRef } from 'react';
import { Terminal as TerminalIcon, Play, Square, RotateCw, Plus, Power } from 'lucide-react';

interface Project {
    id: number;
    name: string;
    service_name: string;
    repository: string;
    branch: string;
    status: string;
    autostart: number;
}

export function Projects() {
    const [projects, setProjects] = useState<Project[]>([]);
    const [selectedProject, setSelectedProject] = useState<Project | null>(null);
    const [logs, setLogs] = useState<string[]>([]);
    const wsRef = useRef<WebSocket | null>(null);
    const logsEndRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        fetchProjects();
    }, []);

    useEffect(() => {
        if (selectedProject) {
            connectWebSocket(selectedProject.service_name);
            const updated = projects.find(p => p.id === selectedProject.id);
            if (updated) setSelectedProject(updated);
        }
        return () => {
            if (wsRef.current) {
                wsRef.current.close();
            }
        };
    }, [selectedProject?.id, projects]);

    useEffect(() => {
        logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [logs]);

    const fetchProjects = async () => {
        try {
            const response = await fetch(`http://${window.location.hostname}:3000/api/projects`);
            const data = await response.json();
            setProjects(data);
        } catch (error) {
            console.error(error);
        }
    };

    const connectWebSocket = (serviceName: string) => {
        if (wsRef.current) wsRef.current.close();
        setLogs([]);
        
        const ws = new WebSocket(`ws://${window.location.hostname}:3000?service=${serviceName}`);
        ws.onmessage = (event) => {
            setLogs((prev) => [...prev, event.data].slice(-100));
        };
        wsRef.current = ws;
    };

    const handleAction = async (action: 'start' | 'stop' | 'restart') => {
        if (!selectedProject) return;
        try {
            await fetch(`http://${window.location.hostname}:3000/api/projects/${selectedProject.id}/${action}`, {
                method: 'POST'
            });
            fetchProjects();
        } catch (error) {
            console.error(error);
        }
    };

    const toggleAutostart = async () => {
        if (!selectedProject) return;
        try {
            const newStatus = !selectedProject.autostart;
            await fetch(`http://${window.location.hostname}:3000/api/projects/${selectedProject.id}/autostart`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ enabled: newStatus })
            });
            fetchProjects();
        } catch (error) {
            console.error(error);
        }
    };

    return (
        <div className="max-w-6xl mx-auto font-mono flex flex-col h-full">
            <header className="mb-6 border-b border-panel-border pb-4 flex justify-between items-end">
                <div>
                    <h2 className="text-3xl font-bold text-cyan-500 tracking-widest mb-2">ACTIVE_PROJECTS</h2>
                    <p className="text-gray-400">Manage deployments and systemd services.</p>
                </div>
                <button className="border border-panel-border px-4 py-2 text-cyan-500 hover:bg-panel-border transition-colors flex items-center">
                    <Plus size={16} className="mr-2" />
                    NEW_PROJECT
                </button>
            </header>

            <div className="flex gap-6 flex-1 min-h-0">
                <div className="w-1/3 border border-panel-border bg-black overflow-y-auto">
                    {projects.map((p) => (
                        <div 
                            key={p.id} 
                            onClick={() => setSelectedProject(p)}
                            className={`p-4 border-b border-panel-border cursor-pointer hover:bg-panel-bg transition-colors ${selectedProject?.id === p.id ? 'border-l-2 border-l-cyan-500' : ''}`}
                        >
                            <div className="flex justify-between items-center mb-2">
                                <span className="font-bold text-gray-200">{p.name}</span>
                                <span className={`text-xs px-2 py-1 ${p.status === 'active' ? 'bg-neon-green/10 text-neon-green' : 'bg-red-500/10 text-red-500'}`}>
                                    {p.status.toUpperCase()}
                                </span>
                            </div>
                            <div className="text-xs text-gray-500 flex justify-between">
                                <span>{p.service_name}</span>
                                {p.autostart ? <span className="text-cyan-500 text-[10px]">AUTOSTART</span> : null}
                            </div>
                        </div>
                    ))}
                    {projects.length === 0 && (
                        <div className="p-8 text-center text-gray-500">NO_PROJECTS_FOUND</div>
                    )}
                </div>

                <div className="w-2/3 border border-panel-border bg-black flex flex-col">
                    {selectedProject ? (
                        <>
                            <div className="p-4 border-b border-panel-border flex justify-between items-center bg-panel-bg">
                                <span className="text-cyan-500 font-bold">{selectedProject.name} // TERMINAL</span>
                                <div className="flex gap-2">
                                    <button 
                                        onClick={toggleAutostart} 
                                        className={`p-2 border border-panel-border flex items-center text-xs px-3 hover:bg-panel-border ${selectedProject.autostart ? 'text-cyan-500' : 'text-gray-500'}`}
                                        title="Toggle Boot Autostart"
                                    >
                                        <Power size={14} className="mr-2" />
                                        AUTOSTART
                                    </button>
                                    <button onClick={() => handleAction('start')} className="p-2 border border-panel-border text-neon-green hover:bg-panel-border"><Play size={16} /></button>
                                    <button onClick={() => handleAction('restart')} className="p-2 border border-panel-border text-yellow-500 hover:bg-panel-border"><RotateCw size={16} /></button>
                                    <button onClick={() => handleAction('stop')} className="p-2 border border-panel-border text-red-500 hover:bg-panel-border"><Square size={16} /></button>
                                </div>
                            </div>
                            <div className="flex-1 p-4 overflow-y-auto text-xs text-gray-300 bg-[#050505]">
                                {logs.map((log, i) => (
                                    <div key={i} className="mb-1 whitespace-pre-wrap">{log}</div>
                                ))}
                                <div ref={logsEndRef} />
                            </div>
                        </>
                    ) : (
                        <div className="flex-1 flex items-center justify-center text-gray-500">
                            <TerminalIcon className="mr-3" />
                            SELECT_PROJECT_TO_VIEW_CONSOLE
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
