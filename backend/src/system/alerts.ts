import { randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { assertManageableServiceName, daemonReload } from './systemd';

export const ALERTS_SUPPORTED = process.platform === 'linux';
const PROVIDERS = ['discord', 'telegram', 'ntfy', 'json'] as const;
export type AlertProvider = typeof PROVIDERS[number];

export interface AlertConfiguration {
    enabled: boolean;
    provider: AlertProvider;
    webhookUrl: string;
}

const defaultPaths = {
    configFile: '/etc/aeros-panel/alerts.env',
    systemdDir: '/etc/systemd/system',
    reload: daemonReload
};

const CONFIG_PREFIX = 'AEROS_ALERTS_CONFIG=';
export const FAILURE_DROP_IN = '[Unit]\nOnFailure=aeros-notify@%n.service\n';

export function validateAlertProvider(provider: unknown): AlertProvider {
    for (const value of PROVIDERS) {
        if (provider === value) return value;
    }
    throw new Error('Select Discord, Telegram, ntfy, or a JSON webhook.');
}

export function validateAlertWebhook(input: unknown, provider: AlertProvider): URL {
    if (typeof input !== 'string' || input.length > 4096 || !/^https?:\/\//i.test(input) ||
        /[\s\p{Cc}\p{Cf}\\]|%(?:0[\da-f]|1[\da-f]|7f)/iu.test(input)) {
        throw new Error('Enter a valid HTTP or HTTPS webhook URL.');
    }

    let url: URL;
    try {
        url = new URL(input);
    } catch {
        throw new Error('Enter a valid HTTP or HTTPS webhook URL.');
    }
    if (url.username || url.password || url.hash) {
        throw new Error('Webhook URLs cannot contain user credentials or fragments.');
    }
    if (provider === 'telegram' && !/^(?:-?\d+|@[a-z\d_]+)$/i.test(url.searchParams.get('chat_id') ?? '')) {
        throw new Error('Add a valid chat_id query parameter to the Telegram sendMessage URL.');
    }
    return url;
}

function quoteUnitArgument(value: string): string {
    if (/[\r\n\0]/.test(value)) throw new Error('Invalid notification executable path.');
    return `"${value.replace(/[\\"]/g, '\\$&').replace(/%/g, '%%')}"`;
}

export function renderAlertUnit(node = process.execPath): string {
    const entry = path.resolve(__dirname, '../../dist/system/alerts.js');
    return [
        '[Unit]',
        'Description=AerosPanel failure notification for %i',
        '',
        '[Service]',
        'Type=oneshot',
        `ExecStart=:${quoteUnitArgument(node)} ${quoteUnitArgument(entry)} %i`,
        'TimeoutStartSec=15s',
        'NoNewPrivileges=yes',
        'ProtectSystem=strict',
        'ProtectHome=read-only',
        'PrivateTmp=yes',
        'UMask=0077',
        ''
    ].join('\n');
}

async function writeFileAtomically(file: string, content: string, mode: number): Promise<void> {
    const temporary = `${file}.${randomUUID()}.tmp`;
    const handle = await fs.open(temporary, 'wx', mode);
    try {
        try {
            await handle.chmod(mode);
            await handle.writeFile(content, 'utf8');
        } finally {
            await handle.close();
        }
        await fs.rename(temporary, file);
    } finally {
        await fs.rm(temporary, { force: true });
    }
}

async function removeFile(file: string): Promise<boolean> {
    try {
        await fs.unlink(file);
        return true;
    } catch (error: any) {
        if (error.code === 'ENOENT') return false;
        throw error;
    }
}

export async function readAlertConfiguration(configFile = defaultPaths.configFile): Promise<AlertConfiguration | null> {
    if (!ALERTS_SUPPORTED) return null;
    let data: string;
    try {
        data = await fs.readFile(configFile, 'utf8');
    } catch (error: any) {
        if (error.code === 'ENOENT') return null;
        throw error;
    }
    try {
        if (!data.startsWith(CONFIG_PREFIX)) throw new Error();
        const raw = JSON.parse(Buffer.from(data.slice(CONFIG_PREFIX.length).trim(), 'base64').toString('utf8'));
        if (typeof raw.enabled !== 'boolean') throw new Error();
        const provider = validateAlertProvider(raw.provider);
        return { enabled: raw.enabled, provider, webhookUrl: validateAlertWebhook(raw.webhookUrl, provider).href };
    } catch {
        throw new Error('Invalid saved alert configuration.');
    }
}

async function updateDropIn(serviceName: string, enabled: boolean, systemdDir: string): Promise<boolean> {
    const dir = path.join(systemdDir, `${serviceName}.service.d`);
    const file = path.join(dir, '10-aeros-alerts.conf');
    if (!enabled) return removeFile(file);

    await fs.mkdir(dir, { recursive: true, mode: 0o755 });
    await writeFileAtomically(file, FAILURE_DROP_IN, 0o644);
    return true;
}

export async function setProjectFailureAlert(serviceName: string, enabled: boolean): Promise<void> {
    assertManageableServiceName(serviceName);
    if (ALERTS_SUPPORTED && await updateDropIn(serviceName, enabled, defaultPaths.systemdDir)) {
        await daemonReload();
    }
}

export async function applyAlertConfiguration(
    config: AlertConfiguration | null,
    services: string[],
    paths = defaultPaths
): Promise<void> {
    for (const service of services) assertManageableServiceName(service);
    if (!ALERTS_SUPPORTED) return;

    if (config) {
        const provider = validateAlertProvider(config.provider);
        const webhookUrl = validateAlertWebhook(config.webhookUrl, provider).href;
        const encoded = Buffer.from(JSON.stringify({ enabled: config.enabled, provider, webhookUrl })).toString('base64');
        await fs.mkdir(path.dirname(paths.configFile), { recursive: true, mode: 0o700 });
        await writeFileAtomically(paths.configFile, `${CONFIG_PREFIX}${encoded}\n`, 0o600);
    } else {
        await removeFile(paths.configFile);
    }

    const enabled = config?.enabled === true;
    if (enabled) {
        await writeFileAtomically(path.join(paths.systemdDir, 'aeros-notify@.service'), renderAlertUnit(), 0o644);
    }
    let reload = enabled;
    for (const service of services) {
        if (await updateDropIn(service, enabled, paths.systemdDir)) reload = true;
    }
    if (reload) await paths.reload();
}

export async function sendAlert(config: AlertConfiguration, serviceName?: string): Promise<void> {
    if (serviceName !== undefined) assertManageableServiceName(serviceName);
    const { provider } = config;
    const url = validateAlertWebhook(config.webhookUrl, provider);
    const unit = serviceName ? `${serviceName}.service` : null;
    const message = unit ? `AerosPanel: ${unit} failed.` : 'AerosPanel: test alert.';
    const timestamp = new Date().toISOString();
    const payloads = {
        discord: { content: message, allowed_mentions: { parse: [] } },
        telegram: { chat_id: url.searchParams.get('chat_id'), text: message },
        json: { event: unit ? 'service.failed' : 'alert.test', service: unit, message, timestamp }
    };
    if (provider === 'telegram') url.searchParams.delete('chat_id');

    let response: Response;
    try {
        response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': provider === 'ntfy' ? 'text/plain; charset=utf-8' : 'application/json' },
            body: provider === 'ntfy' ? message : JSON.stringify(payloads[provider]),
            redirect: 'error',
            signal: AbortSignal.timeout(10000)
        });
    } catch {
        throw new Error('Could not reach the alert webhook.');
    }
    await response.body?.cancel().catch(() => {});
    if (!response.ok) throw new Error(`Alert webhook responded with HTTP ${response.status}.`);
}

async function notifyFromSystemd(unit: string | undefined): Promise<void> {
    if (!unit?.endsWith('.service')) throw new Error('Invalid failure notification unit.');
    const config = await readAlertConfiguration();
    if (config?.enabled) await sendAlert(config, unit.slice(0, -'.service'.length));
}

if (require.main === module) {
    void notifyFromSystemd(process.argv[2]).catch(() => {
        console.error('AerosPanel could not deliver the failure notification.');
        process.exitCode = 1;
    });
}
