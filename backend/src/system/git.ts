const SCP_GIT_PATTERN = /^git@[a-zA-Z0-9](?:[a-zA-Z0-9.-]*[a-zA-Z0-9])?:[a-zA-Z0-9._/~-]+$/;
const BRANCH_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9._/-]{0,119}$/;

export function validateRepositoryUrl(rawRepo: string): string {
    const repo = rawRepo.trim();
    if (!repo) {
        throw new Error('Repository URL cannot be empty.');
    }

    if (repo.startsWith('-') || /[\s\r\n\0]/.test(repo)) {
        throw new Error('Invalid Git repository URL.');
    }

    const lower = repo.toLowerCase();
    if (lower.startsWith('file://') || lower.startsWith('ext::')) {
        throw new Error('Unsupported Git repository protocol.');
    }

    if (SCP_GIT_PATTERN.test(repo)) {
        const colonIdx = repo.indexOf(':');
        const repoPath = repo.slice(colonIdx + 1);
        if (!repoPath || repoPath.startsWith('-') || repoPath.includes('..')) {
            throw new Error('Invalid Git SSH repository path.');
        }
        return repo;
    }

    let parsed: URL;
    try {
        parsed = new URL(repo);
    } catch {
        throw new Error('Repository URL must use https://, http://, ssh://, or git@host:path.');
    }

    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:' && parsed.protocol !== 'ssh:') {
        throw new Error('Repository URL must use https://, http://, ssh://, or git@host:path.');
    }

    if (!parsed.hostname || parsed.hostname.startsWith('-')) {
        throw new Error('Invalid Git repository hostname.');
    }

    return repo;
}

export function validateGitBranch(rawBranch: string): string {
    const branch = rawBranch.trim();
    if (
        !BRANCH_PATTERN.test(branch) ||
        branch.includes('..') ||
        branch.includes('@{') ||
        branch.endsWith('/') ||
        branch.endsWith('.lock')
    ) {
        throw new Error('Invalid git branch name.');
    }
    return branch;
}
