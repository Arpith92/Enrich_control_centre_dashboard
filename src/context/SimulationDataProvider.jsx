import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import dayjs from 'dayjs'
import {
  createEventFeed,
  createTrendData,
  generateInitialPlants,
  simulatePlantTelemetry,
} from '../utils/SolarSimulation'
import useAutoRefresh from '../hooks/useAutoRefresh'
import { getConfiguredThirdPartyCustomers } from '../data/thirdPartySites'

const SimulationContext = createContext(null)
const DAILY_GTI_KEY = 'enrich-daily-gti-v1'
const indiaDate = (value = new Date()) => new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit',
}).format(value)
const readDailyGti = () => {
  try {
    const stored = JSON.parse(window.localStorage.getItem(DAILY_GTI_KEY)) || {}
    const today = indiaDate()
    return Object.fromEntries(Object.entries(stored).filter(([, reading]) => reading.date === today))
  } catch { return {} }
}

export const SimulationDataProvider = ({ children }) => {
  const [plants, setPlants] = useState(() => generateInitialPlants().map((plant) => plant.name === 'Bhokar'
    ? { ...plant, currentMw: 0, todayMwh: 0, telemetrySource: 'SCADA', communication: 'Pending' }
    : plant))
  const [events, setEvents] = useState([])
  const [clock, setClock] = useState(dayjs())
  const [bootTime] = useState(dayjs().subtract(7, 'hour').subtract(22, 'minute'))
  const [history, setHistory] = useState([])
  const [siteWeather, setSiteWeather] = useState({})
  const [weatherUpdatedAt, setWeatherUpdatedAt] = useState(null)
  const [bhokarRealtime, setBhokarRealtime] = useState(null)
  const [thirdPartyWeatherSites, setThirdPartyWeatherSites] = useState(() => getConfiguredThirdPartyCustomers().flatMap((customer) => customer.plants.map((plant) => ({ ...plant, name: plant.site, state: customer.name, thirdParty: true }))))
  const weatherRef = useRef({})
  const scadaRef = useRef({})
  const dailyGtiRef = useRef(readDailyGti())

  useEffect(() => {
    const resetAtDayBoundary = () => {
      const today = indiaDate()
      if (Object.values(dailyGtiRef.current).some((reading) => reading.date !== today)) {
        dailyGtiRef.current = {}
        window.localStorage.setItem(DAILY_GTI_KEY, '{}')
        weatherRef.current = Object.fromEntries(Object.entries(weatherRef.current).map(([id, reading]) => [id, { ...reading, gti_kwh_m2: 0 }]))
        setSiteWeather({ ...weatherRef.current })
      }
    }
    const timer = window.setInterval(resetAtDayBoundary, 30000)
    return () => window.clearInterval(timer)
  }, [])

  const applyRealtime = useCallback((plant) => {
    if (plant.name === 'Mundargi' || plant.name === 'NLC Poolangal') {
      return {
        ...plant,
        currentMw: 0,
        todayMwh: 0,
        telemetrySource: 'SCADA',
        communication: 'Failed',
        communicationIssue: true,
        inverterCount: 0,
        lastUpdated: `No data - ${plant.name === 'NLC Poolangal' ? 'server down' : 'SCADA server issue'}`,
      }
    }
    const live = scadaRef.current[plant.name.toLowerCase()]
    if (!live) return plant
    const feedExpired = Date.now() - Number(live.receivedAt || 0) > 180000
    if (!live.live || feedExpired || !Number.isFinite(Number(live.currentMw))) {
      return {
        ...plant,
        currentMw: 0,
        telemetrySource: 'SCADA',
        telemetrySampleType: '1-minute average',
        communication: 'Failed',
        communicationIssue: true,
        inverterCount: 0,
        lastUpdated: live.timestamp ? dayjs(live.timestamp).format('HH:mm:ss') : 'No current sample',
      }
    }
    return {
      ...plant,
      currentMw: Number(live.currentMw),
      cumulativeGenerationMWh: Number(live.cumulativeGenerationMWh),
      inverterCount: Number(live.inverterCount) || 0,
      telemetrySource: 'SCADA',
      telemetrySampleType: '1-minute average',
      communication: 'Healthy',
      communicationIssue: false,
      lastUpdated: live.timestamp ? dayjs(live.timestamp).format('HH:mm:ss') : dayjs().format('HH:mm:ss'),
    }
  }, [])

  useEffect(() => {
    const tick = () => {
      const now = dayjs()
      setClock(now)
      setPlants((prevPlants) => {
        const nextPlants = prevPlants.map((plant) => applyRealtime(
          plant.name === 'Bhokar' ? plant : simulatePlantTelemetry(plant, now, plant, weatherRef.current[plant.id]),
        ))
        const nextTrend = createTrendData(nextPlants, now)
        setHistory((prevHistory) => [...prevHistory.slice(-23), nextTrend])
        setEvents(createEventFeed(nextPlants, now))
        return nextPlants
      })
    }

    tick()
    const interval = window.setInterval(tick, 2000)
    return () => window.clearInterval(interval)
  }, [applyRealtime])

  const loadScada = useCallback(async () => {
    try {
      const response = await fetch('/api/scada/live', { cache: 'no-store' })
      if (!response.ok) throw new Error(`SCADA API ${response.status}`)
      const payload = await response.json()
      scadaRef.current = Object.fromEntries(
        (payload.sites || []).map((site) => [site.name.toLowerCase(), { ...site, receivedAt: Date.now() }]),
      )
      setPlants((current) => current.map(applyRealtime))
    } catch (error) {
      console.warn('Real-time SCADA unavailable; using simulation values.', error)
    }
  }, [applyRealtime])

  // Source collections contain one-minute averages; do not query them faster.
  useAutoRefresh(loadScada, 60000)

  const loadBhokarRealtime = useCallback(async () => {
    try {
      const response = await fetch('/api/scada/sites/Bhokar', { cache: 'no-store' })
      if (!response.ok) throw new Error(`Bhokar SCADA API ${response.status}`)
      const payload = await response.json()
      setBhokarRealtime(payload)
      const available = (payload.plants || []).filter((plant) => plant.available)
      setPlants((current) => current.map((plant) => plant.name !== 'Bhokar' ? plant : {
        ...plant,
        currentMw: Number(payload.currentMw) || 0,
        todayMwh: Number(payload.dailyGenerationMWh) || 0,
        cumulativeGenerationMWh: Number(payload.cumulativeGenerationMWh) || 0,
        telemetrySource: 'SCADA',
        telemetrySampleType: '1-second live collection',
        communication: available.length === 0 ? 'Failed' : available.length < (payload.plants || []).length ? 'Degraded' : 'Healthy',
        communicationIssue: available.length < (payload.plants || []).length,
        lastUpdated: payload.timestamp ? dayjs(payload.timestamp).format('HH:mm:ss') : 'No live sample',
      }))
    } catch (error) {
      console.warn('Bhokar plant-level SCADA unavailable; retaining the last live values.', error)
    }
  }, [])

  useAutoRefresh(loadBhokarRealtime, 1000)

  useEffect(() => {
    const refresh = () => setThirdPartyWeatherSites(getConfiguredThirdPartyCustomers().flatMap((customer) => customer.plants.map((plant) => ({ ...plant, name: plant.site, state: customer.name, thirdParty: true }))))
    window.addEventListener('third-party-sites-updated', refresh)
    return () => window.removeEventListener('third-party-sites-updated', refresh)
  }, [])

  const loadWeather = useCallback(async () => {
      try {
        const weatherSites = [...plants, ...thirdPartyWeatherSites]
        const current = [
          'temperature_2m', 'relative_humidity_2m', 'precipitation', 'rain', 'showers',
          'weather_code', 'wind_speed_10m', 'shortwave_radiation',
          'global_tilted_irradiance',
        ].join(',')
        const chunks = Array.from({ length: Math.ceil(weatherSites.length / 10) }, (_, index) => weatherSites.slice(index * 10, index * 10 + 10))
        const locations = (await Promise.all(chunks.map(async (chunk) => {
          try {
            const latitudes = chunk.map((plant) => plant.lat).join(',')
            const longitudes = chunk.map((plant) => plant.lon).join(',')
            const response = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${latitudes}&longitude=${longitudes}&current=${current}&hourly=global_tilted_irradiance&forecast_days=1&timezone=Asia%2FKolkata`, { cache: 'no-store' })
            if (!response.ok) throw new Error(`Weather API ${response.status}`)
            const payload = await response.json()
            return Array.isArray(payload) ? payload : [payload]
          } catch (error) {
            console.warn('Primary weather batch unavailable; using current-weather fallback.', error)
            return Promise.all(chunk.map(async (plant) => {
              try {
                const fallback = await fetch(`/api/weather/current?lat=${plant.lat}&lon=${plant.lon}`, { cache: 'no-store' })
                if (!fallback.ok) throw new Error(`Fallback weather API ${fallback.status}`)
                return fallback.json()
              } catch (fallbackError) {
                console.warn(`Weather unavailable for ${plant.name}; retaining its previous reading.`, fallbackError)
                return null
              }
            }))
          }
        }))).flat()
        const nextWeather = { ...weatherRef.current }
        weatherSites.forEach((plant, index) => {
          const location = locations[index]
          if (location?.current) {
            const currentDay = location.current.time?.slice(0, 10)
            const hourlyTimes = location.hourly?.time || []
            const currentWeather = location.current
            const dayIndexes = hourlyTimes.reduce((indexes, time, hourIndex) => {
              if (time.slice(0, 10) === currentDay) indexes.push(hourIndex)
              return indexes
            }, [])
            const providerDailyGti = dayIndexes.length
              ? dayIndexes.reduce((sum, hourIndex) => sum + (Number(location.hourly.global_tilted_irradiance?.[hourIndex]) || 0), 0) / 1000
              : Number.isFinite(Number(currentWeather.daily_gti_kwh_m2)) ? Number(currentWeather.daily_gti_kwh_m2) : null
            const precipitation = Number(currentWeather.precipitation)
            const rain = Number(currentWeather.rain)
            const showers = Number(currentWeather.showers)
            const precipitationMm = Number.isFinite(precipitation)
              ? precipitation
              : Math.max(Number.isFinite(rain) ? rain : 0, Number.isFinite(showers) ? showers : 0)

            const now = Date.now()
            const today = indiaDate()
            const previousDaily = dailyGtiRef.current[plant.id]
            let retainedDailyGti = previousDaily?.date === today ? Number(previousDaily.value) || 0 : 0
            if (providerDailyGti != null) retainedDailyGti = Math.max(retainedDailyGti, providerDailyGti)
            else if (previousDaily?.date === today && previousDaily.sampledAt) {
              const elapsedHours = Math.min((now - previousDaily.sampledAt) / 3600000, 10 / 60)
              retainedDailyGti += Math.max(0, Number(currentWeather.global_tilted_irradiance) || 0) * elapsedHours / 1000
            }
            dailyGtiRef.current[plant.id] = { date: today, value: retainedDailyGti, sampledAt: now }
            nextWeather[plant.id] = {
              ...currentWeather,
              precipitation_mm: Number(precipitationMm.toFixed(2)),
              rain_mm: Number((Number.isFinite(rain) ? rain : 0).toFixed(2)),
              showers_mm: Number((Number.isFinite(showers) ? showers : 0).toFixed(2)),
              gti_w_m2: Number((Number(currentWeather.global_tilted_irradiance) || 0).toFixed(0)),
              gti_kwh_m2: Number(retainedDailyGti.toFixed(2)),
              source_name: 'Open-Meteo Forecast API',
              source_time: currentWeather.time,
              source_type: 'Live model current weather',
            }
          }
        })
        weatherRef.current = nextWeather
        window.localStorage.setItem(DAILY_GTI_KEY, JSON.stringify(dailyGtiRef.current))
        setSiteWeather(nextWeather)
        setWeatherUpdatedAt(dayjs())
      } catch (error) {
        console.warn('Live site weather unavailable; retaining SCADA weather values.', error)
      }
  }, [plants, thirdPartyWeatherSites])

  useAutoRefresh(loadWeather, 60000)

  const metrics = useMemo(() => {
    const totalCapacity = plants.reduce((sum, plant) => sum + plant.capacity, 0)
    const currentGeneration = plants.reduce((sum, plant) => sum + plant.currentMw, 0)
    const todayGeneration = plants.reduce((sum, plant) => sum + plant.todayMwh, 0)
    const onlinePlants = plants.filter((plant) => plant.communication !== 'Failed').length
    const offlinePlants = plants.length - onlinePlants
    const averagePr = plants.reduce((sum, plant) => sum + plant.pr, 0) / plants.length
    const averageCuf = plants.reduce((sum, plant) => sum + plant.cuf, 0) / plants.length
    const averageAvailability = plants.reduce((sum, plant) => sum + plant.availability, 0) / plants.length
    const gridExport = plants.reduce((sum, plant) => sum + plant.currentMw * 0.98, 0)
    const revenue = (todayGeneration * 1000 * 4.2) / 10000000
    const co2Saved = todayGeneration * 0.82

    return {
      totalPlants: plants.length,
      totalCapacity,
      onlinePlants,
      offlinePlants,
      currentGeneration,
      todayGeneration,
      revenue,
      averagePr,
      averageCuf,
      averageAvailability,
      gridExport,
      co2Saved,
    }
  }, [plants])

  const refreshData = () => {
    const now = dayjs()
    setClock(now)
    loadScada()
    setPlants((prevPlants) => prevPlants.map((plant) => applyRealtime(simulatePlantTelemetry(plant, now, plant, weatherRef.current[plant.id]))))
    setEvents(createEventFeed(plants, now))
  }

  return (
    <SimulationContext.Provider value={{ plants, metrics, events, clock, bootTime, history, refreshData, siteWeather, weatherUpdatedAt, thirdPartyWeatherSites, bhokarRealtime }}>
      {children}
    </SimulationContext.Provider>
  )
}

export const useSimulationData = () => {
  const context = useContext(SimulationContext)
  if (!context) {
    throw new Error('useSimulationData must be used within SimulationDataProvider')
  }
  return context
}
