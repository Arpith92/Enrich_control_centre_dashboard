import { useEffect, useMemo, useRef, useState } from 'react'
import { SLDC_DISPLAY_NAMES } from './useSldcData'

const timeOf = (value) => {
  if (!value) return '—'
  const date = value instanceof Date ? value : value?.toDate ? value.toDate() : new Date(String(value).replace(' ', 'T'))
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true })
}

const timestampOf = (value) => {
  if (!value) return null
  if (value instanceof Date) return value.toISOString()
  if (value?.format) return value.format('YYYY-MM-DDTHH:mm:ss')
  return String(value).replace(' ', 'T')
}

const minutesSince = (value) => {
  if (!value) return Infinity
  const date = value instanceof Date ? value : value?.toDate ? value.toDate() : new Date(String(value).replace(' ', 'T'))
  return (Date.now() - date.getTime()) / 60000
}

const durationLabel = (minutes) => {
  const total = Math.max(0, Math.floor(Number(minutes) || 0))
  const hours = Math.floor(total / 60)
  const remainder = total % 60
  return hours ? `${hours}h ${remainder}m` : `${remainder} min`
}

const minutesBetween = (start, end) => {
  const first = new Date(String(start).replace(' ', 'T'))
  const last = new Date(String(end).replace(' ', 'T'))
  return Number.isNaN(first.getTime()) || Number.isNaN(last.getTime())
    ? 0 : Math.max(0, Math.floor((last - first) / 60000))
}

const weatherAlarm = (plant, weather) => {
  const rain = Number(weather?.precipitation_mm ?? weather?.precipitation ?? weather?.rain ?? 0)
  const wind = Number(weather?.wind_speed_10m ?? 0)
  const temperature = Number(weather?.temperature_2m ?? 0)
  const code = Number(weather?.weather_code)
  if ([95, 96, 99].includes(code)) return { alarm: 'Thunderstorm detected', severity: 'High', detail: `Weather code ${code}` }
  if (wind >= 40) return { alarm: 'High wind speed', severity: 'High', detail: `${wind.toFixed(1)} km/h wind` }
  if (rain >= 10) return { alarm: 'Heavy precipitation', severity: 'High', detail: `${rain.toFixed(1)} mm precipitation` }
  if (temperature >= 45) return { alarm: 'High site temperature', severity: 'High', detail: `${temperature.toFixed(1)}°C` }
  if (wind >= 30) return { alarm: 'Wind advisory', severity: 'Medium', detail: `${wind.toFixed(1)} km/h wind` }
  if (rain >= 2.5) return { alarm: 'Rainfall advisory', severity: 'Medium', detail: `${rain.toFixed(1)} mm precipitation` }
  if (temperature >= 40) return { alarm: 'Temperature advisory', severity: 'Medium', detail: `${temperature.toFixed(1)}°C` }
  return null
}

export default function useOperationalFeed({ sldc, plants, siteWeather, weatherUpdatedAt, bhokarRealtime }) {
  const [transitionEvents, setTransitionEvents] = useState([])
  const previousAlarms = useRef(null)

  const alarms = useMemo(() => {
    const active = []
    sldc.sites.forEach((site) => {
      const name = SLDC_DISPLAY_NAMES[site.Plant] || site.Plant
      if (!sldc.isCommunicating(site)) {
        if (!sldc.incidentsReady) return
        const incident = sldc.activeIncidents?.find((row) => row.Plant === site.Plant)
        const startedAt = incident?.StartTime || site.Timestamp
        const durationMinutes = incident?.DurationMinutes ?? minutesSince(startedAt)
        const baseAlarm = incident?.Issue || site.DashboardStatus || 'Communication failure'
        active.push({ id: `sldc-com-${site.Plant}`, time: timeOf(startedAt), timestamp: timestampOf(startedAt), startedAt: timestampOf(startedAt), durationMinutes, plant: name, baseAlarm, alarm: `${baseAlarm} · Active ${durationLabel(durationMinutes)}`, severity: 'High', source: 'MH SLDC' })
      } else if (site.MW == null) {
        active.push({ id: `sldc-data-${site.Plant}`, time: timeOf(site.Timestamp), timestamp: timestampOf(site.Timestamp), plant: name, alarm: 'Live MW unavailable', severity: 'High', source: 'MH SLDC' })
      }
    })

    if (sldc.latestTimestamp && minutesSince(sldc.latestTimestamp) > 30) {
      active.push({ id: 'sldc-stale', time: timeOf(sldc.latestTimestamp), timestamp: timestampOf(sldc.latestTimestamp), plant: 'MH SLDC', alarm: 'Source update delayed', severity: 'High', source: 'MH SLDC' })
    }

    plants.forEach((plant) => {
      const weather = siteWeather[plant.id]
      const condition = weather && weatherAlarm(plant, weather)
      if (condition) active.push({ id: `weather-${plant.id}-${condition.alarm}`, time: timeOf(weather.source_time || weatherUpdatedAt), timestamp: timestampOf(weather.source_time || weatherUpdatedAt), plant: plant.name, alarm: condition.alarm, severity: condition.severity, detail: condition.detail, source: 'Live weather' })
    })

    if (weatherUpdatedAt && minutesSince(weatherUpdatedAt) > 3) {
      active.push({ id: 'weather-stale', time: timeOf(weatherUpdatedAt), timestamp: timestampOf(weatherUpdatedAt), plant: 'Site Weather', alarm: 'Weather feed update delayed', severity: 'Medium', source: 'Open-Meteo' })
    }
    return active.sort((a, b) => (a.severity === 'High' ? -1 : 1) - (b.severity === 'High' ? -1 : 1))
  }, [sldc, plants, siteWeather, weatherUpdatedAt])

  useEffect(() => {
    if (sldc.loading) return
    const nextAlarms = new Map(alarms.map((alarm) => [alarm.id, alarm]))
    if (previousAlarms.current) {
      const eventDate = new Date()
      const timestamp = timestampOf(eventDate)
      const raised = alarms.filter((alarm) => !previousAlarms.current.has(alarm.id)).map((alarm) => ({ id: `raised-${alarm.id}-${Date.now()}`, time: timeOf(alarm.startedAt || timestamp), timestamp: alarm.startedAt || timestamp, plant: alarm.plant, detail: `${alarm.baseAlarm || alarm.alarm} · Incident started`, severity: 'critical', source: alarm.source }))
      const cleared = [...previousAlarms.current.values()].filter((alarm) => !nextAlarms.has(alarm.id)).map((alarm) => {
        const site = sldc.sites.find((row) => (SLDC_DISPLAY_NAMES[row.Plant] || row.Plant) === alarm.plant)
        const restoredAt = timestampOf(site?.Timestamp) || timestamp
        const duration = alarm.startedAt ? minutesBetween(alarm.startedAt, restoredAt) : 0
        return { id: `clear-${alarm.id}-${Date.now()}`, time: timeOf(restoredAt), timestamp: restoredAt, plant: alarm.plant, detail: alarm.startedAt ? `${alarm.baseAlarm || alarm.alarm} restored · ${timeOf(alarm.startedAt)}–${timeOf(restoredAt)} · Downtime ${durationLabel(duration)}` : `${alarm.alarm} cleared`, severity: 'normal', source: alarm.source }
      })
      if (raised.length || cleared.length) setTransitionEvents((previous) => [...raised, ...cleared, ...previous].slice(0, 10))
    }
    previousAlarms.current = nextAlarms
  }, [alarms, sldc.loading, sldc.sites])

  const events = useMemo(() => {
    const sourceTime = sldc.latestTimestamp
    const bhokarSite = plants.find((plant) => plant.name === 'Bhokar')
    const bhokarGti = Number(siteWeather[bhokarSite?.id]?.gti_w_m2 ?? 0)
    const bhokarInverterRows = (bhokarRealtime?.plants || []).flatMap((plant) => {
      const plantGti = Number(plant.parameters?.GTI ?? plant.parameters?.gti ?? bhokarGti)
      if (!(plantGti > 0)) return []
      return (plant.inverters || [])
        .filter((inverter) => {
          const activePower = inverter.activePowerRaw ?? inverter.activePowerMw
          return activePower != null && Number(activePower) === 0
        })
        .map((inverter) => ({
          id: `bhokar-${plant.collection}-inv-${inverter.inverter}-zero`,
          time: timeOf(plant.timestamp || bhokarRealtime?.timestamp),
          timestamp: timestampOf(plant.timestamp || bhokarRealtime?.timestamp),
          plant: plant.name,
          detail: `${plant.name} Inverter_${inverter.inverter} comm issue`,
          severity: 'critical',
          source: 'Bhokar SCADA',
        }))
    })
    const weatherRows = plants.filter((plant) => siteWeather[plant.id]).map((plant) => {
      const weather = siteWeather[plant.id]
      const rain = Number(weather.precipitation_mm ?? weather.precipitation ?? weather.rain ?? 0)
      return {
        id: `weather-event-${plant.id}`,
        time: timeOf(weather.source_time || weatherUpdatedAt),
        timestamp: timestampOf(weather.source_time || weatherUpdatedAt),
        plant: plant.name,
        detail: `${Number(weather.temperature_2m).toFixed(1)}°C · Wind ${Number(weather.wind_speed_10m).toFixed(1)} km/h · Rain ${rain.toFixed(1)} mm`,
        severity: weatherAlarm(plant, weather) ? 'warning' : 'info',
        source: 'Open-Meteo',
      }
    })
    const sldcRows = [...sldc.sites].filter(sldc.isCommunicating).sort((a, b) => Number(b.MW || 0) - Number(a.MW || 0)).slice(0, 2).map((site) => ({
      id: `sldc-event-${site.Plant}`,
      time: timeOf(site.Timestamp),
      timestamp: timestampOf(site.Timestamp),
      plant: SLDC_DISPLAY_NAMES[site.Plant] || site.Plant,
      detail: `${site.MW == null ? 'No MW value' : `${Number(site.MW).toFixed(1)} MW received`} · ${site.Status || site.DashboardStatus}`,
      severity: sldc.isCommunicating(site) ? 'normal' : 'critical',
      source: 'MH SLDC',
    }))
    const summaries = [
      { id: 'sldc-summary', time: timeOf(sourceTime), timestamp: timestampOf(sourceTime), plant: 'MH SLDC', detail: `${sldc.onlineSites.length}/${sldc.sites.length} sites communicating · ${sldc.totalGeneration.toFixed(1)} MW`, severity: sldc.offlineSites.length ? 'critical' : 'normal', source: 'MH SLDC' },
      { id: 'weather-summary', time: timeOf(weatherUpdatedAt), timestamp: timestampOf(weatherUpdatedAt), plant: 'Site Weather', detail: `${Object.keys(siteWeather).length}/${plants.length} locations synced · Open-Meteo live feed`, severity: Object.keys(siteWeather).length ? 'info' : 'warning', source: 'Open-Meteo' },
    ]
    const activeIncidents = alarms.filter((alarm) => alarm.source === 'MH SLDC' && alarm.startedAt).map((alarm) => ({
      id: `active-${alarm.id}`, time: timeOf(alarm.startedAt), timestamp: alarm.startedAt,
      plant: alarm.plant, detail: `${alarm.baseAlarm} active since ${timeOf(alarm.startedAt)} · ${durationLabel(alarm.durationMinutes)}`,
      severity: 'critical', source: 'MH SLDC', transient: true,
    }))
    return [...bhokarInverterRows, ...transitionEvents, ...activeIncidents, ...summaries, ...weatherRows.slice(0, 2), ...sldcRows].slice(0, 6)
  }, [transitionEvents, alarms, sldc, plants, siteWeather, weatherUpdatedAt, bhokarRealtime])

  useEffect(() => {
    if (sldc.loading) return
    const entries = [
      ...alarms.map((alarm) => ({ event_type: 'alarm', plant: alarm.plant, message: `${alarm.baseAlarm || alarm.alarm}${alarm.detail ? ` · ${alarm.detail}` : ''}`, severity: alarm.severity, source: alarm.source, timestamp: alarm.timestamp })),
      ...events.filter((event) => !event.transient).map((event) => ({ event_type: 'event', plant: event.plant, message: event.detail, severity: event.severity, source: event.source || 'Operations', timestamp: event.timestamp })),
    ].filter((entry) => entry.timestamp)
    if (!entries.length) return
    fetch('/api/operations/feed', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ entries }),
    }).catch((error) => console.warn('Operational feed persistence unavailable.', error))
  }, [alarms, events, sldc.loading])

  return { alarms, events }
}
