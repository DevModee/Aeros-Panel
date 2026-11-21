type UnauthorizedListener = () => void;

const unauthorizedListeners = new Set<UnauthorizedListener>();

export function onUnauthorized(listener: UnauthorizedListener): () => void {
    unauthorizedListeners.add(listener);
    return () => {
        unauthorizedListeners.delete(listener);
    };
}

function notifyUnauthorized() {
    for (const listener of unauthorizedListeners) {
        listener();
    }
}

export class ApiError extends Error {
    status: number;

    constructor(message: string, status: number) {
        super(message);
        this.name = 'ApiError';
        this.status = status;
    }
}

export async function apiFetch<T = unknown>(
    path: string,
    options: RequestInit = {},
    { skipAuthRedirect = false }: { skipAuthRedirect?: boolean } = {}
): Promise<T> {
    const headers = new Headers(options.headers);
    if (options.body && !headers.has('Content-Type')) {
        headers.set('Content-Type', 'application/json');
    }

    const response = await fetch(path, {
        ...options,
        headers,
        credentials: 'same-origin'
    });

    const contentType = response.headers.get('content-type') || '';
    const isJson = contentType.includes('application/json');
    const data = isJson ? await response.json() : null;

    if (response.status === 401 && !skipAuthRedirect) {
        notifyUnauthorized();
    }

    if (!response.ok) {
        const message = (data && typeof data.error === 'string')
            ? data.error
            : `Request failed (${response.status})`;
        throw new ApiError(message, response.status);
    }

    return data as T;
}

export function buildWsUrl(params: Record<string, string>): string {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const query = new URLSearchParams(params).toString();
    return `${protocol}//${window.location.host}/ws?${query}`;
}
