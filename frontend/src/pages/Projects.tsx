import React from 'react';
import { Terminal } from 'lucide-react';

export function Projects() {
    return (
        <div className="max-w-6xl mx-auto font-mono">
            <header className="mb-8 border-b border-panel-border pb-6 flex justify-between items-end">
                <div>
                    <h2 className="text-3xl font-bold text-cyan-500 tracking-widest mb-2">ACTIVE_PROJECTS</h2>
                    <p className="text-gray-400">Manage deployments and systemd services.</p>
                </div>
            </header>

            <div className="border border-panel-border bg-black p-5 flex items-center justify-center h-64 text-gray-500">
                <Terminal className="mr-3" />
                PROJECTS_MODULE_OFFLINE
            </div>
        </div>
    );
}
