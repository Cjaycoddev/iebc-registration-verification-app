import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import Logo from '../components/Logo'

const PAGE_SIZE = 50

// Explicitly list columns  face_photo_data is EXCLUDED here for speed
const LIST_COLUMNS = 'id, first_name, middle_name, last_name, id_number, id_type, gender, dob, county, constituency, ward, polling_station, polling_center, phone, created_at, verified_at'

async function fetchAllRows(table, columns, orderBy = 'created_at') {
  const PAGE = 1000
  // Parallel batches  5 pages at a time
  const PARALLEL = 5
  let round = 0
  let all = []

  while (round < 50) {  // hard cap 50 rounds  5  1000 = 250k rows
    const promises = []
    for (let k = 0; k < PARALLEL; k++) {
      const from = (round * PARALLEL + k) * PAGE
      promises.push(
        supabase.from(table).select(columns)
          .order(orderBy, { ascending: false })
          .range(from, from + PAGE - 1)
      )
    }
    const results = await Promise.all(promises)
    let got = 0
    for (const res of results) {
      if (res.error || !res.data) continue
      all = all.concat(res.data)
      got += res.data.length
    }
    if (got < PARALLEL * PAGE) break  // last round had short pages
    round++
  }
  return all
}

export default function AdminVoters() {
  const navigate = useNavigate()
  const [voters, setVoters] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [search, setSearch] = useState('')
  const [county, setCounty] = useState('')
  const [gender, setGender] = useState('')
  const [status, setStatus] = useState('')
  const [sortKey, setSortKey] = useState('created_at')
  const [sortDir, setSortDir] = useState('desc')
  const [page, setPage] = useState(0)
  const [selected, setSelected] = useState(null)
  const [selectedFull, setSelectedFull] = useState(null)
  const [loadingFull, setLoadingFull] = useState(false)
  const [selectedLogs, setSelectedLogs] = useState([])

  useEffect(() => {
    (async () => {
      setLoading(true); setError('')
      try {
        const list = await fetchAllRows('voters', LIST_COLUMNS, 'created_at')
        setVoters(list)
      } catch (e) {
        setError(e.message || 'Failed to load voters')
      }
      setLoading(false)
    })()
  }, [])

  // When a row is clicked, fetch its full record + verification history
  useEffect(() => {
    if (!selected) { setSelectedFull(null); setSelectedLogs([]); return }
    setLoadingFull(true)
    ;(async () => {
      const [voterRes, logsRes] = await Promise.all([
        supabase.from('voters').select('*').eq('id', selected.id).maybeSingle(),
        supabase.from('verification_logs').select('*')
          .eq('voter_id', selected.id)
          .order('created_at', { ascending: false })
          .limit(50),
      ])
      if (voterRes.data) setSelectedFull(voterRes.data)
      setSelectedLogs(logsRes.data || [])
      setLoadingFull(false)
    })()
  }, [selected])

  const counties = useMemo(
    () => Array.from(new Set(voters.map(v => v.county).filter(Boolean))).sort(),
    [voters]
  )

  const filtered = useMemo(() => {
    let list = [...voters]
    const q = search.trim().toLowerCase()
    if (q) {
      list = list.filter(v => {
        const full = (v.first_name + ' ' + (v.middle_name || '') + ' ' + v.last_name).toLowerCase()
        return full.includes(q)
          || v.id_number?.toLowerCase().includes(q)
          || v.county?.toLowerCase().includes(q)
          || v.constituency?.toLowerCase().includes(q)
          || v.ward?.toLowerCase().includes(q)
          || v.polling_station?.toLowerCase().includes(q)
      })
    }
    if (county) list = list.filter(v => v.county === county)
    if (gender) list = list.filter(v => v.gender === gender)
    if (status === 'verified')   list = list.filter(v => v.verified_at)
    if (status === 'unverified') list = list.filter(v => !v.verified_at)

    list.sort((a, b) => {
      let av, bv
      if (sortKey === 'full_name') {
        av = ((a.first_name || '') + ' ' + (a.last_name || '')).toLowerCase()
        bv = ((b.first_name || '') + ' ' + (b.last_name || '')).toLowerCase()
      } else if (sortKey === 'created_at' || sortKey === 'verified_at' || sortKey === 'dob') {
        av = a[sortKey] ? new Date(a[sortKey]).getTime() : 0
        bv = b[sortKey] ? new Date(b[sortKey]).getTime() : 0
      } else {
        av = a[sortKey] ?? ''
        bv = b[sortKey] ?? ''
      }
      const cmp = av < bv ? -1 : av > bv ? 1 : 0
      return sortDir === 'asc' ? cmp : -cmp
    })
    return list
  }, [voters, search, county, gender, status, sortKey, sortDir])

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const safePage = Math.min(page, totalPages - 1)
  const pageRows = filtered.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE)

  function toggleSort(key) {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(key); setSortDir('asc') }
    setPage(0)
  }

  function resetFilters() {
    setSearch(''); setCounty(''); setGender(''); setStatus(''); setPage(0)
  }

  function exportCsv() {
    const headers = ['first_name','middle_name','last_name','id_type','id_number','gender','dob','phone','county','constituency','ward','polling_station','polling_center','created_at','verified_at']
    const rows = [headers.join(',')].concat(filtered.map(v =>
      headers.map(h => {
        const val = v[h] == null ? '' : String(v[h])
        return '"' + val.replace(/"/g, '""') + '"'
      }).join(',')
    ))
    const blob = new Blob([rows.join('\n')], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'voters-' + new Date().toISOString().slice(0, 10) + '.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="admin">
      <header className="admin-header">
        <Logo size={36} showText />
        <div className="admin-header-right">
          <button className="btn-ghost" onClick={() => navigate('/admin')}>Back to Dashboard</button>
        </div>
      </header>

      <main className="admin-main">
        <div className="admin-title-row">
          <div>
            <h1>All Voters</h1>
            <p className="muted">
              {loading ? 'Loading...' : `${filtered.length.toLocaleString()} record${filtered.length === 1 ? '' : 's'} matching filters`}
            </p>
          </div>
          <div className="admin-actions">
            <button className="btn-ghost" onClick={exportCsv} disabled={loading}>Export CSV</button>
            <button className="btn-primary" onClick={() => navigate('/admin/upload-voters')}>Upload CSV</button>
          </div>
        </div>

        <section className="voters-filters">
          <input type="search" className="search-input"
            placeholder="Search name, ID, county, ward, or station"
            value={search} onChange={e => { setSearch(e.target.value); setPage(0) }} />
          <select value={county} onChange={e => { setCounty(e.target.value); setPage(0) }}>
            <option value="">All counties</option>
            {counties.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <select value={gender} onChange={e => { setGender(e.target.value); setPage(0) }}>
            <option value="">Any gender</option>
            <option value="male">Male</option>
            <option value="female">Female</option>
            <option value="other">Other</option>
          </select>
          <select value={status} onChange={e => { setStatus(e.target.value); setPage(0) }}>
            <option value="">Any status</option>
            <option value="verified">Verified</option>
            <option value="unverified">Not verified</option>
          </select>
          <button className="btn-ghost" onClick={resetFilters}>Reset</button>
        </section>

        {error && <div className="form-error">{error}</div>}

        {loading ? (
          <div className="skeleton-list">{[...Array(5)].map((_, i) => <div key={i} className="skeleton-row" />)}</div>
        ) : filtered.length === 0 ? (
          <div className="empty-state">
            <p>No voters matching your filters.</p>
          </div>
        ) : (
          <>
            <div className="table-wrap">
              <table className="officers-table">
                <thead>
                  <tr>
                    <th onClick={() => toggleSort('full_name')} className={sortKey === 'full_name' ? 'sorted' : ''}>Name</th>
                    <th onClick={() => toggleSort('id_number')} className={sortKey === 'id_number' ? 'sorted' : ''}>ID</th>
                    <th>County / Ward</th>
                    <th>Gender</th>
                    <th onClick={() => toggleSort('created_at')} className={sortKey === 'created_at' ? 'sorted' : ''}>Registered</th>
                    <th>Status</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {pageRows.map(v => (
                    <tr key={v.id}>
                      <td data-label="Name">
                        <div className="voter-name-cell">
                          <div className="voter-avatar voter-avatar-empty">
                            {(v.first_name?.[0] || '') + (v.last_name?.[0] || '')}
                          </div>
                          <span>{v.first_name} {v.last_name}</span>
                        </div>
                      </td>
                      <td data-label="ID">{v.id_number}</td>
                      <td data-label="Location">{v.county}<span className="muted">  {v.ward}</span></td>
                      <td data-label="Gender" style={{ textTransform: 'capitalize' }}>{v.gender}</td>
                      <td data-label="Registered">{new Date(v.created_at).toLocaleDateString()}</td>
                      <td data-label="Status">
                        <span className={'status-pill ' + (v.verified_at ? 'status-active' : 'status-pending')}>
                          {v.verified_at ? 'Verified' : 'Pending'}
                        </span>
                      </td>
                      <td><button className="btn-link" onClick={() => setSelected(v)}>View</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="voters-pager">
              <button className="btn-ghost" disabled={safePage === 0} onClick={() => setPage(p => Math.max(0, p - 1))}>Previous</button>
              <span className="muted">Page {safePage + 1} of {totalPages}</span>
              <button className="btn-ghost" disabled={safePage >= totalPages - 1} onClick={() => setPage(p => p + 1)}>Next</button>
            </div>
          </>
        )}
      </main>

      {selected && (
        <div className="voter-modal-backdrop" onClick={() => setSelected(null)}>
          <div className="voter-modal" onClick={e => e.stopPropagation()}>
            <header>
              <h3>{selectedFull ? `${selectedFull.first_name} ${selectedFull.middle_name || ''} ${selectedFull.last_name}` : `${selected.first_name} ${selected.last_name}`}</h3>
              <button onClick={() => setSelected(null)} aria-label="Close">x</button>
            </header>
            <div className="voter-modal-body">
              {loadingFull ? (
                <div className="skeleton-list">{[...Array(3)].map((_, i) => <div key={i} className="skeleton-row" />)}</div>
              ) : (
                <>
                  {selectedFull?.face_photo_data
                    ? <img src={selectedFull.face_photo_data} alt="Face" className="voter-modal-photo" />
                    : <div className="voter-modal-photo voter-modal-photo-empty">No photo on file</div>}
                  <dl className="verify-details">
                    <div><dt>ID Type</dt><dd>{selectedFull?.id_type || selected.id_type}</dd></div>
                    <div><dt>ID Number</dt><dd>{selectedFull?.id_number || selected.id_number}</dd></div>
                    <div><dt>Gender</dt><dd style={{ textTransform: 'capitalize' }}>{selectedFull?.gender || selected.gender}</dd></div>
                    <div><dt>DOB</dt><dd>{selectedFull?.dob || selected.dob}</dd></div>
                    <div><dt>Phone</dt><dd>{selectedFull?.phone || selected.phone || ''}</dd></div>
                    <div><dt>County</dt><dd>{selectedFull?.county || selected.county}</dd></div>
                    <div><dt>Constituency</dt><dd>{selectedFull?.constituency || selected.constituency}</dd></div>
                    <div><dt>Ward</dt><dd>{selectedFull?.ward || selected.ward}</dd></div>
                    <div><dt>Polling Center</dt><dd>{selectedFull?.polling_center || selected.polling_center || ''}</dd></div>
                    <div><dt>Polling Station</dt><dd>{selectedFull?.polling_station || selected.polling_station}</dd></div>
                    <div><dt>Registered</dt><dd>{new Date(selectedFull?.created_at || selected.created_at).toLocaleString()}</dd></div>
                    <div><dt>Verified</dt><dd>{selectedFull?.verified_at || selected.verified_at ? new Date(selectedFull?.verified_at || selected.verified_at).toLocaleString() : 'Not yet'}</dd></div>
                  </dl>

                  <h4>Verification History</h4>
                  {selectedLogs.length === 0 ? (
                    <p className="muted">No verification attempts recorded.</p>
                  ) : (
                    <ul className="verification-history">
                      {selectedLogs.map(l => (
                        <li key={l.id}>
                          <span className={'status-pill ' + (l.success ? 'status-active' : 'status-inactive')}>
                            {l.success ? 'Passed' : 'Failed'}
                          </span>
                          <span className="muted">{l.method}</span>
                          {typeof l.confidence === 'number' && (
                            <span className="muted">{(l.confidence * 100).toFixed(0)}%</span>
                          )}
                          <span className="muted">{new Date(l.created_at).toLocaleString()}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}