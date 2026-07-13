import { useCallback, useMemo, useState } from 'react'
import { ArrowBack, Refresh, Timeline, WarningAmber } from '@mui/icons-material'
import useAutoRefresh from '../hooks/useAutoRefresh'

const localDate = (date = new Date()) => {
  const offset = date.getTimezoneOffset() * 60000
  return new Date(date.getTime() - offset).toISOString().slice(0, 10)
}
const addDay = (value) => {
  const date = new Date(`${value}T00:00:00`)
  date.setDate(date.getDate() + 1)
  return localDate(date)
}
const displayTime = (value) => value ? new Date(value.replace(' ', 'T')).toLocaleString('en-IN', {
  day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true,
}) : '—'

export default function OperationsLog({ onBack, plants }) {
  const today = localDate()
  const [fromDate, setFromDate] = useState(today)
  const [toDate, setToDate] = useState(today)
  const [eventType, setEventType] = useState('all')
  const [severity, setSeverity] = useState('')
  const [plant, setPlant] = useState('')
  const [criteria, setCriteria] = useState({ fromDate: today, toDate: today, eventType: 'all', severity: '', plant: '' })
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    const params = new URLSearchParams({
      start: `${criteria.fromDate}T00:00:00`, end: `${addDay(criteria.toDate)}T00:00:00`,
      event_type: criteria.eventType, limit: '2000',
    })
    if (criteria.severity) params.set('severity', criteria.severity)
    if (criteria.plant) params.set('plant', criteria.plant)
    try {
      const response = await fetch(`/api/operations/logs?${params}`, { cache: 'no-store' })
      if (!response.ok) throw new Error(`Operational log API returned ${response.status}`)
      setRows(await response.json())
    } catch (requestError) {
      setError(requestError.message || 'Unable to load operational history')
    } finally {
      setLoading(false)
    }
  }, [criteria])

  useAutoRefresh(load, 10000)

  const sites = useMemo(() => [...new Set([
    'MH SLDC', 'Site Weather', ...plants.map((item) => item.name), ...rows.map((row) => row.PlantName),
  ])].sort(), [plants, rows])
  const alarmCount = rows.filter((row) => row.EventType === 'alarm').length
  const highCount = rows.filter((row) => String(row.Severity).toLowerCase() === 'high' || String(row.Severity).toLowerCase() === 'critical').length

  const apply = (event) => {
    event.preventDefault()
    if (fromDate > toDate) return setError('From date must be before or equal to To date')
    setCriteria({ fromDate, toDate, eventType, severity, plant })
  }

  return <div className="operations-log-page">
    <div className="operations-log-title"><button onClick={onBack}><ArrowBack /> Control Centre</button><div><span>LIVE OPERATIONS HISTORY</span><h1>Alarms & Events Log</h1><p>Persistent MH SLDC communication and live site-weather monitoring records</p></div><button onClick={load}><Refresh className={loading ? 'spin' : ''} /> Refresh</button></div>
    <div className="operations-log-kpis"><article><span>Total records</span><b>{rows.length}</b></article><article><span>Alarm records</span><b>{alarmCount}</b></article><article><span>High / Critical</span><b className={highCount ? 'danger' : ''}>{highCount}</b></article><article><span>Auto refresh</span><b>10 <small>sec</small></b></article></div>
    <section className="operations-log-panel">
      <form className="operations-log-filters" onSubmit={apply}>
        <label>From<input type="date" value={fromDate} max={today} onChange={(event) => setFromDate(event.target.value)} /></label>
        <label>To<input type="date" value={toDate} min={fromDate} max={today} onChange={(event) => setToDate(event.target.value)} /></label>
        <label>Record type<select value={eventType} onChange={(event) => setEventType(event.target.value)}><option value="all">All records</option><option value="alarm">Alarms</option><option value="event">Events</option></select></label>
        <label>Severity<select value={severity} onChange={(event) => setSeverity(event.target.value)}><option value="">All severities</option><option>High</option><option>Medium</option><option>critical</option><option>warning</option><option>normal</option><option>info</option></select></label>
        <label>Site<select value={plant} onChange={(event) => setPlant(event.target.value)}><option value="">All sites</option>{sites.map((site) => <option key={site}>{site}</option>)}</select></label>
        <button type="submit"><Timeline /> Apply criteria</button>
      </form>
      {error && <div className="operations-log-error"><WarningAmber /> {error}</div>}
      <div className="operations-table-wrap"><table><thead><tr><th>Event time</th><th>Type</th><th>Site / Feed</th><th>Message</th><th>Severity</th><th>Source</th><th>Recorded at</th></tr></thead><tbody>
        {rows.map((row) => <tr key={row.EventKey}><td>{displayTime(row.EventTime)}</td><td><b className={`type ${row.EventType}`}>{row.EventType}</b></td><td><strong>{row.PlantName}</strong></td><td>{row.Message}</td><td><b className={`severity ${String(row.Severity).toLowerCase()}`}>{row.Severity}</b></td><td>{row.SourceName}</td><td>{displayTime(row.CreatedAt)}</td></tr>)}
        {!rows.length && <tr><td colSpan="7" className="operations-empty">{loading ? 'Loading operational history…' : 'No records match the selected criteria'}</td></tr>}
      </tbody></table></div>
    </section>
  </div>
}
