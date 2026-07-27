import { useEffect, useRef, useState } from 'react'
import { ArrowBack, Bolt, CellTower, CloudSync, Refresh, WarningAmber } from '@mui/icons-material'
import { SLDC_DISPLAY_NAMES } from '../hooks/useSldcData'
import SldcReports from '../components/SldcReports'

const number = (value, digits = 1) => Number(value || 0).toLocaleString('en-IN', { maximumFractionDigits: digits, minimumFractionDigits: digits })

export default function SldcDashboard({ data, onBack, openReports = false }) {
  const { sites, onlineSites, offlineSites, totalGeneration, totalCapacity, latestTimestamp, error, lastSync, refresh, isCommunicating, siteAvailability } = data
  const [selectedPlant, setSelectedPlant] = useState('ENRICH KARASGI')
  const reportRef = useRef(null)
  const showReport = (plant = selectedPlant) => {
    setSelectedPlant(plant)
    window.setTimeout(() => reportRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 0)
  }
  useEffect(() => {
    if (!openReports) return
    const timer = window.setTimeout(() => reportRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 0)
    return () => window.clearTimeout(timer)
  }, [openReports])
  return <div className="sldc-dashboard">
    <div className="sldc-page-title">
      <button onClick={onBack}><ArrowBack /> Control Centre</button>
      <div><span>MAHARASHTRA STATE LOAD DESPATCH CENTRE</span><h1>SLDC Data Scout</h1><p>Live generation injection and communication monitoring for all Enrich sites</p></div>
      <div className="sldc-page-actions"><button onClick={() => showReport()}>Reports</button><button className="sldc-refresh" onClick={refresh}><Refresh /> Refresh</button></div>
    </div>

    {error && <div className="sldc-api-alarm"><WarningAmber /> SLDC data service unavailable: {error}</div>}
    {!!offlineSites.length && <div className="sldc-api-alarm"><WarningAmber /> Communication failure: {offlineSites.map((site) => SLDC_DISPLAY_NAMES[site.Plant] || site.Plant).join(', ')}</div>}

    <div className="sldc-summary-grid">
      <article><Bolt /><span>Total power injecting</span><b>{number(totalGeneration)} <small>MW</small></b></article>
      <article><CloudSync /><span>Installed capacity</span><b>{number(totalCapacity, 2)} <small>MW</small></b></article>
      <article><CellTower /><span>Sites communicating</span><b>{onlineSites.length}<small> / 7</small></b></article>
      <article><Refresh /><span>Last MSLDC update</span><b className="timestamp">{latestTimestamp || 'Waiting for data'}</b></article>
    </div>

    <section className="sldc-fleet-panel">
      <div className="sldc-section-heading"><div><span>FLEET STATUS</span><h2>Seven-site telemetry</h2></div><em>{lastSync ? `Updated ${lastSync.toLocaleTimeString('en-IN')}` : 'Connecting…'}</em></div>
      <div className="sldc-station-grid">
        {sites.map((site) => {
          const online = isCommunicating(site)
          const availability = siteAvailability?.[site.Plant]
          return <article className={`sldc-station ${online ? 'online' : 'offline'} ${selectedPlant === site.Plant ? 'selected' : ''}`} key={site.Plant} role="button" tabIndex={0} onClick={() => showReport(site.Plant)} onKeyDown={(event) => event.key === 'Enter' && showReport(site.Plant)}>
            <div className="station-top"><i /><span>{online ? 'COMMUNICATION OK' : 'COMMUNICATION FAILURE'}</span></div>
            <div className="station-availability"><span>TODAY AVAILABILITY</span><b>{availability ? number(availability.AvailabilityPercent, 2) : '—'}<small>%</small></b></div>
            <h3>{SLDC_DISPLAY_NAMES[site.Plant] || site.Plant}</h3>
            <p>{site.DashboardStatus || site.Status}</p>
            <div className="station-reading"><b>{online ? number(site.MW) : '—'}</b><span>MW</span></div>
            <footer><span>IC {number(site.InstalledCapacity, 2)} MW</span></footer>
          </article>
        })}
      </div>
    </section>

    <section className="sldc-export-panel">
      <div><span>COMBINED LIVE GENERATION</span><h2>Total power injected by all communicating plants</h2></div>
      <b>{number(totalGeneration)} <small>MW</small></b>
      <div className="export-track"><i style={{ width: `${totalCapacity ? Math.min(100, totalGeneration / totalCapacity * 100) : 0}%` }} /></div>
      <p>{number(totalCapacity ? totalGeneration / totalCapacity * 100 : 0)}% of connected installed capacity</p>
    </section>
    <SldcReports plants={sites} selectedPlant={selectedPlant} onPlantChange={setSelectedPlant} reportRef={reportRef} />
  </div>
}
