import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import Logo from '../components/Logo'

const PAGE_SIZE = 25

export default function AdminVoters() {
  const navigate = useNavigate()
  const [voters, setVoters] = useState([])
  const [logs, setLogs] = useState([])
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

  useEffect(() => {
    (async () => {
      setLoading(true); setError('')
      const [{ data: v, error: vErr }, { data: l }] = await Promise.all([
        supabase.from('voters').select('*').order('created_at', { ascending: false }),
        supabase.from('verification_logs').select('*').order('created_at', { ascending: false }),
      ])
      if (vErr) setError(vErr.message)
      setVoters(v ?? [])
      setLogs(l ?? [])
      setLoading(false)
    })()
  }, [])

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
    const headers = ['first_name','middle_name','last_name','id_type','id_number','gender','dob','county','constituency','ward','polling_station','created_at','verified_at']
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

  const selectedLogs = useMemo(() => {
    if (!selected) return []
    return logs.filter(l => l.voter_id === selected.id)
  }, [selected, logs])

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
            <p className="muted">{filtered.length} record{filtered.length === 1 ? '' : 's'} matching filters</p>
          </div>
          <div className="admin-actions">
            <button className="btn-ghost" onClick={exportCsv}>Export CSV</button>
            <button className="btn-primary" onClick={() => navigate('/admin/voter-registration')}>+ Register Voter</button>
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
            {voters.length === 0 && (
              <button className="btn-primary" onClick={() => navigate('/admin/voter-registration')}>
                Register the first voter
              </button>
            )}
          </div>
        ) : (
          <>
            <div className="table-wrap">
              <table className="officers-table">
                <thead>
                  <tr>
                    <th onClick={() => toggleSort('full_name')} className={sortKey === 'full_name' ? 'sorted' : ''}>Name <SortArrow active={sortKey === 'full_name'} dir={sortDir} /></th>
                    <th onClick={() => toggleSort('id_number')} className={sortKey === 'id_number' ? 'sorted' : ''}>ID <SortArrow active={sortKey === 'id_number'} dir={sortDir} /></th>
                    <th>County / Ward</th>
                    <th>Gender</th>
                    <th onClick={() => toggleSort('created_at')} className={sortKey === 'created_at' ? 'sorted' : ''}>Registered <SortArrow active={sortKey === 'created_at'} dir={sortDir} /></th>
                    <th>Status</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {pageRows.map(v => (
                    <tr key={v.id}>
                      <td data-label="Name">
                        <div className="voter-name-cell">
                          {v.face_photo_data
                            ? <img src={v.face_photo_data} alt="" className="voter-avatar" />
                            : <div className="voter-avatar voter-avatar-empty" />}
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
              <h3>{selected.first_name} {selected.middle_name || ''} {selected.last_name}</h3>
              <button onClick={() => setSelected(null)} aria-label="Close">x</button>
            </header>
            <div className="voter-modal-body">
              {selected.face_photo_data && (
                <img src={selected.face_photo_data} alt="Face" className="voter-modal-photo" />
              )}
              <dl className="verify-details">
                <div><dt>ID Type</dt><dd>{selected.id_type}</dd></div>
                <div><dt>ID Number</dt><dd>{selected.id_number}</dd></div>
                <div><dt>Gender</dt><dd style={{ textTransform: 'capitalize' }}>{selected.gender}</dd></div>
                <div><dt>DOB</dt><dd>{selected.dob}</dd></div>
                <div><dt>County</dt><dd>{selected.county}</dd></div>
                <div><dt>Constituency</dt><dd>{selected.constituency}</dd></div>
                <div><dt>Ward</dt><dd>{selected.ward}</dd></div>
                <div><dt>Polling Station</dt><dd>{selected.polling_station}</dd></div>
                <div><dt>Registered</dt><dd>{new Date(selected.created_at).toLocaleString()}</dd></div>
                <div><dt>Verified</dt><dd>{selected.verified_at ? new Date(selected.verified_at).toLocaleString() : 'Not yet'}</dd></div>
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
                      <span className="muted">{new Date(l.created_at).toLocaleString()}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function SortArrow({ active, dir }) {
  if (!active) return <span className="sort-arrow muted">updown</span>
  return <span className="sort-arrow active">{dir === 'asc' ? 'up' : 'down'}</span>
}