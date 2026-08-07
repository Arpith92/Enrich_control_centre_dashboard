import { ArrowForward, Sync } from '@mui/icons-material'
import { SLDC_DISPLAY_NAMES } from '../hooks/useSldcData'

const DASHBOARD_TO_SLDC = {
  Karajagi: ['ENRICH KARASGI'],
  Mandrup: ['ENRICH MANDRUP'],
  Kumbhari: ['ENRICH ENERGY LTD SOLAR PARK'],
  Tuljapur: ['ENRICH TULJAPUR'],
  Umri: ['ENRICH ENERGY HIRADGAON'],
  Bhokar: ['ENRICH ENERGY BHOKAR', 'ENRICH SOLAR SERVICES (Narwat)'],
}

export default function SldcStatusCard({ data, onOpen, selectedSite = null }) {
  const { sites, todayAvailability, siteAvailability, loading, error, isCommunicating } = data
  const selectedStations = selectedSite ? DASHBOARD_TO_SLDC[selectedSite] || [] : null
  const visibleSites = selectedStations ? sites.filter((site) => selectedStations.includes(site.Plant)) : sites
  const onlineSites = visibleSites.filter(isCommunicating)
  const totalGeneration = onlineSites.reduce((sum, site) => sum + Math.max(0, Number(site.MW) || 0), 0)
  const availabilityRows = selectedStations?.map((station) => siteAvailability?.[station]).filter(Boolean) || []
  const availableSamples = availabilityRows.reduce((sum, row) => sum + Number(row.AvailableSamples || 0), 0)
  const expectedSamples = availabilityRows.reduce((sum, row) => sum + Number(row.ExpectedSamples || 0), 0)
  const displayedAvailability = selectedStations
    ? expectedSamples ? { AvailableSamples: availableSamples, ExpectedSamples: expectedSamples, AvailabilityPercent: (availableSamples * 100) / expectedSamples } : null
    : todayAvailability
  return <section className="ops-panel sldc-status-card" onClick={onOpen} onKeyDown={(event) => event.key === 'Enter' && onOpen()} role="button" tabIndex={0}>
    <div className="sldc-card-heading"><h3>MH SLDC DATA TRANSFER{selectedSite && <small> · {selectedSite}</small>}</h3><div><b>{onlineSites.length}/{visibleSites.length} <small>UP</small></b><ArrowForward /></div></div>
    <div className="sldc-site-list">
      {visibleSites.map((site) => {
        const online = isCommunicating(site)
        return <div className="sldc-site-row" key={site.Plant}>
          <i className={online ? 'online' : 'offline'} />
          <span>{SLDC_DISPLAY_NAMES[site.Plant] || site.Plant}</span>
          <b className={online ? 'online' : 'offline'}>{online ? 'COM OK' : 'COM FAIL'}</b>
          <strong>{online ? Number(site.MW || 0).toFixed(1) : '—'} <small>MW</small></strong>
        </div>
      })}
      {selectedSite && !visibleSites.length && <div className="sldc-card-message">No MH SLDC station mapping for {selectedSite}</div>}
      {loading && !sites.length && <div className="sldc-card-message"><Sync className="spin" /> Connecting to MH SLDC…</div>}
      {error && !sites.length && <div className="sldc-card-message error">SLDC link unavailable</div>}
    </div>
    <div className="sldc-generation-summary">
      <div><i /><span>LIVE SLDC GENERATION<small>Sum of communicating sites</small></span></div>
      <b>{Number(totalGeneration || 0).toFixed(1)} <small>MW</small></b>
    </div>
    <div className="sldc-availability-summary">
      <div><i /><span>TODAY SLDC DATA TRANSFER AVAILABILITY<small>{displayedAvailability ? `${displayedAvailability.AvailableSamples} of ${displayedAvailability.ExpectedSamples} site intervals received` : 'Calculating from 15-minute records'}</small></span></div>
      <b>{displayedAvailability ? Number(displayedAvailability.AvailabilityPercent).toFixed(2) : '—'}<small>%</small></b>
    </div>
  </section>
}
