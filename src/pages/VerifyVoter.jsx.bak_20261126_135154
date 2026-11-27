import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import Logo from '../components/Logo'
import FaceCapture from '../components/FaceCapture'
import VerifyResult from '../components/VerifyResult'

const ANY_ID_RE = /^(\d{7,9}|[A-Z]\d{7})$/

export default function VerifyVoter() {
  const navigate = useNavigate()
  const [idNumber, setIdNumber] = useState('')
  const [searching, setSearching] = useState(false)
  const [voter, setVoter] = useState(null)
  const [error, setError] = useState('')
  const [faceOpen, setFaceOpen] = useState(false)
  const [livePhoto, setLivePhoto] = useState('')
  const [result, setResult] = useState(null)
  const [logging, setLogging] = useState(false)

  const idError = (() => {
    const t = idNumber.trim()
    if (!t) return null
    if (!ANY_ID_RE.test(t)) return 'Enter 7-9 digits (National ID) or 1 letter + 7 digits (Passport)'
    return null
  })()

  async function handleSearch(e) {
    e?.preventDefault()
    const t = idNumber.trim()
    if (!t || idError) return
    setSearching(true); setError(''); setVoter(null); setLivePhoto('')
    const { data, error: err } = await supabase
      .from('voters').select('*').eq('id_number', t).maybeSingle()
    setSearching(false)
    if (err) return setError(err.message)
    if (!data) return setError('No voter found with that ID number.')
    setVoter(data)
  }

  async function logVerification(success) {
    if (!voter) return
    setLogging(true)
    const { data: { user } } = await supabase.auth.getUser()
    await supabase.from('verification_logs').insert({
      voter_id: voter.id,
      officer_id: user?.id ?? null,
      id_number_searched: idNumber.trim(),
      method: 'face_visual',
      success,
    })
    if (success) {
      await supabase.from('voters').update({ verified_at: new Date().toISOString() }).eq('id', voter.id)
    }
    setLogging(false)
    setResult({
      success,
      voterName: voter.first_name + ' ' + voter.last_name,
      message: success ? 'Face matched the record on file' : 'Face did not match the record',
    })
  }

  function reset() {
    setIdNumber(''); setVoter(null); setLivePhoto(''); setError(''); setResult(null)
  }

  return (
    <div className="register-page" data-page="verify-voter">
      <header className="admin-header">
        <Logo size={32} showText />
        <button className="btn-ghost" onClick={() => navigate(-1)}>Back</button>
      </header>

      <main className="register-main">
        <div className="form-card verify-page-card">
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 4 }}>
            <span style={{
              display: 'inline-flex', width: 44, height: 44, borderRadius: 12,
              background: '#ecfdf5', color: '#059669',
              alignItems: 'center', justifyContent: 'center'
            }} aria-hidden="true">
              <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor"
                   strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 3l7 4v5c0 4.5-3 8-7 9-4-1-7-4.5-7-9V7z" />
                <path d="M9 12l2 2 4-4" />
              </svg>
            </span>
            <h1 style={{ margin: 0 }}>Verify Voter</h1>
          </div>
          <p className="muted">Enter the voter's ID, then capture a live photo to confirm identity.</p>

          <form onSubmit={handleSearch} className="verify-search">
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4 }}>
              <input type="text" className="search-input"
                placeholder="National ID (7-9 digits) or Passport (A1234567)"
                value={idNumber}
                maxLength={9}
                onChange={(e) => {
                  let v = e.target.value
                  const upper = v.toUpperCase()
                  const looksLikePassport = /^[A-Z]/.test(upper)
                  v = looksLikePassport
                    ? upper.replace(/[^A-Z0-9]/g, '')
                    : v.replace(/\D/g, '')
                  setIdNumber(v.slice(0, 9))
                }}
                autoFocus />
              {idError && <span className="field-error">{idError}</span>}
            </div>
            <button type="submit" className="btn-primary"
              disabled={searching || !idNumber.trim() || !!idError}>
              {searching ? 'Searching' : 'Search'}
            </button>
          </form>

          {error && <div className="form-error" style={{ marginTop: 16 }}>{error}</div>}

          {voter && (
            <div className="verify-record">
              <div className="verify-record-head">
                <h2>{voter.first_name} {voter.middle_name || ''} {voter.last_name}</h2>
                <span className={'status-pill ' + (voter.verified_at ? 'status-active' : 'status-pending')}>
                  {voter.verified_at ? 'Previously verified' : 'Not yet verified'}
                </span>
              </div>

              <dl className="verify-details">
                <div><dt>ID Number</dt><dd>{voter.id_number}</dd></div>
                <div><dt>ID Type</dt><dd>{voter.id_type}</dd></div>
                <div><dt>Gender</dt><dd>{voter.gender}</dd></div>
                <div><dt>DOB</dt><dd>{voter.dob}</dd></div>
                <div><dt>County</dt><dd>{voter.county}</dd></div>
                <div><dt>Constituency</dt><dd>{voter.constituency}</dd></div>
                <div><dt>Ward</dt><dd>{voter.ward}</dd></div>
                <div><dt>Polling Station</dt><dd>{voter.polling_station}</dd></div>
              </dl>

              <div className="verify-photos">
                <div className="verify-photo-block">
                  <span className="verify-photo-label">Stored Photo</span>
                  {voter.face_photo_data
                    ? <img src={voter.face_photo_data} alt="Stored" />
                    : <div className="verify-photo-empty">No photo on file</div>}
                </div>
                <div className="verify-photo-block">
                  <span className="verify-photo-label">Live Capture</span>
                  {livePhoto ? (
                    <>
                      <img src={livePhoto} alt="Live" />
                      <button className="btn-ghost" onClick={() => setLivePhoto('')}>Retake</button>
                    </>
                  ) : (
                    <button className="btn-ghost verify-capture-btn" onClick={() => setFaceOpen(true)}>
                      Capture Live Photo
                    </button>
                  )}
                </div>
              </div>

              {livePhoto && (
                <div className="verify-decision">
                  <p className="muted">Compare both photos, then confirm the result.</p>
                  <div className="verify-decision-btns">
                    <button className="btn-primary btn-success" disabled={logging} onClick={() => logVerification(true)}>Match - Verified</button>
                    <button className="btn-primary btn-danger" disabled={logging} onClick={() => logVerification(false)}>No Match - Failed</button>
                  </div>
                </div>
              )}

              <div style={{ marginTop: 24 }}>
                <button className="btn-ghost" onClick={reset}>Search another voter</button>
              </div>
            </div>
          )}
        </div>
      </main>

      <FaceCapture open={faceOpen} onClose={() => setFaceOpen(false)}
        onCapture={(d) => setLivePhoto(d)} title="Capture Live Face" />
      <VerifyResult result={result} onClose={() => setResult(null)} autoCloseMs={0} />
    </div>
  )
}