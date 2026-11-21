import { useState, type FormEvent } from 'react';
import { Lock, ShieldCheck, AlertTriangle } from 'lucide-react';
import { apiFetch, ApiError } from '../lib/api';

export interface AuthUser {
    id: number;
    username: string;
}

interface LoginProps {
    setupRequired: boolean;
    onAuthenticated: (user: AuthUser) => void;
}

export function Login({ setupRequired, onAuthenticated }: LoginProps) {
    const [username, setUsername] = useState('admin');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);

    const handleSubmit = async (e: FormEvent) => {
        e.preventDefault();
        setError(null);

        if (setupRequired && password !== confirmPassword) {
            setError('Passwords do not match.');
            return;
        }

        if (password.length < 6) {
            setError('Password must be at least 6 characters.');
            return;
        }

        setLoading(true);
        try {
            const endpoint = setupRequired ? '/api/auth/setup' : '/api/auth/login';
            const data = await apiFetch<{ authenticated: boolean; user: AuthUser }>(
                endpoint,
                {
                    method: 'POST',
                    body: JSON.stringify({ username: username.trim(), password })
                },
                { skipAuthRedirect: true }
            );
            onAuthenticated(data.user);
        } catch (err) {
            if (err instanceof ApiError) {
                setError(err.message);
            } else {
                setError('Unable to connect to AerosPanel backend.');
            }
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-aeros-dark text-aeros-text font-mono flex items-center justify-center p-6">
            <div className="w-full max-w-md terminal-card border-aeros-gray !p-8 bg-[#050505]">
                <div className="flex items-center mb-6 pb-6 border-b border-aeros-gray">
                    <img src="/logo.webp" alt="Aeros Logo" className="w-11 h-11 mr-4 object-contain" />
                    <div>
                        <h1 className="text-2xl text-aeros-blue font-bold tracking-widest">AEROS_PANEL</h1>
                        <p className="text-xs text-aeros-purple mt-1">
                            {setupRequired ? 'FIRST_BOOT // INITIAL_ADMIN_SETUP' : 'AUTH_GATE // SESSION_REQUIRED'}
                        </p>
                    </div>
                </div>

                {setupRequired && (
                    <div className="mb-6 p-3 border border-aeros-blue/40 bg-[#001422] text-xs text-gray-300 flex items-start gap-3">
                        <ShieldCheck size={16} className="text-aeros-blue shrink-0 mt-0.5" />
                        <span>
                            No admin account found yet. Create your local administrator credentials to lock down terminal and systemd access.
                        </span>
                    </div>
                )}

                {error && (
                    <div className="mb-6 p-3 border border-error-color bg-red-950/30 text-xs text-red-400 flex items-center gap-2">
                        <AlertTriangle size={15} className="shrink-0" />
                        <span>{error}</span>
                    </div>
                )}

                <form onSubmit={handleSubmit} className="space-y-5">
                    <div className="flex flex-col">
                        <label htmlFor="aeros-username" className="text-xs text-aeros-blue mb-2 tracking-wider">
                            ADMIN_USERNAME
                        </label>
                        <input
                            id="aeros-username"
                            type="text"
                            autoComplete="username"
                            value={username}
                            onChange={(e) => setUsername(e.target.value)}
                            required
                            className="bg-[#0a0a0a] border border-aeros-gray px-3 py-2.5 text-sm text-white focus:border-aeros-blue outline-none font-mono"
                        />
                    </div>

                    <div className="flex flex-col">
                        <label htmlFor="aeros-password" className="text-xs text-aeros-blue mb-2 tracking-wider">
                            {setupRequired ? 'SET_PASSWORD' : 'PASSWORD'}
                        </label>
                        <input
                            id="aeros-password"
                            type="password"
                            autoComplete={setupRequired ? 'new-password' : 'current-password'}
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            required
                            minLength={6}
                            placeholder="••••••••"
                            className="bg-[#0a0a0a] border border-aeros-gray px-3 py-2.5 text-sm text-white focus:border-aeros-blue outline-none font-mono"
                        />
                    </div>

                    {setupRequired && (
                        <div className="flex flex-col">
                            <label htmlFor="aeros-confirm" className="text-xs text-aeros-blue mb-2 tracking-wider">
                                CONFIRM_PASSWORD
                            </label>
                            <input
                                id="aeros-confirm"
                                type="password"
                                autoComplete="new-password"
                                value={confirmPassword}
                                onChange={(e) => setConfirmPassword(e.target.value)}
                                required
                                minLength={6}
                                placeholder="••••••••"
                                className="bg-[#0a0a0a] border border-aeros-gray px-3 py-2.5 text-sm text-white focus:border-aeros-blue outline-none font-mono"
                            />
                        </div>
                    )}

                    <button
                        type="submit"
                        disabled={loading}
                        className="w-full mt-2 py-2.5 px-4 border border-aeros-blue text-aeros-blue bg-transparent hover:bg-aeros-blue hover:text-black transition-colors cursor-pointer font-mono text-sm font-bold tracking-wider flex items-center justify-center disabled:opacity-50"
                    >
                        <Lock size={15} className="mr-2" />
                        {loading
                            ? 'VERIFYING...'
                            : setupRequired
                                ? 'CREATE_ADMIN_&_ENTER'
                                : 'AUTHENTICATE'}
                    </button>
                </form>

                <div className="mt-6 pt-4 border-t border-aeros-gray text-[11px] text-gray-500 flex justify-between">
                    <span>SCRYPT + HTTPONLY SESSION</span>
                    <span>ZERO DOCKER</span>
                </div>
            </div>
        </div>
    );
}
