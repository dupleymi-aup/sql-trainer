import { NextResponse } from 'next/server';
import { openApiSpec } from '@/lib/openapi';

export const dynamic = 'force-static';

export async function GET() {
  try {
    return NextResponse.json(openApiSpec, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'public, max-age=3600',
      },
    });
  } catch {
    return NextResponse.json({ success: false, error: 'Failed to load API spec' }, { status: 500 });
  }
}
