import { ArrowForward, Sync } from '@mui/icons-material'
import { SLDC_DISPLAY_NAMES } from '../hooks/useSldcData'

export default function SldcStatusCard({ data, onOpen }) {
  const { sites, onlineSites, totalGeneration, todayAvailability, loading, error, isCommunicating } = data
  return <section className="ops-panel sldc-status-card" onClick={onOpen} onKeyDown={(event) => event.key === 'Enter' && onOpen()} role="button" tabIndex={0}>
    <div className="sldc-card-heading"><h3>MH SLDC DATA TRANSFER</h3><div><b>{onlineSites.length}/{sites.length} <small>UP</small></b><ArrowForward /></div></div>
    <div className="sldc-site-list">
      {sites.map((site) => {
        const online = isCommunicating(site)
        return <div className="sldc-site-row" key={site.Plant}>
          <i className={online ? 'online' : 'offline'} />
          <span>{SLDC_DISPLAY_NAMES[site.Plant] || site.Plant}</span>
          <b className={online ? 'online' : 'offline'}>{online ? 'COM OK' : 'COM FAIL'}</b>
          <strong>{online ? Number(site.MW || 0).toFixed(1) : '—'} <small>MW</small></strong>
        </div>
      })}
      {loading && !sites.length && <div className="sldc-card-message"><Sync className="spin" /> Connecting to MH SLDC…</div>}
      {error && !sites.length && <div className="sldc-card-message error">SLDC link unavailable</div>}
    </div>
    <div className="sldc-generation-summary">
      <div><i /><span>LIVE SLDC GENERATION<small>Sum of communicating sites</small></span></div>
      <b>{Number(totalGeneration || 0).toFixed(1)} <small>MW</small></b>
    </div>
    <div className="sldc-availability-summary">
      <div><i /><span>TODAY SLDC DATA TRANSFER AVAILABILITY<small>{todayAvailability ? `${todayAvailability.AvailableSamples} of ${todayAvailability.ExpectedSamples} site intervals received` : 'Calculating from 15-minute records'}</small></span></div>
      <b>{todayAvailability ? Number(todayAvailability.AvailabilityPercent).toFixed(2) : '—'}<small>%</small></b>
    </div>
  </section>
}
