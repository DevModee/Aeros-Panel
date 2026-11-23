import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { validateGitBranch, validateRepositoryUrl } from '../src/system/git';

describe('validateRepositoryUrl', () => {
    it('accepts https, http, ssh, and SCP-style Git URLs', () => {
        assert.equal(
            validateRepositoryUrl('https://github.com/DevModee/Aeros-Panel.git'),
            'https://github.com/DevModee/Aeros-Panel.git'
        );
        assert.equal(
            validateRepositoryUrl('http://git.local/org/app.git'),
            'http://git.local/org/app.git'
        );
        assert.equal(
            validateRepositoryUrl('ssh://git@github.com/DevModee/Aeros-Panel.git'),
            'ssh://git@github.com/DevModee/Aeros-Panel.git'
        );
        assert.equal(
            validateRepositoryUrl('git@github.com:DevModee/Aeros-Panel.git'),
            'git@github.com:DevModee/Aeros-Panel.git'
        );
    });

    it('rejects file://, ext::, and unsupported protocols', () => {
        assert.throws(() => validateRepositoryUrl('file:///etc/passwd'), /Unsupported Git repository protocol/);
        assert.throws(() => validateRepositoryUrl('FILE:///tmp/repo'), /Unsupported Git repository protocol/);
        assert.throws(() => validateRepositoryUrl('ext::sh -c id'), /Invalid Git repository URL|Unsupported Git repository protocol/);
        assert.throws(() => validateRepositoryUrl('ext::sh'), /Unsupported Git repository protocol/);
        assert.throws(() => validateRepositoryUrl('ftp://example.com/repo.git'), /Repository URL must use/);
    });

    it('rejects option flags, whitespace, and path traversal in SCP URLs', () => {
        assert.throws(() => validateRepositoryUrl('--upload-pack=id'), /Invalid Git repository URL/);
        assert.throws(() => validateRepositoryUrl('-u'), /Invalid Git repository URL/);
        assert.throws(() => validateRepositoryUrl('https://github.com/a/b --option'), /Invalid Git repository URL/);
        assert.throws(() => validateRepositoryUrl('git@github.com:../etc/passwd'), /Invalid Git SSH repository path/);
        assert.throws(() => validateRepositoryUrl('   '), /cannot be empty/);
    });
});

describe('validateGitBranch', () => {
    it('accepts standard branch names', () => {
        assert.equal(validateGitBranch('main'), 'main');
        assert.equal(validateGitBranch('release/v2.0'), 'release/v2.0');
        assert.equal(validateGitBranch('feature_1-test'), 'feature_1-test');
    });

    it('rejects leading flags, ref traversal, and invalid suffixes', () => {
        assert.throws(() => validateGitBranch('--all'), /Invalid git branch name/);
        assert.throws(() => validateGitBranch('-main'), /Invalid git branch name/);
        assert.throws(() => validateGitBranch('main..HEAD'), /Invalid git branch name/);
        assert.throws(() => validateGitBranch('main@{1}'), /Invalid git branch name/);
        assert.throws(() => validateGitBranch('feature/'), /Invalid git branch name/);
        assert.throws(() => validateGitBranch('main.lock'), /Invalid git branch name/);
        assert.throws(() => validateGitBranch(''), /Invalid git branch name/);
    });
});
