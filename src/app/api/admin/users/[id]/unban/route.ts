import { withAdminAuth, isValidUUID } from '@/lib/api-auth';
import { NextResponse } from 'next/server';
import { unbanUser } from '@/lib/db-users';

export const POST = withAdminAuth(async ({ session, params }) => {
  if (!params?.id || !isValidUUID(params.id)) {
    return NextResponse.json({ success: false, error: 'Invalid user ID format' }, { status: 400 });
  }
  const { id } = params;

  const success = unbanUser(id, session.user.id);
  if (!success) {
    return NextResponse.json({ success: false, error: 'User not found or not banned' }, { status: 404 });
  }

  return NextResponse.json({ success: true });
});
