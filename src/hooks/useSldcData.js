import { useCallback, useMemo, useState } from 'react'
import useAutoRefresh from './useAutoRefresh'

export const SLDC_DISPLAY_NAMES = {
  'ENRICH KARASGI': 'Karajagi',
  'ENRICH MANDRUP': 'Mandrup',
  'ENRICH ENERGY LTD SOLAR PARK': 'Kumbhari',
  'ENRICH TULJAPUR': 'Tuljapur',
  'ENRICH ENERGY HIRADGAON': 'Umri',
  'ENRICH ENERGY BHOKAR': 'Bhokar Phase-1',
  'ENRICH SOLAR SERVICES (Narwat)': 'Bhokar Phase-2',
}

const EXPECTED_SITES = [
  ['ENRICH KARASGI', 47.75],
  ['ENRICH MANDRUP', 47.75],
  ['ENRICH ENERGY LTD SOLAR PARK', 25],
  ['ENRICH TULJAPUR', 100],
  ['ENRICH ENERGY HIRADGAON', 50],
  ['ENRICH ENERGY BHOKAR', 25],
  ['ENRICH SOLAR SERVICES (Narwat)', 25],
]

const emptySites = () => EXPECTED_SITES.map(([Plant, InstalledCapacity]) => ({
  Plant,
  InstalledCapacity,
  MW: null,
  FontColor: '#FF0000',
  Status: 'No Current Data',
  DashboardStatus: 'Waiting for live SLDC data',
  Timestamp: null,
}))

const isCommunicating = (site) => site?.FontColor?.toUpperCase() === '#008000'
const localIso = (date) => {
  const offset = date.getTimezoneOffset() * 60000
  return new Date(date.getTime() - offset).toISOString().slice(0, 19)
}

export default function useSldcData() {
  const [sites, setSites] = useState(emptySites)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [lastSync, setLastSync] = useState(null)
  const [todayAvailability, setTodayAvailability] = useState(null)
  const [activeIncidents, setActiveIncidents] = useState([])
  const [incidentsReady, setIncidentsReady] = useState(false)

  const refresh = useCallback(async () => {
    try {
      const response = await fetch('/api/sldc/live', { cache: 'no-store' })
      if (!response.ok) throw new Error(`SLDC API returned ${response.status}`)
      const raw = await response.json()
      const rows = Array.isArray(raw) ? raw : raw?.Plant ? [raw] : []
      const received = new Map(rows.map((row) => [row.Plant, row]))
      setSites(emptySites().map((site) => received.get(site.Plant) || site))
      setLastSync(new Date())
      setError('')
    } catch (requestError) {
      setError(requestError.message || 'SLDC API unavailable')
    } finally {
      setLoading(false)
    }
  }, [])

  const refreshAvailability = useCallback(async () => {
    const end = new Date()
    const start = new Date(end)
    start.setHours(0, 0, 0, 0)
    const params = new URLSearchParams({ start: localIso(start), end: localIso(end) })
    try {
      const response = await fetch(`/api/sldc/fleet-availability?${params}`, { cache: 'no-store' })
      if (!response.ok) throw new Error(`Availability API returned ${response.status}`)
      setTodayAvailability(await response.json())
    } catch {
      setTodayAvailability(null)
    }
  }, [])

  const refreshIncidents = useCallback(async () => {
    const end = new Date()
    const start = new Date(end)
    start.setHours(0, 0, 0, 0)
    const params = new URLSearchParams({ start: localIso(start), end: localIso(end) })
    try {
      const response = await fetch(`/api/sldc/incidents/active?${params}`, { cache: 'no-store' })
      if (!response.ok) throw new Error(`Incident API returned ${response.status}`)
      setActiveIncidents(await response.json())
    } catch {
      // Retain the last valid incident start during a transient API failure.
    } finally {
      setIncidentsReady(true)
    }
  }, [])

  useAutoRefresh(refresh, 5000)
  useAutoRefresh(refreshIncidents, 5000)
  useAutoRefresh(refreshAvailability, 30000)

  return useMemo(() => {
    const onlineSites = sites.filter(isCommunicating)
    // Keep negative telemetry visible at site level, but do not let reverse/noise
    // readings reduce the fleet's total injected generation.
    const totalGeneration = onlineSites.reduce((sum, site) => {
      const mw = Number(site.MW)
      return sum + (Number.isFinite(mw) ? Math.max(0, mw) : 0)
    }, 0)
    return {
      sites,
      onlineSites,
      offlineSites: sites.filter((site) => !isCommunicating(site)),
      totalGeneration,
      todayAvailability,
      activeIncidents,
      incidentsReady,
      totalCapacity: sites.reduce((sum, site) => sum + (Number(site.InstalledCapacity) || 0), 0),
      latestTimestamp: sites.map((site) => site.Timestamp).filter(Boolean).sort().at(-1) || null,
      loading,
      error,
      lastSync,
      refresh,
      isCommunicating,
    }
  }, [sites, loading, error, lastSync, refresh, todayAvailability, activeIncidents, incidentsReady])
}
