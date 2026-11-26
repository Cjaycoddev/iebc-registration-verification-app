import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import Logo from '../components/Logo'

export default function RegisterOfficer() {
  const navigate = useNavigate()
  const [form, setForm] = useState({ full_name: '', email: '', phone: '' })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)

  const update = (k, v) => setForm(f => ({ ...f, [k]: v }))

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setSaving(true)
    const { data: { session } } = await supabase.auth.getSession()
    const res = await fetch('/api/create-officer', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session?.access_token ?? ''}`,
      },
      body: JSON.stringify({
        full_name: form.full_name.trim(),
        email: form.email.trim().toLowerCase(),
        phone: form.phone.trim() || null,
        password: 'IEBC@2026',
      }),
    })
    const data = await res.json()
    setSaving(false)
    if (!res.ok) return setError(data.error || 'Failed to create officer')
    setSuccess(true)
    setTimeout(() => navigate('/admin'), 1400)
  }

  if (success) {
    return (
      <div className="success-screen">
        <svg viewBox="0 0 100 100" width="120" height="120" className="success-tick">
          <circle cx="50" cy="50" r="42" fill="none" stroke="#006600" strokeWidth="3" className="tick-circle" />
          <path d="M30 52 L45 67 L72 38" fill="none" stroke="#006600" strokeWidth="6"
            strokeLinecap="round" strokeLinejoin="round" className="tick-check" />
        </svg>
        <h2>Officer Registered</h2>
        <p className="muted">Redirecting to dashboard</p>
      </div>
    )
  }

  return (
    <div className="register-page">
      <header className="admin-header">
        <Logo size={32} showText />
        <button className="btn-ghost" onClick={() => navigate('/admin')}> Back</button>
      </header>

      <main className="register-main">
        <div className="form-card">
          <h1>Register Officer</h1>
          <p className="muted">Add a new voter registration officer to the system</p>

          <form onSubmit={handleSubmit} className="register-form">
            <label>
              Full Name *
              <input required value={form.full_name}
                onChange={(e) => update('full_name', e.target.value)}
                placeholder="Jane Wanjiku Kamau" />
            </label>
            <label>
              Email *
              <input required type="email" value={form.email}
                onChange={(e) => update('email', e.target.value)}
                placeholder="jane.kamau@iebc.go.ke" />
            </label>
            <label>
              Phone
              <input type="tel" value={form.phone}
                onChange={(e) => update('phone', e.target.value)}
                placeholder="+254 700 000 000" />
            </label>

            {error && <div className="form-error" role="alert">{error}</div>}

            <div className="form-actions">
              <button type="button" className="btn-ghost" onClick={() => navigate('/admin')}>Cancel</button>
              <button type="submit" className="btn-primary" disabled={saving}>
                {saving ? 'Registering' : 'Register Officer'}
              </button>
            </div>
          </form>
        </div>
      </main>
    </div>
  )
}


