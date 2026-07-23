import { useCallback, useEffect, useMemo, useState } from 'react'
import { ArrowBack, Bolt, Factory, Refresh, SolarPower } from '@mui/icons-material'
import useAutoRefresh from '../hooks/useAutoRefresh'
import './BhokarDashboard.css'
import './BhokarRawTags.css'
import './BhokarResilience.css'

const number = (value, digits = 3) => Number(value || 0).toLocaleString('en-IN', { maximumFractionDigits: digits })
const label = (value) => String(value).replace(/([a-z])([A-Z])/g, '$1 $2').replaceAll('_', ' ')

export default function BhokarDashboard({ onBack, initialCollection = null }) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [selected, setSelected] = useState(initialCollection || 'all')

  useEffect(() => {
    if (initialCollection) setSelected(initialCollection)
  }, [initialCollection])

  const refresh = useCallback(async () => {
    try {
      const response = await fetch('/api/scada/sites/Bhokar', { cache: 'no-store' })
      if (!response.ok) throw new Error(`SCADA API returned ${response.status}`)
      setData(await response.json())
      setError('')
    } catch (requestError) {
      setError(requestError.message || 'Bhokar SCADA is unavailable')
    } finally {
      setLoading(false)
    }
  }, [])

  useAutoRefresh(refresh, 1000)
  const plants = useMemo(() => selected === 'all'
    ? (data?.plants || [])
    : (data?.plants || []).filter((plant) => plant.collection === selected), [data, selected])

  return <div className="bhokar-page">
    <div className="bhokar-toolbar">
      <button onClick={onBack}><ArrowBack /> Dashboard</button>
      <div><h1>BHOKAR · LIVE SCADA</h1><span>Nine customer plants · latest documents from *_LIVE collections · 1-second refresh</span></div>
      <button onClick={refresh}><Refresh /> Refresh</button>
    </div>

    {error && <div className="bhokar-error">{error} · Retaining the last received values.</div>}
    <div className="bhokar-kpis">
      <article><Factory /><span>Customer plants<b>{data?.plants?.length || 0}</b></span></article>
      <article><Bolt /><span>Active power<b>{number(data?.currentMw)} MW</b></span></article>
      <article><SolarPower /><span>Daily generation<b>{number(data?.dailyGenerationMWh)} MWh</b></span></article>
      <article><SolarPower /><span>Cumulative generation<b>{number(data?.cumulativeGenerationMWh)} MWh</b></span></article>
    </div>

    <div className="bhokar-tabs">
      <button className={selected === 'all' ? 'active' : ''} onClick={() => setSelected('all')}>All plants</button>
      {(data?.plants || []).map((plant) => <button key={plant.collection} className={selected === plant.collection ? 'active' : ''} onClick={() => setSelected(plant.collection)}>{plant.name}</button>)}
    </div>

    {loading && !data ? <div className="bhokar-loading">Loading real-time Bhokar parameters…</div> : <div className="bhokar-plants">
      {plants.map((plant) => <section className="bhokar-plant" key={plant.collection}>
        <header><div><i className={plant.available ? 'online' : ''}/><h2>{plant.name}</h2><small>{plant.collection}</small></div><time>{plant.timestamp ? new Date(plant.timestamp).toLocaleString('en-IN') : 'No timestamp'}</time></header>
        {plant.stale && <div className="bhokar-stale">Cloud refresh delayed · showing the last successful one-minute average</div>}
        {!plant.available ? <div className="bhokar-unavailable">{plant.error || 'No current SCADA document available'}</div> : <>
          <div className="plant-summary">
            <span>Active power<b>{number(plant.currentMw)} MW</b></span>
            <span>Daily generation<b>{number(plant.dailyGenerationMWh)} MWh</b></span>
            <span>Cumulative generation<b>{number(plant.cumulativeGenerationMWh)} MWh</b></span>
            {Object.entries(plant.parameters || {}).map(([key, value]) => <span key={key}>{label(key)}<b>{String(value ?? '—')}</b></span>)}
          </div>
          <div className="inverter-table-wrap"><table className="inverter-table">
            <thead><tr><th>Inverter</th><th>Active power</th><th>Daily generation</th><th>Cumulative generation</th><th>Status</th></tr></thead>
            <tbody>{plant.inverters.map((inverter) => <tr key={inverter.inverter}>
              <td>INV{inverter.inverter}</td><td>{number(inverter.activePowerMw)} MW</td><td>{number(inverter.dailyGenerationMWh)} MWh</td><td>{number(inverter.cumulativeGenerationMWh)} MWh</td><td><em className="live-status">LIVE</em></td>
            </tr>)}</tbody>
          </table></div>
          <details className="raw-scada-tags" open={selected !== 'all'}>
            <summary>All real-time collection values · refreshed every second</summary>
            <div className="inverter-table-wrap"><table className="inverter-table raw-values-table">
              <thead><tr><th>Collection field</th><th>Latest value</th></tr></thead>
              <tbody>{Object.entries(plant.rawTags || {}).map(([tag, value]) => <tr key={tag}>
                <td><code>{tag}</code></td><td>{String(value ?? '—')}</td>
              </tr>)}</tbody>
            </table></div>
          </details>
        </>}
      </section>)}
    </div>}
  </div>
}
