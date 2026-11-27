import { admin, withRoles, HttpError } from '../../_lib/auth.js';

const CAN_CREATE = {
  superadmin: ['registration_officer','nro','cro','po','superadmin'],
  nro:        ['cro'],
  cro:        ['po'],
};

export default withRoles(['superadmin','nro','cro'], async (req, res, actor) => {
  if (req.method === 'GET') {
    let q = admin.from('profiles').select('*').order('created_at', { ascending: false });
    if (actor.role === 'nro') q = q.in('role', ['cro','po']);
    if (actor.role === 'cro') q = q.eq('role','po').eq('constituency', actor.constituency);
    const { data, error } = await q;
    if (error) throw new HttpError(500, 'LIST_FAILED', error.message);
    return res.status(200).json({ users: data });
  }

  if (req.method !== 'POST') throw new HttpError(405, 'METHOD', 'Not allowed');

  const { email, full_name, role, county, constituency, ward, polling_station, reason } = req.body || {};
  if (!email || !full_name || !role) throw new HttpError(400, 'MISSING', 'email, full_name, role required');
  if (!CAN_CREATE[actor.role]?.includes(role))
    throw new HttpError(403, 'FORBIDDEN_CREATE', `${actor.role} cannot create ${role}`);

  let scope = { county: null, constituency: null, ward: null, polling_station: null };
  if (role === 'cro' || role === 'po') {
    if (actor.role === 'cro') {
      if (!polling_station) throw new HttpError(400, 'MISSING_STATION', 'polling_station required');
      scope = { county: actor.county, constituency: actor.constituency, ward: ward||null, polling_station };
    } else {
      if (!constituency) throw new HttpError(400, 'MISSING_CONSTITUENCY', 'constituency required');
      scope = { county: county||null, constituency, ward: null, polling_station: null };
    }
  }

  const { data: invited, error: invErr } = await admin.auth.admin.inviteUserByEmail(email, {
    data: { full_name, role }
  });
  if (invErr) throw new HttpError(400, 'INVITE_FAILED', invErr.message);

  const { data: profile, error } = await admin.from('profiles').insert({
    id: invited.user.id, email, full_name, role, ...scope, created_by: actor.id
  }).select().single();

  if (error) {
    await admin.auth.admin.deleteUser(invited.user.id).catch(()=>{});
    if (error.code === '23505') {
      const msg = role === 'nro' ? 'An active NRO already exists'
                : `An active CRO already exists for ${scope.constituency}`;
      throw new HttpError(409, 'CONFLICT', msg);
    }
    throw new HttpError(400, 'CREATE_FAILED', error.message);
  }

  await admin.from('user_admin_audit').insert({
    actor_id: actor.id, action: 'create', target_id: profile.id,
    target_email: profile.email, after: profile, reason: reason||null
  });

  return res.status(201).json({ user: profile, invite_sent: true });
});