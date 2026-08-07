import { useCallback, useEffect, useMemo, useState } from 'react'
import { ArrowBack, Bolt, Factory, Refresh, SolarPower } from '@mui/icons-material'
import useAutoRefresh from '../hooks/useAutoRefresh'
import { ENABLE_NLC_BLOCK_DRILLDOWN } from '../config/featureFlags'
import './BhokarDashboard.css'
import './BhokarRawTags.css'
import './BhokarResilience.css'

const number = (value, digits = 2) => Number(value || 0).toLocaleString('en-IN', { minimumFractionDigits: digits, maximumFractionDigits: digits })
const isLifetimeTag = (tag) => /(?:cumulative|total).*generation/i.test(String(tag).replace(/[^a-z]/gi, ''))
const isPositiveGenerationTag = (tag) => /activepower|dailygeneration|cumulativegeneration|totalgeneration/i.test(String(tag).replace(/[^a-z]/gi, ''))
const tagValue = (value, tag = '') => {
  if (value == null || value === '') return '—'
  if (typeof value === 'boolean') return String(value)
  const numeric = Number(value)
  const normalized = isPositiveGenerationTag(tag) ? Math.abs(numeric) : numeric
  const displayed = isLifetimeTag(tag) ? normalized / (normalized >= 100000 ? 1000000 : 1000) : normalized
  return Number.isFinite(displayed) ? displayed.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : String(value)
}
const lifetimeGwh = (value) => value == null ? '—' : number(Number(value) / 1000)
const REALTIME_REFRESH_MS = 5000
const label = (value) => String(value).replace(/([a-z])([A-Z])/g, '$1 $2').replaceAll('_', ' ')
const plantDisplayName = (siteName, plant) => ENABLE_NLC_BLOCK_DRILLDOWN && siteName === 'NLC Poolangal' ? 'NLC' : plant.name

export default function BhokarDashboard({ onBack, initialCollection = null, initialData = null, siteName = 'Bhokar' }) {
  const [data, setData] = useState(initialData)
  const [loading, setLoading] = useState(!initialData)
  const [error, setError] = useState('')
  const [selected, setSelected] = useState(initialCollection || 'all')

  useEffect(() => {
    if (initialCollection) setSelected(initialCollection)
  }, [initialCollection])

  useEffect(() => {
    if (!initialData || initialData.name !== siteName) return
    setData(initialData)
    setLoading(false)
    setError('')
  }, [initialData, siteName])

  const refresh = useCallback(async () => {
    try {
      const response = await fetch(`/api/scada/sites/${encodeURIComponent(siteName)}`, { cache: 'no-store' })
      if (!response.ok) throw new Error(`SCADA API returned ${response.status}`)
      setData(await response.json())
      setError('')
    } catch (requestError) {
      setError(requestError.message || `${siteName} SCADA is unavailable`)
    } finally {
      setLoading(false)
    }
  }, [siteName])

  // Retain the previous successful payload on screen during each refresh.
  useAutoRefresh(refresh, REALTIME_REFRESH_MS)
  const plants = useMemo(() => selected === 'all'
    ? (data?.plants || [])
    : (data?.plants || []).filter((plant) => plant.collection === selected), [data, selected])

  return <div className="bhokar-page">
    <div className="bhokar-toolbar">
      <button onClick={onBack}><ArrowBack /> Dashboard</button>
      <div><h1>{siteName.toUpperCase()} · LIVE SCADA</h1><span>{data ? data.plants?.length || 0 : '…'} customer plants · latest documents from *_LIVE collections</span></div>
      <button onClick={refresh}><Refresh /> Refresh</button>
    </div>

    {error && <div className="bhokar-error">{error} · Retaining the last received values.</div>}
    <div className="bhokar-kpis">
      <article><Factory /><span>Customer plants<b>{data?.plants?.length || 0}</b></span></article>
      <article><Bolt /><span>Active power<b>{number(data?.currentMw)} MW</b></span></article>
      <article><SolarPower /><span>Daily generation<b>{number(data?.dailyGenerationMWh)} MWh</b></span></article>
      <article><SolarPower /><span>Lifetime generation<b>{lifetimeGwh(data?.cumulativeGenerationMWh)} GWh</b></span></article>
    </div>

    <div className="bhokar-tabs">
      <button className={selected === 'all' ? 'active' : ''} onClick={() => setSelected('all')}>All plants</button>
      {(data?.plants || []).map((plant) => <button key={plant.collection} className={selected === plant.collection ? 'active' : ''} onClick={() => setSelected(plant.collection)}>{plantDisplayName(siteName, plant)}</button>)}
    </div>

    {loading && !data ? <div className="bhokar-loading">Loading real-time {siteName} parameters…</div> : <div className="bhokar-plants">
      {plants.map((plant) => <section className="bhokar-plant" key={plant.collection}>
        <header><div><i className={plant.available ? 'online' : ''}/><h2>{plantDisplayName(siteName, plant)}</h2><small>{plant.collection}</small></div><time>{plant.timestamp ? new Date(plant.timestamp).toLocaleString('en-IN') : 'No timestamp'}</time></header>
        {plant.stale && <div className="bhokar-stale">Cloud data delayed · showing the last successful values</div>}
        {!plant.available ? <div className="bhokar-unavailable">{plant.error || 'No current SCADA document available'}</div> : <>
          <div className="plant-summary">
            <span>Active power<b>{number(plant.currentMw)} MW</b></span>
            <span>Daily generation<b>{number(plant.dailyGenerationMWh)} MWh</b></span>
            <span>Lifetime generation<b>{lifetimeGwh(plant.cumulativeGenerationMWh)} GWh</b></span>
            {Object.entries(plant.parameters || {}).map(([key, value]) => <span key={key}>{label(key)}{isLifetimeTag(key) ? ' (GWh)' : ''}<b>{tagValue(value, key)}</b></span>)}
          </div>
          <div className="inverter-table-wrap"><table className="inverter-table">
            <thead><tr><th>Inverter</th><th>Active power</th><th>Daily generation</th><th>Lifetime generation</th><th>Status</th></tr></thead>
            <tbody>{plant.inverters.map((inverter) => <tr key={inverter.inverter}>
              <td>INV{inverter.inverter}</td><td>{number(inverter.activePowerMw)} MW</td><td>{number(inverter.dailyGenerationMWh)} MWh</td><td>{lifetimeGwh(inverter.cumulativeGenerationMWh)} GWh</td><td><em className="live-status">LIVE</em></td>
            </tr>)}</tbody>
          </table></div>
          <details className="raw-scada-tags" open={selected !== 'all'}>
            <summary>All real-time collection values</summary>
            <div className="inverter-table-wrap"><table className="inverter-table raw-values-table">
              <thead><tr><th>Collection field</th><th>Latest value</th></tr></thead>
              <tbody>{Object.entries(plant.rawTags || {}).sort(([left], [right]) => left.localeCompare(right, undefined, { numeric: true })).map(([tag, value]) => <tr key={tag}>
                <td><code>{tag}{isLifetimeTag(tag) ? ' [GWh]' : ''}</code></td><td>{tagValue(value, tag)}</td>
              </tr>)}</tbody>
            </table></div>
          </details>
        </>}
      </section>)}
    </div>}
  </div>
}
