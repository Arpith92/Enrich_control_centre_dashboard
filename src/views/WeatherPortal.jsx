import { useCallback, useMemo, useState } from 'react'
import ReactECharts from 'echarts-for-react'
import {
  Air, ArrowBack, CloudOutlined, Compress, DeviceThermostat, History,
  Refresh, Speed, WaterDrop, WbSunny,
} from '@mui/icons-material'
import useAutoRefresh from '../hooks/useAutoRefresh'

const localDate = (date = new Date()) => {
  const offset = date.getTimezoneOffset() * 60000
  return new Date(date.getTime() - offset).toISOString().slice(0, 10)
}
const shiftDays = (days) => {
  const date = new Date()
  date.setDate(date.getDate() + days)
  return localDate(date)
}
const number = (value, digits = 1) => value == null ? '—' : Number(value).toFixed(digits)
const weatherLabel = (code) => {
  if ([95, 96, 99].includes(code)) return 'Thunderstorm'
  if ([51, 53, 55, 61, 63, 65, 80, 81, 82].includes(code)) return 'Rain'
  if ([45, 48].includes(code)) return 'Fog'
  if (code === 3) return 'Overcast'
  if ([1, 2].includes(code)) return 'Partly cloudy'
  if (code === 0) return 'Clear sky'
  return 'Variable weather'
}
const displayTime = (value) => value ? new Date(value).toLocaleString('en-IN', {
  day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false,
}) : '—'

const METRICS = {
  temperature_2m: { label: 'Temperature', unit: '°C', color: '#ffb347' },
  relative_humidity_2m: { label: 'Relative humidity', unit: '%', color: '#45c8ff' },
  precipitation: { label: 'Precipitation', unit: 'mm', color: '#5b91ff' },
  wind_speed_10m: { label: 'Wind speed', unit: 'km/h', color: '#64e6c3' },
  surface_pressure: { label: 'Surface pressure', unit: 'hPa', color: '#c38cff' },
  global_tilted_irradiance: { label: 'GTI', unit: 'W/m²', color: '#ffe25b' },
}

const hourlyRows = (hourly = {}) => (hourly.time || []).map((time, index) => {
  const row = { time }
  Object.keys(hourly).forEach((key) => { if (key !== 'time') row[key] = hourly[key]?.[index] })
  return row
})

export default function WeatherPortal({ plants, liveWeather, onBack }) {
  const today = localDate()
  const [selectedId, setSelectedId] = useState(plants[0]?.id || '')
  const [mode, setMode] = useState('forecast')
  const [fromDate, setFromDate] = useState(shiftDays(-6))
  const [toDate, setToDate] = useState(today)
  const [historyCriteria, setHistoryCriteria] = useState({ from: shiftDays(-6), to: today })
  const [metric, setMetric] = useState('temperature_2m')
  const [payload, setPayload] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const plant = plants.find((item) => item.id === selectedId) || plants[0]

  const load = useCallback(async () => {
    if (!plant) return
    setLoading(true)
    setError('')
    const params = new URLSearchParams({ lat: plant.lat, lon: plant.lon })
    if (mode === 'history') {
      params.set('start_date', historyCriteria.from)
      params.set('end_date', historyCriteria.to)
    }
    try {
      const response = await fetch(`/api/weather/${mode === 'history' ? 'history' : 'forecast'}?${params}`, { cache: 'no-store' })
      if (!response.ok) {
        const detail = await response.json().catch(() => ({}))
        throw new Error(detail.detail || `Weather API returned ${response.status}`)
      }
      setPayload(await response.json())
    } catch (requestError) {
      setError(requestError.message || 'Weather data unavailable')
      setPayload(null)
    } finally {
      setLoading(false)
    }
  }, [plant, mode, historyCriteria])

  useAutoRefresh(load, mode === 'forecast' ? 60000 : 300000)

  const rows = useMemo(() => hourlyRows(payload?.hourly), [payload])
  const visibleRows = useMemo(() => mode === 'forecast'
    ? rows.filter((row) => !payload?.current?.time || row.time >= payload.current.time.slice(0, 13)).slice(0, 72)
    : rows, [rows, mode, payload])
  const current = payload?.current || liveWeather?.[plant?.id] || {}
  const dailyRows = useMemo(() => {
    const daily = payload?.daily || {}
    return (daily.time || []).map((time, index) => ({
      time, code: daily.weather_code?.[index], max: daily.temperature_2m_max?.[index],
      min: daily.temperature_2m_min?.[index], precipitation: daily.precipitation_sum?.[index],
      probability: daily.precipitation_probability_max?.[index], wind: daily.wind_speed_10m_max?.[index],
      radiation: daily.shortwave_radiation_sum?.[index], sunrise: daily.sunrise?.[index], sunset: daily.sunset?.[index],
    }))
  }, [payload])
  const summary = useMemo(() => {
    const valid = (key) => rows.map((row) => Number(row[key])).filter(Number.isFinite)
    const avg = (values) => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null
    const max = (values) => values.length ? Math.max(...values) : null
    const sum = (values) => values.reduce((total, value) => total + value, 0)
    return {
      temperature: avg(valid('temperature_2m')), humidity: avg(valid('relative_humidity_2m')),
      wind: max(valid('wind_speed_10m')), precipitation: sum(valid('precipitation')),
      gti: max(valid('global_tilted_irradiance')), pressure: avg(valid('surface_pressure')),
    }
  }, [rows])

  const chartMetric = METRICS[metric]
  const chartRows = visibleRows.length > 744 ? visibleRows.filter((_, index) => index % Math.ceil(visibleRows.length / 744) === 0) : visibleRows
  const chartOption = {
    backgroundColor: 'transparent',
    tooltip: { trigger: 'axis', backgroundColor: '#06182a', borderColor: '#1d6087', textStyle: { color: '#e8f5ff', fontSize: 10 } },
    grid: { left: 48, right: 20, top: 25, bottom: 42 },
    xAxis: { type: 'category', data: chartRows.map((row) => displayTime(row.time)), axisLabel: { color: '#7892a8', fontSize: 8 }, axisLine: { lineStyle: { color: '#17415d' } } },
    yAxis: { type: 'value', name: chartMetric.unit, nameTextStyle: { color: '#7892a8' }, axisLabel: { color: '#7892a8', fontSize: 8 }, splitLine: { lineStyle: { color: '#102f45' } } },
    dataZoom: [{ type: 'inside' }, { type: 'slider', height: 14, bottom: 5, borderColor: '#17415d', fillerColor: 'rgba(56,186,255,.16)', textStyle: { color: '#7892a8' } }],
    series: [{ name: chartMetric.label, type: 'line', smooth: true, showSymbol: false, sampling: 'lttb', data: chartRows.map((row) => row[metric]), lineStyle: { color: chartMetric.color, width: 2 }, areaStyle: { color: `${chartMetric.color}22` } }],
  }

  const applyHistory = (event) => {
    event.preventDefault()
    if (fromDate > toDate) return setError('From date must be before or equal to To date')
    const days = (new Date(toDate) - new Date(fromDate)) / 86400000
    if (days > 366) return setError('Select a historical range of 366 days or less')
    setHistoryCriteria({ from: fromDate, to: toDate })
  }

  return <section className="weather-portal">
    <div className="weather-portal-title">
      <button onClick={onBack}><ArrowBack /> Control Centre</button>
      <div><span>SITE WEATHER INTELLIGENCE</span><h1>Weather Portal</h1><p>Live conditions, seven-day forecast and historical plant weather</p></div>
      <button onClick={load}><Refresh className={loading ? 'spin' : ''} /> Refresh</button>
    </div>

    <div className="weather-toolbar">
      <label>Location<select value={selectedId} onChange={(event) => setSelectedId(event.target.value)}>{plants.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.state}</option>)}</select></label>
      <div className="weather-mode"><button className={mode === 'forecast' ? 'active' : ''} onClick={() => setMode('forecast')}><WbSunny /> Forecast</button><button className={mode === 'history' ? 'active' : ''} onClick={() => setMode('history')}><History /> Historical</button></div>
      {mode === 'history' && <form onSubmit={applyHistory}><label>From<input type="date" value={fromDate} max={today} onChange={(event) => setFromDate(event.target.value)} /></label><label>To<input type="date" value={toDate} min={fromDate} max={today} onChange={(event) => setToDate(event.target.value)} /></label><button type="submit">Apply dates</button></form>}
      <div className="weather-location"><b>{plant?.name}</b><span>{plant?.lat.toFixed(4)}°, {plant?.lon.toFixed(4)}° · {plant?.state}</span></div>
    </div>

    {error && <div className="weather-error"><CloudOutlined /> {error}</div>}
    {loading && !payload && <div className="weather-loading"><Refresh className="spin" /> Loading weather data…</div>}

    {mode === 'forecast' ? <>
      <div className="weather-current-grid">
        <article className="weather-current-hero"><WbSunny /><div><span>Current condition</span><b>{number(current.temperature_2m)}°C</b><strong>{weatherLabel(Number(current.weather_code))}</strong><small>Feels like {number(current.apparent_temperature)}°C · Updated {displayTime(current.time)}</small></div></article>
        <article><WaterDrop /><span>Humidity</span><b>{number(current.relative_humidity_2m, 0)}%</b></article>
        <article><Air /><span>Wind / Gust</span><b>{number(current.wind_speed_10m)} <small>km/h</small></b><em>Gust {number(current.wind_gusts_10m)} km/h</em></article>
        <article><CloudOutlined /><span>Rain / Precipitation</span><b>{number(current.precipitation, 2)} <small>mm</small></b><em>Cloud {number(current.cloud_cover, 0)}%</em></article>
        <article><Compress /><span>Surface pressure</span><b>{number(current.surface_pressure)} <small>hPa</small></b></article>
        <article><WbSunny /><span>GTI</span><b>{number(current.global_tilted_irradiance, 0)} <small>W/m²</small></b></article>
      </div>
      <div className="weather-daily"><h2>7-day forecast</h2><div>{dailyRows.map((day) => <article key={day.time}><span>{new Date(`${day.time}T00:00`).toLocaleDateString('en-IN', { weekday: 'short', day: '2-digit', month: 'short' })}</span><WbSunny /><b>{number(day.max, 0)}° <small>/ {number(day.min, 0)}°</small></b><em>{weatherLabel(Number(day.code))}</em><p><WaterDrop /> {number(day.precipitation, 1)} mm · {number(day.probability, 0)}%</p><p><Air /> {number(day.wind, 0)} km/h</p></article>)}</div></div>
    </> : <div className="weather-history-summary">
      <article><DeviceThermostat /><span>Average temperature</span><b>{number(summary.temperature)}°C</b></article>
      <article><WaterDrop /><span>Average humidity</span><b>{number(summary.humidity)}%</b></article>
      <article><Air /><span>Maximum wind</span><b>{number(summary.wind)} <small>km/h</small></b></article>
      <article><CloudOutlined /><span>Total precipitation</span><b>{number(summary.precipitation, 2)} <small>mm</small></b></article>
      <article><WbSunny /><span>Peak GTI</span><b>{number(summary.gti, 0)} <small>W/m²</small></b></article>
      <article><Speed /><span>Average pressure</span><b>{number(summary.pressure)} <small>hPa</small></b></article>
    </div>}

    {payload && <>
      <div className="weather-chart-panel"><div className="weather-chart-head"><div><span>{mode === 'forecast' ? 'HOURLY FORECAST' : 'HISTORICAL TREND'}</span><h2>{chartMetric.label}</h2></div><div>{Object.entries(METRICS).map(([key, item]) => <button key={key} className={metric === key ? 'active' : ''} onClick={() => setMetric(key)}>{item.label}</button>)}</div></div><ReactECharts option={chartOption} style={{ height: 315 }} /></div>
      <div className="weather-data-panel"><div><h2>{mode === 'forecast' ? 'Next 72 hours' : 'Historical hourly records'}</h2><span>{visibleRows.length.toLocaleString('en-IN')} records · All times Asia/Kolkata</span></div><div className="weather-table-scroll"><table><thead><tr><th>Time</th><th>Condition</th><th>Temp</th><th>Feels</th><th>RH</th><th>Precip.</th><th>Rain</th><th>Cloud</th><th>Pressure</th><th>Wind</th><th>Direction</th><th>Gust</th><th>GHI</th><th>DNI</th><th>DHI</th><th>GTI</th></tr></thead><tbody>{visibleRows.map((row) => <tr key={row.time}><td>{displayTime(row.time)}</td><td>{weatherLabel(Number(row.weather_code))}</td><td>{number(row.temperature_2m)}°C</td><td>{number(row.apparent_temperature)}°C</td><td>{number(row.relative_humidity_2m, 0)}%</td><td>{number(row.precipitation, 2)} mm</td><td>{number(row.rain, 2)} mm</td><td>{number(row.cloud_cover, 0)}%</td><td>{number(row.surface_pressure)} hPa</td><td>{number(row.wind_speed_10m)} km/h</td><td>{number(row.wind_direction_10m, 0)}°</td><td>{number(row.wind_gusts_10m)} km/h</td><td>{number(row.shortwave_radiation, 0)}</td><td>{number(row.direct_radiation, 0)}</td><td>{number(row.diffuse_radiation, 0)}</td><td><b>{number(row.global_tilted_irradiance, 0)}</b></td></tr>)}</tbody></table></div></div>
      <p className="weather-attribution">Weather model data: Open-Meteo Forecast and Historical Weather APIs. Historical values are gridded reanalysis/model data for the selected plant coordinates.</p>
    </>}
  </section>
}
