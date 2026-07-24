import { lazy, Suspense, useEffect, useState } from 'react'
import { Box, CssBaseline } from '@mui/material'
import {
  Dashboard, SolarPower, NotificationsNone, DescriptionOutlined, QueryStats,
  LightModeOutlined, ConfirmationNumberOutlined, SettingsOutlined, Menu,
  Refresh, Fullscreen, DarkModeOutlined, Bolt, EnergySavingsLeaf, Co2,
  Speed, Wifi, AccountBalanceWallet, CloudOutlined,
  Sync, SecurityOutlined, Storage, AccountCircle,
} from '@mui/icons-material'
import IndiaMap from './components/IndiaMap'
import SldcStatusCard from './components/SldcStatusCard'
import SldcDashboard from './views/SldcDashboard'
import OperationsLog from './views/OperationsLog'
import BhokarDashboard from './views/BhokarDashboard'
import useSldcData from './hooks/useSldcData'
import useOperationalFeed from './hooks/useOperationalFeed'
import { SimulationDataProvider, useSimulationData } from './context/SimulationDataProvider'
import enrichLogo from './assets/enrich-logo.png'
import { simulateThirdPartyCustomers } from './data/thirdPartySites'
import './App.css'
import './precision.css'

const WeatherPortal = lazy(() => import('./views/WeatherPortal'))
const SiteSettings = lazy(() => import('./views/SiteSettings'))

const workbookSiteSummary = {
  Mandrup: [28, 43.45], Karajagi: [30, 49.43], Zaheerabad: [30, 57.5], Turmamidi: [2, 9],
  Mundargi: [1, 1], Tuljapur: [9, 44.85], Kumbhari: [8, 24.775], Umri: [10, 39.7],
  Bhokar: [9, 27.3], 'NLC Poolangal': [1, 100], BEL1MW: [1, 1], BEL2MW: [1, 2], PGCIL: [1, 85],
}
const bhokarPlantNames = ['Jugai', 'Jagadeesh', 'Padmavati', 'Suyesh', 'Sound Castings', 'Supriya', 'IMP', 'Veeresha', 'Omya']
const bhokarLiveCollections = {
  jugai: 'B1_Jugai_LIVE', jagadeesh: 'B2_Jagdeesh_LIVE', supriya: 'B3_Supriya_LIVE',
  padmavati: 'B4_Padmavati_LIVE', 'sound castings': 'B5_SoundCasting_LIVE',
  soundcasting: 'B5_SoundCasting_LIVE', imp: 'B6_IMP_LIVE', suyesh: 'B7_Suyash_LIVE',
  suyash: 'B7_Suyash_LIVE', veeresha: 'B8_Veersha_LIVE', veersha: 'B8_Veersha_LIVE',
  omya: 'B9_Omya_LIVE',
}
const bhokarCollectionForPlant = (name = '') => bhokarLiveCollections[name.toLowerCase().trim()]
const createImmediatePlantMapping = () => Object.fromEntries(Object.entries(workbookSiteSummary).map(([siteName, [count, capacity]]) => [siteName,
  Array.from({ length: count }, (_, index) => ({
    id: `immediate-${siteName}-${index + 1}`,
    customerName: siteName === 'Bhokar' ? `${bhokarPlantNames[index]} customer` : `${siteName} mapped plant`,
    plantName: siteName === 'Bhokar' ? bhokarPlantNames[index] : `${siteName} Plant ${String(index + 1).padStart(2, '0')}`,
    state: '', siteName, ac: capacity / count, dc: (capacity / count) * 1.2,
    commissioningDate: '', communicationIssue: false,
  })),
]))

const fmt = (n, digits = 1) => Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: digits })
const viewFromHash = () => window.location.hash.startsWith('#bhokar') ? 'Bhokar' : ({
  '#operations-log': 'Operations', '#sldc-reports': 'Reports', '#sldc': 'SLDC', '#weather': 'Weather', '#bhokar': 'Bhokar', '#settings': 'Settings',
}[window.location.hash] || 'Dashboard')
const Panel = ({ title, children, className = '' }) => <section className={`ops-panel ${className}`}><h3>{title}</h3>{children}</section>
const getPrecipitationMm = (weather) => Number(weather?.precipitation_mm ?? weather?.precipitation ?? weather?.rain ?? 0)

const Nav = ({ collapsed, onToggle, active, onSelect }) => {
  const items = [
    [Dashboard, 'Dashboard'], [SolarPower, 'Plants'], [NotificationsNone, 'Alarms'],
    [DescriptionOutlined, 'Reports'], [QueryStats, 'Analytics'], [LightModeOutlined, 'Weather'],
    [ConfirmationNumberOutlined, 'Tickets'], [QueryStats, 'SLDC'], [SettingsOutlined, 'Settings'],
  ]
  return <aside className={`ops-nav ${collapsed ? 'collapsed' : ''}`}>
    <button className="menu-btn" onClick={onToggle} aria-label="Toggle navigation"><Menu /></button>
    {items.map(([Icon, label]) => <button key={label} className={active === label ? 'active' : ''} onClick={() => onSelect(label)}><Icon /><span>{label}</span></button>)}
  </aside>
}

const Header = ({ clock }) => <header className="ops-header">
  <div className="brand"><img className="brand-logo" src={enrichLogo} alt="Enrich - The Solar People" /><div><b>ENRICH SOLAR OPERATIONS</b><span>SOLAR PLANT MONITORING DASHBOARD</span></div></div>
  <div className="head-tools">
    <div className="header-user"><AccountCircle /><span>Hi, <b>Arpith Shetty</b></span></div>
    <div className="clock">{clock.format('hh:mm:ss A')}<span>{clock.format('DD MMM YYYY, ddd')}</span></div>
    <button onClick={() => window.dispatchEvent(new Event('dashboard-refresh'))}><Refresh /><span>Refresh</span></button><button onClick={() => document.documentElement.requestFullscreen?.()}><Fullscreen /><span>Fullscreen</span></button>
    <button><DarkModeOutlined /><span>Theme</span></button>
    <div className="connected"><QueryStats /><b>SCADA CONNECTED</b><span>All Systems Normal</span></div>
  </div>
</header>

const Kpis = ({ m }) => {
  const cards = [
    ['CURRENT GENERATION', fmt(m.currentGeneration, 2), ' MW', EnergySavingsLeaf, `${((m.currentGeneration / m.totalCapacity) * 100).toFixed(2)}% of Capacity`],
    ["TODAY'S GENERATION", fmt(m.todayGeneration, 2), ' MWh', Bolt, 'Updated live'],
    ["TODAY'S REVENUE", `₹ ${fmt(m.revenue, 2)}`, ' Cr', AccountBalanceWallet, '@ ₹4.20 / kWh'],
    ['CO₂ SAVED TODAY', fmt(m.co2Saved, 2), ' Ton', Co2, 'Equivalent Reduction'],
    ['PR (AVG)', fmt(m.averagePr, 2), ' %', Speed, '↑ 2.31%'],
    ['AVAILABILITY (AVG)', fmt(m.averageAvailability, 2), ' %', Wifi, '↑ 0.68%'],
    ['CUF (AVG)', fmt(m.averageCuf, 2), ' %', QueryStats, '↑ 1.22%'],
    ['GRID EXPORT', fmt(m.gridExport, 2), ' MW', EnergySavingsLeaf, '98.0% of Generation'],
  ]
  return <div className="kpi-strip">{cards.map(([label, value, unit, Icon, note]) =>
    <div className="ops-kpi" key={label}><Icon /><div><span>{label}</span><b>{value}<small>{unit}</small></b><em>{note}</em></div></div>)}</div>
}

const ThirdPartyPortfolio = ({ plants, scope, onSelectScope, plantMapping, siteWeather, bhokarRealtime }) => {
  const [customers, setCustomers] = useState(() => simulateThirdPartyCustomers(new Date(), siteWeather))
  const [active, setActive] = useState(null)
  useEffect(() => {
    const refresh = () => setCustomers(simulateThirdPartyCustomers(new Date(), siteWeather))
    const interval = window.setInterval(refresh, 30000)
    refresh()
    window.addEventListener('third-party-sites-updated', refresh)
    return () => { window.clearInterval(interval); window.removeEventListener('third-party-sites-updated', refresh) }
  }, [siteWeather])
  const select = (id) => {
    const next = active === id ? null : id
    setActive(next)
    window.dispatchEvent(new CustomEvent('third-party-customer-select', { detail: next }))
  }
  const totalCapacity = customers.reduce((sum, customer) => sum + customer.dc, 0)
  const totalGeneration = customers.reduce((sum, customer) => sum + customer.simulatedMw, 0)
  const enrichCapacity = plants.reduce((sum, plant) => {
    const mappedDc = (plantMapping[plant.name] || []).reduce((total, mappedPlant) => total + mappedPlant.dc, 0)
    return sum + (mappedDc || plant.capacity * 1.2)
  }, 0)
  const enrichGeneration = plants.reduce((sum, plant) => sum + plant.currentMw, 0)
  const showEnrich = scope?.type !== 'portfolio-third-party'
  const showThirdParty = scope?.type !== 'portfolio-enrich'
  const displayedCapacity = showEnrich && showThirdParty ? enrichCapacity + totalCapacity : showEnrich ? enrichCapacity : totalCapacity
  const displayedGeneration = showEnrich && showThirdParty ? enrichGeneration + totalGeneration : showEnrich ? enrichGeneration : totalGeneration
  const totalLabel = showEnrich && showThirdParty ? 'ALL SITES' : showEnrich ? 'ENRICH SITES' : 'THIRD-PARTY SITES'
  return <Panel title="ALL COMMISSIONED SITES" className="third-party-portfolio">
    <div className="portfolio-head"><span>Portfolio / Site</span><span>DC Capacity</span><span>Generation</span></div>
    <div className="portfolio-rows portfolio-site-list">
      {showEnrich && [...plants].sort((a, b) => b.capacity - a.capacity || a.name.localeCompare(b.name)).map((plant) => {
        const mappedPlants = plantMapping[plant.name] || []
        const issueCount = plant.name === 'Bhokar' && bhokarRealtime?.plants
          ? bhokarRealtime.plants.filter((item) => !item.available || item.stale).length
          : mappedPlants.filter((item) => item.communicationIssue).length
        const failed = (plant.name !== 'Bhokar' && (plant.communication === 'Failed' || plant.communicationIssue)) || (mappedPlants.length > 0 && issueCount === mappedPlants.length)
        const partial = issueCount > 0 && !failed
        const selected = (scope?.type === 'enrich' && scope.id === plant.id) || (scope?.type === 'enrich-plant' && scope.siteId === plant.id)
        const dcCapacity = mappedPlants.reduce((sum, mappedPlant) => sum + mappedPlant.dc, 0) || plant.capacity * 1.2
        return <button className={`portfolio-site enrich-site-row ${failed ? 'site-offline' : partial ? 'site-partial' : 'site-online'} ${selected ? 'active' : ''}`} title={failed ? 'All plants have communication issues' : partial ? `${issueCount} of ${mappedPlants.length} plants has a communication issue` : `${mappedPlants.length || 1} plant(s) · all communication healthy`} key={plant.id} onClick={() => onSelectScope(selected ? null : { type: 'enrich', id: plant.id, name: plant.name })}><span><b>{plant.name}</b></span><strong>{dcCapacity.toFixed(2)} MWp</strong><strong>{plant.currentMw.toFixed(2)} MW</strong></button>
      })}
      {showThirdParty && [...customers].sort((a, b) => b.ac - a.ac || a.name.localeCompare(b.name)).map((customer) => <div className={`portfolio-customer-section ${active === customer.id ? 'active' : ''}`} key={customer.id}>
        <button className={`portfolio-site customer-site-row site-third-party comm-${customer.communicationStatus} ${scope?.customerId === customer.id || scope?.id === customer.id ? 'active' : ''}`} title={customer.communicationIssueCount ? `${customer.communicationIssueCount} of ${customer.plants.length} plants have communication issues` : 'All plants communicating'} onClick={() => { const isSelected = scope?.customerId === customer.id || scope?.id === customer.id; select(customer.id); onSelectScope(isSelected ? null : { type: 'customer', id: customer.id, customerId: customer.id, name: customer.name, customer }) }}><span><b>{customer.name}</b></span><strong>{customer.dc.toFixed(2)} MWp</strong><strong>{customer.simulatedMw.toFixed(2)} MW</strong></button>
      </div>)}
    </div>
    <button className={`portfolio-total ${!scope ? 'active' : ''}`} onClick={() => { setActive(null); window.dispatchEvent(new CustomEvent('third-party-customer-select', { detail: null })); onSelectScope(null) }} title="Clear filter and show all sites"><span><b>{totalLabel}</b>{scope && <small>Click to clear filter</small>}</span><strong>{displayedCapacity.toFixed(2)} MWp</strong><strong>{displayedGeneration.toFixed(2)} MW</strong></button>
  </Panel>
}

const weatherLabel = (code, precipitation = 0) => {
  if (precipitation > 0 || [51,53,55,61,63,65,80,81,82,95,96,99].includes(code)) return 'Rain / Precipitation'
  if ([1,2].includes(code)) return 'Partly Cloudy'
  if (code === 3 || [45,48].includes(code)) return 'Cloudy'
  if (code === 0) return 'Clear'
  return 'Overcast'
}

const weatherVisual = (code, precipitation = 0) => {
  const rain = precipitation
  if (rain > 0 || [51,53,55,61,63,65,80,81,82].includes(code)) return { glyph: '🌧', kind: 'rain' }
  if (code === 0) return { glyph: '☀', kind: 'sun' }
  if ([95,96,99].includes(code)) return { glyph: '⛈', kind: 'storm' }
  return { glyph: '☁', kind: 'cloud' }
}

const RightRail = ({ alarms, events, plants, siteWeather, weatherUpdatedAt, onOpenLogs }) => <div className="right-rail">
  <Panel title="⚠ LIVE ALARMS" className="alarm-box"><b className="alarm-count">{alarms.length}</b><button className="feed-more" onClick={onOpenLogs}>More →</button>
    <div className="alarm-head"><span>TIME</span><span>PLANT</span><span>ALARM</span><span>SEVERITY</span></div>
    <div className="alarm-live-list">{alarms.slice(0, 5).map((alarm) => <div className="alarm-row" key={alarm.id}><span>{alarm.time}</span><span>{alarm.plant}</span><span>{alarm.alarm}</span><b className={alarm.severity.toLowerCase()}>{alarm.severity}</b></div>)}
      {!alarms.length && <div className="alarm-empty"><i /> No active SLDC or weather alarms</div>}
    </div>
  </Panel>
  <Panel title="♧ LIVE EVENTS" className="events-box"><button className="feed-more" onClick={onOpenLogs}>More →</button>
    {events.slice(0, 6).map((event) => <div className={`event-row ${event.severity}`} key={event.id}><i/><span>{event.time}</span><div><b>{event.plant}</b><small>{event.detail}</small></div></div>)}
  </Panel>
  <Panel title="SITE WEATHER · LIVE" className="weather-box site-weather">
    <span className="weather-source">LIVE · 60s SYNC · {weatherUpdatedAt ? weatherUpdatedAt.format('HH:mm:ss') : 'CONNECTING…'}</span>
    <div className="site-weather-list">
      {plants.map((plant) => {
        const w = siteWeather[plant.id]
        const precipitationMm = getPrecipitationMm(w)
        const visual = w ? weatherVisual(w.weather_code, w.rain) : { glyph: '◌', kind: 'loading' }
        return <div className="site-weather-row" key={plant.id}>
          <div className="weather-site"><i className={`weather-visual ${visual.kind}`}>{visual.glyph}</i><span><b>{plant.name}</b><small>{w ? weatherLabel(w.weather_code, w.rain) : 'Loading live weather…'}</small></span></div>
          {w && <div className="weather-parameters">
            <span>Temp <b>{w.temperature_2m}°C</b></span>
            <span>Wind <b>{w.wind_speed_10m} km/h</b></span>
            <span>GTI (W/m²) <b>{w.gti_w_m2}</b></span>
            <span>Rain/Precip <b>{precipitationMm} mm</b></span>
            <span>RH <b>{w.relative_humidity_2m}%</b></span>
            <span>GTI (kWh/m²) <b>{w.gti_kwh_m2}</b></span>
          </div>}
        </div>
      })}
    </div>
  </Panel>
</div>

const Spark = () => <svg className="spark" viewBox="0 0 300 100" preserveAspectRatio="none"><defs><linearGradient id="sg" x1="0" y1="0" x2="0" y2="1"><stop stopColor="#8cff55" stopOpacity=".35"/><stop offset="1" stopColor="#8cff55" stopOpacity="0"/></linearGradient></defs><path d="M0 95 C35 95 38 84 60 52 S105 27 135 18 S190 5 220 30 S260 62 300 77 L300 100 L0 100Z" fill="url(#sg)"/><path d="M0 95 C35 95 38 84 60 52 S105 27 135 18 S190 5 220 30 S260 62 300 77" fill="none" stroke="#a6ff68" strokeWidth="2"/></svg>

const weeklyGeneration = [1782, 1850, 1918, 1986, 2054, 2122, 2190]
const weeklyGenerationPeak = Math.max(...weeklyGeneration)

const Bottom = ({ plants }) => <div className="bottom-grid">
  <Panel title="GENERATION TREND · TODAY (LIVE)"><Spark /><div className="axis">{['00:00','04:00','08:00','12:00','16:00','20:00','24:00'].map((time)=><span key={time}>{time}</span>)}</div></Panel>
  <Panel title="GENERATION LAST 7 DAYS (MWh)"><div className="bars">{weeklyGeneration.map((generation)=><i key={generation} style={{height:`${(generation / weeklyGenerationPeak) * 100}%`}}><span>{generation}</span></i>)}</div></Panel>
  <Panel title="TOP 5 PLANTS BY CURRENT GENERATION"><div className="rank">{[...plants].sort((a,b)=>b.currentMw-a.currentMw).slice(0,5).map(p=><span key={p.id}>{p.name}<i style={{width:`${Math.min(100,p.currentMw)}%`}}/><b>{p.currentMw.toFixed(2)}</b></span>)}</div></Panel>
</div>

const Footer = () => <footer className="status-footer">{[[SecurityOutlined,'SCADA STATUS','ONLINE'],[CloudOutlined,'API STATUS','ONLINE'],[Wifi,'NETWORK HEALTH','GOOD'],[Storage,'DATABASE','HEALTHY'],[Speed,'SERVER LOAD','24%'],[CloudOutlined,'CLOUD BACKUP','OK'],[Sync,'NEXT DATA SYNC','00:00:01']].map(([Icon,a,b])=><div key={a}><Icon/><span>{a}<b>{b}</b></span></div>)}</footer>

const DashboardView = () => {
  const { plants, metrics, clock, siteWeather, weatherUpdatedAt, thirdPartyWeatherSites, bhokarRealtime } = useSimulationData()
  const [navCollapsed, setNavCollapsed] = useState(false)
  const [activeView, setActiveView] = useState(viewFromHash)
  const [scope, setScope] = useState(null)
  const [selectedBhokarCollection, setSelectedBhokarCollection] = useState(null)
  const [plantMapping, setPlantMapping] = useState(createImmediatePlantMapping)
  const sldc = useSldcData()
  const liveFeed = useOperationalFeed({ sldc, plants, siteWeather, weatherUpdatedAt })
  useEffect(() => {
    const loadMapping = async () => {
      try {
        const response = await fetch('/api/plant-mapping', { cache: 'no-store' })
        if (!response.ok) throw new Error(`Plant mapping API ${response.status}`)
        const payload = await response.json()
        if (!Object.keys(payload.sites || {}).length) throw new Error('Plant mapping API returned no sites')
        setPlantMapping(payload.sites)
      } catch (apiError) {
        try {
          const [{ default: readXlsxFile }, workbookResponse] = await Promise.all([
            import('read-excel-file/browser'),
            fetch('/Control_Centre_plantwise_data_mapping.xlsx', { cache: 'no-store' }),
          ])
          if (!workbookResponse.ok) throw new Error(`Workbook ${workbookResponse.status}`)
          const rows = await readXlsxFile(await workbookResponse.blob())
          const aliases = { 'Bhokar - I': 'Bhokar', Polangal: 'NLC Poolangal', Rajgir: 'BEL1MW', Muradnagar: 'BEL2MW', Nagdha: 'PGCIL' }
          const sites = {}
          rows.slice(1).forEach((row, index) => {
            if (!row[4]) return
            const siteName = aliases[String(row[4]).trim()] || String(row[4]).trim()
            const sitePlants = sites[siteName] ||= []
            sitePlants.push({
              id: `mapping-${index + 2}`, customerName: String(row[1] || '').trim(),
              plantName: String(row[2] || `${siteName} Plant`).trim(), state: String(row[3] || '').trim(), siteName,
              ac: Number(row[5] || 0), dc: Number(row[6] || 0),
              commissioningDate: row[7] instanceof Date ? row[7].toISOString().slice(0, 10) : String(row[7] || ''),
              communicationIssue: false,
            })
          })
          setPlantMapping(sites)
        } catch (workbookError) {
          console.warn('Plant mapping unavailable.', apiError, workbookError)
        }
      }
    }
    loadMapping()
  }, [])
  const selectedEnrichPlant = scope?.type === 'enrich' ? plants.find((plant) => plant.id === scope.id) : scope?.type === 'enrich-plant' ? plants.find((plant) => plant.id === scope.siteId) : null
  const visiblePlants = selectedEnrichPlant
    ? [selectedEnrichPlant]
    : scope?.type === 'customer' || scope?.type === 'third-party-plant' || scope?.type === 'portfolio-third-party' ? [] : plants
  const scopedThirdPartyWeather = scope?.type === 'third-party-plant'
    ? [{ ...scope.plant, name: scope.plant.site, state: scope.customer.name, thirdParty: true }]
    : scope?.type === 'customer'
      ? scope.customer.plants.map((plant) => ({ ...plant, name: plant.site, state: scope.customer.name, thirdParty: true }))
      : []
  const visibleWeatherPlants = selectedEnrichPlant
    ? [selectedEnrichPlant]
    : scopedThirdPartyWeather.length ? scopedThirdPartyWeather
      : scope?.type === 'portfolio-enrich' ? plants
        : scope?.type === 'portfolio-third-party' ? thirdPartyWeatherSites
          : [...plants, ...thirdPartyWeatherSites]
  const mappedSiteCapacity = selectedEnrichPlant ? (plantMapping[selectedEnrichPlant.name] || []).reduce((sum, item) => sum + item.ac, 0) : 0
  const portfolioThirdParty = simulateThirdPartyCustomers(new Date(), siteWeather)
  const portfolioThirdPartyCapacity = portfolioThirdParty.reduce((sum, customer) => sum + customer.ac, 0)
  const portfolioThirdPartyGeneration = portfolioThirdParty.reduce((sum, customer) => sum + customer.simulatedMw, 0)
  const portfolioThirdPartyToday = portfolioThirdParty.reduce((sum, customer) => sum + customer.todayMwh, 0)
  const isEnrichPortfolio = scope?.type === 'portfolio-enrich'
  const scopedThirdPartyPlants = scope?.type === 'third-party-plant'
    ? [scope.plant]
    : scope?.type === 'customer' ? scope.customer.plants
      : scope?.type === 'portfolio-third-party' ? portfolioThirdParty.flatMap((customer) => customer.plants)
        : []
  const isThirdPartyScope = scopedThirdPartyPlants.length > 0
  const scopedThirdPartyPr = isThirdPartyScope
    ? (scopedThirdPartyPlants.reduce((sum, plant) => sum + plant.ac * (plant.efficiency || .8), 0) / scopedThirdPartyPlants.reduce((sum, plant) => sum + plant.ac, 0)) * 100
    : null
  const scopedThirdPartyAvailability = isThirdPartyScope
    ? (scopedThirdPartyPlants.filter((plant) => !plant.communicationIssue).length / scopedThirdPartyPlants.length) * 100
    : null
  const scopeCapacity = scope?.mappedPlant?.ac ?? selectedEnrichPlant?.capacity ?? scope?.plant?.ac ?? scope?.customer?.ac ?? (scope?.type === 'portfolio-third-party' ? portfolioThirdPartyCapacity : isEnrichPortfolio ? metrics.totalCapacity : undefined)
  const scopeGeneration = scope?.mappedPlant && selectedEnrichPlant ? selectedEnrichPlant.currentMw * (scope.mappedPlant.ac / (mappedSiteCapacity || selectedEnrichPlant.capacity)) : selectedEnrichPlant?.currentMw ?? scope?.plant?.simulatedMw ?? scope?.customer?.simulatedMw ?? (scope?.type === 'portfolio-third-party' ? portfolioThirdPartyGeneration : isEnrichPortfolio ? metrics.currentGeneration : undefined)
  const scopeTodayGeneration = scope?.mappedPlant && selectedEnrichPlant
    ? selectedEnrichPlant.todayMwh * (scope.mappedPlant.ac / (mappedSiteCapacity || selectedEnrichPlant.capacity))
    : selectedEnrichPlant?.todayMwh ?? scope?.plant?.todayMwh ?? scope?.customer?.todayMwh
      ?? (scope?.type === 'portfolio-third-party' ? portfolioThirdPartyToday : isEnrichPortfolio ? metrics.todayGeneration : undefined)
  const fleetCapacity = plants.reduce((sum, plant) => sum + plant.capacity, 0) || 1
  const scale = scopeCapacity ? scopeCapacity / fleetCapacity : 1
  const allCapacity = metrics.totalCapacity + portfolioThirdPartyCapacity
  const allCurrentGeneration = metrics.currentGeneration + portfolioThirdPartyGeneration
  const allTodayGeneration = metrics.todayGeneration + portfolioThirdPartyToday
  const allThirdPartyPlants = portfolioThirdParty.flatMap((customer) => customer.plants)
  const allOnlinePlants = metrics.onlinePlants + allThirdPartyPlants.filter((plant) => !plant.communicationIssue).length
  const allPlantCount = metrics.totalPlants + allThirdPartyPlants.length
  const allThirdPartyPr = portfolioThirdPartyCapacity
    ? (allThirdPartyPlants.reduce((sum, plant) => sum + plant.ac * (plant.efficiency || .8), 0) / portfolioThirdPartyCapacity) * 100
    : metrics.averagePr
  const combinedMetrics = {
    ...metrics,
    totalPlants: allPlantCount,
    totalCapacity: allCapacity,
    onlinePlants: allOnlinePlants,
    offlinePlants: allPlantCount - allOnlinePlants,
    currentGeneration: allCurrentGeneration,
    todayGeneration: allTodayGeneration,
    revenue: (allTodayGeneration * 1000 * 4.2) / 10000000,
    co2Saved: allTodayGeneration * 0.82,
    averagePr: ((metrics.averagePr * metrics.totalCapacity) + (allThirdPartyPr * portfolioThirdPartyCapacity)) / Math.max(1, allCapacity),
    averageAvailability: ((metrics.averageAvailability * metrics.totalPlants) + (allThirdPartyPlants.filter((plant) => !plant.communicationIssue).length * 100)) / Math.max(1, allPlantCount),
    averageCuf: (allTodayGeneration / Math.max(1, allCapacity * 24)) * 100,
    gridExport: allCurrentGeneration * .98,
  }
  const scopedMetrics = scope ? {
    ...metrics,
    totalPlants: isThirdPartyScope ? scopedThirdPartyPlants.length : metrics.totalPlants,
    onlinePlants: isThirdPartyScope ? scopedThirdPartyPlants.filter((plant) => !plant.communicationIssue).length : metrics.onlinePlants,
    offlinePlants: isThirdPartyScope ? scopedThirdPartyPlants.filter((plant) => plant.communicationIssue).length : metrics.offlinePlants,
    totalCapacity: scopeCapacity || metrics.totalCapacity,
    currentGeneration: scopeGeneration || 0,
    todayGeneration: scopeTodayGeneration ?? metrics.todayGeneration * scale,
    revenue: ((scopeTodayGeneration ?? metrics.todayGeneration * scale) * 1000 * 4.2) / 10000000,
    co2Saved: (scopeTodayGeneration ?? metrics.todayGeneration * scale) * 0.82,
    averagePr: selectedEnrichPlant?.pr ?? scopedThirdPartyPr ?? metrics.averagePr,
    averageAvailability: selectedEnrichPlant?.availability ?? scopedThirdPartyAvailability ?? metrics.averageAvailability,
    averageCuf: selectedEnrichPlant?.cuf ?? (isThirdPartyScope ? ((scopeTodayGeneration || 0) / Math.max(1, scopeCapacity * 24)) * 100 : metrics.averageCuf),
    gridExport: (scopeGeneration || 0) * .98,
  } : combinedMetrics
  const selectedEnrichName = selectedEnrichPlant?.name
  const visibleAlarms = selectedEnrichName ? liveFeed.alarms.filter((item) => item.plant === selectedEnrichName) : liveFeed.alarms
  const visibleEvents = selectedEnrichName ? liveFeed.events.filter((item) => item.plant === selectedEnrichName) : liveFeed.events
  useEffect(() => {
    const syncHash = () => setActiveView(viewFromHash())
    window.addEventListener('hashchange', syncHash)
    return () => window.removeEventListener('hashchange', syncHash)
  }, [])
  const selectView = (view) => {
    if (view === 'Alarms') view = 'Operations'
    setActiveView(view)
    if (view === 'SLDC') window.location.hash = 'sldc'
    else if (view === 'Reports') window.location.hash = 'sldc-reports'
    else if (view === 'Operations') window.location.hash = 'operations-log'
    else if (view === 'Weather') window.location.hash = 'weather'
    else if (view === 'Bhokar') window.location.hash = 'bhokar'
    else if (view === 'Settings') window.location.hash = 'settings'
    else if (window.location.hash) history.replaceState(null, '', window.location.pathname)
  }
  return <Box className={`ops-app ${navCollapsed ? 'nav-collapsed' : ''}`}>
    <Nav collapsed={navCollapsed} onToggle={() => setNavCollapsed((value) => !value)} active={activeView === 'Operations' ? 'Alarms' : activeView} onSelect={selectView} />
    <main className={activeView === 'SLDC' || activeView === 'Reports' || activeView === 'Operations' || activeView === 'Weather' || activeView === 'Bhokar' || activeView === 'Settings' ? 'sldc-main' : ''}><Header clock={clock}/>{activeView === 'Bhokar'
      ? <BhokarDashboard initialCollection={selectedBhokarCollection} onBack={() => selectView('Dashboard')} />
      : activeView === 'Settings'
      ? <Suspense fallback={<div className="weather-loading">Loading site settings…</div>}><SiteSettings onBack={() => selectView('Dashboard')} /></Suspense>
      : activeView === 'Weather'
      ? <Suspense fallback={<div className="weather-loading">Loading weather portal…</div>}><WeatherPortal plants={[...plants, ...thirdPartyWeatherSites]} liveWeather={siteWeather} onBack={() => selectView('Dashboard')} /></Suspense>
      : activeView === 'Operations' ? <OperationsLog plants={plants} onBack={() => selectView('Dashboard')} />
      : activeView === 'SLDC' || activeView === 'Reports'
      ? <SldcDashboard data={sldc} onBack={() => selectView('Dashboard')} openReports={activeView === 'Reports'} />
      : <><Kpis m={scopedMetrics}/><div className="main-grid"><div className="left-rail portfolio-rail"><ThirdPartyPortfolio plants={plants} scope={scope} onSelectScope={setScope} plantMapping={plantMapping} siteWeather={siteWeather} bhokarRealtime={bhokarRealtime}/><SldcStatusCard data={sldc} onOpen={() => selectView('SLDC')} /></div><IndiaMap plants={visiblePlants} scope={scope} onSelectScope={setScope} plantMapping={plantMapping} siteWeather={siteWeather} bhokarRealtime={bhokarRealtime} onOpenBhokarPlant={(mappedPlant) => { const collection = bhokarCollectionForPlant(mappedPlant.plantName); setSelectedBhokarCollection(collection || null); setActiveView('Bhokar'); window.location.hash = collection ? `bhokar/${collection}` : 'bhokar' }}/><RightRail alarms={visibleAlarms} events={visibleEvents} plants={visibleWeatherPlants} siteWeather={siteWeather} weatherUpdatedAt={weatherUpdatedAt} onOpenLogs={() => selectView('Operations')}/></div><Bottom plants={visiblePlants}/><Footer /></>}
    </main>
  </Box>
}

export default function App() { return <SimulationDataProvider><CssBaseline/><DashboardView/></SimulationDataProvider> }
