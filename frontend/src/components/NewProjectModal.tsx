import { useEffect, useState, type FormEvent } from 'react';
import { X, Layers, Eye, Plus, AlertTriangle } from 'lucide-react';
import { apiFetch, ApiError } from '../lib/api';

export type TemplateId = 'node' | 'python' | 'static' | 'java' | 'custom';

export interface ProjectTemplate {
    id: TemplateId;
    name: string;
    shortLabel: string;
    description: string;
    defaultExecStart: string;
    defaultBuildCmd: string;
    defaultMemoryMax: string;
    defaultCpuQuota: string;
    defaultUser: string;
    hint: string;
}

interface StarterPreset {
    id: string;
    label: string;
    name: string;
    serviceName: string;
    workDir: string;
    execStart: string;
    memoryMax: string;
    cpuQuota: string;
    description: string;
}

const STARTER_PACK_PRESETS: StarterPreset[] = [
    {
        id: 'n8n',
        label: 'n8n',
        name: 'n8n',
        serviceName: 'n8n',
        workDir: '/opt/n8n',
        execStart: '/usr/bin/env n8n start',
        memoryMax: '512M',
        cpuQuota: '150%',
        description: 'Workflow automation (requires global n8n installed via npm)'
    },
    {
        id: 'qbittorrent',
        label: 'qBittorrent-nox',
        serviceName: 'qbittorrent-nox',
        name: 'qBittorrent',
        workDir: '/opt/qbittorrent',
        execStart: '/usr/bin/qbittorrent-nox --webui-port=8080',
        memoryMax: '256M',
        cpuQuota: '100%',
        description: 'Headless torrent client (apt install qbittorrent-nox)'
    },
    {
        id: 'filebrowser',
        label: 'Filebrowser',
        name: 'Filebrowser',
        serviceName: 'filebrowser',
        workDir: '/opt/filebrowser',
        execStart: '/usr/local/bin/filebrowser -a 0.0.0.0 -p 8085 -r /srv',
        memoryMax: '128M',
        cpuQuota: '100%',
        description: 'Lightweight single-binary web file manager'
    },
    {
        id: 'syncthing',
        label: 'Syncthing',
        name: 'Syncthing',
        serviceName: 'syncthing',
        workDir: '/opt/syncthing',
        execStart: '/usr/bin/syncthing serve --no-browser --gui-address=0.0.0.0:8384',
        memoryMax: '256M',
        cpuQuota: '100%',
        description: 'Continuous peer-to-peer file synchronization (apt install syncthing)'
    }
];

interface NewProjectModalProps {
    isOpen: boolean;
    onClose: () => void;
    onCreated: (createdId: number, warning?: string) => void;
}

function slugifyService(raw: string): string {
    return raw
        .replace(/\.git$/i, '')
        .toLowerCase()
        .replace(/[^a-z0-9._-]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 60);
}

export function NewProjectModal({ isOpen, onClose, onCreated }: NewProjectModalProps) {
    const [templates, setTemplates] = useState<ProjectTemplate[]>([]);
    const [selectedTemplate, setSelectedTemplate] = useState<TemplateId>('node');
    const [name, setName] = useState('');
    const [serviceName, setServiceName] = useState('');
    const [serviceTouched, setServiceTouched] = useState(false);
    const [repository, setRepository] = useState('');
    const [branch, setBranch] = useState('main');
    const [workDir, setWorkDir] = useState('/opt/my-service');
    const [workDirTouched, setWorkDirTouched] = useState(false);
    const [execStart, setExecStart] = useState('/usr/bin/node dist/index.js');
    const [buildCmd, setBuildCmd] = useState('npm run build');
    const [memoryMax, setMemoryMax] = useState('256M');
    const [cpuQuota, setCpuQuota] = useState('');
    const [runUser, setRunUser] = useState('');
    const [activePreset, setActivePreset] = useState<string | null>(null);
    const [createUnit, setCreateUnit] = useState(true);

    const [previewOpen, setPreviewOpen] = useState(false);
    const [previewContent, setPreviewContent] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [submitting, setSubmitting] = useState(false);

    useEffect(() => {
        if (!isOpen) return;
        let active = true;
        apiFetch<ProjectTemplate[]>('/api/templates')
            .then((list) => {
                if (!active) return;
                setTemplates(list);
                const first = list[0];
                if (first) {
                    setSelectedTemplate(first.id);
                    setExecStart(first.defaultExecStart);
                    setBuildCmd(first.defaultBuildCmd);
                    setMemoryMax(first.defaultMemoryMax);
                    setCpuQuota(first.defaultCpuQuota || '');
                    setRunUser(first.defaultUser);
                }
            })
            .catch((err) => console.error(err));

        return () => {
            active = false;
        };
    }, [isOpen]);

    if (!isOpen) return null;

    const currentTemplate = templates.find((t) => t.id === selectedTemplate);

    const applyTemplate = (tpl: ProjectTemplate) => {
        setActivePreset(null);
        setSelectedTemplate(tpl.id);
        setExecStart(tpl.defaultExecStart);
        setBuildCmd(tpl.defaultBuildCmd);
        setMemoryMax(tpl.defaultMemoryMax);
        setCpuQuota(tpl.defaultCpuQuota || '');
        setRunUser(tpl.defaultUser);
        setPreviewOpen(false);
    };

    const applyStarterPreset = (preset: StarterPreset) => {
        setActivePreset(preset.id);
        setSelectedTemplate('custom');
        setName(preset.name);
        setServiceName(preset.serviceName);
        setServiceTouched(true);
        setWorkDir(preset.workDir);
        setWorkDirTouched(true);
        setRepository('');
        setExecStart(preset.execStart);
        setBuildCmd('');
        setMemoryMax(preset.memoryMax);
        setCpuQuota(preset.cpuQuota);
        setRunUser('');
        setPreviewOpen(false);
        setError(null);
    };

    const syncDerivedFields = (nextName: string, nextRepo: string) => {
        if (!serviceTouched) {
            const repoLeaf = nextRepo.trim().split('/').filter(Boolean).pop() || '';
            const derived = slugifyService(repoLeaf || nextName);
            setServiceName(derived);
            if (!workDirTouched) {
                setWorkDir(derived ? `/opt/${derived}` : '/opt/my-service');
            }
        }
    };

    const handleNameChange = (val: string) => {
        setName(val);
        syncDerivedFields(val, repository);
    };

    const handleRepoChange = (val: string) => {
        setRepository(val);
        syncDerivedFields(name, val);
    };

    const handleServiceChange = (val: string) => {
        const cleaned = val.toLowerCase().replace(/[^a-z0-9._-]/g, '');
        setServiceTouched(true);
        setServiceName(cleaned);
        if (!workDirTouched) {
            setWorkDir(cleaned ? `/opt/${cleaned}` : '/opt/my-service');
        }
    };

    const handlePreview = async () => {
        setError(null);
        if (previewOpen) {
            setPreviewOpen(false);
            return;
        }

        try {
            const data = await apiFetch<{ unitContent: string }>('/api/templates/preview', {
                method: 'POST',
                body: JSON.stringify({
                    name: name || 'My Service',
                    service_name: serviceName || 'my-service',
                    template: selectedTemplate,
                    work_dir: workDir,
                    exec_start: execStart,
                    run_user: runUser,
                    memory_max: memoryMax,
                    cpu_quota: cpuQuota
                })
            });
            setPreviewContent(data.unitContent);
            setPreviewOpen(true);
        } catch (err) {
            setError(err instanceof ApiError ? err.message : 'Failed to generate preview.');
        }
    };

    const handleSubmit = async (e: FormEvent) => {
        e.preventDefault();
        setError(null);
        setSubmitting(true);

        try {
            const res = await apiFetch<{
                id: number;
                unit?: { installed: boolean; warning?: string };
            }>('/api/projects', {
                method: 'POST',
                body: JSON.stringify({
                    name: name.trim(),
                    service_name: serviceName.trim(),
                    repository: repository.trim() || null,
                    branch: branch.trim() || 'main',
                    template: selectedTemplate,
                    work_dir: workDir.trim(),
                    exec_start: execStart.trim(),
                    build_cmd: buildCmd.trim(),
                    run_user: runUser.trim(),
                    memory_max: memoryMax.trim(),
                    cpu_quota: cpuQuota.trim(),
                    create_unit: createUnit
                })
            });

            onCreated(res.id, res.unit?.warning);
            onClose();
        } catch (err) {
            setError(err instanceof ApiError ? err.message : 'Failed to create project.');
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4 font-mono">
            <div className="w-full max-w-3xl max-h-[90vh] overflow-y-auto terminal-card border-aeros-gray !p-6 bg-[#050505]">
                <div className="flex justify-between items-center pb-4 mb-5 border-b border-aeros-gray">
                    <div className="flex items-center text-aeros-blue font-bold text-lg tracking-wider">
                        <Layers size={18} className="mr-3" />
                        NEW_SYSTEMD_PROJECT
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        className="text-gray-400 hover:text-white bg-transparent border-0 cursor-pointer"
                        title="Close"
                    >
                        <X size={18} />
                    </button>
                </div>

                <div className="mb-5">
                    <div className="text-xs text-aeros-purple mb-2 tracking-wider">1. SELECT_TEMPLATE</div>
                    <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                        {templates.map((tpl) => (
                            <button
                                key={tpl.id}
                                type="button"
                                onClick={() => applyTemplate(tpl)}
                                className={`px-3 py-2.5 text-xs font-mono border transition-colors cursor-pointer text-left ${
                                    selectedTemplate === tpl.id
                                        ? 'border-aeros-blue bg-[#001829] text-aeros-blue font-bold'
                                        : 'border-aeros-gray bg-[#0a0a0a] text-gray-300 hover:border-aeros-purple'
                                }`}
                            >
                                {tpl.shortLabel}
                            </button>
                        ))}
                    </div>
                    {currentTemplate && (
                        <div className="mt-2 text-xs text-gray-400">
                            <span>{currentTemplate.description}</span>
                            <span className="block text-[11px] text-gray-500 mt-1">TIP: {currentTemplate.hint}</span>
                        </div>
                    )}
                </div>

                <div className="mb-5">
                    <div className="text-xs text-aeros-purple mb-2 tracking-wider">STARTER_PACK (OPTIONAL_PRESETS)</div>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                        {STARTER_PACK_PRESETS.map((preset) => (
                            <button
                                key={preset.id}
                                type="button"
                                onClick={() => applyStarterPreset(preset)}
                                title={preset.description}
                                className={`px-3 py-2 text-xs font-mono border transition-colors cursor-pointer text-left ${
                                    activePreset === preset.id
                                        ? 'border-aeros-blue bg-[#001829] text-aeros-blue font-bold'
                                        : 'border-aeros-gray bg-[#0a0a0a] text-gray-300 hover:border-aeros-purple'
                                }`}
                            >
                                <div>{preset.label}</div>
                                <div className="text-[10px] text-gray-500 mt-0.5">
                                    {preset.memoryMax} / {preset.cpuQuota}
                                </div>
                            </button>
                        ))}
                    </div>
                    {activePreset && (
                        <div className="mt-1.5 text-[11px] text-gray-400">
                            {STARTER_PACK_PRESETS.find((p) => p.id === activePreset)?.description}
                        </div>
                    )}
                </div>

                {error && (
                    <div className="mb-4 p-3 border border-error-color bg-red-950/30 text-xs text-red-400 flex items-center gap-2">
                        <AlertTriangle size={14} className="shrink-0" />
                        <span>{error}</span>
                    </div>
                )}

                <form onSubmit={handleSubmit} className="space-y-4 text-xs">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="flex flex-col">
                            <label className="text-gray-400 mb-1.5">PROJECT_NAME *</label>
                            <input
                                type="text"
                                required
                                value={name}
                                onChange={(e) => handleNameChange(e.target.value)}
                                placeholder="e.g. Discord Music Bot"
                                className="bg-[#0a0a0a] border border-aeros-gray px-3 py-2 text-white focus:border-aeros-blue outline-none font-mono"
                            />
                        </div>
                        <div className="flex flex-col">
                            <label className="text-gray-400 mb-1.5">SERVICE_NAME (.service) *</label>
                            <input
                                type="text"
                                required
                                value={serviceName}
                                onChange={(e) => handleServiceChange(e.target.value)}
                                placeholder="e.g. music-bot"
                                className="bg-[#0a0a0a] border border-aeros-gray px-3 py-2 text-white focus:border-aeros-blue outline-none font-mono"
                            />
                        </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                        <div className="flex flex-col sm:col-span-2">
                            <label className="text-gray-400 mb-1.5">GIT_REPOSITORY (optional)</label>
                            <input
                                type="text"
                                value={repository}
                                onChange={(e) => handleRepoChange(e.target.value)}
                                placeholder="https://github.com/user/repo.git"
                                className="bg-[#0a0a0a] border border-aeros-gray px-3 py-2 text-white focus:border-aeros-blue outline-none font-mono"
                            />
                        </div>
                        <div className="flex flex-col">
                            <label className="text-gray-400 mb-1.5">BRANCH</label>
                            <input
                                type="text"
                                value={branch}
                                onChange={(e) => setBranch(e.target.value)}
                                placeholder="main"
                                className="bg-[#0a0a0a] border border-aeros-gray px-3 py-2 text-white focus:border-aeros-blue outline-none font-mono"
                            />
                        </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="flex flex-col">
                            <label className="text-gray-400 mb-1.5">WORKING_DIRECTORY *</label>
                            <input
                                type="text"
                                required
                                value={workDir}
                                onChange={(e) => {
                                    setWorkDirTouched(true);
                                    setWorkDir(e.target.value);
                                }}
                                placeholder="/opt/music-bot"
                                className="bg-[#0a0a0a] border border-aeros-gray px-3 py-2 text-white focus:border-aeros-blue outline-none font-mono"
                            />
                        </div>
                        <div className="flex flex-col">
                            <label className="text-gray-400 mb-1.5">BUILD_COMMAND (on Deploy, optional)</label>
                            <input
                                type="text"
                                value={buildCmd}
                                onChange={(e) => setBuildCmd(e.target.value)}
                                placeholder="npm run build"
                                className="bg-[#0a0a0a] border border-aeros-gray px-3 py-2 text-white focus:border-aeros-blue outline-none font-mono"
                            />
                        </div>
                    </div>

                    <div className="flex flex-col">
                        <label className="text-gray-400 mb-1.5">EXEC_START (systemd) *</label>
                        <input
                            type="text"
                            required
                            value={execStart}
                            onChange={(e) => setExecStart(e.target.value)}
                            placeholder="/usr/bin/node dist/index.js"
                            className="bg-[#0a0a0a] border border-aeros-gray px-3 py-2 text-white focus:border-aeros-blue outline-none font-mono"
                        />
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                        <div className="flex flex-col">
                            <label className="text-gray-400 mb-1.5">MEMORY_MAX (e.g. 256M, 1G)</label>
                            <input
                                type="text"
                                value={memoryMax}
                                onChange={(e) => setMemoryMax(e.target.value)}
                                placeholder="256M"
                                className="bg-[#0a0a0a] border border-aeros-gray px-3 py-2 text-white focus:border-aeros-blue outline-none font-mono"
                            />
                        </div>
                        <div className="flex flex-col">
                            <label className="text-gray-400 mb-1.5">CPU_QUOTA (e.g. 100%, 200%)</label>
                            <input
                                type="text"
                                value={cpuQuota}
                                onChange={(e) => setCpuQuota(e.target.value)}
                                placeholder="Optional (e.g. 100%)"
                                className="bg-[#0a0a0a] border border-aeros-gray px-3 py-2 text-white focus:border-aeros-blue outline-none font-mono"
                            />
                        </div>
                        <div className="flex flex-col">
                            <label className="text-gray-400 mb-1.5">LINUX_USER (optional)</label>
                            <input
                                type="text"
                                value={runUser}
                                onChange={(e) => setRunUser(e.target.value)}
                                placeholder="Default (root)"
                                className="bg-[#0a0a0a] border border-aeros-gray px-3 py-2 text-white focus:border-aeros-blue outline-none font-mono"
                            />
                        </div>
                    </div>

                    <label className="flex items-center gap-2 text-gray-300 pt-1 cursor-pointer">
                        <input
                            type="checkbox"
                            checked={createUnit}
                            onChange={(e) => setCreateUnit(e.target.checked)}
                            className="accent-aeros-blue"
                        />
                        <span>Write /etc/systemd/system/{serviceName || '<service>'}.service and reload systemd</span>
                    </label>

                    {previewOpen && (
                        <div className="border border-aeros-gray bg-black p-3">
                            <div className="text-[11px] text-aeros-purple mb-2">
                                /etc/systemd/system/{serviceName || 'my-service'}.service
                            </div>
                            <pre className="text-[11px] text-gray-300 whitespace-pre-wrap m-0 overflow-x-auto">
                                {previewContent}
                            </pre>
                        </div>
                    )}

                    <div className="pt-4 border-t border-aeros-gray flex flex-wrap justify-between gap-3">
                        <button
                            type="button"
                            onClick={handlePreview}
                            className="px-3 py-2 border border-aeros-gray text-gray-300 hover:border-aeros-purple hover:text-aeros-purple bg-transparent cursor-pointer flex items-center"
                        >
                            <Eye size={14} className="mr-2" />
                            {previewOpen ? 'HIDE_UNIT_PREVIEW' : 'PREVIEW_.service'}
                        </button>

                        <div className="flex gap-2">
                            <button
                                type="button"
                                onClick={onClose}
                                className="px-4 py-2 border border-aeros-gray text-gray-400 hover:text-white bg-transparent cursor-pointer"
                            >
                                CANCEL
                            </button>
                            <button
                                type="submit"
                                disabled={submitting}
                                className="px-4 py-2 border border-aeros-blue text-aeros-blue hover:bg-aeros-blue hover:text-black bg-transparent cursor-pointer font-bold flex items-center disabled:opacity-50"
                            >
                                <Plus size={14} className="mr-2" />
                                {submitting ? 'CREATING...' : 'CREATE_PROJECT'}
                            </button>
                        </div>
                    </div>
                </form>
            </div>
        </div>
    );
}
