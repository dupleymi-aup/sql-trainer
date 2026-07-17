import { describe, it, expect } from 'vitest';
import { NextResponse } from 'next/server';
import { withTiming } from '@/lib/api-timing';

function createRequest(path = '/api/test'): Request {
  return new Request(`http://localhost:3000${path}`, { method: 'GET' });
}

describe('withTiming', () => {
  it('adds X-Response-Time header to successful responses', async () => {
    const handler = withTiming(async () => {
      return NextResponse.json({ ok: true });
    });

    const response = await handler(createRequest());
    expect(response.headers.get('X-Response-Time')).toMatch(/^\d+ms$/);
  });

  it('returns the original response status', async () => {
    const handler = withTiming(async () => {
      return NextResponse.json({ error: 'not found' }, { status: 404 });
    });

    const response = await handler(createRequest());
    expect(response.status).toBe(404);
  });

  it('preserves response body', async () => {
    const handler = withTiming(async () => {
      return NextResponse.json({ data: [1, 2, 3] });
    });

    const response = await handler(createRequest());
    const body = await response.json();
    expect(body).toEqual({ data: [1, 2, 3] });
  });

  it('returns 500 and logs on handler error', async () => {
    const failingHandler = withTiming(async () => {
      throw new Error('boom');
    });

    const response = await failingHandler(createRequest());
    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body).toEqual({ success: false, error: 'Internal server error' });
    expect(response.headers.get('X-Response-Time')).toMatch(/^\d+ms$/);
  });

  it('accepts custom route name', async () => {
    const handler = withTiming(async () => {
      return NextResponse.json({ ok: true });
    }, 'custom/route');

    const response = await handler(createRequest());
    expect(response.headers.get('X-Response-Time')).toMatch(/^\d+ms$/);
  });
});
