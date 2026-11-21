export type TemplateId = 'node' | 'python' | 'static' | 'java' | 'custom';

export interface ProjectTemplate {
    id: TemplateId;
    name: string;
    shortLabel: string;
    description: string;
    defaultExecStart: string;
    defaultBuildCmd: string;
    defaultMemoryMax: string;
    defaultUser: string;
    hint: string;
}

export const PROJECT_TEMPLATES: ProjectTemplate[] = [
    {
        id: 'node',
        name: 'Node.js / TypeScript',
        shortLabel: 'NODE.JS',
        description: 'Discord bots, Express/Fastify APIs, or TypeScript services running natively on Node.',
        defaultExecStart: '/usr/bin/node dist/index.js',
        defaultBuildCmd: 'npm run build',
        defaultMemoryMax: '256M',
        defaultUser: '',
        hint: 'Use /usr/bin/node index.js for plain JS projects without a build step.'
    },
    {
        id: 'python',
        name: 'Python (FastAPI / Bot)',
        shortLabel: 'PYTHON',
        description: 'Discord.py / Telegram bots, FastAPI, or Flask apps using a local virtualenv.',
        defaultExecStart: '{{WORK_DIR}}/.venv/bin/python main.py',
        defaultBuildCmd: '',
        defaultMemoryMax: '256M',
        defaultUser: '',
        hint: 'For FastAPI: {{WORK_DIR}}/.venv/bin/uvicorn main:app --host 0.0.0.0 --port 8000'
    },
    {
        id: 'static',
        name: 'Static / Vite',
        shortLabel: 'STATIC',
        description: 'Build Vite/React/Astro static sites and serve dist/ with minimal memory footprint.',
        defaultExecStart: '/usr/bin/python3 -m http.server 8080 --directory dist',
        defaultBuildCmd: 'npm run build',
        defaultMemoryMax: '128M',
        defaultUser: '',
        hint: 'Zero-config static file server; swap ExecStart for Caddy or serve if preferred.'
    },
    {
        id: 'java',
        name: 'Java / Minecraft',
        shortLabel: 'JAVA / MC',
        description: 'Minecraft servers (Paper/Fabric/Purpur) or Spring Boot JARs with explicit memory caps.',
        defaultExecStart: '/usr/bin/java -Xms512M -Xmx1G -jar server.jar nogui',
        defaultBuildCmd: '',
        defaultMemoryMax: '1536M',
        defaultUser: '',
        hint: 'Keep MemoryMax slightly above -Xmx so JVM overhead does not trigger OOM kills.'
    },
    {
        id: 'custom',
        name: 'Custom Command',
        shortLabel: 'CUSTOM',
        description: 'Go binaries, Rust services, Bun apps, or any custom Linux executable.',
        defaultExecStart: '/usr/bin/env bash start.sh',
        defaultBuildCmd: '',
        defaultMemoryMax: '512M',
        defaultUser: '',
        hint: 'Provide any absolute executable path and arguments for systemd ExecStart.'
    }
];

export const SERVICE_NAME_PATTERN = /^[a-z0-9][a-z0-9._-]{0,63}$/;
const USER_PATTERN = /^[a-z_][a-z0-9_-]{0,31}$/;
const MEMORY_MAX_PATTERN = /^\d+[KMG]?$/i;

export interface SystemdUnitConfig {
    name: string;
    serviceName: string;
    template: TemplateId;
    workDir?: string;
    execStart?: string;
    runUser?: string;
    memoryMax?: string;
}

export function getTemplateById(id: string): ProjectTemplate {
    return PROJECT_TEMPLATES.find((t) => t.id === id) || PROJECT_TEMPLATES[PROJECT_TEMPLATES.length - 1];
}

function sanitizeSingleLine(value: string): string {
    return value.replace(/[\r\n]+/g, ' ').trim();
}

export function validateUnitConfig(input: SystemdUnitConfig): {
    name: string;
    serviceName: string;
    template: TemplateId;
    workDir: string;
    execStart: string;
    runUser: string;
    memoryMax: string;
} {
    const name = sanitizeSingleLine(input.name);
    const serviceName = input.serviceName.trim().toLowerCase();
    const tpl = getTemplateById(input.template);

    if (!name) {
        throw new Error('Project name is required');
    }
    if (!SERVICE_NAME_PATTERN.test(serviceName)) {
        throw new Error('Invalid service_name. Use lowercase letters, numbers, dots, underscores, or hyphens.');
    }

    const workDir = sanitizeSingleLine(input.workDir || `/opt/${serviceName}`);
    if (!workDir.startsWith('/') || workDir.includes('..')) {
        throw new Error('Working directory must be an absolute Linux path (e.g. /opt/my-app).');
    }

    let execStart = sanitizeSingleLine(input.execStart || tpl.defaultExecStart);
    execStart = execStart.replace(/\{\{WORK_DIR\}\}/g, workDir);
    if (!execStart) {
        throw new Error('ExecStart command is required');
    }

    // systemd requires absolute paths for ExecStart executables
    if (execStart.startsWith('./')) {
        execStart = `${workDir}/${execStart.slice(2)}`;
    } else if (execStart.startsWith('.venv/')) {
        execStart = `${workDir}/${execStart}`;
    }

    const runUser = sanitizeSingleLine(input.runUser || '');
    if (runUser && !USER_PATTERN.test(runUser)) {
        throw new Error('Invalid Linux user name.');
    }

    const memoryMaxRaw = sanitizeSingleLine(input.memoryMax || '');
    if (memoryMaxRaw && !MEMORY_MAX_PATTERN.test(memoryMaxRaw)) {
        throw new Error('Invalid MemoryMax value. Examples: 256M, 512M, 1G.');
    }
    const memoryMax = memoryMaxRaw.toUpperCase();

    return {
        name,
        serviceName,
        template: tpl.id,
        workDir,
        execStart,
        runUser,
        memoryMax
    };
}

export function generateSystemdUnit(input: SystemdUnitConfig): {
    config: ReturnType<typeof validateUnitConfig>;
    unitContent: string;
} {
    const config = validateUnitConfig(input);
    const lines = [
        '[Unit]',
        `Description=AerosPanel Service: ${config.name}`,
        'After=network-online.target',
        'Wants=network-online.target',
        '',
        '[Service]',
        'Type=simple',
        `WorkingDirectory=${config.workDir}`,
        `EnvironmentFile=-${config.workDir}/.env`,
        `ExecStart=${config.execStart}`,
        'Restart=always',
        'RestartSec=5'
    ];

    if (config.runUser) {
        lines.push(`User=${config.runUser}`);
    }

    if (config.memoryMax) {
        lines.push(`MemoryMax=${config.memoryMax}`);
    }

    lines.push(
        'StandardOutput=journal',
        'StandardError=journal',
        `SyslogIdentifier=${config.serviceName}`,
        '',
        '[Install]',
        'WantedBy=multi-user.target',
        ''
    );

    return {
        config,
        unitContent: lines.join('\n')
    };
}
