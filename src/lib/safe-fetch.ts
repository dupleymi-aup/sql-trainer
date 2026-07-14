function getCsrfToken(): string | null {
  const meta = document.querySelector<HTMLMetaElement>('meta[name="csrf-token"]');
  if (meta?.content) return meta.content;

  const match = document.cookie.match(/(?:^|;\s*)csrf-token-raw=([^;]+)/);
  if (match) return decodeURIComponent(match[1]);

  return null;
}

const CSRF_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

export async function safeFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const method = (init?.method ?? 'GET').toUpperCase();

  if (CSRF_METHODS.has(method)) {
    const token = getCsrfToken();
    if (token) {
      const headers = new Headers(init?.headers);
      headers.set('X-CSRF-Token', token);
      init = { ...init, headers };
    }
  }

  return fetch(input, init);
}
