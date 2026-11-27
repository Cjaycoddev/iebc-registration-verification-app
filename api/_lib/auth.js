import { createClient } from '@supabase/supabase-js';

export const admin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export class HttpError extends Error {
  constructor(status, code, message) { super(message); this.status = status; this.code = code; }
}

export async function requireAuth(req) {
  const token = (req.headers.authorization || '').replace(/^Bearer /, '');
  if (!token) throw new HttpError(401, 'NO_TOKEN', 'Auth required');
  const { data: { user }, error } = await admin.auth.getUser(token);
  if (error || !user) throw new HttpError(401, 'BAD_TOKEN', 'Invalid session');
  const { data: profile } = await admin.from('profiles').select('*').eq('id', user.id).maybeSingle();
  if (!profile) throw new HttpError(403, 'NO_PROFILE', 'No profile');
  if (profile.status === 'suspended') throw new HttpError(403, 'SUSPENDED', 'Account suspended');
  if (profile.status === 'deleted')   throw new HttpError(403, 'DELETED', 'Account removed');
  return profile;
}

export function withRoles(roles, handler) {
  return async (req, res) => {
    try {
      const actor = await requireAuth(req);
      if (!roles.includes(actor.role)) throw new HttpError(403, 'FORBIDDEN_ROLE', 'Wrong role');
      return await handler(req, res, actor);
    } catch (e) {
      return res.status(e.status || 500).json({ error: e.message, code: e.code });
    }
  };
}