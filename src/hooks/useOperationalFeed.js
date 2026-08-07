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

const badCommunicationValue = (value) => {
  if (value == null || value === '') return true
  if (typeof value === 'boolean') return !value
  if (typeof value === 'number') return value === 0
  return /(?:lost|fail|fault|offline|disconnect|not\s*sync|invalid|low)/i.test(String(value))
}

const equipmentAlarms = (plant) => {
  const detected = Object.entries({ ...plant.rawTags, ...plant.parameters }).flatMap(([key, value]) => {
    const normalized = key.toLowerCase().replace(/[^a-z0-9]/g, '')
    if (normalized.includes('plc') && normalized.includes('comm') && badCommunicationValue(value)) return [{ code: 'plc', alarm: 'PLC Communication Lost', severity: 'High' }]
    if ((normalized.includes('ntp') || normalized.includes('timesync')) && badCommunicationValue(value)) return [{ code: 'ntp', alarm: 'NTP Time Sync Failed', severity: 'Medium' }]
    if (normalized.includes('ups') && normalized.includes('battery') && (badCommunicationValue(value) || (Number.isFinite(Number(value)) && Number(value) < 20))) return [{ code: 'ups', alarm: 'UPS Battery Low', severity: 'Medium' }]
    if (normalized.includes('meter') && normalized.includes('comm') && badCommunicationValue(value)) return [{ code: 'meter', alarm: 'Meter Communication Lost', severity: 'High' }]
    return []
  })
  return [...new Map(detected.map((alarm) => [alarm.code, alarm])).values()]
}

const severityRank = { Critical: 0, High: 1, Medium: 2, Low: 3 }

const transitionLabel = (alarm, restored = false) => {
  if (alarm.id.startsWith('scada-com-')) return restored ? 'Site Communication Restored' : 'Site Communication Lost'
  if (alarm.id.startsWith('scada-inverter-')) return restored ? 'Inverter Communication Restored' : 'Inverter Communication Lost'
  if (alarm.id.startsWith('sldc-')) return restored ? 'SLDC Communication Restored' : 'SLDC Communication Lost'
  return restored ? `${alarm.baseAlarm || alarm.alarm} cleared` : `${alarm.baseAlarm || alarm.alarm} · Incident started`
}

export default function useOperationalFeed({ sldc, plants, siteWeather, weatherUpdatedAt, siteRealtime = {} }) {
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
        active.push({ id: `sldc-com-${site.Plant}`, time: timeOf(startedAt), timestamp: timestampOf(startedAt), startedAt: timestampOf(startedAt), durationMinutes, plant: name, baseAlarm: 'SLDC Communication Lost', alarm: `SLDC Communication Lost · disconnected · Active ${durationLabel(durationMinutes)}`, severity: 'Critical', source: 'MH SLDC' })
      } else if (site.MW == null) {
        active.push({ id: `sldc-data-${site.Plant}`, time: timeOf(site.Timestamp), timestamp: timestampOf(site.Timestamp), plant: name, alarm: 'SLDC data not synchronized', severity: 'Critical', source: 'MH SLDC' })
      }
    })

    if (sldc.latestTimestamp && minutesSince(sldc.latestTimestamp) > 5) {
      active.push({ id: 'sldc-stale', time: timeOf(sldc.latestTimestamp), timestamp: timestampOf(sldc.latestTimestamp), plant: 'MH SLDC', alarm: 'SLDC data not synchronized · update delayed >5 min', severity: 'Critical', source: 'MH SLDC' })
    }

    plants.forEach((plant) => {
      const weather = siteWeather[plant.id]
      const condition = weather && weatherAlarm(plant, weather)
      if (condition) active.push({ id: `weather-${plant.id}-${condition.alarm}`, time: timeOf(weather.source_time || weatherUpdatedAt), timestamp: timestampOf(weather.source_time || weatherUpdatedAt), plant: plant.name, alarm: condition.alarm, severity: condition.severity, detail: condition.detail, source: 'Live weather' })
    })

    Object.entries(siteRealtime).forEach(([siteName, realtime]) => {
      ;(realtime?.plants || []).forEach((plant) => {
        const common = {
          time: timeOf(plant.timestamp || realtime.timestamp), timestamp: timestampOf(plant.timestamp || realtime.timestamp),
          plant: `${siteName} · ${plant.name}`, source: `${siteName} SCADA`,
        }
        if (plant.communicationIssue) active.push({
          ...common, id: `scada-com-${siteName}-${plant.collection}`,
          alarm: 'Site Communication Failure · No data >5 min', severity: 'Critical',
        })
        if (plant.dataStuck) active.push({
          ...common, id: `scada-stuck-${siteName}-${plant.collection}`,
          alarm: 'Real-time data stuck for 1 minute', severity: 'Medium',
        })
        ;(plant.inverterIssues || []).forEach((inverter) => active.push({
          ...common, id: `scada-inverter-${siteName}-${plant.collection}-${inverter}`,
          alarm: `${inverter} Communication Failure · No response >2 min`, severity: 'High',
        }))
        if (plant.zeroGenerationAlarm) active.push({
          ...common, id: `scada-zero-${siteName}-${plant.collection}`,
          alarm: 'Plant Offline · Entire plant generation = 0 during daylight', severity: 'Critical',
        })
        if (plant.lowGenerationAlarm) active.push({
          ...common, id: `scada-low-${siteName}-${plant.collection}`,
          alarm: `Low Generation · Below 80% expected (${Number(plant.currentMw || 0).toFixed(2)} / ${Number(plant.expectedMw || 0).toFixed(2)} MW)`, severity: 'Medium',
        })
        equipmentAlarms(plant).forEach((equipment) => active.push({
          ...common, id: `scada-${equipment.code}-${siteName}-${plant.collection}`,
          alarm: equipment.alarm, severity: equipment.severity,
        }))
      })
    })

    if (weatherUpdatedAt && minutesSince(weatherUpdatedAt) > 5) {
      active.push({ id: 'weather-stale', time: timeOf(weatherUpdatedAt), timestamp: timestampOf(weatherUpdatedAt), plant: 'Site Weather', alarm: 'Weather Station Offline · No update >5 min', severity: 'High', source: 'Open-Meteo' })
    }
    return active.sort((a, b) => (severityRank[a.severity] ?? 9) - (severityRank[b.severity] ?? 9))
  }, [sldc, plants, siteWeather, weatherUpdatedAt, siteRealtime])

  useEffect(() => {
    if (sldc.loading) return
    const nextAlarms = new Map(alarms.map((alarm) => [alarm.id, alarm]))
    if (previousAlarms.current) {
      const eventDate = new Date()
      const timestamp = timestampOf(eventDate)
      const raised = alarms.filter((alarm) => !previousAlarms.current.has(alarm.id)).map((alarm) => ({ id: `raised-${alarm.id}-${Date.now()}`, time: timeOf(alarm.startedAt || timestamp), timestamp: alarm.startedAt || timestamp, plant: alarm.plant, detail: transitionLabel(alarm), severity: alarm.severity === 'Medium' ? 'warning' : 'critical', source: alarm.source }))
      const cleared = [...previousAlarms.current.values()].filter((alarm) => !nextAlarms.has(alarm.id)).map((alarm) => {
        const site = sldc.sites.find((row) => (SLDC_DISPLAY_NAMES[row.Plant] || row.Plant) === alarm.plant)
        const restoredAt = timestampOf(site?.Timestamp) || timestamp
        const duration = alarm.startedAt ? minutesBetween(alarm.startedAt, restoredAt) : 0
        return { id: `clear-${alarm.id}-${Date.now()}`, time: timeOf(restoredAt), timestamp: restoredAt, plant: alarm.plant, detail: alarm.startedAt ? `${transitionLabel(alarm, true)} · ${timeOf(alarm.startedAt)}–${timeOf(restoredAt)} · Downtime ${durationLabel(duration)}` : transitionLabel(alarm, true), severity: 'normal', source: alarm.source }
      })
      if (raised.length || cleared.length) setTransitionEvents((previous) => [...raised, ...cleared, ...previous].slice(0, 10))
    }
    previousAlarms.current = nextAlarms
  }, [alarms, sldc.loading, sldc.sites])

  const events = useMemo(() => {
    const sourceTime = sldc.latestTimestamp
    const scadaInverterRows = Object.entries(siteRealtime).flatMap(([siteName, realtime]) => {
      const site = plants.find((plant) => plant.name === siteName)
      const siteGti = Number(siteWeather[site?.id]?.gti_w_m2 ?? 0)
      return (realtime?.plants || []).flatMap((plant) => {
        const plantGti = Number(plant.gti ?? plant.parameters?.GTI ?? plant.parameters?.gti ?? siteGti)
        const inverterRows = (plant.inverterIssues || []).map((inverter) => ({
          id: `${siteName}-${plant.collection}-inv-${inverter}-issue`,
          time: timeOf(plant.timestamp || realtime?.timestamp),
          timestamp: timestampOf(plant.timestamp || realtime?.timestamp),
          plant: `${siteName} · ${plant.name}`,
          detail: `${plant.name} · ${inverter} inactive / no communication · GTI ${plantGti.toFixed(0)} W/m²`,
          severity: 'critical', source: `${siteName} SCADA`,
        }))
        const statusRows = [
          ...(plant.inactiveInverters || []).filter((inverter) => !(plant.inverterIssues || []).includes(inverter)).map((inverter) => ({ id: `${siteName}-${plant.collection}-inv-${inverter}-inactive`, detail: `${plant.name} · ${inverter} currently inactive / no response`, severity: 'warning' })),
          ...(plant.dataStuck ? [{ id: `${siteName}-${plant.collection}-stuck`, detail: `${plant.name} real-time data stuck for 1 minute`, severity: 'warning' }] : []),
          ...(plant.communicationIssue ? [{ id: `${siteName}-${plant.collection}-communication`, detail: `${plant.name} ${plant.statusMessage}`, severity: 'critical' }] : []),
        ].map((row) => ({ ...row, time: timeOf(plant.timestamp || realtime?.timestamp), timestamp: timestampOf(plant.timestamp || realtime?.timestamp), plant: `${siteName} · ${plant.name}`, source: `${siteName} SCADA` }))
        return [...inverterRows, ...statusRows]
      })
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
    return [...scadaInverterRows, ...transitionEvents, ...activeIncidents, ...summaries, ...weatherRows.slice(0, 2), ...sldcRows].slice(0, 6)
  }, [transitionEvents, alarms, sldc, plants, siteWeather, weatherUpdatedAt, siteRealtime])

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
