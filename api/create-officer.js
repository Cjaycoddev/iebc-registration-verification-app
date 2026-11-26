import { createClient } from '@supabase/supabase-js'

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  // --- Verify caller is a superadmin ---
  const authHeader = req.headers.authorization || ''
  const token = authHeader.replace('Bearer ', '').trim()
  if (!token) return res.status(401).json({ error: 'Missing auth token' })

  const { data: { user }, error: userErr } = await supabaseAdmin.auth.getUser(token)
  if (userErr || !user) return res.status(401).json({ error: 'Invalid token' })

  const { data: profile } = await supabaseAdmin
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()
  if (profile?.role !== 'superadmin') {
    return res.status(403).json({ error: 'Only superadmins can register officers' })
  }

  // --- Proceed ---
  const { full_name, email, phone, password } = req.body
  if (!full_name || !email || !password) {
    return res.status(400).json({ error: 'full_name, email and password are required' })
  }

  const { data: authUser, error: authErr } = await supabaseAdmin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  })
  if (authErr) return res.status(400).json({ error: authErr.message })

  const { error: offErr } = await supabaseAdmin.from('officers').insert({
    full_name,
    email: email.toLowerCase(),
    phone: phone || null,
    status: 'active',
  })
  if (offErr) return res.status(400).json({ error: offErr.message })

  const { error: profErr } = await supabaseAdmin.from('profiles').insert({
    id: authUser.user.id,
    full_name,
    email,
    role: 'officer',
  })
  if (profErr) return res.status(400).json({ error: profErr.message })

  res.status(200).json({ ok: true })
}
