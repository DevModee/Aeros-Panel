import { useState, useEffect, useRef, useCallback } from 'react';
import {
    Terminal as TerminalIcon,
    Play,
    Square,
    RotateCw,
    Plus,
    Power,
    FileText,
    Save,
    X,
    Trash2,
    Rocket
} from 'lucide-react';
import { apiFetch, ApiError, buildWsUrl } from '../lib/api';
import { NewProjectModal } from '../components/NewProjectModal';

interface Project {
    id: number;
    name: string;
    service_name: string;
    repository: string | null;
    branch: string;
    status: string;
    autostart: number;
    env_vars: string | null;
    template?: string;
    work_dir?: string | null;
    memory_max?: string | null;
    last_deploy_at?: string | null;
    deploying?: boolean;
}

export function Projects() {
    const [projects, setProjects] = useState<Project[]>([]);
    const [selectedProjectId, setSelectedProjectId] = useState<number | null>(null);
    const [logs, setLogs] = useState<string[]>([]);
    const [isEditingEnv, setIsEditingEnv] = useState(false);
    const [envContent, setEnvContent] = useState('');
    const [isNewModalOpen, setIsNewModalOpen] = useState(false);
    const [deployingService, setDeployingService] = useState<string | null>(null);
    const [notice, setNotice] = useState<string | null>(null);
    const wsRef = useRef<WebSocket | null>(null);
    const logsEndRef = useRef<HTMLDivElement>(null);

    const selectedProject = projects.find((p) => p.id === selectedProjectId) ?? null;
    const selectedServiceName = selectedProject?.service_name ?? null;
    const isSelectedDeploying = Boolean(
        selectedProject && (selectedProject.deploying || deployingService === selectedProject.service_name)
    );

    const fetchProjects = useCallback(async () => {
        try {
            const data = await apiFetch<Project[]>('/api/projects');
            setProjects(data);
        } catch (error) {
            console.error(error);
        }
    }, []);

    useEffect(() => {
        let active = true;
        apiFetch<Project[]>('/api/projects')
            .then((data) => {
                if (active) setProjects(data);
            })
            .catch((error) => {
                console.error(error);
            });
        return () => {
            active = false;
        };
    }, []);

    useEffect(() => {
        if (!selectedServiceName || isEditingEnv) {
            return;
        }

        const ws = new WebSocket(buildWsUrl({ service: selectedServiceName }));
        ws.onmessage = (event) => {
            const msg = String(event.data);
            setLogs((prev) => [...prev, msg].slice(-300));
            if (msg.includes('[DEPLOY] Completed') || msg.includes('[DEPLOY] FAILED')) {
                setDeployingService((curr) => (curr === selectedServiceName ? null : curr));
                void fetchProjects();
            }
        };
        wsRef.current = ws;

        return () => {
            ws.close();
            if (wsRef.current === ws) {
                wsRef.current = null;
            }
        };
    }, [selectedServiceName, isEditingEnv, fetchProjects]);

    useEffect(() => {
        logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [logs]);

    const handleSelectProject = (project: Project) => {
        if (project.id !== selectedProjectId) {
            setLogs([]);
            setIsEditingEnv(false);
            setSelectedProjectId(project.id);
        }
    };

    const handleAction = async (action: 'start' | 'stop' | 'restart') => {
        if (!selectedProject) return;
        try {
            await apiFetch(`/api/projects/${selectedProject.id}/${action}`, {
                method: 'POST'
            });
            fetchProjects();
        } catch (error) {
            console.error(error);
        }
    };

    const handleDeploy = async () => {
        if (!selectedProject || isSelectedDeploying) return;
        setNotice(null);
        setIsEditingEnv(false);
        setDeployingService(selectedProject.service_name);

        try {
            await apiFetch(`/api/projects/${selectedProject.id}/deploy`, {
                method: 'POST'
            });
        } catch (error) {
            setDeployingService(null);
            const message = error instanceof ApiError ? error.message : 'Failed to start deployment.';
            setNotice(message);
        }
    };

    const toggleAutostart = async () => {
        if (!selectedProject) return;
        try {
            const newStatus = !selectedProject.autostart;
            await apiFetch(`/api/projects/${selectedProject.id}/autostart`, {
                method: 'POST',
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
            await apiFetch(`/api/projects/${selectedProject.id}/env`, {
                method: 'POST',
                body: JSON.stringify({ env_vars: envContent })
            });
            await fetchProjects();
            setIsEditingEnv(false);
        } catch (error) {
            console.error(error);
        }
    };

    const handleProjectCreated = async (createdId: number, warning?: string) => {
        await fetchProjects();
        setLogs([]);
        setIsEditingEnv(false);
        setSelectedProjectId(createdId);
        setNotice(warning || 'Project created and systemd service configured.');
    };

    const formatDeployTime = (iso: string) => {
        const d = new Date(iso);
        return Number.isNaN(d.getTime()) ? iso : d.toLocaleString();
    };

    return (
        <div className="max-w-6xl mx-auto flex flex-col h-full">
            <header className="mb-6 flex justify-between items-end">
                <div>
                    <h2 className="text-3xl font-bold text-aeros-blue tracking-widest mb-2">ACTIVE_PROJECTS</h2>
                    <p className="text-gray-400 font-mono">Manage deployments and systemd services.</p>
                </div>
                <button
                    onClick={() => setIsNewModalOpen(true)}
                    className="border border-aeros-gray text-white bg-transparent hover:border-aeros-blue hover:text-aeros-blue transition-colors cursor-pointer flex items-center px-4 py-2 font-mono text-sm"
                >
                    <Plus size={16} className="mr-2" />
                    NEW_PROJECT
                </button>
            </header>

            {notice && (
                <div className="mb-4 px-4 py-2.5 border border-aeros-blue/50 bg-[#001422] text-xs text-gray-200 font-mono flex justify-between items-center">
                    <span>{notice}</span>
                    <button
                        onClick={() => setNotice(null)}
                        className="text-gray-400 hover:text-white bg-transparent border-0 cursor-pointer ml-4"
                    >
                        <X size={14} />
                    </button>
                </div>
            )}

            <div className="flex gap-6 flex-1 min-h-0">
                <div className="w-1/3 terminal-card border-aeros-gray overflow-y-auto !p-6 bg-[#050505]">
                    <div className="text-aeros-blue flex items-center mb-6 font-bold text-lg">
                        PROJECT_LIST
                    </div>
                    <div className="list-group">
                        {projects.map((p) => (
                            <div
                                key={p.id}
                                onClick={() => handleSelectProject(p)}
                                className={`list-group-item cursor-pointer flex flex-col p-4 border-b border-aeros-gray hover:bg-aeros-gray transition-colors ${selectedProject?.id === p.id ? 'bg-aeros-gray border-l-2 border-l-aeros-purple' : ''}`}
                            >
                                <div className="flex justify-between items-center mb-2 font-mono">
                                    <span className="font-bold text-white">{p.name}</span>
                                    <span className={`text-xs px-2 py-1 ${p.status === 'active' ? 'bg-green-900 text-green-400' : 'bg-red-900 text-red-400'}`}>
                                        {p.status.toUpperCase()}
                                    </span>
                                </div>
                                <div className="text-xs text-gray-400 flex justify-between items-center font-mono">
                                    <span>{p.service_name}</span>
                                    <div className="flex items-center gap-2">
                                        {p.template && (
                                            <span className="text-[10px] px-1.5 py-0.5 border border-aeros-gray text-aeros-blue uppercase">
                                                {p.template}
                                            </span>
                                        )}
                                        {p.autostart ? <span className="text-aeros-purple font-bold">AUTOSTART</span> : null}
                                    </div>
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
                            <header className="flex justify-between items-center gap-2 flex-wrap">
                                <span className="text-aeros-blue font-bold font-mono">
                                    {selectedProject.name} // {isEditingEnv ? 'EDIT_ENV' : 'TERMINAL'}
                                </span>
                                {!isEditingEnv ? (
                                    <div className="flex gap-2 flex-wrap">
                                        <button
                                            onClick={handleDeploy}
                                            disabled={isSelectedDeploying}
                                            className="btn btn-default py-1 px-2 text-xs flex items-center bg-transparent border-aeros-blue text-aeros-blue hover:bg-aeros-blue hover:text-black cursor-pointer disabled:opacity-50"
                                            title="Git pull, build if needed, and restart service"
                                        >
                                            <Rocket size={14} className={`mr-2 ${isSelectedDeploying ? 'animate-pulse' : ''}`} />
                                            {isSelectedDeploying ? 'DEPLOYING...' : 'DEPLOY'}
                                        </button>
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
                                        <button onClick={() => handleAction('start')} className="btn btn-default py-1 px-2 bg-transparent text-green-500 border-aeros-gray hover:border-green-500 cursor-pointer" title="Start"><Play size={14} /></button>
                                        <button onClick={() => handleAction('restart')} className="btn btn-default py-1 px-2 bg-transparent text-yellow-500 border-aeros-gray hover:border-yellow-500 cursor-pointer" title="Restart"><RotateCw size={14} /></button>
                                        <button onClick={() => handleAction('stop')} className="btn btn-default py-1 px-2 bg-transparent text-red-500 border-aeros-gray hover:border-red-500 cursor-pointer" title="Stop"><Square size={14} /></button>
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

                            <div className="px-4 py-2 border-b border-aeros-gray bg-black text-[11px] text-gray-400 font-mono flex flex-wrap gap-x-4 gap-y-1">
                                <span>UNIT: <span className="text-gray-200">{selectedProject.service_name}.service</span></span>
                                {selectedProject.work_dir && <span>DIR: <span className="text-gray-200">{selectedProject.work_dir}</span></span>}
                                {selectedProject.branch && <span>BRANCH: <span className="text-aeros-blue">{selectedProject.branch}</span></span>}
                                {selectedProject.memory_max && <span>RAM_CAP: <span className="text-aeros-purple">{selectedProject.memory_max}</span></span>}
                                {selectedProject.last_deploy_at && (
                                    <span>LAST_DEPLOY: <span className="text-gray-300">{formatDeployTime(selectedProject.last_deploy_at)}</span></span>
                                )}
                            </div>

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
                                    {logs.map((log, i) => {
                                        const lineColor = log.startsWith('[DEPLOY] FAILED') || log.startsWith('ERROR:')
                                            ? 'text-red-400'
                                            : log.startsWith('[DEPLOY]')
                                                ? 'text-aeros-blue'
                                                : 'text-gray-300';
                                        return (
                                            <div key={i} className={`mb-1 whitespace-pre-wrap ${lineColor}`}>{log}</div>
                                        );
                                    })}
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

            <NewProjectModal
                isOpen={isNewModalOpen}
                onClose={() => setIsNewModalOpen(false)}
                onCreated={handleProjectCreated}
            />
        </div>
    );
}
