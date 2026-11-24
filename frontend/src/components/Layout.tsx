import { useState } from 'react';
import { Terminal, Server, FolderGit2, Power, Settings as SettingsIcon, Menu, X } from 'lucide-react';
import type { AuthUser } from '../pages/Login';

interface LayoutProps {
    children: React.ReactNode;
    currentPath: string;
    onNavigate: (path: string) => void;
    user: AuthUser;
    onLogout: () => void;
}

export function Layout({ children, currentPath, onNavigate, user, onLogout }: LayoutProps) {
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

    const navItems = [
        { id: 'dashboard', label: 'DASHBOARD', icon: <Terminal size={18} /> },
        { id: 'projects', label: 'PROJECTS', icon: <FolderGit2 size={18} /> },
        { id: 'server', label: 'SERVER_INFO', icon: <Server size={18} /> },
        { id: 'settings', label: 'SETTINGS', icon: <SettingsIcon size={18} /> },
    ];

    const handleNav = (id: string) => {
        onNavigate(id);
        setMobileMenuOpen(false);
    };

    return (
        <div className="flex flex-col md:flex-row h-screen bg-aeros-dark text-aeros-text font-mono overflow-hidden">
            {/* Mobile top bar */}
            <header className="flex items-center justify-between px-4 py-3 border-b border-aeros-gray bg-aeros-dark md:hidden shrink-0">
                <div className="flex items-center gap-3">
                    <button
                        type="button"
                        onClick={() => setMobileMenuOpen((prev) => !prev)}
                        aria-label={mobileMenuOpen ? 'Close navigation menu' : 'Open navigation menu'}
                        className="text-aeros-blue bg-transparent border border-aeros-gray p-1.5 cursor-pointer"
                    >
                        {mobileMenuOpen ? <X size={18} /> : <Menu size={18} />}
                    </button>
                    <div className="flex items-center gap-2">
                        <img src="/logo.webp" alt="Aeros Logo" className="w-7 h-7 object-contain" />
                        <span className="text-base text-aeros-blue font-bold tracking-widest">AEROS</span>
                    </div>
                </div>
                <div className="flex items-center gap-3 text-xs">
                    <span className="text-gray-400 hidden sm:inline">USER_{user.username.toUpperCase()}</span>
                    <button
                        type="button"
                        onClick={onLogout}
                        title="Log out"
                        className="text-aeros-text hover:text-error-color border-0 bg-transparent cursor-pointer p-1"
                    >
                        <Power size={16} />
                    </button>
                </div>
            </header>

            {/* Mobile backdrop */}
            {mobileMenuOpen && (
                <div
                    className="fixed inset-0 z-30 bg-black/75 md:hidden"
                    onClick={() => setMobileMenuOpen(false)}
                />
            )}

            {/* Sidebar / Mobile Drawer */}
            <aside
                className={`fixed inset-y-0 left-0 z-40 w-64 border-r border-aeros-gray flex flex-col bg-aeros-dark transition-transform duration-150 md:static md:translate-x-0 ${
                    mobileMenuOpen ? 'translate-x-0' : '-translate-x-full'
                }`}
            >
                <div className="p-6 border-b border-aeros-gray flex items-center justify-between">
                    <div className="flex items-center">
                        <img src="/logo.webp" alt="Aeros Logo" className="w-10 h-10 mr-3 object-contain" />
                        <div>
                            <h1 className="text-xl text-aeros-blue font-bold tracking-widest">AEROS</h1>
                            <p className="text-xs text-aeros-purple mt-1">v2.0.0 // ONLINE</p>
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={() => setMobileMenuOpen(false)}
                        aria-label="Close menu"
                        className="md:hidden text-gray-400 hover:text-white bg-transparent border-0 cursor-pointer"
                    >
                        <X size={18} />
                    </button>
                </div>
                <nav className="flex-1 p-4 space-y-2 overflow-y-auto">
                    <ul className="list-none p-0 m-0 flex flex-col gap-2">
                        {navItems.map((item) => (
                            <li key={item.id} className="m-0">
                                <button
                                    type="button"
                                    onClick={() => handleNav(item.id)}
                                    className={`w-full flex items-center space-x-3 px-4 py-3 rounded-none transition-colors text-left border-0 cursor-pointer font-mono
                                        ${currentPath === item.id 
                                            ? 'bg-aeros-gray text-aeros-blue border-l-2 border-aeros-purple' 
                                            : 'bg-transparent text-aeros-text hover:bg-aeros-gray hover:text-white border-l-2 border-transparent'
                                        }`}
                                >
                                    {item.icon}
                                    <span className="tracking-wider">{item.label}</span>
                                </button>
                            </li>
                        ))}
                    </ul>
                </nav>
                <div className="p-4 border-t border-aeros-gray">
                    <div className="flex items-center justify-between text-xs">
                        <div>
                            <span className="text-gray-400">USER_{user.username.toUpperCase()}</span>
                            <div className="flex items-center mt-1">
                                <div className="w-2 h-2 bg-aeros-purple rounded-full mr-2"></div>
                                <span className="text-aeros-purple">ONLINE</span>
                            </div>
                        </div>
                        <button
                            type="button"
                            onClick={onLogout}
                            title="Log out"
                            className="text-aeros-text hover:text-error-color border-0 bg-transparent cursor-pointer"
                        >
                            <Power size={16} />
                        </button>
                    </div>
                </div>
            </aside>
            <main className="flex-1 overflow-auto bg-aeros-dark p-4 sm:p-6 md:p-8">
                {children}
            </main>
        </div>
    );
}
