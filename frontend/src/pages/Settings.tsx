import { Settings as SettingsIcon, Save } from 'lucide-react';

export function Settings() {
    return (
        <div className="max-w-4xl mx-auto flex flex-col h-full font-mono">
            <header className="mb-6 flex justify-between items-end">
                <div>
                    <h2 className="text-3xl font-bold text-aeros-blue tracking-widest mb-2">SYSTEM_SETTINGS</h2>
                    <p className="text-gray-400">Configure global panel parameters.</p>
                </div>
            </header>

            <div className="terminal-card border-aeros-gray p-6">
                <header className="text-aeros-blue flex items-center mb-6">
                    <SettingsIcon className="mr-2" size={18} />
                    GLOBAL_CONFIG
                </header>
                
                <div className="space-y-6 text-gray-300">
                    <div className="flex flex-col">
                        <label className="mb-2 text-aeros-purple">SSH_PORT</label>
                        <input type="text" className="bg-[#0a0a0a] border border-aeros-gray p-2 text-white focus:border-aeros-purple outline-none" defaultValue="22" />
                    </div>
                    
                    <div className="flex flex-col">
                        <label className="mb-2 text-aeros-purple">UPDATE_CHANNEL</label>
                        <select className="bg-[#0a0a0a] border border-aeros-gray p-2 text-white focus:border-aeros-purple outline-none">
                            <option>STABLE</option>
                            <option>BETA</option>
                            <option>NIGHTLY</option>
                        </select>
                    </div>

                    <div className="flex flex-col">
                        <label className="mb-2 text-aeros-purple">API_KEY</label>
                        <input type="password" className="bg-[#0a0a0a] border border-aeros-gray p-2 text-white focus:border-aeros-purple outline-none" defaultValue="********" />
                    </div>

                    <div className="pt-4 border-t border-aeros-gray">
                        <button className="btn btn-primary text-aeros-blue border-aeros-blue flex items-center bg-transparent hover:bg-aeros-blue hover:text-aeros-dark cursor-pointer px-6">
                            <Save size={16} className="mr-2" />
                            APPLY_CHANGES
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
