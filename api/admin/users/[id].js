import { admin, withRoles, HttpError } from '../../_lib/auth.js';

export default withRoles(['superadmin','nro','cro'], async (req, res, actor) => {
  const { data: t } = await admin.from('profiles').select('*').eq('id', req.query.id).maybeSingle();
  if (!t) throw new HttpError(404, 'NOT_FOUND', 'User not found');
  if (t.id === actor.id) throw new HttpError(403, 'SELF', 'Cannot act on self');

  const manages =
    actor.role === 'superadmin' ||
    (actor.role === 'nro' && ['cro','po'].includes(t.role)) ||
    (actor.role === 'cro' && t.role === 'po' && t.constituency === actor.constituency);
  if (!manages) throw new HttpError(403, 'OUT_OF_SCOPE', 'Not in your scope');

  if (req.method === 'PATCH') {
    const { action, reason } = req.body || {};

    if (action === 'suspend' || action === 'reactivate') {
      if (actor.role !== 'superadmin' && t.role === 'superadmin')
        throw new HttpError(403, 'FORBIDDEN', 'Cannot touch superadmin');
      const status = action === 'suspend' ? 'suspended' : 'active';
      const { data: updated, error } = await admin.from('profiles')
        .update({ status, suspended_at: action==='suspend' ? new Date().toISOString() : null })
        .eq('id', t.id).select().single();
      if (error) throw new HttpError(400, 'UPDATE_FAILED', error.message);
      if (action === 'suspend') await admin.auth.admin.signOut(t.id, 'global').catch(()=>{});
      await audit(actor, action, t, updated, reason);
      return res.status(200).json({ user: updated });
    }

    if (action === 'reset_password') {
      const { error } = await admin.auth.admin.generateLink({ type: 'recovery', email: t.email });
      if (error) throw new HttpError(400, 'RESET_FAILED', error.message);
      await audit(actor, 'password_reset', t, null, reason);
      return res.status(200).json({ reset_email_sent: true });
    }

    throw new HttpError(400, 'BAD_ACTION', 'suspend|reactivate|reset_password');
  }

  if (req.method === 'DELETE') {
    if (actor.role !== 'superadmin' && t.role !== 'po')
      throw new HttpError(403, 'FORBIDDEN', 'Only superadmin can delete non-PO');

    if (t.role === 'superadmin') {
      const { count } = await admin.from('profiles').select('*', { count:'exact', head:true })
        .eq('role','superadmin').eq('status','active');
      if (count <= 1) throw new HttpError(409, 'LAST_SUPERADMIN', 'Cannot remove last superadmin');
    }

    const hard = req.query.hard === 'true' && actor.role === 'superadmin';
    if (hard) {
      await admin.from('profiles').delete().eq('id', t.id);
      await admin.auth.admin.deleteUser(t.id).catch(()=>{});
      await audit(actor, 'hard_delete', t, null, req.body?.reason);
      return res.status(200).json({ deleted: 'hard' });
    }

    const { data: updated } = await admin.from('profiles')
      .update({ status: 'deleted', deleted_at: new Date().toISOString() })
      .eq('id', t.id).select().single();
    await admin.auth.admin.signOut(t.id, 'global').catch(()=>{});
    await audit(actor, 'delete', t, updated, req.body?.reason);
    return res.status(200).json({ deleted: 'soft' });
  }

  throw new HttpError(405, 'METHOD', 'Not allowed');
});

async function audit(actor, action, target, after, reason) {
  await admin.from('user_admin_audit').insert({
    actor_id: actor.id, action, target_id: target.id,
    target_email: target.email, after, reason: reason||null
  });
}