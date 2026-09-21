import React from 'react';
import { Terminal, Server, FolderGit2, Settings, Power } from 'lucide-react';

interface LayoutProps {
    children: React.ReactNode;
    currentPath: string;
    onNavigate: (path: string) => void;
}

export function Layout({ children, currentPath, onNavigate }: LayoutProps) {
    const navItems = [
        { id: 'dashboard', label: 'DASHBOARD', icon: <Terminal size={18} /> },
        { id: 'projects', label: 'PROJECTS', icon: <FolderGit2 size={18} /> },
        { id: 'server', label: 'SERVER_INFO', icon: <Server size={18} /> },
        { id: 'settings', label: 'SETTINGS', icon: <Settings size={18} /> },
    ];

    return (
        <div className="flex h-screen bg-black text-gray-300 font-mono overflow-hidden">
            <aside className="w-64 border-r border-panel-border flex flex-col">
                <div className="p-6 border-b border-panel-border">
                    <h1 className="text-xl text-cyan-500 font-bold tracking-widest">AEROS_PANEL</h1>
                    <p className="text-xs text-gray-500 mt-1">v1.0.0 // ONLINE</p>
                </div>
                <nav className="flex-1 p-4 space-y-2">
                    {navItems.map((item) => (
                        <button
                            key={item.id}
                            onClick={() => onNavigate(item.id)}
                            className={`w-full flex items-center space-x-3 px-4 py-3 rounded-none transition-colors text-left
                                ${currentPath === item.id 
                                    ? 'bg-panel-border text-cyan-500 border-l-2 border-cyan-500' 
                                    : 'hover:bg-panel-bg hover:text-white border-l-2 border-transparent'
                                }`}
                        >
                            {item.icon}
                            <span className="tracking-wider">{item.label}</span>
                        </button>
                    ))}
                </nav>
                <div className="p-4 border-t border-panel-border">
                    <div className="flex items-center justify-between text-xs">
                        <div>
                            <span className="text-gray-400">USER_ADMIN</span>
                            <div className="flex items-center mt-1">
                                <div className="w-2 h-2 bg-neon-green rounded-full mr-2"></div>
                                <span className="text-neon-green">ONLINE</span>
                            </div>
                        </div>
                        <button className="text-gray-500 hover:text-red-500">
                            <Power size={16} />
                        </button>
                    </div>
                </div>
            </aside>
            <main className="flex-1 overflow-auto bg-panel-bg p-8">
                {children}
            </main>
        </div>
    );
}
