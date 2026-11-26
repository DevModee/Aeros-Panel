import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { it } from 'node:test';
import {
    ALERTS_SUPPORTED,
    applyAlertConfiguration,
    FAILURE_DROP_IN,
    readAlertConfiguration,
    renderAlertUnit,
    sendAlert,
    setProjectFailureAlert,
    validateAlertProvider,
    validateAlertWebhook,
    type AlertConfiguration
} from '../src/system/alerts';

const config: AlertConfiguration = { enabled: true, provider: 'json', webhookUrl: 'https://example.test/hooks/fixture' };

it('accepts HTTP(S) destinations and validates Telegram chat IDs', () => {
    assert.equal(validateAlertWebhook('http://localhost/topic', 'ntfy').href, 'http://localhost/topic');
    assert.equal(validateAlertWebhook(config.webhookUrl, 'discord').href, config.webhookUrl);
    assert.equal(validateAlertWebhook('https://example.test/sendMessage?chat_id=-123', 'telegram').searchParams.get('chat_id'), '-123');
    assert.throws(() => validateAlertWebhook(config.webhookUrl, 'telegram'), /chat_id/);
    assert.throws(() => validateAlertProvider('smtp'), /Select Discord/);
});

it('rejects unsafe URLs without echoing their contents', () => {
    for (const input of [null, '', 'file:///etc/passwd', 'https://', 'https://example.test/\nhook',
        'https://example.test/\x00hook', 'https://example.test/%0d%0a', 'https://example.test/\u200b',
        'https://example.test\\hook', 'https://user:fixture@example.test/hook', 'http://example.test/#fragment']) {
        assert.throws(() => validateAlertWebhook(input, 'json'), {
            message: /valid HTTP or HTTPS webhook URL|cannot contain user credentials or fragments/
        });
    }
});

it('renders a oneshot unit and failure drop-in with no webhook data', () => {
    const unit = renderAlertUnit('/opt/aeros tools/node%20');
    assert.match(unit, /^Type=oneshot$/m);
    assert.match(unit, /^ExecStart=:"\/opt\/aeros tools\/node%%20" ".+alerts\.js" %i$/m);
    assert.doesNotMatch(unit, /https?:\/\/|Environment=/);
    assert.equal(FAILURE_DROP_IN, '[Unit]\nOnFailure=aeros-notify@%n.service\n');
});

it('sends the payload and content type each provider expects', async (t) => {
    const requests: Array<{ url: URL; init: RequestInit }> = [];
    t.mock.method(globalThis, 'fetch', async (url: URL, init: RequestInit) => {
        requests.push({ url, init });
        return new Response(null, { status: 204 });
    });

    await sendAlert({ ...config, provider: 'discord' }, 'example');
    await sendAlert({ ...config, provider: 'telegram', webhookUrl: `${config.webhookUrl}?chat_id=-123` });
    await sendAlert({ ...config, provider: 'ntfy' }, 'example');
    await sendAlert(config, 'example');

    assert.ok(requests.every(({ init }) => init.method === 'POST' && init.redirect === 'error' && init.signal));
    assert.deepEqual(JSON.parse(String(requests[0].init.body)), {
        content: 'AerosPanel: example.service failed.', allowed_mentions: { parse: [] }
    });
    assert.equal(requests[1].url.searchParams.has('chat_id'), false);
    assert.deepEqual(JSON.parse(String(requests[1].init.body)), { chat_id: '-123', text: 'AerosPanel: test alert.' });
    assert.equal(new Headers(requests[2].init.headers).get('Content-Type'), 'text/plain; charset=utf-8');
    assert.equal(requests[2].init.body, 'AerosPanel: example.service failed.');
    const json = JSON.parse(String(requests[3].init.body));
    assert.equal(json.event, 'service.failed');
    assert.equal(json.service, 'example.service');
    assert.ok(Number.isFinite(Date.parse(json.timestamp)));
});

it('reports HTTP and transport failures without exposing the webhook', async (t) => {
    const fetch = t.mock.method(globalThis, 'fetch', async () => new Response('fixture', { status: 403 }));
    await assert.rejects(sendAlert(config), { message: 'Alert webhook responded with HTTP 403.' });
    fetch.mock.mockImplementation(async () => { throw new Error(config.webhookUrl); });
    await assert.rejects(sendAlert(config), { message: 'Could not reach the alert webhook.' });
});

it('validates service names before editing drop-ins or sending failure alerts', async () => {
    await assert.rejects(setProjectFailureAlert('../example', true), /Invalid systemd service name/);
    await assert.rejects(applyAlertConfiguration(config, ['sshd']), /reserved/);
    await assert.rejects(sendAlert(config, 'aeros-panel'), /reserved/);
});

it('installs private configuration and toggles only its drop-in', { skip: !ALERTS_SUPPORTED }, async (t) => {
    const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'aeros-alerts-test-'));
    t.after(() => fs.rm(temporary, { recursive: true, force: true }));
    const systemdDir = path.join(temporary, 'systemd');
    const configFile = path.join(temporary, 'config', 'alerts.env');
    const unitFile = path.join(systemdDir, 'example.service');
    const dropIn = path.join(systemdDir, 'example.service.d', '10-aeros-alerts.conf');
    const template = path.join(systemdDir, 'aeros-notify@.service');
    let reloads = 0;
    const paths = { systemdDir, configFile, reload: async () => { reloads++; } };
    await fs.mkdir(systemdDir);
    await fs.writeFile(unitFile, '[Service]\nType=simple\n');
    await applyAlertConfiguration(config, ['example'], paths);

    assert.deepEqual(await readAlertConfiguration(configFile), config);
    assert.equal((await fs.stat(configFile)).mode & 0o777, 0o600);
    assert.equal((await fs.stat(template)).mode & 0o777, 0o644);
    assert.equal(await fs.readFile(dropIn, 'utf8'), FAILURE_DROP_IN);
    assert.equal((await fs.stat(dropIn)).mode & 0o777, 0o644);
    const adjacent = path.join(path.dirname(dropIn), '99-custom.conf');
    await fs.writeFile(adjacent, '[Unit]\n');

    await applyAlertConfiguration({ ...config, enabled: false }, ['example'], paths);
    assert.equal((await readAlertConfiguration(configFile))?.enabled, false);
    await assert.rejects(fs.stat(dropIn), { code: 'ENOENT' });
    assert.equal(await fs.readFile(unitFile, 'utf8'), '[Service]\nType=simple\n');
    assert.equal(await fs.readFile(adjacent, 'utf8'), '[Unit]\n');
    assert.equal(reloads, 2);
});

it('skips system files and reloads on non-Linux hosts', { skip: ALERTS_SUPPORTED }, async () => {
    await applyAlertConfiguration(config, ['example'], {
        configFile: '', systemdDir: '', reload: async () => assert.fail('unexpected systemd reload')
    });
    await setProjectFailureAlert('example', true);
    assert.equal(await readAlertConfiguration(''), null);
});
