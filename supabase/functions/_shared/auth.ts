import { createSupabaseClient } from './supabase.ts';

export async function getUserFromRequest(req: Request) {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    return null;
  }

  const supabase = createSupabaseClient(authHeader);
  const { data: { user }, error } = await supabase.auth.getUser();

  if (error || !user) {
    return null;
  }

  return user;
}

export async function requireAuth(req: Request) {
  const user = await getUserFromRequest(req);
  if (!user) {
    throw new Error('Unauthorized');
  }
  return user;
}

export async function requireRole(req: Request, role: string) {
  const user = await requireAuth(req);
  const supabase = createSupabaseClient(req.headers.get('Authorization')!);

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  if (!profile || profile.role !== role) {
    throw new Error('Forbidden: Insufficient permissions');
  }

  return { user, profile };
}
