import { useCallback, useMemo, useState } from 'react'
import { Assessment, CalendarMonth, FileDownload, Refresh, Timeline, WarningAmber } from '@mui/icons-material'
import { SLDC_DISPLAY_NAMES } from '../hooks/useSldcData'
import useAutoRefresh from '../hooks/useAutoRefresh'

const localDate = (date = new Date()) => {
  const offset = date.getTimezoneOffset() * 60000
  return new Date(date.getTime() - offset).toISOString().slice(0, 10)
}

const localDateTime = (date = new Date()) => {
  const offset = date.getTimezoneOffset() * 60000
  return new Date(date.getTime() - offset).toISOString().slice(0, 19)
}

const addDays = (dateText, days) => {
  const date = new Date(`${dateText}T00:00:00`)
  date.setDate(date.getDate() + days)
  return localDate(date)
}

const apiRange = (fromDate, toDate) => {
  const start = `${fromDate}T00:00:00`
  const tomorrow = `${addDays(toDate, 1)}T00:00:00`
  const end = toDate === localDate() ? localDateTime() : tomorrow
  return { start, end }
}

const displayTime = (value) => value ? new Date(value.replace(' ', 'T')).toLocaleString('en-IN', {
  day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false,
}) : '—'

const mw = (value) => value == null ? '—' : Number(value).toFixed(1)

export default function SldcReports({ plants, selectedPlant, onPlantChange, reportRef }) {
  const today = localDate()
  const [fromDate, setFromDate] = useState(today)
  const [toDate, setToDate] = useState(today)
  const [query, setQuery] = useState({ fromDate: today, toDate: today })
  const [report, setReport] = useState({ samples: [], availability: [], generation: [], communication: [] })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const loadReport = useCallback(async () => {
    if (!selectedPlant) return
    setLoading(true)
    setError('')
    const range = apiRange(query.fromDate, query.toDate)
    const common = new URLSearchParams({ plant: selectedPlant, start: range.start, end: range.end })
    try {
      const paths = [
        `/api/sldc/samples?${common}`,
        `/api/sldc/availability?${common}&group_by=day`,
        `/api/sldc/generation?${common}&group_by=day`,
        `/api/sldc/communication?${common}`,
      ]
      const responses = await Promise.all(paths.map((path) => fetch(path, { cache: 'no-store' })))
      const failed = responses.find((response) => !response.ok)
      if (failed) throw new Error(`Report API returned ${failed.status}`)
      const [samples, availability, generation, communication] = await Promise.all(responses.map((response) => response.json()))
      setReport({ samples, availability, generation, communication })
    } catch (requestError) {
      setError(requestError.message || 'Unable to load SLDC report')
    } finally {
      setLoading(false)
    }
  }, [selectedPlant, query])

<<<<<<< HEAD
  useAutoRefresh(loadReport, query.toDate === today ? 15000 : 60000)
=======
  useAutoRefresh(loadReport, query.toDate === today ? 15000 : 60000,
    `${selectedPlant}|${query.fromDate}|${query.toDate}`)
>>>>>>> 23b0ecad43258afe71a144fbed8b528015030979

  const totals = useMemo(() => {
    const expected = report.availability.reduce((sum, row) => sum + row.ExpectedSamples, 0)
    const available = report.availability.reduce((sum, row) => sum + row.AvailableSamples, 0)
    return {
      availability: expected ? available * 100 / expected : 0,
      generation: report.generation.reduce((sum, row) => sum + row.EstimatedGenerationMWh, 0),
      unavailable: report.availability.reduce((sum, row) => sum + row.UnavailableSamples, 0),
    }
  }, [report])

  const applyDates = (event) => {
    event.preventDefault()
    if (fromDate > toDate) {
      setError('From date must be before or equal to To date')
      return
    }
    setQuery({ fromDate, toDate })
  }

  const quickRange = (days) => {
    const from = addDays(today, -(days - 1))
    setFromDate(from)
    setToDate(today)
    setQuery({ fromDate: from, toDate: today })
  }

  const downloadExcel = () => {
    if (!selectedPlant) return
    const range = apiRange(query.fromDate, query.toDate)
    const params = new URLSearchParams({ plant: selectedPlant, start: range.start, end: range.end })
    const link = document.createElement('a')
    link.href = `/api/sldc/report.xlsx?${params}`
    document.body.appendChild(link)
    link.click()
    link.remove()
  }

  return <section className="sldc-reports" ref={reportRef}>
    <div className="sldc-report-heading">
      <div><span>REPORTS</span><h2>{SLDC_DISPLAY_NAMES[selectedPlant] || selectedPlant} · Data history</h2><p>Generation, communication availability and exact 15-minute SLDC records</p></div>
      <Assessment />
    </div>

    <form className="sldc-report-filters" onSubmit={applyDates}>
      <label>Site<select value={selectedPlant} onChange={(event) => onPlantChange(event.target.value)}>{plants.map((plant) => <option value={plant.Plant} key={plant.Plant}>{SLDC_DISPLAY_NAMES[plant.Plant] || plant.Plant}</option>)}</select></label>
      <label>From date<input type="date" value={fromDate} max={today} onChange={(event) => setFromDate(event.target.value)} /></label>
      <label>To date<input type="date" value={toDate} min={fromDate} max={today} onChange={(event) => setToDate(event.target.value)} /></label>
      <button type="submit"><CalendarMonth /> Apply criteria</button>
      <button type="button" onClick={() => quickRange(1)}>Today</button>
      <button type="button" onClick={() => quickRange(7)}>Last 7 days</button>
      <button type="button" className="report-download" onClick={downloadExcel}><FileDownload /> Download Excel</button>
      <button type="button" className="report-refresh" onClick={loadReport}><Refresh className={loading ? 'spin' : ''} /></button>
    </form>

    {error && <div className="sldc-report-error"><WarningAmber />{error}</div>}
    <div className="sldc-report-kpis">
      <article><span>Availability</span><b>{totals.availability.toFixed(2)}%</b></article>
      <article><span>Estimated generation</span><b>{totals.generation.toFixed(2)} <small>MWh</small></b></article>
      <article><span>15-minute logs</span><b>{report.samples.length}</b></article>
      <article><span>Unavailable slots</span><b className={totals.unavailable ? 'danger' : ''}>{totals.unavailable}</b></article>
    </div>

    <div className="sldc-report-block">
      <h3><Timeline /> Daily performance report</h3>
      <div className="sldc-table-scroll"><table><thead><tr><th>Date</th><th>Est. generation</th><th>Average MW</th><th>Minimum MW</th><th>Maximum MW</th><th>Available / Expected</th><th>Availability</th></tr></thead><tbody>
        {report.generation.map((row) => <tr key={row.Period}><td>{row.Period}</td><td>{row.EstimatedGenerationMWh.toFixed(2)} MWh</td><td>{row.AverageMW.toFixed(1)}</td><td>{row.MinimumMW.toFixed(1)}</td><td>{row.MaximumMW.toFixed(1)}</td><td>{row.AvailableSamples} / {row.ExpectedSamples}</td><td><b className={row.AvailabilityPercent < 100 ? 'bad' : 'good'}>{row.AvailabilityPercent.toFixed(2)}%</b></td></tr>)}
        {!report.generation.length && <tr><td colSpan="7" className="empty-report">{loading ? 'Loading report…' : 'No generation records for this period'}</td></tr>}
      </tbody></table></div>
    </div>

    <div className="sldc-report-block">
      <h3><WarningAmber /> Communication issue periods</h3>
      <div className="sldc-table-scroll"><table><thead><tr><th>Issue start</th><th>Issue end</th><th>Duration</th><th>Lost 15-min slots</th><th>Issue</th></tr></thead><tbody>
        {report.communication.map((row, index) => <tr key={`${row.StartTime}-${index}`}><td>{displayTime(row.StartTime)}</td><td>{displayTime(row.EndTime)}</td><td>{row.DurationMinutes} min</td><td>{row.LostSamples}</td><td><b className="bad">{row.Issue}</b></td></tr>)}
        {!report.communication.length && <tr><td colSpan="5" className="empty-report">{loading ? 'Loading report…' : 'No communication issues in this period'}</td></tr>}
      </tbody></table></div>
    </div>

    <div className="sldc-report-block">
      <h3><Assessment /> 15-minute SLDC logs</h3>
      <div className="sldc-table-scroll logs"><table><thead><tr><th>Sample time</th><th>Power</th><th>Communication</th><th>SLDC status</th><th>Issue detail</th><th>Source timestamp</th><th>Collected at</th></tr></thead><tbody>
        {report.samples.map((row) => <tr key={row.SampleTime}><td>{displayTime(row.SampleTime)}</td><td><strong>{mw(row.MW)} MW</strong></td><td><b className={row.IsAvailable ? 'good' : 'bad'}>{row.IsAvailable ? 'Available' : 'Unavailable'}</b></td><td>{row.Status || '—'}</td><td>{row.CommunicationIssue || row.DashboardStatus || '—'}</td><td>{displayTime(row.SourceTimestamp)}</td><td>{displayTime(row.CollectedAt)}</td></tr>)}
        {!report.samples.length && <tr><td colSpan="7" className="empty-report">{loading ? 'Loading 15-minute logs…' : 'No stored 15-minute logs for this period'}</td></tr>}
      </tbody></table></div>
    </div>
  </section>
}
