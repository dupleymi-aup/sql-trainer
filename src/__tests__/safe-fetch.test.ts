import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

const mockMetaElements: { name: string; content: string }[] = [];
let mockCookie = '';

const mockDocument = {
  head: {
    appendChild: (el: { name: string; content: string }) => {
      mockMetaElements.push(el);
    },
  },
  createElement: () => ({ name: '', content: '' }),
  querySelector: (selector: string) => {
    if (selector === 'meta[name="csrf-token"]') {
      return mockMetaElements.length > 0 ? mockMetaElements[0] : null;
    }
    return null;
  },
};

Object.defineProperty(mockDocument, 'cookie', {
  get: () => mockCookie,
  set: (v: string) => {
    mockCookie = v;
  },
  configurable: true,
});

vi.stubGlobal('document', mockDocument);

beforeEach(() => {
  mockFetch.mockReset();
  mockMetaElements.length = 0;
  mockCookie = '';
});

async function getSafeFetch() {
  vi.resetModules();
  const { safeFetch } = await import('@/lib/safe-fetch');
  return safeFetch;
}

describe('safeFetch', () => {
  it('passes through GET requests without CSRF header', async () => {
    mockFetch.mockResolvedValue(new Response('ok'));
    const safeFetch = await getSafeFetch();

    await safeFetch('/api/test');

    expect(mockFetch).toHaveBeenCalledWith('/api/test', undefined);
  });

  it('adds CSRF header from meta tag for POST', async () => {
    mockMetaElements.push({ name: 'csrf-token', content: 'test-token-123' });
    mockFetch.mockResolvedValue(new Response('ok'));
    const safeFetch = await getSafeFetch();

    await safeFetch('/api/test', { method: 'POST', body: '{}' });

    const headers = new Headers(mockFetch.mock.calls[0][1].headers);
    expect(headers.get('X-CSRF-Token')).toBe('test-token-123');
  });

  it('adds CSRF header for PUT, PATCH, DELETE', async () => {
    mockMetaElements.push({ name: 'csrf-token', content: 'token-put' });
    mockFetch.mockResolvedValue(new Response('ok'));
    const safeFetch = await getSafeFetch();

    await safeFetch('/api/test', { method: 'PUT' });
    expect(new Headers(mockFetch.mock.calls[0][1].headers).get('X-CSRF-Token')).toBe('token-put');

    mockFetch.mockClear();
    await safeFetch('/api/test', { method: 'PATCH' });
    expect(new Headers(mockFetch.mock.calls[0][1].headers).get('X-CSRF-Token')).toBe('token-put');

    mockFetch.mockClear();
    await safeFetch('/api/test', { method: 'DELETE' });
    expect(new Headers(mockFetch.mock.calls[0][1].headers).get('X-CSRF-Token')).toBe('token-put');
  });

  it('falls back to cookie when no meta tag', async () => {
    mockCookie = 'csrf-token-raw=cookie-token-456; path=/';
    mockFetch.mockResolvedValue(new Response('ok'));
    const safeFetch = await getSafeFetch();

    await safeFetch('/api/test', { method: 'POST', body: '{}' });

    const headers = new Headers(mockFetch.mock.calls[0][1].headers);
    expect(headers.get('X-CSRF-Token')).toBe('cookie-token-456');
  });

  it('preserves existing headers when adding CSRF token', async () => {
    mockMetaElements.push({ name: 'csrf-token', content: 'token' });
    mockFetch.mockResolvedValue(new Response('ok'));
    const safeFetch = await getSafeFetch();

    await safeFetch('/api/test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Custom': 'custom-value' },
      body: '{}',
    });

    const headers = new Headers(mockFetch.mock.calls[0][1].headers);
    expect(headers.get('Content-Type')).toBe('application/json');
    expect(headers.get('X-Custom')).toBe('custom-value');
    expect(headers.get('X-CSRF-Token')).toBe('token');
  });

  it('does not add CSRF header when no token available', async () => {
    mockFetch.mockResolvedValue(new Response('ok'));
    const safeFetch = await getSafeFetch();

    await safeFetch('/api/test', { method: 'POST', body: '{}' });

    const headers = new Headers(mockFetch.mock.calls[0][1].headers);
    expect(headers.get('X-CSRF-Token')).toBeNull();
  });

  it('skips CSRF header for GET even when token exists', async () => {
    mockMetaElements.push({ name: 'csrf-token', content: 'token' });
    mockFetch.mockResolvedValue(new Response('ok'));
    const safeFetch = await getSafeFetch();

    await safeFetch('/api/test');

    expect(mockFetch.mock.calls[0][1]).toBeUndefined();
  });
});
