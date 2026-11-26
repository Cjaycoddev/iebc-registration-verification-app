import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import Logo from '../components/Logo'

export default function Login() {
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setLoading(true)

    console.log('[login] attempting:', email)

    const { data: auth, error: signInErr } = await supabase.auth.signInWithPassword({ email, password })

    if (signInErr) {
      console.error('[login] sign-in error:', signInErr.message)
      setLoading(false)
      return setError(signInErr.message)
    }

    console.log('[login] sign-in OK, user.id=', auth.user.id)

    const { data: profile, error: pErr } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', auth.user.id)
      .maybeSingle()

    console.log('[login] profile fetch  error:', pErr?.message ?? 'none', ' data:', profile)

    setLoading(false)

    if (pErr) {
      await supabase.auth.signOut()
      return setError('Profile lookup failed: ' + pErr.message)
    }
    if (!profile) {
      await supabase.auth.signOut()
      return setError('No profile row for this account. Contact the administrator.')
    }

    const dest = profile.role === 'superadmin' ? '/admin' : '/officer'
    console.log('[login] DECISION  role:', profile.role, ' dest:', dest)
    navigate(dest, { replace: true })
  }

  return (
    <div className="login-page">
      <div className="login-brand">
        <div className="login-brand-inner">
          <Logo size={64} />
          <h1>Independent Electoral<br/>and Boundaries Commission</h1>
          <p>Voter Registration &amp; Verification System</p>
          <div className="brand-stripes"><span/><span/><span/></div>
        </div>
      </div>

      <div className="login-form-wrap">
        <form className="login-form" onSubmit={handleSubmit}>
          <h2>Sign In</h2>
          <p className="muted">IEBC staff  admins &amp; registration officers</p>

          <label>
            Email
            <input type="email" required autoComplete="email"
              value={email} onChange={(e) => setEmail(e.target.value)}
              placeholder="you@iebc.local" />
          </label>

          <label>
            Password
            <input type="password" required autoComplete="current-password"
              value={password} onChange={(e) => setPassword(e.target.value)}
              placeholder="" />
          </label>

          {error && <div className="form-error" role="alert">{error}</div>}

          <button type="submit" className="btn-primary" disabled={loading}>
            {loading ? 'Signing in' : 'Sign In'}
          </button>

          <p className="login-footer">Protected by IEBC Security Policy</p>
        </form>
      </div>
    </div>
  )
}
