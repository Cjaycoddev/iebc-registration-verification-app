import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import Logo from '../components/Logo'

export default function OfficerDashboard() {
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [counts, setCounts] = useState({ mine: 0, verified: 0 })

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser()
      setEmail(user?.email ?? '')
      if (!user) return
      const { data } = await supabase
        .from('voters')
        .select('id, verified_at')
        .eq('registered_by', user.id)
      const list = data || []
      setCounts({
        mine: list.length,
        verified: list.filter(x => x.verified_at).length,
      })
    })()
  }, [])

  async function handleLogout() {
    await supabase.auth.signOut()
    navigate('/login', { replace: true })
  }

  const actions = [
    {
      key: 'register',
      title: 'Register Voter',
      desc: 'Enroll a new voter with face capture',
      onClick: () => navigate('/admin/voter-registration'),
      tone: 'teal',
      icon: 'plus',
    },
    {
      key: 'verify',
      title: 'Verify Voter',
      desc: 'Match a voter against their stored photo',
      onClick: () => navigate('/admin/verify'),
      tone: 'green',
      icon: 'shield',
    },
  ]

  return (
    <div className="admin officer-dashboard">
      <header className="admin-header">
        <Logo size={36} showText />
        <div className="admin-header-right">
          <span className="admin-user">{email}</span>
          <button className="btn-ghost" onClick={handleLogout}>Sign out</button>
        </div>
      </header>

      <main className="admin-main">
        <div className="admin-title-row">
          <div>
            <h1>Officer Dashboard</h1>
            <p className="muted">Register and verify voters at your station</p>
          </div>
        </div>

        <section className="kpi-grid officer-kpi-grid">
          <div className="kpi-card kpi-tone-teal">
            <div className="kpi-top">
              <span className="kpi-label">Voters You Registered</span>
              <span className="kpi-dot" aria-hidden />
            </div>
            <span className="kpi-value">{counts.mine}</span>
          </div>
          <div className="kpi-card kpi-tone-green">
            <div className="kpi-top">
              <span className="kpi-label">Verified Voters</span>
              <span className="kpi-dot" aria-hidden />
            </div>
            <span className="kpi-value">{counts.verified}</span>
          </div>
        </section>

        <section className="action-tiles">
          {actions.map(a => (
            <button key={a.key} className={'action-tile tile-' + a.tone} onClick={a.onClick}>
              <div className="tile-icon" aria-hidden>
                {a.icon === 'plus' ? (
                  <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor"
                       strokeWidth="2" strokeLinecap="round">
                    <path d="M12 5v14M5 12h14" />
                  </svg>
                ) : (
                  <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor"
                       strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 3l7 4v5c0 4.5-3 8-7 9-4-1-7-4.5-7-9V7z" />
                    <path d="M9 12l2 2 4-4" />
                  </svg>
                )}
              </div>
              <div className="tile-body">
                <h3>{a.title}</h3>
                <p>{a.desc}</p>
              </div>
              <span className="tile-arrow" aria-hidden>&rarr;</span>
            </button>
          ))}
        </section>
      </main>
    </div>
  )
}