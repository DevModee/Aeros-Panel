import { db } from './db';

export interface PublicStatusConfig {
    enabled: boolean;
    token: string;
}

const KEY_ENABLED = 'public_status_enabled';
const KEY_TOKEN = 'public_status_token';

export async function getSetting(key: string, defaultValue = ''): Promise<string> {
    const row = await db('settings').where('key', key).first();
    return row ? String(row.value) : defaultValue;
}

export async function setSetting(key: string, value: string): Promise<void> {
    await db('settings')
        .insert({ key, value })
        .onConflict('key')
        .merge({ value });
}

export async function getPublicStatusConfig(): Promise<PublicStatusConfig> {
    const [enabledRaw, token] = await Promise.all([
        getSetting(KEY_ENABLED, '0'),
        getSetting(KEY_TOKEN, '')
    ]);

    return {
        enabled: enabledRaw === '1',
        token
    };
}

export async function updatePublicStatusConfig(
    input: Partial<PublicStatusConfig>
): Promise<PublicStatusConfig> {
    if (typeof input.enabled === 'boolean') {
        await setSetting(KEY_ENABLED, input.enabled ? '1' : '0');
    }
    if (typeof input.token === 'string') {
        await setSetting(KEY_TOKEN, input.token.trim());
    }
    return getPublicStatusConfig();
}
