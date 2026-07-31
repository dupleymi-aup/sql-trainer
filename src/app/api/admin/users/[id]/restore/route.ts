import { NextResponse } from 'next/server';
import { restoreUser } from '@/lib/db-users';
import { withAdminAuth, isValidUUID } from '@/lib/api-auth';

export const POST = withAdminAuth(async ({ session, params }) => {
  if (!params?.id || !isValidUUID(params.id)) {
    return NextResponse.json({ success: false, error: 'Invalid user ID format' }, { status: 400 });
  }
  const { id } = params;

  const success = restoreUser(id, session.user.id);
  if (!success) {
    return NextResponse.json({ success: false, error: 'User not found or not deleted' }, { status: 404 });
  }

  return NextResponse.json({ success: true });
});
