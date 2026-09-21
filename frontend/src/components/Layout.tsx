
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
        <div className="flex h-screen bg-aeros-dark text-aeros-text font-mono overflow-hidden">
            <aside className="w-64 border-r border-aeros-gray flex flex-col bg-aeros-dark">
                <div className="p-6 border-b border-aeros-gray flex items-center">
                    <img src="/logo.webp" alt="Aeros Logo" className="w-10 h-10 mr-3 object-contain" />
                    <div>
                        <h1 className="text-xl text-aeros-blue font-bold tracking-widest">AEROS</h1>
                        <p className="text-xs text-aeros-purple mt-1">v1.0.0 // ONLINE</p>
                    </div>
                </div>
                <nav className="flex-1 p-4 space-y-2 terminal-menu">
                    <ul className="list-none p-0 m-0">
                        {navItems.map((item) => (
                            <li key={item.id} className="m-0">
                                <button
                                    onClick={() => onNavigate(item.id)}
                                    className={`w-full flex items-center space-x-3 px-4 py-3 rounded-none transition-colors text-left border-0 cursor-pointer
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
                            <span className="text-gray-400">USER_ADMIN</span>
                            <div className="flex items-center mt-1">
                                <div className="w-2 h-2 bg-aeros-purple rounded-full mr-2"></div>
                                <span className="text-aeros-purple">ONLINE</span>
                            </div>
                        </div>
                        <button className="text-aeros-text hover:text-error-color border-0 bg-transparent cursor-pointer">
                            <Power size={16} />
                        </button>
                    </div>
                </div>
            </aside>
            <main className="flex-1 overflow-auto bg-aeros-dark p-8">
                {children}
            </main>
        </div>
    );
}
