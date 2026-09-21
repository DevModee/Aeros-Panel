import { useState, useEffect, useRef } from 'react';
import { Terminal as TerminalIcon, Play, Square, RotateCw, Plus, Power, FileText, Save, X, Trash2 } from 'lucide-react';

interface Project {
    id: number;
    name: string;
    service_name: string;
    repository: string;
    branch: string;
    status: string;
    autostart: number;
    env_vars: string;
}

export function Projects() {
    const [projects, setProjects] = useState<Project[]>([]);
    const [selectedProject, setSelectedProject] = useState<Project | null>(null);
    const [logs, setLogs] = useState<string[]>([]);
    const [isEditingEnv, setIsEditingEnv] = useState(false);
    const [envContent, setEnvContent] = useState('');
    const wsRef = useRef<WebSocket | null>(null);
    const logsEndRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        fetchProjects();
    }, []);

    useEffect(() => {
        if (selectedProject && !isEditingEnv) {
            connectWebSocket(selectedProject.service_name);
            const updated = projects.find(p => p.id === selectedProject.id);
            if (updated) setSelectedProject(updated);
        }
        return () => {
            if (wsRef.current) {
                wsRef.current.close();
            }
        };
    }, [selectedProject?.id, projects, isEditingEnv]);

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

    const openEnvEditor = () => {
        if (!selectedProject) return;
        setEnvContent(selectedProject.env_vars || '');
        setIsEditingEnv(true);
        if (wsRef.current) wsRef.current.close();
    };

    const saveEnv = async () => {
        if (!selectedProject) return;
        try {
            await fetch(`http://${window.location.hostname}:3000/api/projects/${selectedProject.id}/env`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ env_vars: envContent })
            });
            await fetchProjects();
            setIsEditingEnv(false);
        } catch (error) {
            console.error(error);
        }
    };

    const handleNewProject = async () => {
        const url = prompt('Ingresa la URL de clonación de Github (ej: git@github.com:User/Repo.git):');
        if (!url) return;
        const name = prompt('Ingresa un nombre para el proyecto (ej: Mi Bot):');
        if (!name) return;
        
        // Derivar el service_name de la url de github (ej: Repo-Name)
        const parts = url.split('/');
        let serviceName = parts[parts.length - 1].replace('.git', '');
        serviceName = serviceName.replace(/[^a-zA-Z0-9-]/g, '-').toLowerCase();

        try {
            await fetch(`http://${window.location.hostname}:3000/api/projects`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name, service_name: serviceName, repository: url })
            });
            fetchProjects();
        } catch (error) {
            console.error(error);
            alert('Error al crear proyecto');
        }
    };

    return (
        <div className="max-w-6xl mx-auto flex flex-col h-full">
            <header className="mb-6 flex justify-between items-end">
                <div>
                    <h2 className="text-3xl font-bold text-aeros-blue tracking-widest mb-2">ACTIVE_PROJECTS</h2>
                    <p className="text-gray-400 font-mono">Manage deployments and systemd services.</p>
                </div>
                <button onClick={handleNewProject} className="border border-aeros-gray text-white bg-transparent hover:border-aeros-blue hover:text-aeros-blue transition-colors cursor-pointer flex items-center px-4 py-2 font-mono text-sm">
                    <Plus size={16} className="mr-2" />
                    NEW_PROJECT
                </button>
            </header>

            <div className="flex gap-6 flex-1 min-h-0">
                <div className="w-1/3 terminal-card border-aeros-gray overflow-y-auto !p-6 bg-[#050505]">
                    <div className="text-aeros-blue flex items-center mb-6 font-bold text-lg">
                        PROJECT_LIST
                    </div>
                    <div className="list-group">
                        {projects.map((p) => (
                            <div 
                                key={p.id} 
                                onClick={() => setSelectedProject(p)}
                                className={`list-group-item cursor-pointer flex flex-col p-4 border-b border-aeros-gray hover:bg-aeros-gray transition-colors ${selectedProject?.id === p.id ? 'bg-aeros-gray border-l-2 border-l-aeros-purple' : ''}`}
                            >
                                <div className="flex justify-between items-center mb-2 font-mono">
                                    <span className="font-bold text-white">{p.name}</span>
                                    <span className={`text-xs px-2 py-1 ${p.status === 'active' ? 'bg-green-900 text-green-400' : 'bg-red-900 text-red-400'}`}>
                                        {p.status.toUpperCase()}
                                    </span>
                                </div>
                                <div className="text-xs text-gray-400 flex justify-between font-mono">
                                    <span>{p.service_name}</span>
                                    {p.autostart ? <span className="text-aeros-purple font-bold">AUTOSTART</span> : null}
                                </div>
                            </div>
                        ))}
                        {projects.length === 0 && (
                            <div className="p-8 text-center text-gray-500 font-mono">NO_PROJECTS_FOUND</div>
                        )}
                    </div>
                </div>

                <div className="w-2/3 terminal-card border-aeros-gray flex flex-col">
                    {selectedProject ? (
                        <>
                            <header className="flex justify-between items-center">
                                <span className="text-aeros-blue font-bold font-mono">
                                    {selectedProject.name} // {isEditingEnv ? 'EDIT_ENV' : 'TERMINAL'}
                                </span>
                                {!isEditingEnv ? (
                                    <div className="flex gap-2">
                                        <button 
                                            onClick={() => setLogs([])}
                                            className="btn btn-default py-1 px-2 text-xs flex items-center bg-transparent border-aeros-gray hover:border-error-color hover:text-error-color cursor-pointer text-gray-500"
                                            title="Clear Terminal"
                                        >
                                            <Trash2 size={14} className="mr-2" />
                                            CLEAR
                                        </button>
                                        <button 
                                            onClick={openEnvEditor} 
                                            className="btn btn-default py-1 px-2 text-xs flex items-center bg-transparent border-aeros-gray hover:border-aeros-blue hover:text-aeros-blue cursor-pointer"
                                            title="Edit .env"
                                        >
                                            <FileText size={14} className="mr-2" />
                                            .env
                                        </button>
                                        <button 
                                            onClick={toggleAutostart} 
                                            className={`btn btn-default py-1 px-2 text-xs flex items-center bg-transparent cursor-pointer ${selectedProject.autostart ? 'border-aeros-purple text-aeros-purple hover:bg-aeros-purple hover:text-white' : 'border-aeros-gray hover:border-aeros-purple hover:text-aeros-purple'}`}
                                            title="Toggle Boot Autostart"
                                        >
                                            <Power size={14} className="mr-2" />
                                            BOOT
                                        </button>
                                        <button onClick={() => handleAction('start')} className="btn btn-default py-1 px-2 bg-transparent text-green-500 border-aeros-gray hover:border-green-500 cursor-pointer"><Play size={14} /></button>
                                        <button onClick={() => handleAction('restart')} className="btn btn-default py-1 px-2 bg-transparent text-yellow-500 border-aeros-gray hover:border-yellow-500 cursor-pointer"><RotateCw size={14} /></button>
                                        <button onClick={() => handleAction('stop')} className="btn btn-default py-1 px-2 bg-transparent text-red-500 border-aeros-gray hover:border-red-500 cursor-pointer"><Square size={14} /></button>
                                    </div>
                                ) : (
                                    <div className="flex gap-2">
                                        <button 
                                            onClick={() => setIsEditingEnv(false)} 
                                            className="btn btn-error py-1 px-2 text-xs flex items-center cursor-pointer bg-red-900 border-red-500 hover:bg-red-500 hover:text-white"
                                        >
                                            <X size={14} className="mr-2" />
                                            CANCEL
                                        </button>
                                        <button 
                                            onClick={saveEnv} 
                                            className="btn btn-primary py-1 px-2 text-xs flex items-center cursor-pointer border-aeros-blue text-aeros-blue hover:bg-aeros-blue hover:text-white bg-transparent"
                                        >
                                            <Save size={14} className="mr-2" />
                                            SAVE_ENV
                                        </button>
                                    </div>
                                )}
                            </header>
                            
                            {isEditingEnv ? (
                                <div className="flex-1 p-4 bg-black flex flex-col">
                                    <div className="text-gray-400 text-xs mb-2 font-mono"># Configura las variables de entorno para {selectedProject.name}</div>
                                    <textarea 
                                        className="flex-1 w-full bg-[#0a0a0a] text-aeros-text p-4 font-mono text-sm border border-aeros-gray focus:border-aeros-purple outline-none resize-none"
                                        value={envContent}
                                        onChange={(e) => setEnvContent(e.target.value)}
                                        placeholder="TOKEN=your_token_here&#10;PORT=8080"
                                        spellCheck="false"
                                    />
                                </div>
                            ) : (
                                <div className="flex-1 p-4 overflow-y-auto text-xs text-gray-300 bg-[#050505] font-mono">
                                    {logs.map((log, i) => (
                                        <div key={i} className="mb-1 whitespace-pre-wrap">{log}</div>
                                    ))}
                                    <div ref={logsEndRef} />
                                </div>
                            )}
                        </>
                    ) : (
                        <div className="flex-1 flex items-center justify-center text-gray-500 font-mono">
                            <TerminalIcon className="mr-3" />
                            SELECT_PROJECT_TO_VIEW_CONSOLE
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
