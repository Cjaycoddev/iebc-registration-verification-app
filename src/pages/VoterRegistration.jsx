import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { LOCATIONS } from '../lib/locations'
import { features } from '../lib/features'
import { loadFaceModels, computeFaceDescriptor } from '../lib/faceMatch'
import Logo from '../components/Logo'
import FaceCapture from '../components/FaceCapture'

const STEPS = ['Personal', 'Location', 'Biometric']

const NAME_RE     = /^[A-Za-z][A-Za-z '-]*$/
const PASSPORT_RE = /^[A-Z]\d{7}$/

const NOW = new Date()
const DATE_18Y_AGO  = new Date(NOW.getFullYear() - 18, NOW.getMonth(), NOW.getDate())
const DATE_120Y_AGO = new Date(NOW.getFullYear() - 120, NOW.getMonth(), NOW.getDate())
const MAX_DOB_STR   = DATE_18Y_AGO.toISOString().split('T')[0]
const MIN_DOB_STR   = DATE_120Y_AGO.toISOString().split('T')[0]

function validateName(v, { required = false } = {}) {
  if (!v || !v.trim()) return required ? 'Required' : null
  const t = v.trim()
  if (t.length < 2)  return 'Minimum 2 characters'
  if (t.length > 50) return 'Maximum 50 characters'
  if (!NAME_RE.test(t)) return 'Letters, spaces, hyphen, apostrophe only (no digits)'
  return null
}
function validateIdNumber(v, type) {
  if (!v || !v.trim()) return 'Required'
  const t = v.trim()
  if (type === 'national_id') {
    if (!/^\d+$/.test(t)) return 'Digits only'
    if (t.length < 7) return 'Minimum 7 digits'
    if (t.length > 9) return 'Maximum 9 digits'
    return null
  }
  if (type === 'passport') {
    if (t.length > 9) return 'Maximum 9 characters'
    if (!PASSPORT_RE.test(t)) return 'Format: 1 uppercase letter + 7 digits (e.g. A1234567)'
    return null
  }
  return null
}
function validateDob(v) {
  if (!v) return 'Required'
  const d = new Date(v)
  if (isNaN(d.getTime())) return 'Invalid date'
  if (d > DATE_18Y_AGO)  return 'Must be at least 18 years old'
  if (d < DATE_120Y_AGO) return 'Please enter a realistic date of birth'
  return null
}

export default function VoterRegistration() {
  const navigate = useNavigate()
  const [step, setStep] = useState(0)
  const [form, setForm] = useState({
    first_name: '', middle_name: '', last_name: '',
    gender: '', id_type: 'national_id', id_number: '', dob: '',
    county: '', constituency: '', ward: '', polling_station: '',
    face_photo_data: '',
  })
  const [faceDescriptor, setFaceDescriptor] = useState(null)
  const [faceProcessing, setFaceProcessing] = useState(false)
  const [faceError, setFaceError] = useState('')
  const [touched, setTouched] = useState({})
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)
  const [faceOpen, setFaceOpen] = useState(false)

  useEffect(() => {
    loadFaceModels().catch(err => {
      console.warn('[face] background model load failed:', err)
    })
  }, [])

  const update = (k, v) => setForm(f => ({ ...f, [k]: v }))
  const markTouched = (k) => setTouched(t => ({ ...t, [k]: true }))
  const setCounty = (v) => setForm(f => ({ ...f, county: v, constituency: '', ward: '', polling_station: '' }))
  const setConstituency = (v) => setForm(f => ({ ...f, constituency: v, ward: '', polling_station: '' }))
  const setWard = (v) => setForm(f => ({ ...f, ward: v, polling_station: '' }))

  const counties       = Object.keys(LOCATIONS)
  const constituencies = form.county ? Object.keys(LOCATIONS[form.county] || {}) : []
  const wards          = form.county && form.constituency ? Object.keys(LOCATIONS[form.county]?.[form.constituency] || {}) : []
  const stations       = form.ward ? (LOCATIONS[form.county]?.[form.constituency]?.[form.ward] || []) : []

  const errors = useMemo(() => ({
    first_name: validateName(form.first_name, { required: true }),
    middle_name: validateName(form.middle_name),
    last_name:  validateName(form.last_name, { required: true }),
    gender:     !form.gender ? 'Required' : null,
    id_type:    !form.id_type ? 'Required' : null,
    id_number:  validateIdNumber(form.id_number, form.id_type),
    dob:        validateDob(form.dob),
  }), [form])

  const canNext1 = !errors.first_name && !errors.middle_name && !errors.last_name
    && !errors.gender && !errors.id_type && !errors.id_number && !errors.dob
  const canNext2 = !!(form.county && form.constituency && form.ward && form.polling_station)
  const canSubmit = canNext1 && canNext2 && !!form.face_photo_data && Array.isArray(faceDescriptor)

  async function handleFaceCaptured(dataUrl) {
    setFaceProcessing(true)
    setFaceError('')
    try {
      const desc = await computeFaceDescriptor(dataUrl)
      update('face_photo_data', dataUrl)
      setFaceDescriptor(desc)
    } catch (err) {
      setFaceError(err?.message || 'Face processing failed. Please try again.')
      update('face_photo_data', '')
      setFaceDescriptor(null)
    } finally {
      setFaceProcessing(false)
    }
  }

  async function handleSubmit() {
    if (!canSubmit) {
      setError('Fix all errors and capture a face before registering.')
      return
    }
    setSaving(true); setError('')
    const { data: { user } } = await supabase.auth.getUser()
    const { error } = await supabase.from('voters').insert({
      first_name: form.first_name.trim(),
      middle_name: form.middle_name.trim() || null,
      last_name: form.last_name.trim(),
      gender: form.gender,
      id_type: form.id_type,
      id_number: form.id_number.trim(),
      dob: form.dob,
      county: form.county,
      constituency: form.constituency,
      ward: form.ward,
      polling_station: form.polling_station,
      face_photo_data: form.face_photo_data,
      face_descriptor: faceDescriptor,
      registered_by: user?.id ?? null,
    })
    setSaving(false)
    if (error) return setError(error.message)
    setSuccess(true)
    setTimeout(() => navigate(-1), 1800)
  }

  function onContinue() {
    if (step === 0) {
      setTouched({ first_name: true, middle_name: true, last_name: true, gender: true, id_type: true, id_number: true, dob: true })
      if (!canNext1) return
      setStep(1)
    } else if (step === 1) {
      if (!canNext2) return
      setStep(2)
    }
  }

  if (success) {
    return (
      <div className="success-screen">
        <svg viewBox="0 0 100 100" width="120" height="120" className="success-tick">
          <circle cx="50" cy="50" r="42" fill="none" stroke="#006600" strokeWidth="3" className="tick-circle" />
          <path d="M30 52 L45 67 L72 38" fill="none" stroke="#006600" strokeWidth="6"
            strokeLinecap="round" strokeLinejoin="round" className="tick-check" />
        </svg>
        <h2>Voter Registered</h2>
        <p className="muted">Face encoding stored. Returning...</p>
      </div>
    )
  }

  return (
    <div className="register-page">
      <header className="admin-header">
        <Logo size={32} showText />
        <button className="btn-ghost" onClick={() => navigate(-1)}>Back</button>
      </header>

      <main className="register-main">
        <div className="stepper">
          {STEPS.map((s, i) => (
            <div key={s} className={`step ${i === step ? 'active' : ''} ${i < step ? 'done' : ''}`}>
              <span className="step-num">{i < step ? 'OK' : i + 1}</span>
              <span className="step-label">{s}</span>
            </div>
          ))}
        </div>

        <div className="form-card">
          {step === 0 && (
            <>
              <h1>Personal Details</h1>
              <p className="muted">Step 1 of 3</p>
              <div className="register-form">
                <label>
                  First Name *
                  <input value={form.first_name}
                    onChange={e => update('first_name', e.target.value)}
                    onBlur={() => markTouched('first_name')}
                    maxLength={50} placeholder="Jane" />
                  {touched.first_name && errors.first_name && <span className="field-error">{errors.first_name}</span>}
                </label>
                <label>
                  Middle Name
                  <input value={form.middle_name}
                    onChange={e => update('middle_name', e.target.value)}
                    onBlur={() => markTouched('middle_name')}
                    maxLength={50} placeholder="Wanjiku (optional)" />
                  {touched.middle_name && errors.middle_name && <span className="field-error">{errors.middle_name}</span>}
                </label>
                <label>
                  Last Name *
                  <input value={form.last_name}
                    onChange={e => update('last_name', e.target.value)}
                    onBlur={() => markTouched('last_name')}
                    maxLength={50} placeholder="Kamau" />
                  {touched.last_name && errors.last_name && <span className="field-error">{errors.last_name}</span>}
                </label>

                <label>
                  Gender *
                  <div className="radio-group">
                    {['male','female','other'].map(g => (
                      <label key={g} className="radio-pill">
                        <input type="radio" name="gender" value={g}
                          checked={form.gender === g}
                          onChange={e => { update('gender', e.target.value); markTouched('gender') }} />
                        <span>{g.charAt(0).toUpperCase() + g.slice(1)}</span>
                      </label>
                    ))}
                  </div>
                  {touched.gender && errors.gender && <span className="field-error">{errors.gender}</span>}
                </label>

                <label>
                  ID Type *
                  <div className="radio-group">
                    <label className="radio-pill">
                      <input type="radio" name="id_type" value="national_id"
                        checked={form.id_type === 'national_id'}
                        onChange={e => { update('id_type', e.target.value); update('id_number', ''); markTouched('id_type') }} />
                      <span>National ID</span>
                    </label>
                    <label className="radio-pill">
                      <input type="radio" name="id_type" value="passport"
                        checked={form.id_type === 'passport'}
                        onChange={e => { update('id_type', e.target.value); update('id_number', ''); markTouched('id_type') }} />
                      <span>Passport</span>
                    </label>
                  </div>
                </label>

                <label>
                  {form.id_type === 'passport' ? 'Passport Number *' : 'National ID Number *'}
                  <input value={form.id_number}
                    onChange={e => {
                      let v = e.target.value
                      v = form.id_type === 'national_id'
                        ? v.replace(/\D/g, '')
                        : v.toUpperCase().replace(/[^A-Z0-9]/g, '')
                      update('id_number', v.slice(0, 9))
                    }}
                    onBlur={() => markTouched('id_number')}
                    maxLength={9} inputMode={form.id_type === 'national_id' ? 'numeric' : 'text'}
                    placeholder={form.id_type === 'passport' ? 'A1234567' : '12345678'} />
                  {form.id_type === 'passport' && <span className="field-hint">1 uppercase letter + 7 digits</span>}
                  {form.id_type === 'national_id' && <span className="field-hint">7-9 digits, numbers only</span>}
                  {touched.id_number && errors.id_number && <span className="field-error">{errors.id_number}</span>}
                </label>

                <label>
                  Date of Birth *
                  <input type="date" value={form.dob}
                    min={MIN_DOB_STR} max={MAX_DOB_STR}
                    onChange={e => { update('dob', e.target.value); markTouched('dob') }} />
                  <span className="field-hint">Must be 18 years or older</span>
                  {touched.dob && errors.dob && <span className="field-error">{errors.dob}</span>}
                </label>
              </div>
            </>
          )}

          {step === 1 && (
            <>
              <h1>Location &amp; Polling Station</h1>
              <p className="muted">Step 2 of 3</p>
              <div className="register-form">
                <label>County *
                  <select value={form.county} onChange={e => setCounty(e.target.value)}>
                    <option value="">Select county</option>
                    {counties.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </label>
                <label>Constituency *
                  <select value={form.constituency} onChange={e => setConstituency(e.target.value)} disabled={!form.county}>
                    <option value="">{form.county ? 'Select constituency' : 'Select a county first'}</option>
                    {constituencies.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </label>
                <label>Ward (CAW) *
                  <select value={form.ward} onChange={e => setWard(e.target.value)} disabled={!form.constituency}>
                    <option value="">{form.constituency ? 'Select ward' : 'Select a constituency first'}</option>
                    {wards.map(w => <option key={w} value={w}>{w}</option>)}
                  </select>
                </label>
                <label>Polling Station *
                  <select value={form.polling_station} onChange={e => update('polling_station', e.target.value)} disabled={!form.ward}>
                    <option value="">{form.ward ? 'Select polling station' : 'Select a ward first'}</option>
                    {stations.map(p => <option key={p} value={p}>{p}</option>)}
                  </select>
                </label>
              </div>
            </>
          )}

          {step === 2 && (
            <>
              <h1>Biometric Capture</h1>
              <p className="muted">Step 3 of 3</p>
              <div className="biometric-section">
                <h3>Face Capture</h3>

                {!features.camera && (
                  <div className="form-error">This browser doesn't support camera access. Use Chrome, Safari 15+, Edge, or Firefox.</div>
                )}

                {features.camera && faceProcessing && (
                  <div className="face-processing">
                    <div className="face-spinner" />
                    <span>Analysing face...</span>
                  </div>
                )}

                {features.camera && !faceProcessing && form.face_photo_data && faceDescriptor && (
                  <div className="face-preview">
                    <img src={form.face_photo_data} alt="Captured face" className="face-thumb-lg" />
                    <div className="face-preview-actions">
                      <button className="btn-ghost"
                        onClick={() => { update('face_photo_data', ''); setFaceDescriptor(null); setFaceOpen(true) }}>
                        Retake
                      </button>
                    </div>
                    <span className="face-ok-hint">Face encoding captured</span>
                  </div>
                )}

                {features.camera && !faceProcessing && !form.face_photo_data && !faceError && (
                  <button className="btn-primary" onClick={() => setFaceOpen(true)}>
                    Open Camera
                  </button>
                )}

                {faceError && (
                  <div className="form-error">
                    {faceError}
                    <button className="btn-ghost" style={{ marginTop: 10 }}
                      onClick={() => { setFaceError(''); setFaceOpen(true) }}>
                      Try Again
                    </button>
                  </div>
                )}

                <h3 style={{ marginTop: 24 }}>Fingerprint Enroll</h3>
                <p className="muted">Not available in this build.</p>
              </div>
            </>
          )}

          {error && <div className="form-error" style={{ marginTop: 16 }}>{error}</div>}

          <div className="form-actions">
            {step > 0 && <button className="btn-ghost" onClick={() => setStep(s => s - 1)}>Back</button>}
            {step < 2 && <button className="btn-primary" onClick={onContinue}>Continue</button>}
            {step === 2 && (
              <button className="btn-primary" disabled={!canSubmit || saving} onClick={handleSubmit}>
                {saving ? 'Registering' : 'Complete Registration'}
              </button>
            )}
          </div>
        </div>
      </main>

      <FaceCapture open={faceOpen} onClose={() => setFaceOpen(false)}
        onCapture={handleFaceCaptured} title="Capture Voter Face" />
    </div>
  )
}