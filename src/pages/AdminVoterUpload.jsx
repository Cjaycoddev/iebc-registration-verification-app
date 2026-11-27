import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Papa from 'papaparse'
import { supabase } from '../lib/supabase'
import Logo from '../components/Logo'

// ---- Column alias map: any of these header names maps to our canonical field ----
const ALIASES = {
  first_name:      ['first_name','fname','firstname','given_name','givenname','first name','given name','given names'],
  middle_name:     ['middle_name','mname','middlename','middle name','other_name','othername','other name','other names'],
  last_name:       ['last_name','sname','surname','lastname','family_name','familyname','last name','family name'],
  county:          ['county','county_name','county name'],
  constituency:    ['constituency','constituency_name','constituency name','const'],
  ward:            ['ward','caw','ward_name','ward name','county_assembly_ward','county assembly ward','countyassemblyward'],
  polling_center:  ['polling_center','polling_centre','polling center','polling centre','center','centre','pollingcenter'],
  polling_station: ['polling_station','polling_station_name','polling station','station','stream','pollingstation'],
  gender:          ['gender','sex'],
  dob:             ['dob','date_of_birth','dateofbirth','date of birth','birth_date','birthdate','birth date'],
  phone:           ['phone','phone_number','phonenumber','phone number','mobile','mobile_number','mobile_no','tel'],
  id_number:       ['id_number','id_no','id','national_id','national_id_number','national id','id_passport_no','id_passport','id passport no','passport_no','passport_number','idpassportno'],
  id_type:         ['id_type','idtype','id type'],
}

const REQUIRED = ['first_name','last_name','gender','id_number','dob','county','constituency','ward']

function normHeader(h) {
  return String(h || '').trim().toLowerCase().replace(/[\s/\-]+/g, '_').replace(/[^a-z0-9_]/g, '')
}

function detectMapping(headers) {
  const mapping = {}
  const normalizedHeaders = headers.map(h => ({ original: h, norm: normHeader(h) }))
  for (const [canonical, aliases] of Object.entries(ALIASES)) {
    const normAliases = aliases.map(normHeader)
    const hit = normalizedHeaders.find(h => normAliases.includes(h.norm))
    if (hit) mapping[canonical] = hit.original
  }
  return mapping
}

function normaliseGender(val) {
  if (val === null || val === undefined) return null
  const s = String(val).trim().toLowerCase()
  if (!s) return null
  if (['m','male','man','1','mr'].includes(s)) return 'male'
  if (['f','female','woman','2','mrs','ms'].includes(s)) return 'female'
  if (['o','other','x','3'].includes(s)) return 'other'
  return null
}

function normalisePhone(val) {
  if (!val) return null
  const digits = String(val).replace(/\D/g, '')
  if (!digits) return null
  if (digits.length === 12 && digits.startsWith('254')) return '+' + digits
  if (digits.length === 10 && digits.startsWith('0')) return '+254' + digits.slice(1)
  if (digits.length === 9 && digits.startsWith('7')) return '+254' + digits
  if (digits.length === 9 && digits.startsWith('1')) return '+254' + digits
  return digits
}

function normaliseDate(val) {
  if (val === null || val === undefined) return null
  const s = String(val).trim()
  if (!s) return null

  // YYYY-MM-DD or YYYY/MM/DD
  let m = s.match(/^(\d{4})[\-\/.](\d{1,2})[\-\/.](\d{1,2})/)
  if (m) {
    const y = parseInt(m[1]), mo = parseInt(m[2]), d = parseInt(m[3])
    if (y >= 1900 && y <= 2100 && mo >= 1 && mo <= 12 && d >= 1 && d <= 31) {
      return `${y}-${String(mo).padStart(2,'0')}-${String(d).padStart(2,'0')}`
    }
  }

  // DD/MM/YYYY or DD-MM-YYYY (Kenyan standard) or MM/DD/YYYY
  m = s.match(/^(\d{1,2})[\-\/.](\d{1,2})[\-\/.](\d{4})/)
  if (m) {
    const a = parseInt(m[1]), b = parseInt(m[2]), y = parseInt(m[3])
    if (y < 1900 || y > 2100) return null
    let d, mo
    if (a > 12 && b <= 12) { d = a; mo = b }
    else if (b > 12 && a <= 12) { d = b; mo = a }
    else { d = a; mo = b }  // assume DD/MM (Kenyan)
    if (d >= 1 && d <= 31 && mo >= 1 && mo <= 12) {
      return `${y}-${String(mo).padStart(2,'0')}-${String(d).padStart(2,'0')}`
    }
  }

  // Excel serial number
  if (/^\d{5}$/.test(s)) {
    const n = parseInt(s)
    const epoch = new Date(1899, 11, 30)
    const dt = new Date(epoch.getTime() + n * 86400000)
    if (!isNaN(dt.getTime()) && dt.getFullYear() > 1900 && dt.getFullYear() < 2100) {
      return dt.toISOString().slice(0, 10)
    }
  }

  return null
}

function parseId(rawId, rawType) {
  let idType = rawType ? String(rawType).trim().toLowerCase() : null
  if (idType) {
    if (idType.includes('passport')) idType = 'passport'
    else if (idType.includes('national') || idType === 'id' || idType.includes('national_id')) idType = 'national_id'
    else idType = null
  }

  const id = String(rawId || '').trim().toUpperCase().replace(/\s+/g, '')
  if (!id) return { id_type: idType || 'national_id', id_number: '', error: 'ID number is empty' }

  if (!idType) {
    if (/^[A-Z]\d{7}$/.test(id)) idType = 'passport'
    else if (/^\d{6,9}$/.test(id)) idType = 'national_id'
    else idType = 'national_id'  // default, will fail below
  }

  if (idType === 'national_id' && !/^\d{6,9}$/.test(id)) {
    return { id_type: idType, id_number: id, error: 'National ID must be 6-9 digits, got "' + id + '"' }
  }
  if (idType === 'passport' && !/^[A-Z]\d{7}$/.test(id)) {
    return { id_type: idType, id_number: id, error: 'Passport must be letter + 7 digits (A1234567), got "' + id + '"' }
  }

  return { id_type: idType, id_number: id }
}

function validateRow(canonical) {
  const errors = []

  if (!canonical.first_name) errors.push('first_name: required')
  if (!canonical.last_name) errors.push('last_name: required')

  if (!canonical.gender) errors.push('gender: could not recognise "' + (canonical._raw_gender ?? '') + '" as male/female/other')

  if (!canonical.id_number) errors.push('id_number: required')
  else if (canonical._idError) errors.push(canonical._idError)

  if (!canonical.dob) errors.push('dob: could not parse "' + (canonical._raw_dob ?? '') + '" as a valid date')

  if (!canonical.county) errors.push('county: required')
  if (!canonical.constituency) errors.push('constituency: required')
  if (!canonical.ward) errors.push('ward: required')
  if (!canonical.polling_station) errors.push('polling_station: required')

  return errors
}

function buildCanonical(row, mapping) {
  const get = (field) => {
    const header = mapping[field]
    return header ? String(row[header] ?? '').trim() : ''
  }

  const rawGender = get('gender')
  const rawDob = get('dob')
  const rawId = get('id_number')
  const rawType = get('id_type')
  const pollingCenter = get('polling_center')
  const pollingStation = get('polling_station') || pollingCenter  // fallback

  const idParsed = parseId(rawId, rawType)

  return {
    first_name:      get('first_name'),
    middle_name:     get('middle_name') || null,
    last_name:       get('last_name'),
    gender:          normaliseGender(rawGender),
    dob:             normaliseDate(rawDob),
    phone:           normalisePhone(get('phone')),
    county:          get('county'),
    constituency:    get('constituency'),
    ward:            get('ward'),
    polling_center:  pollingCenter || null,
    polling_station: pollingStation || '',
    id_type:         idParsed.id_type,
    id_number:       idParsed.id_number,
    _raw_gender:     rawGender,
    _raw_dob:        rawDob,
    _idError:        idParsed.error,
  }
}

export default function AdminVoterUpload() {
  const navigate = useNavigate()
  const [fileName, setFileName] = useState('')
  const [rawRows, setRawRows] = useState([])
  const [headers, setHeaders] = useState([])
  const [mapping, setMapping] = useState({})
  const [existingIds, setExistingIds] = useState(new Set())
  const [markVerified, setMarkVerified] = useState(true)
  const [countyFilter, setCountyFilter] = useState('')
  const [uploading, setUploading] = useState(false)
  const [progress, setProgress] = useState({ done: 0, total: 0 })
  const [result, setResult] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    (async () => {
      const PAGE = 1000
      const ids = new Set()
      let from = 0
      for (let i = 0; i < 100; i++) {
        const { data } = await supabase.from('voters').select('id_number').range(from, from + PAGE - 1)
        if (!data || data.length === 0) break
        data.forEach(r => r.id_number && ids.add(r.id_number))
        if (data.length < PAGE) break
        from += PAGE
      }
      setExistingIds(ids)
    })()
  }, [])

  function handleFile(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setFileName(file.name); setResult(null); setError(''); setRawRows([]); setHeaders([]); setMapping({})

    Papa.parse(file, {
      header: true,
      skipEmptyLines: 'greedy',
      transformHeader: h => h.trim(),
      complete: (res) => {
        const hdrs = res.meta.fields || []
        const parsed = res.data.filter(r => Object.values(r).some(v => v && String(v).trim()))
        setHeaders(hdrs)
        setRawRows(parsed)
        setMapping(detectMapping(hdrs))
      },
      error: (err) => setError('CSV parse error: ' + err.message),
    })
  }

  const analysis = useMemo(() => {
    if (rawRows.length === 0) return { valid: [], errors: [], dupes: [], missing: [], counties: [] }

    const missing = REQUIRED.filter(f => !mapping[f])

    const valid = [], errors = [], dupes = []
    const seen = new Set()
    const counties = new Set()

    rawRows.forEach((row, idx) => {
      const c = buildCanonical(row, mapping)
      if (c.county) counties.add(c.county)
      if (countyFilter && c.county !== countyFilter) return

      const errs = validateRow(c)
      if (errs.length > 0) { errors.push({ idx, canonical: c, errors: errs }); return }

      if (existingIds.has(c.id_number)) { dupes.push({ idx, id: c.id_number, reason: 'already in database' }); return }
      if (seen.has(c.id_number))       { dupes.push({ idx, id: c.id_number, reason: 'duplicate in file' }); return }
      seen.add(c.id_number)
      valid.push(c)
    })

    return { valid, errors, dupes, missing, counties: Array.from(counties).sort() }
  }, [rawRows, mapping, existingIds, countyFilter])

  async function handleUpload() {
    if (analysis.valid.length === 0) return
    setUploading(true); setProgress({ done: 0, total: analysis.valid.length }); setError('')

    const { data: { user } } = await supabase.auth.getUser()
    const nowIso = new Date().toISOString()

    const toInsert = analysis.valid.map(c => ({
      first_name: c.first_name,
      middle_name: c.middle_name,
      last_name: c.last_name,
      gender: c.gender,
      id_type: c.id_type,
      id_number: c.id_number,
      dob: c.dob,
      phone: c.phone,
      county: c.county,
      constituency: c.constituency,
      ward: c.ward,
      polling_center: c.polling_center,
      polling_station: c.polling_station,
      registered_by: user?.id ?? null,
      verified_at: markVerified ? nowIso : null,
    }))

    const BATCH = 200
    let inserted = 0
    const failures = []

    for (let i = 0; i < toInsert.length; i += BATCH) {
      const batch = toInsert.slice(i, i + BATCH)
      const { data, error: err } = await supabase.from('voters').insert(batch).select('id')
      if (err) failures.push({ from: i, error: err.message })
      else inserted += (data?.length || batch.length)
      setProgress({ done: Math.min(i + BATCH, toInsert.length), total: toInsert.length })
    }

    setUploading(false)
    setResult({ inserted, failed: failures.length, failures })
  }

  function reset() {
    setFileName(''); setRawRows([]); setHeaders([]); setMapping({}); setResult(null); setError(''); setCountyFilter('')
  }

  function downloadFailed() {
    const payload = analysis.errors.map(e => {
      const original = rawRows[e.idx]
      return { ...original, _error: e.errors.join('; ') }
    })
    if (payload.length === 0) return
    const csv = Papa.unparse(payload)
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = 'failed-rows-' + Date.now() + '.csv'; a.click()
    URL.revokeObjectURL(url)
  }

  const mappingEntries = Object.entries(mapping)
  const unmappedRequired = REQUIRED.filter(f => !mapping[f])

  return (
    <div className="admin">
      <header className="admin-header">
        <Logo size={36} showText />
        <div className="admin-header-right">
          <button className="btn-ghost" onClick={() => navigate('/admin')}>Back</button>
        </div>
      </header>

      <main className="admin-main">
        <div className="admin-title-row">
          <div>
            <h1>Upload Voter CSV</h1>
            <p className="muted">Flexible column matching. Duplicates and invalid rows are skipped automatically.</p>
          </div>
        </div>

        {!result && (
          <section className="upload-card">
            <label className="upload-dropzone">
              <input type="file" accept=".csv,text/csv" onChange={handleFile} hidden />
              <div className="upload-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24" width="32" height="32" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="17 8 12 3 7 8" />
                  <line x1="12" y1="3" x2="12" y2="15" />
                </svg>
              </div>
              <strong>{fileName || 'Choose a CSV file'}</strong>
              <span className="muted">Any of these column names work: first_name / fname, last_name / sname, gender / sex, dob / date_of_birth, caw / ward, id_passport_no / id_number, etc.</span>
            </label>

            {headers.length > 0 && (
              <div className="mapping-panel">
                <h3>Detected columns ({mappingEntries.length} matched)</h3>
                <div className="mapping-grid">
                  {Object.entries(ALIASES).map(([canonical]) => {
                    const matched = mapping[canonical]
                    const isRequired = REQUIRED.includes(canonical)
                    return (
                      <div key={canonical} className={'mapping-item' + (matched ? ' is-ok' : isRequired ? ' is-missing' : '')}>
                        <span className="mapping-from">{matched || ''}</span>
                        <span className="mapping-arrow"></span>
                        <span className="mapping-to">{canonical}{isRequired ? ' *' : ''}</span>
                      </div>
                    )
                  })}
                </div>
                {unmappedRequired.length > 0 && (
                  <div className="form-error" style={{ marginTop: 12 }}>
                    Missing required columns: {unmappedRequired.join(', ')}. Rename one of the file's headers to any alias above and re-upload.
                  </div>
                )}
                {mapping.id_number && !mapping.id_type && (
                  <p className="muted" style={{ marginTop: 10, fontSize: '.82rem' }}>
                    No id_type column  will auto-detect: all-digits  National ID, letter + digits  Passport.
                  </p>
                )}
                {mapping.polling_center && !mapping.polling_station && (
                  <p className="muted" style={{ marginTop: 6, fontSize: '.82rem' }}>
                    No polling_station column  will use polling_center as the station.
                  </p>
                )}
              </div>
            )}

            {rawRows.length > 0 && (
              <>
                <div className="upload-summary">
                  <div className="upload-stat is-ok"><span>{analysis.valid.length}</span><small>Ready</small></div>
                  <div className="upload-stat is-warn"><span>{analysis.dupes.length}</span><small>Duplicates</small></div>
                  <div className="upload-stat is-err"><span>{analysis.errors.length}</span><small>Errors</small></div>
                </div>

                <div className="upload-controls">
                  <label>
                    County filter
                    <select value={countyFilter} onChange={e => setCountyFilter(e.target.value)}>
                      <option value="">All counties ({analysis.counties.length})</option>
                      {analysis.counties.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </label>
                  <label className="upload-checkbox">
                    <input type="checkbox" checked={markVerified} onChange={e => setMarkVerified(e.target.checked)} />
                    Mark imported voters as verified
                  </label>
                </div>

                {analysis.errors.length > 0 && (
                  <details className="upload-details" open>
                    <summary>{analysis.errors.length} rows with errors</summary>
                    <ul>
                      {analysis.errors.slice(0, 15).map((e, i) => (
                        <li key={i}>Row {e.idx + 2}: {e.errors.join('; ')}</li>
                      ))}
                      {analysis.errors.length > 15 && <li> and {analysis.errors.length - 15} more</li>}
                    </ul>
                    <button className="btn-ghost" style={{ marginTop: 10 }} onClick={downloadFailed}>
                      Download failed rows as CSV
                    </button>
                  </details>
                )}

                {analysis.dupes.length > 0 && (
                  <details className="upload-details">
                    <summary>{analysis.dupes.length} duplicate rows (skipped)</summary>
                    <ul>
                      {analysis.dupes.slice(0, 15).map((d, i) => (
                        <li key={i}>Row {d.idx + 2}: ID {d.id}  {d.reason}</li>
                      ))}
                    </ul>
                  </details>
                )}

                {analysis.valid.length > 0 && (
                  <div className="upload-preview">
                    <h3>Preview (first 10 valid rows, normalised)</h3>
                    <div className="table-wrap">
                      <table className="officers-table">
                        <thead>
                          <tr><th>Name</th><th>ID</th><th>Type</th><th>Gender</th><th>DOB</th><th>County</th><th>Ward</th></tr>
                        </thead>
                        <tbody>
                          {analysis.valid.slice(0, 10).map((c, i) => (
                            <tr key={i}>
                              <td>{c.first_name} {c.last_name}</td>
                              <td>{c.id_number}</td>
                              <td>{c.id_type}</td>
                              <td style={{ textTransform: 'capitalize' }}>{c.gender}</td>
                              <td>{c.dob}</td>
                              <td>{c.county}</td>
                              <td>{c.ward}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {uploading && (
                  <div className="upload-progress">
                    <div className="upload-progress-bar" style={{ width: (progress.done / Math.max(1, progress.total)) * 100 + '%' }} />
                    <span>{progress.done} / {progress.total}</span>
                  </div>
                )}

                <div className="upload-actions">
                  <button className="btn-ghost" onClick={reset} disabled={uploading}>Cancel</button>
                  <button className="btn-primary" disabled={uploading || analysis.valid.length === 0} onClick={handleUpload}>
                    {uploading ? 'Uploading...' : `Import ${analysis.valid.length} voter${analysis.valid.length === 1 ? '' : 's'}`}
                  </button>
                </div>
              </>
            )}

            {error && <div className="form-error">{error}</div>}
          </section>
        )}

        {result && (
          <section className="upload-card upload-result">
            <div className="upload-result-icon" aria-hidden="true">
              {result.inserted > 0 ? (
                <svg viewBox="0 0 52 52" width="80" height="80">
                  <circle cx="26" cy="26" r="24" fill="none" stroke="#059669" strokeWidth="3" />
                  <path d="M14 27 L23 36 L39 18" fill="none" stroke="#059669" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              ) : (
                <svg viewBox="0 0 52 52" width="80" height="80">
                  <circle cx="26" cy="26" r="24" fill="none" stroke="#dc2626" strokeWidth="3" />
                  <path d="M17 17 L35 35 M35 17 L17 35" fill="none" stroke="#dc2626" strokeWidth="4" strokeLinecap="round" />
                </svg>
              )}
            </div>
            <h2>{result.inserted} voter{result.inserted === 1 ? '' : 's'} imported</h2>
            {result.failed > 0 && <p className="muted">{result.failed} batch{result.failed === 1 ? '' : 'es'} failed</p>}
            {result.failures.length > 0 && (
              <details className="upload-details">
                <summary>Failed batches</summary>
                <ul>{result.failures.map((f, i) => <li key={i}>From row {f.from}: {f.error}</li>)}</ul>
              </details>
            )}
            <div className="upload-actions">
              <button className="btn-ghost" onClick={reset}>Upload another file</button>
              <button className="btn-primary" onClick={() => navigate('/admin/voters')}>View all voters</button>
            </div>
          </section>
        )}
      </main>
    </div>
  )
}