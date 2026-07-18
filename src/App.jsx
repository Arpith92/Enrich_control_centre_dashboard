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

const fmt = (n, digits = 1) => Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: digits })
const viewFromHash = () => ({
  '#operations-log': 'Operations', '#sldc-reports': 'Reports', '#sldc': 'SLDC', '#weather': 'Weather', '#bhokar': 'Bhokar',
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

const ThirdPartyPortfolio = () => {
  const [customers, setCustomers] = useState(() => simulateThirdPartyCustomers())
  const [active, setActive] = useState(null)
  useEffect(() => {
    const interval = window.setInterval(() => setCustomers(simulateThirdPartyCustomers()), 30000)
    return () => window.clearInterval(interval)
  }, [])
  const select = (id) => {
    const next = active === id ? null : id
    setActive(next)
    window.dispatchEvent(new CustomEvent('third-party-customer-select', { detail: next }))
  }
  const totalCapacity = customers.reduce((sum, customer) => sum + customer.ac, 0)
  const totalGeneration = customers.reduce((sum, customer) => sum + customer.simulatedMw, 0)
  return <Panel title="THIRD-PARTY SITES · SIMULATION" className="third-party-portfolio">
    <div className="portfolio-head"><span>Customer / Sites</span><span>Capacity</span><span>Generation</span></div>
    <div className="portfolio-rows">{customers.map((customer) => <button className={active === customer.id ? 'active' : ''} key={customer.id} onClick={() => select(customer.id)}>
      <span><b>{customer.name}</b><small>{customer.plants.length} plants · click to map</small></span><strong>{customer.ac.toFixed(0)} MW</strong><strong>{customer.simulatedMw.toFixed(2)} MW</strong>
    </button>)}</div>
    <div className="portfolio-total"><span><b>ALL THIRD-PARTY SITES</b><small>{customers.reduce((sum, customer) => sum + customer.plants.length, 0)} plants</small></span><strong>{totalCapacity.toFixed(0)} MW</strong><strong>{totalGeneration.toFixed(2)} MW</strong></div>
    <small className="portfolio-note">Simulated values · refreshed every 30 seconds</small>
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
            <span>GTI (kWh/m²) <b>{w.gti_kwh_m2}</b></span>
            <span>Rain/Precip <b>{precipitationMm} mm</b></span>
            <span>RH <b>{w.relative_humidity_2m}%</b></span>
            <span>Pressure <b>{w.surface_pressure} hPa</b></span>
          </div>}
        </div>
      })}
    </div>
  </Panel>
</div>

const Spark = () => <svg className="spark" viewBox="0 0 300 100" preserveAspectRatio="none"><defs><linearGradient id="sg" x1="0" y1="0" x2="0" y2="1"><stop stopColor="#8cff55" stopOpacity=".35"/><stop offset="1" stopColor="#8cff55" stopOpacity="0"/></linearGradient></defs><path d="M0 95 C35 95 38 84 60 52 S105 27 135 18 S190 5 220 30 S260 62 300 77 L300 100 L0 100Z" fill="url(#sg)"/><path d="M0 95 C35 95 38 84 60 52 S105 27 135 18 S190 5 220 30 S260 62 300 77" fill="none" stroke="#a6ff68" strokeWidth="2"/></svg>

const Bottom = ({ plants }) => <div className="bottom-grid">
  <Panel title="GENERATION TREND · TODAY (LIVE)"><Spark /><div className="axis">{['00:00','04:00','08:00','12:00','16:00','20:00','24:00'].map((time)=><span key={time}>{time}</span>)}</div></Panel>
  <Panel title="GENERATION LAST 7 DAYS (MWH)"><div className="bars">{[72,82,88,94,86,91,90].map((h,i)=><i key={i} style={{height:`${h}%`}}><span>{1782+i*68}</span></i>)}</div></Panel>
  <Panel title="TOP 5 PLANTS BY CURRENT GENERATION"><div className="rank">{[...plants].sort((a,b)=>b.currentMw-a.currentMw).slice(0,5).map(p=><span key={p.id}>{p.name}<i style={{width:`${Math.min(100,p.currentMw)}%`}}/><b>{p.currentMw.toFixed(2)}</b></span>)}</div></Panel>
</div>

const Footer = () => <footer className="status-footer">{[[SecurityOutlined,'SCADA STATUS','ONLINE'],[CloudOutlined,'API STATUS','ONLINE'],[Wifi,'NETWORK HEALTH','GOOD'],[Storage,'DATABASE','HEALTHY'],[Speed,'SERVER LOAD','24%'],[CloudOutlined,'CLOUD BACKUP','OK'],[Sync,'NEXT DATA SYNC','00:00:01']].map(([Icon,a,b])=><div key={a}><Icon/><span>{a}<b>{b}</b></span></div>)}</footer>

const DashboardView = () => {
  const { plants, metrics, clock, siteWeather, weatherUpdatedAt } = useSimulationData()
  const [navCollapsed, setNavCollapsed] = useState(false)
  const [activeView, setActiveView] = useState(viewFromHash)
  const sldc = useSldcData()
  const liveFeed = useOperationalFeed({ sldc, plants, siteWeather, weatherUpdatedAt })
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
    else if (window.location.hash) history.replaceState(null, '', window.location.pathname)
  }
  return <Box className={`ops-app ${navCollapsed ? 'nav-collapsed' : ''}`}>
    <Nav collapsed={navCollapsed} onToggle={() => setNavCollapsed((value) => !value)} active={activeView === 'Operations' ? 'Alarms' : activeView} onSelect={selectView} />
    <main className={activeView === 'SLDC' || activeView === 'Reports' || activeView === 'Operations' || activeView === 'Weather' || activeView === 'Bhokar' ? 'sldc-main' : ''}><Header clock={clock}/>{activeView === 'Bhokar'
      ? <BhokarDashboard onBack={() => selectView('Dashboard')} />
      : activeView === 'Weather'
      ? <Suspense fallback={<div className="weather-loading">Loading weather portal…</div>}><WeatherPortal plants={plants} liveWeather={siteWeather} onBack={() => selectView('Dashboard')} /></Suspense>
      : activeView === 'Operations' ? <OperationsLog plants={plants} onBack={() => selectView('Dashboard')} />
      : activeView === 'SLDC' || activeView === 'Reports'
      ? <SldcDashboard data={sldc} onBack={() => selectView('Dashboard')} openReports={activeView === 'Reports'} />
      : <><Kpis m={metrics}/><div className="main-grid"><div className="left-rail"><ThirdPartyPortfolio/><SldcStatusCard data={sldc} onOpen={() => selectView('SLDC')} /></div><IndiaMap plants={plants}/><RightRail alarms={liveFeed.alarms} events={liveFeed.events} plants={plants} siteWeather={siteWeather} weatherUpdatedAt={weatherUpdatedAt} onOpenLogs={() => selectView('Operations')}/></div><Bottom plants={plants}/><Footer /></>}
    </main>
  </Box>
}

export default function App() { return <SimulationDataProvider><CssBaseline/><DashboardView/></SimulationDataProvider> }
