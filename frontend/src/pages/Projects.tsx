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
    Rocket,
    Webhook,
    Globe,
    Copy,
    Check
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
    metrics?: { memoryBytes: number | null; cpuUsageNSec: number | null } | null;
    autostart: number;
    template?: string;
    work_dir?: string | null;
    memory_max?: string | null;
    last_deploy_at?: string | null;
    deploying?: boolean;
    has_webhook?: boolean;
    domain?: string | null;
    port?: number | null;
}

export function Projects() {
    const [projects, setProjects] = useState<Project[]>([]);
    const [selectedProjectId, setSelectedProjectId] = useState<number | null>(null);
    const [logs, setLogs] = useState<string[]>([]);
    const [isEditingEnv, setIsEditingEnv] = useState(false);
    const [loadingEnv, setLoadingEnv] = useState(false);
    const [envContent, setEnvContent] = useState('');
    const [isNewModalOpen, setIsNewModalOpen] = useState(false);
    const [isWebhookModalOpen, setIsWebhookModalOpen] = useState(false);
    const [webhookSecret, setWebhookSecret] = useState<string | null>(null);
    const [webhookBusy, setWebhookBusy] = useState(false);
    const [copiedField, setCopiedField] = useState<'url' | 'secret' | null>(null);
    const [caddyActive, setCaddyActive] = useState(false);
    const [isDomainModalOpen, setIsDomainModalOpen] = useState(false);
    const [domainInput, setDomainInput] = useState('');
    const [portInput, setPortInput] = useState('3000');
    const [domainBusy, setDomainBusy] = useState(false);
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
        apiFetch<{ installed: boolean; active: boolean }>('/api/caddy/status')
            .then((data) => {
                if (active) setCaddyActive(Boolean(data.active));
            })
            .catch(() => {});
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
            setIsWebhookModalOpen(false);
            setIsDomainModalOpen(false);
            setWebhookSecret(null);
            setSelectedProjectId(project.id);
        }
    };

    const openDomainModal = () => {
        if (!selectedProject) return;
        setDomainInput(selectedProject.domain || '');
        setPortInput(selectedProject.port ? String(selectedProject.port) : '3000');
        setIsDomainModalOpen(true);
    };

    const saveProjectDomain = async () => {
        if (!selectedProject || domainBusy) return;
        setDomainBusy(true);
        setNotice(null);
        try {
            await apiFetch(`/api/projects/${selectedProject.id}/domain`, {
                method: 'PUT',
                body: JSON.stringify({ domain: domainInput.trim(), port: Number(portInput) })
            });
            setIsDomainModalOpen(false);
            await fetchProjects();
            setNotice(`Configured Caddy HTTPS route for ${domainInput.trim()}.`);
        } catch (error) {
            const message = error instanceof ApiError ? error.message : 'Failed to configure domain.';
            setNotice(message);
        } finally {
            setDomainBusy(false);
        }
    };

    const removeProjectDomain = async () => {
        if (!selectedProject || domainBusy) return;
        setDomainBusy(true);
        setNotice(null);
        try {
            await apiFetch(`/api/projects/${selectedProject.id}/domain`, { method: 'DELETE' });
            setIsDomainModalOpen(false);
            await fetchProjects();
            setNotice('Removed Caddy route for project.');
        } catch (error) {
            const message = error instanceof ApiError ? error.message : 'Failed to remove domain.';
            setNotice(message);
        } finally {
            setDomainBusy(false);
        }
    };

    const openWebhookModal = () => {
        setWebhookSecret(null);
        setCopiedField(null);
        setIsWebhookModalOpen(true);
    };

    const generateProjectWebhook = async () => {
        if (!selectedProject || webhookBusy) return;
        setWebhookBusy(true);
        setNotice(null);
        try {
            const data = await apiFetch<{ enabled: boolean; secret: string; path: string }>(
                `/api/projects/${selectedProject.id}/webhook`,
                { method: 'POST' }
            );
            setWebhookSecret(data.secret);
            await fetchProjects();
        } catch (error) {
            const message = error instanceof ApiError ? error.message : 'Failed to generate webhook secret.';
            setNotice(message);
        } finally {
            setWebhookBusy(false);
        }
    };

    const disableProjectWebhook = async () => {
        if (!selectedProject || webhookBusy) return;
        setWebhookBusy(true);
        setNotice(null);
        try {
            await apiFetch(`/api/projects/${selectedProject.id}/webhook`, { method: 'DELETE' });
            setWebhookSecret(null);
            await fetchProjects();
        } catch (error) {
            const message = error instanceof ApiError ? error.message : 'Failed to disable webhook.';
            setNotice(message);
        } finally {
            setWebhookBusy(false);
        }
    };

    const copyText = async (value: string, field: 'url' | 'secret') => {
        try {
            await navigator.clipboard.writeText(value);
            setCopiedField(field);
            setTimeout(() => setCopiedField((curr) => (curr === field ? null : curr)), 1500);
        } catch {
            setNotice('Could not copy to clipboard.');
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

    const openEnvEditor = async () => {
        if (!selectedProject) return;
        setNotice(null);
        setLoadingEnv(true);
        setEnvContent('');
        setIsEditingEnv(true);
        if (wsRef.current) wsRef.current.close();

        try {
            const data = await apiFetch<{ env_vars: string }>(`/api/projects/${selectedProject.id}/env`);
            setEnvContent(data.env_vars || '');
        } catch (error) {
            const message = error instanceof ApiError ? error.message : 'Failed to load .env secrets.';
            setNotice(message);
            setIsEditingEnv(false);
        } finally {
            setLoadingEnv(false);
        }
    };

    const saveEnv = async () => {
        if (!selectedProject || loadingEnv) return;
        try {
            await apiFetch(`/api/projects/${selectedProject.id}/env`, {
                method: 'POST',
                body: JSON.stringify({ env_vars: envContent })
            });
            setEnvContent('');
            setIsEditingEnv(false);
        } catch (error) {
            const message = error instanceof ApiError ? error.message : 'Failed to save .env file.';
            setNotice(message);
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
                                    <div className="flex flex-wrap justify-end items-center gap-x-2 gap-y-1">
                                        {p.metrics?.memoryBytes != null && (
                                            <span className="text-[10px] text-gray-400 whitespace-nowrap" title="Current service memory">
                                                {(p.metrics.memoryBytes / 1024 ** 2).toFixed(1)} MiB RAM
                                            </span>
                                        )}
                                        {p.metrics?.cpuUsageNSec != null && (
                                            <span className="text-[10px] text-gray-400 whitespace-nowrap" title="Cumulative service CPU time">
                                                {(p.metrics.cpuUsageNSec / 1e9).toFixed(1)}s CPU
                                            </span>
                                        )}
                                        <span className={`text-xs px-2 py-1 ${p.status === 'active' ? 'bg-green-900 text-green-400' : 'bg-red-900 text-red-400'}`}>
                                            {p.status.toUpperCase()}
                                        </span>
                                    </div>
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
                            <header className="flex justify-between items-center gap-2 flex-wrap px-4 py-3 border-b border-aeros-gray bg-[#0a0a0a]">
                                <span className="text-aeros-blue font-bold font-mono text-sm">
                                    {selectedProject.name} // {isEditingEnv ? 'EDIT_ENV' : 'TERMINAL'}
                                </span>
                                {!isEditingEnv ? (
                                    <div className="flex gap-1.5 items-center flex-wrap">
                                        <button
                                            onClick={handleDeploy}
                                            disabled={isSelectedDeploying}
                                            className="py-1.5 px-2.5 text-xs font-mono flex items-center bg-transparent border border-aeros-blue text-aeros-blue hover:bg-aeros-blue hover:text-black transition-colors cursor-pointer disabled:opacity-50"
                                            title="Git pull, build if needed, and restart service"
                                        >
                                            <Rocket size={13} className={`mr-1.5 ${isSelectedDeploying ? 'animate-pulse' : ''}`} />
                                            {isSelectedDeploying ? 'DEPLOYING...' : 'DEPLOY'}
                                        </button>
                                        <button
                                            onClick={() => setLogs([])}
                                            className="py-1.5 px-2.5 text-xs font-mono flex items-center bg-transparent border border-aeros-gray hover:border-error-color hover:text-error-color transition-colors cursor-pointer text-gray-400"
                                            title="Clear Terminal"
                                        >
                                            <Trash2 size={13} className="mr-1.5" />
                                            CLEAR
                                        </button>
                                        {caddyActive && (
                                            <button
                                                onClick={openDomainModal}
                                                className={`py-1.5 px-2.5 text-xs font-mono flex items-center bg-transparent border transition-colors cursor-pointer ${selectedProject.domain ? 'border-green-500 text-green-400 hover:bg-green-500 hover:text-black' : 'border-aeros-gray text-gray-300 hover:border-aeros-blue hover:text-aeros-blue'}`}
                                                title="Configure Caddy Domain + HTTPS"
                                            >
                                                <Globe size={13} className="mr-1.5" />
                                                DOMAIN
                                            </button>
                                        )}
                                        <button
                                            onClick={openWebhookModal}
                                            className={`py-1.5 px-2.5 text-xs font-mono flex items-center bg-transparent border transition-colors cursor-pointer ${selectedProject.has_webhook ? 'border-aeros-blue text-aeros-blue hover:bg-aeros-blue hover:text-black' : 'border-aeros-gray text-gray-300 hover:border-aeros-blue hover:text-aeros-blue'}`}
                                            title="Configure GitHub Push Webhook"
                                        >
                                            <Webhook size={13} className="mr-1.5" />
                                            HOOK
                                        </button>
                                        <button
                                            onClick={openEnvEditor}
                                            className="py-1.5 px-2.5 text-xs font-mono flex items-center bg-transparent border border-aeros-gray text-gray-300 hover:border-aeros-blue hover:text-aeros-blue transition-colors cursor-pointer"
                                            title="Edit .env"
                                        >
                                            <FileText size={13} className="mr-1.5" />
                                            .env
                                        </button>
                                        <button
                                            onClick={toggleAutostart}
                                            className={`py-1.5 px-2.5 text-xs font-mono flex items-center bg-transparent border transition-colors cursor-pointer ${selectedProject.autostart ? 'border-aeros-purple text-aeros-purple hover:bg-aeros-purple hover:text-white' : 'border-aeros-gray text-gray-300 hover:border-aeros-purple hover:text-aeros-purple'}`}
                                            title="Toggle Boot Autostart"
                                        >
                                            <Power size={13} className="mr-1.5" />
                                            BOOT
                                        </button>
                                        <button onClick={() => handleAction('start')} className="p-1.5 bg-transparent text-green-500 border border-aeros-gray hover:border-green-500 transition-colors cursor-pointer" title="Start"><Play size={13} /></button>
                                        <button onClick={() => handleAction('restart')} className="p-1.5 bg-transparent text-yellow-500 border border-aeros-gray hover:border-yellow-500 transition-colors cursor-pointer" title="Restart"><RotateCw size={13} /></button>
                                        <button onClick={() => handleAction('stop')} className="p-1.5 bg-transparent text-red-500 border border-aeros-gray hover:border-red-500 transition-colors cursor-pointer" title="Stop"><Square size={13} /></button>
                                    </div>
                                ) : (
                                    <div className="flex gap-2">
                                        <button
                                            onClick={() => setIsEditingEnv(false)}
                                            className="py-1.5 px-2.5 text-xs font-mono flex items-center cursor-pointer bg-transparent border border-red-500 text-red-400 hover:bg-red-500 hover:text-white transition-colors"
                                        >
                                            <X size={13} className="mr-1.5" />
                                            CANCEL
                                        </button>
                                        <button
                                            onClick={saveEnv}
                                            className="py-1.5 px-2.5 text-xs font-mono flex items-center cursor-pointer border border-aeros-blue text-aeros-blue hover:bg-aeros-blue hover:text-black bg-transparent transition-colors"
                                        >
                                            <Save size={13} className="mr-1.5" />
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
                                {selectedProject.domain && (
                                    <span>
                                        HTTPS:{' '}
                                        <span className="text-green-400">
                                            {selectedProject.domain} → :{selectedProject.port}
                                        </span>
                                    </span>
                                )}
                                {selectedProject.last_deploy_at && (
                                    <span>LAST_DEPLOY: <span className="text-gray-300">{formatDeployTime(selectedProject.last_deploy_at)}</span></span>
                                )}
                            </div>

                            {isEditingEnv ? (
                                <div className="flex-1 p-4 bg-black flex flex-col">
                                    <div className="text-gray-400 text-xs mb-2 font-mono">
                                        {loadingEnv
                                            ? `# Loading environment variables for ${selectedProject.name}...`
                                            : `# Configura las variables de entorno para ${selectedProject.name}`}
                                    </div>
                                    <textarea
                                        className="flex-1 w-full bg-[#0a0a0a] text-aeros-text p-4 font-mono text-sm border border-aeros-gray focus:border-aeros-purple outline-none resize-none disabled:opacity-50"
                                        value={envContent}
                                        disabled={loadingEnv}
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

            {isWebhookModalOpen && selectedProject && (
                <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
                    <div className="terminal-card border-aeros-gray bg-[#050505] w-full max-w-lg p-6 font-mono">
                        <div className="flex justify-between items-center pb-3 mb-4 border-b border-aeros-gray">
                            <span className="text-aeros-blue font-bold text-sm flex items-center">
                                <Webhook size={15} className="mr-2" />
                                GITHUB_WEBHOOK // {selectedProject.service_name}
                            </span>
                            <button
                                onClick={() => {
                                    setIsWebhookModalOpen(false);
                                    setWebhookSecret(null);
                                }}
                                className="text-gray-400 hover:text-white bg-transparent border-0 cursor-pointer"
                            >
                                <X size={16} />
                            </button>
                        </div>

                        <p className="text-xs text-gray-400 mb-4">
                            Configure a GitHub repository webhook with content type{' '}
                            <span className="text-gray-200">application/json</span> on{' '}
                            <span className="text-aeros-blue">push</span> events targeting branch{' '}
                            <span className="text-aeros-blue">{selectedProject.branch || 'main'}</span>.
                        </p>

                        <div className="mb-4">
                            <label className="block text-[11px] text-gray-400 mb-1">PAYLOAD_URL</label>
                            <div className="flex gap-2">
                                <input
                                    type="text"
                                    readOnly
                                    value={`${window.location.origin}/api/webhooks/github/${selectedProject.id}`}
                                    className="flex-1 bg-black border border-aeros-gray px-3 py-2 text-xs text-gray-200 outline-none"
                                />
                                <button
                                    onClick={() =>
                                        copyText(
                                            `${window.location.origin}/api/webhooks/github/${selectedProject.id}`,
                                            'url'
                                        )
                                    }
                                    className="px-3 py-2 text-xs border border-aeros-gray text-gray-200 hover:border-aeros-blue hover:text-aeros-blue bg-transparent cursor-pointer flex items-center"
                                >
                                    {copiedField === 'url' ? <Check size={14} /> : <Copy size={14} />}
                                </button>
                            </div>
                        </div>

                        {webhookSecret && (
                            <div className="mb-4 p-3 border border-aeros-blue/60 bg-[#001422]">
                                <label className="block text-[11px] text-aeros-blue mb-1">
                                    WEBHOOK_SECRET (SHOWN ONCE)
                                </label>
                                <div className="flex gap-2">
                                    <input
                                        type="text"
                                        readOnly
                                        value={webhookSecret}
                                        className="flex-1 bg-black border border-aeros-gray px-3 py-2 text-xs text-white outline-none"
                                    />
                                    <button
                                        onClick={() => copyText(webhookSecret, 'secret')}
                                        className="px-3 py-2 text-xs border border-aeros-blue text-aeros-blue hover:bg-aeros-blue hover:text-black bg-transparent cursor-pointer flex items-center"
                                    >
                                        {copiedField === 'secret' ? <Check size={14} /> : <Copy size={14} />}
                                    </button>
                                </div>
                            </div>
                        )}

                        <div className="flex justify-between items-center pt-3 border-t border-aeros-gray">
                            <span className="text-xs text-gray-400">
                                STATUS:{' '}
                                <span className={selectedProject.has_webhook ? 'text-green-400' : 'text-gray-500'}>
                                    {selectedProject.has_webhook ? 'ENABLED' : 'DISABLED'}
                                </span>
                            </span>
                            <div className="flex gap-2">
                                {selectedProject.has_webhook && (
                                    <button
                                        onClick={disableProjectWebhook}
                                        disabled={webhookBusy}
                                        className="px-3 py-1.5 text-xs border border-red-500 text-red-400 hover:bg-red-500 hover:text-white bg-transparent cursor-pointer disabled:opacity-50"
                                    >
                                        DISABLE
                                    </button>
                                )}
                                <button
                                    onClick={generateProjectWebhook}
                                    disabled={webhookBusy}
                                    className="px-3 py-1.5 text-xs border border-aeros-blue text-aeros-blue hover:bg-aeros-blue hover:text-black bg-transparent cursor-pointer disabled:opacity-50"
                                >
                                    {selectedProject.has_webhook ? 'ROTATE_SECRET' : 'GENERATE_SECRET'}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {isDomainModalOpen && selectedProject && (
                <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
                    <div className="terminal-card border-aeros-gray bg-[#050505] w-full max-w-md p-6 font-mono">
                        <div className="flex justify-between items-center pb-3 mb-4 border-b border-aeros-gray">
                            <span className="text-aeros-blue font-bold text-sm flex items-center">
                                <Globe size={15} className="mr-2" />
                                CADDY_DOMAIN // {selectedProject.service_name}
                            </span>
                            <button
                                onClick={() => setIsDomainModalOpen(false)}
                                className="text-gray-400 hover:text-white bg-transparent border-0 cursor-pointer"
                            >
                                <X size={16} />
                            </button>
                        </div>

                        <p className="text-xs text-gray-400 mb-4">
                            Writes an isolated snippet under <span className="text-gray-200">/etc/caddy/conf.d/</span> and reloads Caddy for automatic HTTPS.
                        </p>

                        <div className="space-y-3 mb-5">
                            <div>
                                <label className="block text-[11px] text-gray-400 mb-1">DOMAIN (FQDN)</label>
                                <input
                                    type="text"
                                    value={domainInput}
                                    onChange={(e) => setDomainInput(e.target.value)}
                                    placeholder="app.example.com"
                                    className="w-full bg-black border border-aeros-gray px-3 py-2 text-xs text-white focus:border-aeros-blue outline-none"
                                />
                            </div>
                            <div>
                                <label className="block text-[11px] text-gray-400 mb-1">LOCAL_PORT</label>
                                <input
                                    type="number"
                                    min={1}
                                    max={65535}
                                    value={portInput}
                                    onChange={(e) => setPortInput(e.target.value)}
                                    placeholder="3000"
                                    className="w-full bg-black border border-aeros-gray px-3 py-2 text-xs text-white focus:border-aeros-blue outline-none"
                                />
                            </div>
                        </div>

                        <div className="flex justify-between items-center pt-3 border-t border-aeros-gray">
                            {selectedProject.domain ? (
                                <button
                                    onClick={removeProjectDomain}
                                    disabled={domainBusy}
                                    className="px-3 py-1.5 text-xs border border-red-500 text-red-400 hover:bg-red-500 hover:text-white bg-transparent cursor-pointer disabled:opacity-50"
                                >
                                    REMOVE
                                </button>
                            ) : (
                                <span />
                            )}
                            <button
                                onClick={saveProjectDomain}
                                disabled={domainBusy || !domainInput.trim()}
                                className="px-3 py-1.5 text-xs border border-aeros-blue text-aeros-blue hover:bg-aeros-blue hover:text-black bg-transparent cursor-pointer disabled:opacity-50"
                            >
                                {domainBusy ? 'APPLYING...' : 'APPLY_ROUTE'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
