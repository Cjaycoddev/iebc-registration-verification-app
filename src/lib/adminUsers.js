import { supabase } from './supabase';

const headers = async () => ({
  'Content-Type': 'application/json',
  Authorization: `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}`,
});

const call = async (url, opts={}) => {
  const r = await fetch(url, { ...opts, headers: await headers() });
  const b = await r.json().catch(()=>({}));
  if (!r.ok) { const e = new Error(b.error||r.statusText); e.code=b.code; e.status=r.status; throw e; }
  return b;
};

export const listUsers   = (qs='')  => call(`/api/admin/users${qs}`);
export const createUser  = (p)      => call('/api/admin/users', { method:'POST', body: JSON.stringify(p) });
export const suspendUser = (id,r)   => call(`/api/admin/users/${id}`, { method:'PATCH', body: JSON.stringify({ action:'suspend', reason:r }) });
export const reactivate  = (id,r)   => call(`/api/admin/users/${id}`, { method:'PATCH', body: JSON.stringify({ action:'reactivate', reason:r }) });
export const resetPw     = (id)     => call(`/api/admin/users/${id}`, { method:'PATCH', body: JSON.stringify({ action:'reset_password' }) });
export const deleteUser  = (id,{hard=false,reason}={}) =>
  call(`/api/admin/users/${id}${hard?'?hard=true':''}`, { method:'DELETE', body: JSON.stringify({ reason }) });