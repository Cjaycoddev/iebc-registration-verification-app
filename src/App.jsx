import { useEffect, useState } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { supabase } from './lib/supabase'
import Login from './pages/Login'
import AdminDashboard from './pages/AdminDashboard'
import AdminVoters from './pages/AdminVoters'
import AdminVoterUpload from './pages/AdminVoterUpload'
import RegisterOfficer from './pages/RegisterOfficer'
import VoterRegistration from './pages/VoterRegistration'
import VerifyVoter from './pages/VerifyVoter'
import OfficerDashboard from './pages/OfficerDashboard'

function useSession() {
  const [session, setSession] = useState(undefined)
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => sub.subscription.unsubscribe()
  }, [])
  return session
}

function useRole(session) {
  const [state, setState] = useState({ sessionId: null, role: undefined })

  useEffect(() => {
    if (!session) return
    let cancelled = false
    supabase.from('profiles').select('role').eq('id', session.user.id).maybeSingle()
      .then(({ data, error }) => {
        if (cancelled) return
        setState({
          sessionId: session.user.id,
          role: error || !data ? '__invalid__' : data.role,
        })
      })
    return () => { cancelled = true }
  }, [session])

  if (session === null) return null
  if (!session) return undefined
  if (state.sessionId !== session.user.id) return undefined
  return state.role
}

function Protected({ children, adminOnly = false }) {
  const session = useSession()
  const role = useRole(session)

  if (session === undefined) return <div className="boot-loader">Loading</div>
  if (!session) return <Navigate to="/login" replace />
  if (role === undefined) return <div className="boot-loader">Loading</div>
  if (adminOnly && role !== 'superadmin') return <Navigate to="/officer" replace />
  return children
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/admin" element={<Protected adminOnly><AdminDashboard /></Protected>} />
        <Route path="/admin/voters" element={<Protected adminOnly><AdminVoters /></Protected>} />
        <Route path="/admin/upload-voters" element={<Protected adminOnly><AdminVoterUpload /></Protected>} />
        <Route path="/admin/register-officer" element={<Protected adminOnly><RegisterOfficer /></Protected>} />
        <Route path="/admin/voter-registration" element={<Protected><VoterRegistration /></Protected>} />
        <Route path="/admin/verify" element={<Protected><VerifyVoter /></Protected>} />
        <Route path="/officer" element={<Protected><OfficerDashboard /></Protected>} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </BrowserRouter>
  )
}