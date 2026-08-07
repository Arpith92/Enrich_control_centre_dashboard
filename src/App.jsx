import { lazy, Suspense, useEffect, useState } from 'react'
import { Box, CssBaseline } from '@mui/material'
import {
  Dashboard, SolarPower, NotificationsNone, DescriptionOutlined, QueryStats,
  LightModeOutlined, ConfirmationNumberOutlined, SettingsOutlined, Menu,
  Refresh, Fullscreen, DarkModeOutlined, Bolt, EnergySavingsLeaf, Co2,
  Speed, Wifi, CloudOutlined,
  SecurityOutlined, Storage, AccountCircle,
} from '@mui/icons-material'
import IndiaMap from './components/IndiaMap'
import RealtimePortfolioSite from './components/RealtimePortfolioSite'
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
const viewFromHash = () => (window.location.hash.startsWith('#bhokar') || window.location.hash.startsWith('#scada/')) ? 'Bhokar' : ({
  '#operations-log': 'Operations', '#sldc-reports': 'Reports', '#sldc': 'SLDC', '#weather': 'Weather', '#bhokar': 'Bhokar', '#settings': 'Settings',
}[window.location.hash] || 'Dashboard')
const realtimeSelectionFromHash = () => {
  const match = window.location.hash.match(/^#scada\/([^/]+)\/([^/]+)$/)
  if (!match) return null
  try { return { site: decodeURIComponent(match[1]), collection: decodeURIComponent(match[2]) } } catch { return null }
}
const Panel = ({ title, children, className = '' }) => <section className={`ops-panel ${className}`}><h3>{title}</h3>{children}</section>
const getPrecipitationMm = (weather) => Number(weather?.precipitation_mm ?? weather?.precipitation ?? weather?.rain ?? 0)
const availabilityStorageKey = 'enrich-scada-daily-availability-v1'
const retainedPrStorageKey = 'enrich-retained-daily-pr-v1'
const indianDayKey = (date = new Date()) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date)
const indianDayStart = (now = Date.now()) => {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(now))
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]))
  return Date.parse(`${value.year}-${value.month}-${value.day}T00:00:00+05:30`)
}
const useDailyScadaAvailability = (siteRealtime) => {
  const [records, setRecords] = useState(() => {
    try { return JSON.parse(window.localStorage.getItem(availabilityStorageKey) || '{}') } catch { return {} }
  })
  useEffect(() => {
    const now = Date.now()
    const day = indianDayKey(new Date(now))
    const samples = Object.entries(siteRealtime || {}).flatMap(([siteName, site]) => (site?.plants || []).map((plant) => ({
      key: `${siteName}:${plant.collection}`,
      online: !plant.communicationIssue && plant.available !== false && plant.dataAvailable !== false,
    })))
    if (!samples.length) return
    setRecords((previous) => {
      const next = Object.fromEntries(Object.entries(previous).filter(([, record]) => record.day === day))
      samples.forEach(({ key, online }) => {
        const record = next[key]
        if (!record) {
          const observedMs = Math.max(1, now - indianDayStart(now))
          next[key] = { day, lastAt: now, online, onlineMs: online ? observedMs : 0, totalMs: observedMs }
          return
        }
        const elapsed = Math.max(0, Math.min(now - Number(record.lastAt || now), 60000))
        next[key] = { ...record, lastAt: now, online, onlineMs: Number(record.onlineMs || 0) + (record.online ? elapsed : 0), totalMs: Number(record.totalMs || 0) + elapsed }
      })
      window.localStorage.setItem(availabilityStorageKey, JSON.stringify(next))
      return next
    })
  }, [siteRealtime])
  return records
}
const useRetainedDailyPr = (scopeKey, currentPr) => {
  const [records, setRecords] = useState(() => {
    try { return JSON.parse(window.localStorage.getItem(retainedPrStorageKey) || '{}') } catch { return {} }
  })
  const day = indianDayKey()
  useEffect(() => {
    if (!Number.isFinite(currentPr) || currentPr <= 0) return
    setRecords((previous) => {
      const next = { ...previous, [scopeKey]: { day, value: currentPr } }
      window.localStorage.setItem(retainedPrStorageKey, JSON.stringify(next))
      return next
    })
  }, [scopeKey, currentPr, day])
  if (Number.isFinite(currentPr) && currentPr > 0) return currentPr
  const retained = records[scopeKey]
  return retained?.day === day ? Number(retained.value || 0) : 0
}

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

const Header = ({ clock, lightTheme, onToggleTheme, searchOptions, onSearch }) => <header className="ops-header">
  <div className="brand"><img className="brand-logo" src={enrichLogo} alt="Enrich - The Solar People" /><div><b>ENRICH SOLAR OPERATIONS</b><span>SOLAR PLANT MONITORING DASHBOARD</span></div></div>
  <div className="head-tools">
    <label className="header-search"><QueryStats /><input list="dashboard-search-options" placeholder="Search site, plant or location" onChange={(event) => onSearch(event.target.value)} /><datalist id="dashboard-search-options">{searchOptions.map((option) => <option key={option.key} value={option.label}>{option.description}</option>)}</datalist></label>
    <div className="header-user"><AccountCircle /><span>Hi, <b>Arpith Shetty</b></span></div>
    <div className="clock">{clock.format('hh:mm:ss A')}<span>{clock.format('DD MMM YYYY, ddd')}</span></div>
    <button onClick={() => window.dispatchEvent(new Event('dashboard-refresh'))}><Refresh /><span>Refresh</span></button><button onClick={() => document.documentElement.requestFullscreen?.()}><Fullscreen /><span>Fullscreen</span></button>
    <button onClick={onToggleTheme} aria-pressed={lightTheme} title={`Switch to ${lightTheme ? 'dark' : 'white'} theme`}>{lightTheme ? <DarkModeOutlined /> : <LightModeOutlined />}<span>Theme</span></button>
  </div>
</header>

const Kpis = ({ m }) => {
  const cards = [
    ['CURRENT GENERATION', fmt(m.currentGeneration, 2), ' MW', EnergySavingsLeaf, `${((m.currentGeneration / m.totalCapacity) * 100).toFixed(2)}% of Capacity`],
    ["TODAY'S GENERATION", fmt(m.todayGeneration, 2), ' MWh', Bolt, 'Today'],
    ['ACTIVE INVERTERS', `${fmt(m.activeInverters, 0)} / ${fmt(m.totalInverters, 0)}`, '', Wifi, 'Live status'],
    ['CO₂ SAVED TODAY', fmt(m.co2Saved, 2), ' Ton', Co2, 'Updated today'],
    ['PR', fmt(m.averagePr, 2), ' %', Speed, 'Retained for the day'],
    ['SCADA AVAILABILITY', fmt(m.averageAvailability, 2), ' %', Wifi, 'Today'],
    ['SPECIFIC YIELD', fmt(m.instantaneousYield, 2), ' MW/MWp', QueryStats, `Daily ${fmt(m.daySpecificYield, 2)} kWh/kWp/day`],
    ['DAILY IRRADIATION', fmt(m.irradiance, 2), ' kWh/m²', LightModeOutlined, 'Retained until 23:59'],
  ]
  return <div className="kpi-strip">{cards.map(([label, value, unit, Icon, note]) =>
    <div className="ops-kpi" key={label}><Icon /><div><span>{label}</span><b>{value}<small>{unit}</small></b><em>{note}</em></div></div>)}</div>
}

const ThirdPartyPortfolio = ({ plants, scope, onSelectScope, plantMapping, siteWeather, siteRealtime }) => {
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
  const thirdPartyCustomers = customers.filter((customer) => !customer.commonInfra)
  const commonInfraCustomers = customers.filter((customer) => customer.commonInfra)
  const enrichCapacity = plants.reduce((sum, plant) => {
    const mappedDc = (plantMapping[plant.name] || []).reduce((total, mappedPlant) => total + mappedPlant.dc, 0)
    return sum + (mappedDc || plant.capacity * 1.2)
  }, 0)
  const enrichGeneration = plants.reduce((sum, plant) => sum + plant.currentMw, 0)
  const showEnrich = !['portfolio-third-party', 'portfolio-common-infra'].includes(scope?.type)
  const showThirdParty = !['portfolio-enrich', 'portfolio-common-infra'].includes(scope?.type)
  const showCommonInfra = !['portfolio-enrich', 'portfolio-third-party'].includes(scope?.type)
  const visibleCustomers = [
    ...(showThirdParty ? thirdPartyCustomers : []),
    ...(showCommonInfra ? commonInfraCustomers : []),
  ]
  const displayedCapacity = (showEnrich ? enrichCapacity : 0) + visibleCustomers.reduce((sum, customer) => sum + customer.dc, 0)
  const displayedGeneration = (showEnrich ? enrichGeneration : 0) + visibleCustomers.reduce((sum, customer) => sum + customer.simulatedMw, 0)
  const totalLabel = scope?.type === 'portfolio-enrich' ? 'ENRICH SITES'
    : scope?.type === 'portfolio-third-party' ? 'THIRD-PARTY SITES'
      : scope?.type === 'portfolio-common-infra' ? 'COMMON INFRA' : 'ALL SITES'
  return <Panel title="ALL COMMISSIONED SITES" className="third-party-portfolio">
    <div className="portfolio-head"><span>Portfolio / Site</span><span>DC Capacity</span><span>Generation</span></div>
    <div className="portfolio-rows portfolio-site-list">
      {showEnrich && [...plants].sort((a, b) => b.capacity - a.capacity || a.name.localeCompare(b.name)).map((plant) => {
        const mappedPlants = plantMapping[plant.name] || []
        const realtime = siteRealtime?.[plant.name]
        return <RealtimePortfolioSite key={plant.id} plant={plant} mappedPlants={mappedPlants} realtime={realtime} scope={scope} onSelectScope={onSelectScope} />
      })}
      {[...visibleCustomers].sort((a, b) => Number(a.commonInfra) - Number(b.commonInfra) || b.dc - a.dc || a.name.localeCompare(b.name)).map((customer) => <div className={`portfolio-customer-section ${active === customer.id ? 'active' : ''}`} key={customer.id}>
        <button className={`portfolio-site customer-site-row ${customer.commonInfra ? 'site-common-infra' : 'site-third-party'} comm-${customer.communicationStatus} ${scope?.customerId === customer.id || scope?.id === customer.id ? 'active' : ''}`} title={customer.commonInfra ? `${customer.plants.length} common-infrastructure plants · no real-time telemetry` : customer.communicationIssueCount ? `${customer.communicationIssueCount} of ${customer.plants.length} plants have communication issues` : 'All plants communicating'} onClick={() => { const isSelected = scope?.customerId === customer.id || scope?.id === customer.id; select(customer.id); onSelectScope(isSelected ? null : { type: 'customer', id: customer.id, customerId: customer.id, name: customer.name, customer }) }}><span><b>{customer.name}</b></span><strong>{customer.dc.toFixed(2)} MWp</strong><strong>{customer.simulatedMw.toFixed(2)} MW</strong></button>
      </div>)}
    </div>
    <button className={`portfolio-total ${!scope ? 'active' : ''}`} onClick={() => { setActive(null); window.dispatchEvent(new CustomEvent('third-party-customer-select', { detail: null })); onSelectScope(null); window.dispatchEvent(new Event('map-show-overview')) }} title="Clear every filter and show the complete installed base"><span><b>{totalLabel}</b>{scope && <small>Click to clear filter</small>}</span><strong>{displayedCapacity.toFixed(2)} MWp</strong><strong>{displayedGeneration.toFixed(2)} MW</strong></button>
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
    <div className="alarm-live-list">{alarms.slice(0, 3).map((alarm) => <div className="alarm-row" key={alarm.id} title={`${alarm.plant} · ${alarm.alarm}`}><span>{alarm.time}</span><span>{alarm.plant}</span><span>{alarm.alarm}</span><b className={alarm.severity.toLowerCase()}>{alarm.severity}</b></div>)}
      {!alarms.length && <div className="alarm-empty"><i /> No active SLDC or weather alarms</div>}
    </div>
  </Panel>
  <Panel title="♧ LIVE EVENTS" className="events-box"><button className="feed-more" onClick={onOpenLogs}>More →</button>
    {events.slice(0, 3).map((event) => <div className={`event-row ${event.severity}`} key={event.id} title={`${event.plant} · ${event.detail}`}><i/><span>{event.time}</span><div><b>{event.plant}</b><small>{event.detail}</small></div></div>)}
  </Panel>
  <Panel title="SITE WEATHER · LIVE" className="weather-box site-weather">
    <span className="weather-source">{weatherUpdatedAt ? `LIVE · ${weatherUpdatedAt.format('HH:mm:ss')}` : 'CONNECTING…'}</span>
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

const Bottom = ({ plants, currentGeneration, todayGeneration, scopeKey }) => {
  const historyKey = `enrich-generation-daily-${scopeKey}`
  const trendKey = `enrich-generation-today-${scopeKey}`
  const [trend, setTrend] = useState(() => {
    try {
      const today = indianDayKey()
      const stored = JSON.parse(window.localStorage.getItem(trendKey) || '[]').filter((item) => item.date === today)
      const now = new Date()
      const firstLive = stored.length ? new Date(stored[0].time) : now
      const morning = new Date(now); morning.setHours(6, 0, 0, 0)
      const currentHour = now.getHours() + now.getMinutes() / 60
      const solarNow = Math.max(.08, Math.sin(Math.PI * Math.max(0, Math.min(12, currentHour - 6)) / 12))
      const peak = Number(currentGeneration || 0) / solarNow
      const simulated = []
      for (let time = morning.getTime(); time < firstLive.getTime(); time += 15 * 60000) {
        const point = new Date(time)
        const hour = point.getHours() + point.getMinutes() / 60
        const solar = Math.max(0, Math.sin(Math.PI * Math.max(0, Math.min(12, hour - 6)) / 12))
        simulated.push({ date: today, time: point, value: peak * solar, source: 'simulated' })
      }
      return [...simulated, ...stored.map((item) => ({ ...item, time: new Date(item.time), source: item.source || 'live' })), { date: today, time: now, value: Number(currentGeneration || 0), source: 'live' }]
    } catch { return [{ date: indianDayKey(), time: new Date(), value: Number(currentGeneration || 0) }] }
  })
  const [daily, setDaily] = useState(() => {
    let stored = []
    try { stored = JSON.parse(window.localStorage.getItem(historyKey) || '[]') } catch { stored = [] }
    const today = new Date()
    const liveByDate = new Map(stored.filter((item) => item.source === 'live').map((item) => [item.date, item]))
    const baseline = Math.max(1, Number(todayGeneration || 0))
    return Array.from({ length: 7 }, (_, index) => {
      const date = new Date(today); date.setDate(today.getDate() - (6 - index))
      const key = indianDayKey(date)
      const variation = .92 + ((date.getDate() * 17 + scopeKey.length * 7) % 17) / 100
      return liveByDate.get(key) || { date: key, value: baseline * variation, source: 'simulated' }
    })
  })
  const [hoveredTrend, setHoveredTrend] = useState(null)
  useEffect(() => {
    setTrend((previous) => {
      const today = indianDayKey()
      const retained = previous.filter((item) => item.date === today)
      const sample = { date: today, time: new Date(), value: Number(currentGeneration || 0), source: 'live' }
      const last = retained.at(-1)
      const next = (last && sample.time - new Date(last.time) < 60000
        ? [...retained.slice(0, -1), sample] : [...retained, sample]).slice(-720)
      window.localStorage.setItem(trendKey, JSON.stringify(next))
      return next
    })
  }, [currentGeneration, trendKey])
  useEffect(() => {
    const date = indianDayKey()
    setDaily((previous) => {
      const next = [...previous.filter((item) => item.date !== date), { date, value: Number(todayGeneration || 0), source: 'live' }].sort((a, b) => a.date.localeCompare(b.date)).slice(-7)
      window.localStorage.setItem(historyKey, JSON.stringify(next))
      return next
    })
  }, [todayGeneration, historyKey])
  const trendMax = Math.max(1, ...trend.map((item) => item.value))
  const morning = new Date(); morning.setHours(6, 0, 0, 0)
  const now = new Date()
  const periodMs = Math.max(1, now - morning)
  const chartPoints = trend.map((item) => ({ ...item, x: Math.max(0, Math.min(300, ((item.time - morning) / periodMs) * 300)), y: 96 - (item.value / trendMax) * 88 }))
  const smoothPath = chartPoints.length ? chartPoints.reduce((path, point, index) => {
    if (!index) return `M ${point.x} ${point.y}`
    const previous = chartPoints[index - 1]
    const midpoint = (previous.x + point.x) / 2
    return `${path} C ${midpoint} ${previous.y}, ${midpoint} ${point.y}, ${point.x} ${point.y}`
  }, '') : ''
  const onTrendMove = (event) => {
    const bounds = event.currentTarget.getBoundingClientRect()
    const x = ((event.clientX - bounds.left) / bounds.width) * 300
    setHoveredTrend(chartPoints.reduce((closest, point) => !closest || Math.abs(point.x - x) < Math.abs(closest.x - x) ? point : closest, null))
  }
  const dailyBars = [...daily].sort((a, b) => b.date.localeCompare(a.date))
  const dailyPeak = Math.max(1, ...dailyBars.map((item) => item.value))
  return <div className="bottom-grid">
  <Panel title="GENERATION TREND · TODAY (LIVE)"><div className="interactive-trend"><svg className="spark" viewBox="0 0 300 100" preserveAspectRatio="none" onMouseMove={onTrendMove} onMouseLeave={() => setHoveredTrend(null)}><path d={smoothPath} fill="none" stroke="#a6ff68" strokeWidth="2"/>{hoveredTrend && <><line x1={hoveredTrend.x} x2={hoveredTrend.x} y1="5" y2="98" stroke="#6ddcff" strokeWidth=".6" strokeDasharray="2 2"/><circle cx={hoveredTrend.x} cy={hoveredTrend.y} r="3" fill="#071827" stroke="#a6ff68" strokeWidth="1.5"/></>}</svg>{hoveredTrend && <div className="trend-tooltip" style={{ left: `${Math.min(82, Math.max(5, (hoveredTrend.x / 300) * 100))}%` }}><b>{hoveredTrend.value.toFixed(2)} MW</b><span>{hoveredTrend.time.toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit'})}</span><i>{hoveredTrend.source === 'simulated' ? 'SIMULATED' : 'LIVE'}</i></div>}</div><div className="trend-endpoints"><span>{trend[0].time.toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit'})} · {trend[0].value.toFixed(2)} MW</span><span>NOW · {trend.at(-1).value.toFixed(2)} MW</span></div></Panel>
  <Panel title="GENERATION · LAST 7 DAYS (MWh)"><div className="generation-seven-bars">{dailyBars.map((item, index)=><div className="generation-day-bar" key={item.date}><b>{item.value.toLocaleString('en-IN',{maximumFractionDigits:1})}</b><i style={{height:`${Math.max(5,(item.value / dailyPeak) * 100)}%`}}/><span>{index === 0 ? 'Today' : new Date(`${item.date}T00:00:00`).toLocaleDateString('en-IN',{day:'2-digit',month:'short'})}</span><small className={item.source}>{item.source === 'live' ? 'LIVE' : 'SIM'}</small></div>)}</div></Panel>
  <Panel title="TOP 5 PLANTS BY CURRENT GENERATION"><div className="rank">{[...plants].sort((a,b)=>b.currentMw-a.currentMw).slice(0,5).map(p=><span key={p.id}>{p.name}<i style={{width:`${Math.min(100,p.currentMw)}%`}}/><b>{p.currentMw.toFixed(2)}</b></span>)}</div></Panel>
</div>}

const Footer = () => <footer className="status-footer">{[[SecurityOutlined,'SCADA STATUS','ONLINE'],[CloudOutlined,'API STATUS','ONLINE'],[Wifi,'NETWORK HEALTH','GOOD'],[Storage,'DATABASE','HEALTHY'],[Speed,'SERVER LOAD','24%'],[CloudOutlined,'CLOUD BACKUP','OK']].map(([Icon,a,b])=><div key={a}><Icon/><span>{a}<b>{b}</b></span></div>)}</footer>

const DashboardView = () => {
  const { plants, metrics, clock, siteWeather, weatherUpdatedAt, thirdPartyWeatherSites, siteRealtime } = useSimulationData()
  const [navCollapsed, setNavCollapsed] = useState(false)
  const [lightTheme, setLightTheme] = useState(() => window.localStorage.getItem('enrich-dashboard-theme') === 'light')
  const [activeView, setActiveView] = useState(viewFromHash)
  const [scope, setScope] = useState(null)
  const initialRealtimeSelection = realtimeSelectionFromHash()
  const [selectedBhokarCollection, setSelectedBhokarCollection] = useState(initialRealtimeSelection?.collection || null)
  const [selectedRealtimeSite, setSelectedRealtimeSite] = useState(initialRealtimeSelection?.site || 'Bhokar')
  const [plantMapping, setPlantMapping] = useState(createImmediatePlantMapping)
  const sldc = useSldcData()
  const liveFeed = useOperationalFeed({ sldc, plants, siteWeather, weatherUpdatedAt, siteRealtime })
  const dailyAvailability = useDailyScadaAvailability(siteRealtime)
  const toggleTheme = () => setLightTheme((current) => {
    const next = !current
    window.localStorage.setItem('enrich-dashboard-theme', next ? 'light' : 'dark')
    return next
  })
  const searchOptions = [
    ...plants.map((plant) => ({ key: `site-${plant.id}`, label: plant.name, description: `Site · ${plant.state}`, scope: { type: 'enrich', id: plant.id, name: plant.name } })),
    ...Object.entries(plantMapping).flatMap(([siteName, mappedPlants]) => mappedPlants.map((mappedPlant) => {
      const parent = plants.find((plant) => plant.name === siteName)
      return { key: `plant-${mappedPlant.id}`, label: `${mappedPlant.plantName} · ${siteName}`, description: `${mappedPlant.customerName} · ${mappedPlant.state}`, scope: parent ? { type: 'enrich-plant', id: mappedPlant.id, siteId: parent.id, name: mappedPlant.plantName, parent, mappedPlant } : null }
    })).filter((option) => option.scope),
  ]
  const applySearch = (value) => {
    const normalized = value.trim().toLowerCase()
    if (!normalized) return
    const match = searchOptions.find((option) => option.label.toLowerCase() === normalized)
      || searchOptions.find((option) => `${option.label} ${option.description}`.toLowerCase().includes(normalized))
    if (match) { setScope(match.scope); setActiveView('Dashboard'); if (window.location.hash) history.replaceState(null, '', window.location.pathname) }
  }
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
  const selectedEnrichPlant = scope?.type === 'enrich' ? plants.find((plant) => plant.id === scope.id) : scope?.type === 'enrich-plant' || scope?.type === 'scada-block' ? plants.find((plant) => plant.id === scope.siteId) : null
  const visiblePlants = selectedEnrichPlant
    ? [selectedEnrichPlant]
    : scope?.type === 'customer' || scope?.type === 'third-party-plant' || scope?.type === 'portfolio-third-party' || scope?.type === 'portfolio-common-infra' ? [] : plants
  const scopedThirdPartyWeather = scope?.type === 'third-party-plant'
    ? [{ ...scope.plant, name: scope.plant.site, state: scope.customer.name, thirdParty: true }]
    : scope?.type === 'customer'
      ? scope.customer.plants.map((plant) => ({ ...plant, name: plant.site, state: scope.customer.name, thirdParty: true }))
      : []
  const visibleWeatherPlants = selectedEnrichPlant
    ? [selectedEnrichPlant]
    : scopedThirdPartyWeather.length ? scopedThirdPartyWeather
      : scope?.type === 'portfolio-enrich' ? plants
        : scope?.type === 'portfolio-third-party' ? thirdPartyWeatherSites.filter((plant) => !plant.commonInfra)
          : scope?.type === 'portfolio-common-infra' ? thirdPartyWeatherSites.filter((plant) => plant.commonInfra)
          : [...plants, ...thirdPartyWeatherSites]
  const mappedSiteCapacity = selectedEnrichPlant ? (plantMapping[selectedEnrichPlant.name] || []).reduce((sum, item) => sum + item.ac, 0) : 0
  const portfolioThirdParty = simulateThirdPartyCustomers(new Date(), siteWeather)
  const portfolioThirdPartyCapacity = portfolioThirdParty.reduce((sum, customer) => sum + customer.dc, 0)
  const portfolioThirdPartyGeneration = portfolioThirdParty.reduce((sum, customer) => sum + customer.simulatedMw, 0)
  const portfolioThirdPartyToday = portfolioThirdParty.reduce((sum, customer) => sum + customer.todayMwh, 0)
  const isEnrichPortfolio = scope?.type === 'portfolio-enrich'
  const scopedThirdPartyPlants = scope?.type === 'third-party-plant'
    ? [scope.plant]
    : scope?.type === 'customer' ? scope.customer.plants
      : scope?.type === 'portfolio-third-party' ? portfolioThirdParty.filter((customer) => !customer.commonInfra).flatMap((customer) => customer.plants)
        : scope?.type === 'portfolio-common-infra' ? portfolioThirdParty.filter((customer) => customer.commonInfra).flatMap((customer) => customer.plants)
        : []
  const isThirdPartyScope = scopedThirdPartyPlants.length > 0
  const scopedThirdPartyHasNoTelemetry = scopedThirdPartyPlants.length > 0 && scopedThirdPartyPlants.every((plant) => plant.noTelemetry)
  const scopedThirdPartyPr = scopedThirdPartyHasNoTelemetry ? 0 : isThirdPartyScope
    ? (scopedThirdPartyPlants.reduce((sum, plant) => sum + plant.ac * (plant.efficiency || .8), 0) / scopedThirdPartyPlants.reduce((sum, plant) => sum + plant.ac, 0)) * 100
    : null
  const scopedThirdPartyAvailability = scopedThirdPartyHasNoTelemetry ? 0 : isThirdPartyScope
    ? (scopedThirdPartyPlants.filter((plant) => !plant.communicationIssue).length / scopedThirdPartyPlants.length) * 100
    : null
  const scopedPortfolioCustomers = scope?.type === 'portfolio-common-infra'
    ? portfolioThirdParty.filter((customer) => customer.commonInfra)
    : scope?.type === 'portfolio-third-party' ? portfolioThirdParty.filter((customer) => !customer.commonInfra) : []
  const scopedPortfolioCapacity = scopedPortfolioCustomers.reduce((sum, customer) => sum + customer.dc, 0)
  const scopedPortfolioGeneration = scopedPortfolioCustomers.reduce((sum, customer) => sum + customer.simulatedMw, 0)
  const scopedPortfolioToday = scopedPortfolioCustomers.reduce((sum, customer) => sum + customer.todayMwh, 0)
  const scopeCapacity = scope?.mappedPlant?.dc ?? selectedEnrichPlant?.capacity ?? scope?.plant?.dc ?? scope?.customer?.dc ?? (scopedPortfolioCustomers.length ? scopedPortfolioCapacity : isEnrichPortfolio ? metrics.totalCapacity : undefined)
  const scopeGeneration = scope?.mappedPlant && selectedEnrichPlant ? selectedEnrichPlant.currentMw * (scope.mappedPlant.ac / (mappedSiteCapacity || selectedEnrichPlant.capacity)) : selectedEnrichPlant?.currentMw ?? scope?.plant?.simulatedMw ?? scope?.customer?.simulatedMw ?? (scopedPortfolioCustomers.length ? scopedPortfolioGeneration : isEnrichPortfolio ? metrics.currentGeneration : undefined)
  const scopeTodayGeneration = scope?.mappedPlant && selectedEnrichPlant
    ? selectedEnrichPlant.todayMwh * (scope.mappedPlant.ac / (mappedSiteCapacity || selectedEnrichPlant.capacity))
    : selectedEnrichPlant?.todayMwh ?? scope?.plant?.todayMwh ?? scope?.customer?.todayMwh
      ?? (scopedPortfolioCustomers.length ? scopedPortfolioToday : isEnrichPortfolio ? metrics.todayGeneration : undefined)
  const fleetCapacity = plants.reduce((sum, plant) => sum + plant.capacity, 0) || 1
  const scale = scopeCapacity ? scopeCapacity / fleetCapacity : 1
  const allCapacity = metrics.totalCapacity + portfolioThirdPartyCapacity
  const allCurrentGeneration = metrics.currentGeneration + portfolioThirdPartyGeneration
  const allTodayGeneration = metrics.todayGeneration + portfolioThirdPartyToday
  const allThirdPartyPlants = portfolioThirdParty.flatMap((customer) => customer.plants)
  const allOnlinePlants = metrics.onlinePlants + allThirdPartyPlants.filter((plant) => !plant.noTelemetry && !plant.communicationIssue).length
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
    onlinePlants: isThirdPartyScope ? scopedThirdPartyPlants.filter((plant) => !plant.noTelemetry && !plant.communicationIssue).length : metrics.onlinePlants,
    offlinePlants: isThirdPartyScope ? scopedThirdPartyPlants.filter((plant) => !plant.noTelemetry && plant.communicationIssue).length : metrics.offlinePlants,
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
  const allRealtimePlants = Object.entries(siteRealtime || {}).flatMap(([siteName, site]) => (site?.plants || []).map((plant) => {
    const mappedPlant = (plantMapping[siteName] || []).find((mapped) => mapped.collection === plant.collection)
      || (plantMapping[siteName] || []).find((mapped) => mapped.plantName === plant.plantName || mapped.plantName === plant.name)
    return {
      ...mappedPlant,
      ...plant,
      ac: Number(plant.ac || mappedPlant?.ac || 0),
      dc: Number(plant.dc || mappedPlant?.dc || 0),
      siteName,
    }
  }))
  let selectedRealtimePlants = allRealtimePlants
  if (selectedEnrichPlant) selectedRealtimePlants = allRealtimePlants.filter((plant) => plant.siteName === selectedEnrichPlant.name)
  if (scope?.type === 'enrich-plant' && scope.mappedPlant?.collection) {
    selectedRealtimePlants = selectedRealtimePlants.filter((plant) => plant.collection === scope.mappedPlant.collection)
  }
  const blockNumber = scope?.type === 'scada-block' ? Number(scope.blockNumber) : null
  const selectedTelemetry = selectedRealtimePlants.map((plant) => {
    const inverters = blockNumber
      ? (plant.inverters || []).filter((inverter) => new RegExp(`^Block\\s+${blockNumber}\\s+Inv\\s+`, 'i').test(inverter.inverter || ''))
      : (plant.inverters || [])
    if (blockNumber && !inverters.length) return null
    const blockCount = blockNumber ? Math.max(1, new Set((plant.inverters || []).map((inverter) => String(inverter.inverter || '').match(/^Block\s+(\d+)/i)?.[1]).filter(Boolean)).size) : 1
    const currentMw = blockNumber ? inverters.reduce((sum, inverter) => sum + Number(inverter.activePowerMw || 0), 0) : Number(plant.currentMw || 0)
    const todayMWh = blockNumber ? inverters.reduce((sum, inverter) => sum + Number(inverter.dailyGenerationMWh || 0), 0) : Number(plant.dailyGenerationMWh || 0)
    const totalInverters = inverters.length || Number(plant.inverterTotal || 0)
    const generating = Number(plant.gti || 0) > 0 || currentMw > 0
    const activeInverters = blockNumber
      ? inverters.filter((inverter) => (inverter.activePowerRaw ?? inverter.activePowerMw) != null && (!generating || Number(inverter.activePowerRaw ?? inverter.activePowerMw) !== 0)).length
      : Number(plant.communicatingInverters ?? totalInverters)
    return {
      ...plant, inverters, currentMw, todayMWh, totalInverters, activeInverters,
      ac: Number(plant.ac || 0) / blockCount, dc: Number(plant.dc || plant.ac || 0) / blockCount,
      availabilityKey: `${plant.siteName}:${plant.collection}`,
    }
  }).filter(Boolean)
  const hasRealtimeScope = selectedTelemetry.length > 0 && (!isThirdPartyScope || selectedEnrichPlant)
  const realtimeCapacity = selectedTelemetry.reduce((sum, plant) => sum + plant.ac, 0)
  const realtimeDcCapacity = selectedTelemetry.reduce((sum, plant) => sum + plant.dc, 0)
  const realtimeGeneration = selectedTelemetry.reduce((sum, plant) => sum + plant.currentMw, 0)
  const realtimeToday = selectedTelemetry.reduce((sum, plant) => sum + plant.todayMWh, 0)
  const realtimeTotalInverters = selectedTelemetry.reduce((sum, plant) => sum + plant.totalInverters, 0)
  const realtimeActiveInverters = selectedTelemetry.reduce((sum, plant) => sum + plant.activeInverters, 0)
  const dailyIrradiationValues = visibleWeatherPlants.map((plant) => Number(siteWeather[plant.id]?.gti_kwh_m2))
    .filter((value) => Number.isFinite(value) && value >= 0)
  const dailyIrradiation = dailyIrradiationValues.length ? dailyIrradiationValues.reduce((sum, value) => sum + value, 0) / dailyIrradiationValues.length : 0
  const availabilityTotals = selectedTelemetry.reduce((totals, plant) => {
    const record = dailyAvailability[plant.availabilityKey]
    if (record) { totals.online += Number(record.onlineMs || 0); totals.total += Number(record.totalMs || 0) }
    return totals
  }, { online: 0, total: 0 })
  const useSelectedRealtimeGeneration = hasRealtimeScope && Boolean(scope)
    && !['portfolio-enrich', 'portfolio-third-party', 'portfolio-common-infra'].includes(scope?.type)
  const fleetEnrichDc = plants.reduce((sum, plant) => sum + ((plantMapping[plant.name] || []).reduce((total, mappedPlant) => total + Number(mappedPlant.dc || 0), 0) || Number(plant.capacity || 0) * 1.2), 0)
  const selectedMappedDc = scope?.mappedPlant?.dc || (selectedEnrichPlant ? (plantMapping[selectedEnrichPlant.name] || []).reduce((sum, mappedPlant) => sum + Number(mappedPlant.dc || 0), 0) : 0)
  const yieldDcCapacity = useSelectedRealtimeGeneration
    ? (scope?.type === 'enrich' ? Number(selectedMappedDc || realtimeDcCapacity) : realtimeDcCapacity)
    : !scope ? fleetEnrichDc + portfolioThirdPartyCapacity
      : scope?.type === 'portfolio-enrich' ? fleetEnrichDc
        : scope?.type === 'portfolio-third-party' || scope?.type === 'portfolio-common-infra' ? scopedPortfolioCapacity
          : Number(selectedMappedDc || scope?.plant?.dc || scope?.customer?.dc || scopedMetrics.totalCapacity || 0)
  const yieldDailyGeneration = useSelectedRealtimeGeneration ? realtimeToday : scopedMetrics.todayGeneration
  const yieldActivePower = useSelectedRealtimeGeneration ? realtimeGeneration : scopedMetrics.currentGeneration
  const selectedSiteRealtime = selectedEnrichPlant ? siteRealtime?.[selectedEnrichPlant.name] : null
  const siteYieldDailyGeneration = scope?.type === 'enrich' && selectedSiteRealtime?.dailyGenerationMWh != null
    ? Number(selectedSiteRealtime.dailyGenerationMWh) : yieldDailyGeneration
  const siteYieldActivePower = scope?.type === 'enrich' && selectedSiteRealtime?.currentMw != null
    ? Number(selectedSiteRealtime.currentMw) : yieldActivePower
  const panIndiaInstantaneousYields = [
    ...plants.map((plant) => {
      const dc = (plantMapping[plant.name] || []).reduce((sum, mappedPlant) => sum + Number(mappedPlant.dc || 0), 0) || Number(plant.capacity || 0) * 1.2
      return dc > 0 ? Number(plant.currentMw || 0) / dc : null
    }),
    ...allThirdPartyPlants.map((plant) => Number(plant.dc || 0) > 0 ? Number(plant.simulatedMw || 0) / Number(plant.dc) : null),
  ].filter((value) => Number.isFinite(value))
  const panIndiaSiteYields = [
    ...plants.map((plant) => {
      const dc = (plantMapping[plant.name] || []).reduce((sum, mappedPlant) => sum + Number(mappedPlant.dc || 0), 0) || Number(plant.capacity || 0) * 1.2
      const dailyGeneration = Number(plant.todayMwh)
      return dc > 0 && Number.isFinite(dailyGeneration) && plant.telemetrySource !== 'Pending' && plant.communication !== 'Pending'
        ? dailyGeneration / dc : null
    }),
    ...allThirdPartyPlants.map((plant) => {
      const dc = Number(plant.dc)
      const dailyGeneration = Number(plant.todayMwh)
      return !plant.noTelemetry && dc > 0 && Number.isFinite(dailyGeneration) ? dailyGeneration / dc : null
    }),
  ].filter((value) => Number.isFinite(value))
  const daySpecificYield = !scope && panIndiaSiteYields.length
    ? panIndiaSiteYields.reduce((sum, value) => sum + value, 0) / panIndiaSiteYields.length
    : yieldDcCapacity > 0 ? siteYieldDailyGeneration / yieldDcCapacity : 0
  const instantaneousYield = !scope && panIndiaInstantaneousYields.length
    ? panIndiaInstantaneousYields.reduce((sum, value) => sum + value, 0) / panIndiaInstantaneousYields.length
    : yieldDcCapacity > 0 ? siteYieldActivePower / yieldDcCapacity : 0
  const calculatedPr = dailyIrradiation > 0
    ? Math.min(100, Math.max(0, (daySpecificYield / dailyIrradiation) * 100)) : 0
  const retainedPr = useRetainedDailyPr(scope?.id || scope?.type || 'all-sites', calculatedPr)
  const realtimeKpis = hasRealtimeScope ? {
    ...scopedMetrics,
    totalCapacity: useSelectedRealtimeGeneration ? (realtimeCapacity || realtimeDcCapacity || 1) : scopedMetrics.totalCapacity,
    currentGeneration: useSelectedRealtimeGeneration ? realtimeGeneration : scopedMetrics.currentGeneration,
    todayGeneration: useSelectedRealtimeGeneration ? realtimeToday : scopedMetrics.todayGeneration,
    activeInverters: realtimeActiveInverters,
    totalInverters: realtimeTotalInverters,
    co2Saved: (useSelectedRealtimeGeneration ? realtimeToday : scopedMetrics.todayGeneration) * .82,
    averagePr: retainedPr,
    averageAvailability: availabilityTotals.total ? (availabilityTotals.online / availabilityTotals.total) * 100 : 0,
    instantaneousYield,
    daySpecificYield,
    irradiance: dailyIrradiation,
  } : {
    ...scopedMetrics,
    activeInverters: scopedMetrics.onlinePlants || 0,
    totalInverters: scopedMetrics.totalPlants || 0,
    instantaneousYield,
    daySpecificYield,
    averagePr: retainedPr,
    irradiance: dailyIrradiation,
  }
  const selectedEnrichName = selectedEnrichPlant?.name
  const visibleAlarms = selectedEnrichName ? liveFeed.alarms.filter((item) => item.plant === selectedEnrichName) : liveFeed.alarms
  const visibleEvents = selectedEnrichName ? liveFeed.events.filter((item) => item.plant === selectedEnrichName) : liveFeed.events
  useEffect(() => {
    const syncHash = () => {
      setActiveView(viewFromHash())
      const selection = realtimeSelectionFromHash()
      if (selection) {
        setSelectedRealtimeSite(selection.site)
        setSelectedBhokarCollection(selection.collection)
      }
    }
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
  const openPlantDetails = (siteName, collection) => {
    setSelectedRealtimeSite(siteName)
    setSelectedBhokarCollection(collection)
    setActiveView('Bhokar')
    window.location.hash = `scada/${encodeURIComponent(siteName)}/${encodeURIComponent(collection)}`
  }
  return <Box className={`ops-app ${navCollapsed ? 'nav-collapsed' : ''} ${lightTheme ? 'light-theme' : ''}`}>
    <Nav collapsed={navCollapsed} onToggle={() => setNavCollapsed((value) => !value)} active={activeView === 'Operations' ? 'Alarms' : activeView} onSelect={selectView} />
    <main className={activeView === 'SLDC' || activeView === 'Reports' || activeView === 'Operations' || activeView === 'Weather' || activeView === 'Bhokar' || activeView === 'Settings' ? 'sldc-main' : ''}><Header clock={clock} lightTheme={lightTheme} onToggleTheme={toggleTheme} searchOptions={searchOptions} onSearch={applySearch}/>{activeView === 'Bhokar'
      ? <BhokarDashboard siteName={selectedRealtimeSite} initialCollection={selectedBhokarCollection} initialData={siteRealtime[selectedRealtimeSite]} onBack={() => selectView('Dashboard')} />
      : activeView === 'Settings'
      ? <Suspense fallback={<div className="weather-loading">Loading site settings…</div>}><SiteSettings onBack={() => selectView('Dashboard')} /></Suspense>
      : activeView === 'Weather'
      ? <Suspense fallback={<div className="weather-loading">Loading weather portal…</div>}><WeatherPortal plants={[...plants, ...thirdPartyWeatherSites]} liveWeather={siteWeather} onBack={() => selectView('Dashboard')} /></Suspense>
      : activeView === 'Operations' ? <OperationsLog plants={plants} onBack={() => selectView('Dashboard')} />
      : activeView === 'SLDC' || activeView === 'Reports'
      ? <SldcDashboard data={sldc} onBack={() => selectView('Dashboard')} openReports={activeView === 'Reports'} />
      : <><Kpis m={realtimeKpis}/><div className="main-grid"><div className="left-rail portfolio-rail"><ThirdPartyPortfolio plants={plants} scope={scope} onSelectScope={setScope} plantMapping={plantMapping} siteWeather={siteWeather} siteRealtime={siteRealtime}/><SldcStatusCard data={sldc} selectedSite={selectedEnrichPlant?.name || null} onOpen={() => selectView('SLDC')} /></div><IndiaMap plants={visiblePlants} scope={scope} onSelectScope={setScope} plantMapping={plantMapping} siteWeather={siteWeather} siteRealtime={siteRealtime} onOpenPlantDetails={openPlantDetails} lightTheme={lightTheme}/><RightRail alarms={visibleAlarms} events={visibleEvents} plants={visibleWeatherPlants} siteWeather={siteWeather} weatherUpdatedAt={weatherUpdatedAt} onOpenLogs={() => selectView('Operations')}/></div><Bottom key={scope?.id || scope?.type || 'all-sites'} scopeKey={scope?.id || scope?.type || 'all-sites'} plants={visiblePlants} currentGeneration={realtimeKpis.currentGeneration} todayGeneration={realtimeKpis.todayGeneration}/><Footer /></>}
    </main>
  </Box>
}

export default function App() { return <SimulationDataProvider><CssBaseline/><DashboardView/></SimulationDataProvider> }
