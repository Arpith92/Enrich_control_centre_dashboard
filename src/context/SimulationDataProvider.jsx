import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import dayjs from 'dayjs'
import {
  createEventFeed,
  createTrendData,
  generateInitialPlants,
  simulatePlantTelemetry,
} from '../utils/SolarSimulation'
import useAutoRefresh from '../hooks/useAutoRefresh'

const SimulationContext = createContext(null)

export const SimulationDataProvider = ({ children }) => {
  const [plants, setPlants] = useState(() => generateInitialPlants())
  const [events, setEvents] = useState([])
  const [clock, setClock] = useState(dayjs())
  const [bootTime] = useState(dayjs().subtract(7, 'hour').subtract(22, 'minute'))
  const [history, setHistory] = useState([])
  const [siteWeather, setSiteWeather] = useState({})
  const [weatherUpdatedAt, setWeatherUpdatedAt] = useState(null)
  const weatherRef = useRef({})
  const scadaRef = useRef({})

  const applyRealtime = useCallback((plant) => {
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
          simulatePlantTelemetry(plant, now, plant, weatherRef.current[plant.id]),
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

  const loadWeather = useCallback(async () => {
      try {
        const latitudes = plants.map((plant) => plant.lat).join(',')
        const longitudes = plants.map((plant) => plant.lon).join(',')
        const current = [
          'temperature_2m', 'relative_humidity_2m', 'precipitation', 'rain', 'showers',
          'weather_code', 'surface_pressure', 'wind_speed_10m', 'shortwave_radiation',
          'global_tilted_irradiance',
        ].join(',')
        const response = await fetch(
          `https://api.open-meteo.com/v1/forecast?latitude=${latitudes}&longitude=${longitudes}&current=${current}&hourly=global_tilted_irradiance&forecast_days=1&timezone=Asia%2FKolkata`,
          { cache: 'no-store' },
        )
        if (!response.ok) throw new Error(`Weather API ${response.status}`)
        const payload = await response.json()
        const locations = Array.isArray(payload) ? payload : [payload]
        const nextWeather = {}
        plants.forEach((plant, index) => {
          const location = locations[index]
          if (location?.current) {
            const currentHour = location.current.time?.slice(0, 13)
            const hourlyTimes = location.hourly?.time || []
            let lastHourIndex = -1
            for (let hourIndex = 0; hourIndex < hourlyTimes.length; hourIndex += 1) {
              if (hourlyTimes[hourIndex].slice(0, 13) <= currentHour) lastHourIndex = hourIndex
            }
            const dailyGti = lastHourIndex >= 0
              ? location.hourly.global_tilted_irradiance.slice(0, lastHourIndex + 1).reduce((sum, value) => sum + (Number(value) || 0), 0) / 1000
              : 0
            const currentWeather = location.current
            const precipitation = Number(currentWeather.precipitation)
            const rain = Number(currentWeather.rain)
            const showers = Number(currentWeather.showers)
            const precipitationMm = Number.isFinite(precipitation)
              ? precipitation
              : Math.max(Number.isFinite(rain) ? rain : 0, Number.isFinite(showers) ? showers : 0)

            nextWeather[plant.id] = {
              ...currentWeather,
              precipitation_mm: Number(precipitationMm.toFixed(2)),
              rain_mm: Number((Number.isFinite(rain) ? rain : 0).toFixed(2)),
              showers_mm: Number((Number.isFinite(showers) ? showers : 0).toFixed(2)),
              gti_kwh_m2: Number(dailyGti.toFixed(2)),
              source_name: 'Open-Meteo Forecast API',
              source_time: currentWeather.time,
              source_type: 'Live model current weather',
            }
          }
        })
        weatherRef.current = nextWeather
        setSiteWeather(nextWeather)
        setWeatherUpdatedAt(dayjs())
      } catch (error) {
        console.warn('Live site weather unavailable; retaining SCADA weather values.', error)
      }
  }, [plants])

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
    <SimulationContext.Provider value={{ plants, metrics, events, clock, bootTime, history, refreshData, siteWeather, weatherUpdatedAt }}>
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
