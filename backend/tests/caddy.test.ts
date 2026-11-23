import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
    generateCaddySnippet,
    getCaddySnippetPath,
    validateDomain,
    validatePort
} from '../src/system/caddy';

describe('validateDomain', () => {
    it('accepts valid FQDNs and normalizes to lowercase', () => {
        assert.equal(validateDomain('app.example.com'), 'app.example.com');
        assert.equal(validateDomain('  API.Sub-Domain.Example.ORG '), 'api.sub-domain.example.org');
    });

    it('rejects malformed domains, wildcards, paths, and injection attempts', () => {
        assert.throws(() => validateDomain('localhost'), /Invalid domain name/);
        assert.throws(() => validateDomain('*.example.com'), /Invalid domain name/);
        assert.throws(() => validateDomain('https://example.com'), /Invalid domain name/);
        assert.throws(() => validateDomain('example.com:8080'), /Invalid domain name/);
        assert.throws(() => validateDomain('app.example.com {\n respond "hi"\n}'), /Invalid domain name/);
        assert.throws(() => validateDomain('-bad.example.com'), /Invalid domain name/);
        assert.throws(() => validateDomain('127.0.0.1'), /Invalid domain name/);
    });
});

describe('validatePort', () => {
    it('accepts valid TCP port numbers', () => {
        assert.equal(validatePort(80), 80);
        assert.equal(validatePort('3000'), 3000);
        assert.equal(validatePort(65535), 65535);
    });

    it('rejects out-of-range and non-integer ports', () => {
        assert.throws(() => validatePort(0), /between 1 and 65535/);
        assert.throws(() => validatePort(65536), /between 1 and 65535/);
        assert.throws(() => validatePort(-1), /between 1 and 65535/);
        assert.throws(() => validatePort(3000.5), /between 1 and 65535/);
        assert.throws(() => validatePort('abc'), /between 1 and 65535/);
    });
});

describe('getCaddySnippetPath and generateCaddySnippet', () => {
    it('builds isolated snippet paths and blocks reserved service names', () => {
        assert.equal(getCaddySnippetPath('my-api'), '/etc/caddy/conf.d/aeros-my-api.caddy');
        assert.throws(() => getCaddySnippetPath('ssh'), /reserved/);
        assert.throws(() => getCaddySnippetPath('../etc/passwd'), /Invalid systemd service name/);
    });

    it('generates a clean reverse_proxy snippet', () => {
        const result = generateCaddySnippet('Panel.Example.com', 8080);
        assert.equal(result.domain, 'panel.example.com');
        assert.equal(result.port, 8080);
        assert.equal(
            result.content,
            '# Managed by AerosPanel\npanel.example.com {\n    reverse_proxy 127.0.0.1:8080\n}\n'
        );
    });
});
