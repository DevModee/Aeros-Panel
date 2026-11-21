import { useEffect, useState, type FormEvent } from 'react';
import { Radio, Save, Copy, Check, KeyRound, RefreshCw, Play } from 'lucide-react';
import { apiFetch, ApiError } from '../lib/api';

interface PublicStatusConfig {
    enabled: boolean;
    token: string;
}

function generateRandomToken(): string {
    const bytes = new Uint8Array(18);
    window.crypto.getRandomValues(bytes);
    return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

export function Settings() {
    const [enabled, setEnabled] = useState(false);
    const [token, setToken] = useState('');
    const [savingStatus, setSavingStatus] = useState(false);
    const [statusMessage, setStatusMessage] = useState<string | null>(null);
    const [copied, setCopied] = useState(false);
    const [testOutput, setTestOutput] = useState<string | null>(null);
    const [testing, setTesting] = useState(false);

    const [currentPassword, setCurrentPassword] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [passwordMessage, setPasswordMessage] = useState<{ ok: boolean; text: string } | null>(null);
    const [savingPassword, setSavingPassword] = useState(false);

    useEffect(() => {
        let active = true;
        apiFetch<PublicStatusConfig>('/api/settings/public-status')
            .then((cfg) => {
                if (!active) return;
                setEnabled(cfg.enabled);
                setToken(cfg.token);
            })
            .catch((error) => console.error(error));

        return () => {
            active = false;
        };
    }, []);

    const endpointBase = `${window.location.origin}/api/public/status`;
    const endpointPreview = token.trim()
        ? `${endpointBase}?token=${encodeURIComponent(token.trim())}`
        : endpointBase;

    const handleSavePublicStatus = async (e: FormEvent) => {
        e.preventDefault();
        setSavingStatus(true);
        setStatusMessage(null);
        setTestOutput(null);

        try {
            const updated = await apiFetch<PublicStatusConfig>('/api/settings/public-status', {
                method: 'PUT',
                body: JSON.stringify({ enabled, token: token.trim() })
            });
            setEnabled(updated.enabled);
            setToken(updated.token);
            setStatusMessage(
                updated.enabled
                    ? 'Public status endpoint enabled.'
                    : 'Public status endpoint disabled.'
            );
        } catch (err) {
            setStatusMessage(err instanceof ApiError ? err.message : 'Failed to save settings.');
        } finally {
            setSavingStatus(false);
        }
    };

    const handleCopyUrl = async () => {
        try {
            await navigator.clipboard.writeText(endpointPreview);
            setCopied(true);
            setTimeout(() => setCopied(false), 1800);
        } catch (err) {
            console.error(err);
        }
    };

    const handleTestEndpoint = async () => {
        setTesting(true);
        setTestOutput(null);
        try {
            const headers: HeadersInit = token.trim()
                ? { Authorization: `Bearer ${token.trim()}` }
                : {};
            const res = await fetch('/api/public/status', { headers });
            const json = await res.json();
            setTestOutput(`HTTP ${res.status}\n${JSON.stringify(json, null, 2)}`);
        } catch (err: any) {
            setTestOutput(`ERROR: ${err?.message || 'Request failed'}`);
        } finally {
            setTesting(false);
        }
    };

    const handlePasswordUpdate = async (e: FormEvent) => {
        e.preventDefault();
        setPasswordMessage(null);

        if (newPassword !== confirmPassword) {
            setPasswordMessage({ ok: false, text: 'New passwords do not match.' });
            return;
        }
        if (newPassword.length < 10) {
            setPasswordMessage({ ok: false, text: 'New password must be at least 10 characters.' });
            return;
        }

        setSavingPassword(true);
        try {
            await apiFetch('/api/auth/password', {
                method: 'POST',
                body: JSON.stringify({ currentPassword, newPassword })
            });
            setCurrentPassword('');
            setNewPassword('');
            setConfirmPassword('');
            setPasswordMessage({ ok: true, text: 'Password updated and other sessions revoked.' });
        } catch (err) {
            setPasswordMessage({
                ok: false,
                text: err instanceof ApiError ? err.message : 'Failed to update password.'
            });
        } finally {
            setSavingPassword(false);
        }
    };

    return (
        <div className="max-w-4xl mx-auto flex flex-col font-mono pb-8">
            <header className="mb-6 flex justify-between items-end">
                <div>
                    <h2 className="text-3xl font-bold text-aeros-blue tracking-widest mb-2">SYSTEM_SETTINGS</h2>
                    <p className="text-gray-400">Configure Aeros ecosystem telemetry and admin security.</p>
                </div>
            </header>

            <div className="space-y-6">
                <form onSubmit={handleSavePublicStatus} className="terminal-card border-aeros-gray !p-8 bg-[#050505]">
                    <div className="flex items-center justify-between mb-6">
                        <div className="text-aeros-blue flex items-center font-bold text-lg">
                            <Radio className="mr-4 text-aeros-blue" size={22} />
                            PUBLIC_STATUS_ENDPOINT
                        </div>
                        <button
                            type="button"
                            onClick={() => setEnabled((prev) => !prev)}
                            className={`px-3 py-1.5 text-xs font-mono border cursor-pointer transition-colors ${
                                enabled
                                    ? 'border-green-500 bg-green-950/40 text-green-400'
                                    : 'border-aeros-gray bg-black text-gray-400 hover:border-aeros-blue'
                            }`}
                        >
                            {enabled ? 'STATUS: ENABLED' : 'STATUS: DISABLED'}
                        </button>
                    </div>

                    <p className="text-xs text-gray-400 mb-5 leading-relaxed">
                        Exposes a lightweight, read-only <span className="text-gray-200">/api/public/status</span> JSON feed
                        (CPU, RAM, temperature, and service up/down counts — never .env or secrets) for{' '}
                        <span className="text-aeros-blue">statuspulse</span>, <span className="text-aeros-blue">aerosdev.com</span>,
                        or mobile monitoring alerts. Cached for 2s with zero idle overhead.
                    </p>

                    <div className="space-y-4 text-xs">
                        <div className="flex flex-col">
                            <label className="mb-1.5 text-aeros-purple">OPTIONAL_ACCESS_TOKEN (Bearer or ?token=)</label>
                            <div className="flex gap-2">
                                <input
                                    type="text"
                                    value={token}
                                    onChange={(e) => setToken(e.target.value)}
                                    placeholder="Leave blank for open read-only access"
                                    className="flex-1 bg-[#0a0a0a] border border-aeros-gray px-3 py-2 text-white focus:border-aeros-blue outline-none font-mono"
                                />
                                <button
                                    type="button"
                                    onClick={() => setToken(generateRandomToken())}
                                    className="px-3 py-2 border border-aeros-gray text-gray-300 hover:border-aeros-blue hover:text-aeros-blue bg-transparent cursor-pointer flex items-center"
                                    title="Generate random token"
                                >
                                    <RefreshCw size={14} className="mr-1.5" />
                                    GEN
                                </button>
                                {token && (
                                    <button
                                        type="button"
                                        onClick={() => setToken('')}
                                        className="px-3 py-2 border border-aeros-gray text-gray-400 hover:border-error-color hover:text-error-color bg-transparent cursor-pointer"
                                    >
                                        CLEAR
                                    </button>
                                )}
                            </div>
                        </div>

                        <div className="border border-aeros-gray bg-black p-3 flex items-center justify-between gap-3">
                            <span className="text-gray-300 truncate">{endpointPreview}</span>
                            <div className="flex gap-2 shrink-0">
                                <button
                                    type="button"
                                    onClick={handleCopyUrl}
                                    className="px-2.5 py-1 border border-aeros-gray text-gray-300 hover:border-aeros-blue hover:text-aeros-blue bg-transparent cursor-pointer flex items-center"
                                >
                                    {copied ? <Check size={13} className="mr-1 text-green-400" /> : <Copy size={13} className="mr-1" />}
                                    {copied ? 'COPIED' : 'COPY'}
                                </button>
                                <button
                                    type="button"
                                    onClick={handleTestEndpoint}
                                    disabled={testing}
                                    className="px-2.5 py-1 border border-aeros-gray text-aeros-purple hover:border-aeros-purple bg-transparent cursor-pointer flex items-center"
                                >
                                    <Play size={13} className="mr-1" />
                                    {testing ? '...' : 'TEST'}
                                </button>
                            </div>
                        </div>

                        {testOutput && (
                            <pre className="border border-aeros-gray bg-black p-3 text-[11px] text-gray-300 overflow-x-auto max-h-56 m-0">
                                {testOutput}
                            </pre>
                        )}

                        {statusMessage && (
                            <div className="text-aeros-blue">{statusMessage}</div>
                        )}

                        <div className="pt-3 border-t border-aeros-gray">
                            <button
                                type="submit"
                                disabled={savingStatus}
                                className="px-5 py-2 border border-aeros-blue text-aeros-blue bg-transparent hover:bg-aeros-blue hover:text-black cursor-pointer font-bold flex items-center disabled:opacity-50"
                            >
                                <Save size={15} className="mr-2" />
                                {savingStatus ? 'SAVING...' : 'SAVE_STATUS_CONFIG'}
                            </button>
                        </div>
                    </div>
                </form>

                <form onSubmit={handlePasswordUpdate} className="terminal-card border-aeros-gray !p-8 bg-[#050505]">
                    <div className="text-aeros-blue flex items-center mb-6 font-bold text-lg">
                        <KeyRound className="mr-4 text-aeros-blue" size={22} />
                        ADMIN_SECURITY
                    </div>

                    <div className="space-y-4 text-xs">
                        <div className="flex flex-col">
                            <label className="mb-1.5 text-gray-400">CURRENT_PASSWORD</label>
                            <input
                                type="password"
                                required
                                autoComplete="current-password"
                                value={currentPassword}
                                onChange={(e) => setCurrentPassword(e.target.value)}
                                className="bg-[#0a0a0a] border border-aeros-gray px-3 py-2 text-white focus:border-aeros-blue outline-none font-mono"
                            />
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div className="flex flex-col">
                                <label className="mb-1.5 text-gray-400">NEW_PASSWORD</label>
                                <input
                                    type="password"
                                    required
                                    minLength={10}
                                    autoComplete="new-password"
                                    value={newPassword}
                                    onChange={(e) => setNewPassword(e.target.value)}
                                    placeholder="Min. 10 characters"
                                    className="bg-[#0a0a0a] border border-aeros-gray px-3 py-2 text-white focus:border-aeros-blue outline-none font-mono"
                                />
                            </div>
                            <div className="flex flex-col">
                                <label className="mb-1.5 text-gray-400">CONFIRM_NEW_PASSWORD</label>
                                <input
                                    type="password"
                                    required
                                    minLength={10}
                                    autoComplete="new-password"
                                    value={confirmPassword}
                                    onChange={(e) => setConfirmPassword(e.target.value)}
                                    placeholder="Min. 10 characters"
                                    className="bg-[#0a0a0a] border border-aeros-gray px-3 py-2 text-white focus:border-aeros-blue outline-none font-mono"
                                />
                            </div>
                        </div>

                        {passwordMessage && (
                            <div className={passwordMessage.ok ? 'text-green-400' : 'text-red-400'}>
                                {passwordMessage.text}
                            </div>
                        )}

                        <div className="pt-3 border-t border-aeros-gray">
                            <button
                                type="submit"
                                disabled={savingPassword}
                                className="px-5 py-2 border border-aeros-purple text-aeros-purple bg-transparent hover:bg-aeros-purple hover:text-white cursor-pointer font-bold flex items-center disabled:opacity-50"
                            >
                                <KeyRound size={15} className="mr-2" />
                                {savingPassword ? 'UPDATING...' : 'UPDATE_PASSWORD'}
                            </button>
                        </div>
                    </div>
                </form>
            </div>
        </div>
    );
}
