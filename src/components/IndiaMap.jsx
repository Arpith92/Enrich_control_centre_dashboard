import { useEffect, useRef, useState } from 'react'
import { Box, Paper, Typography } from '@mui/material'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { simulateThirdPartyCustomers } from '../data/thirdPartySites'
import indiaStates from '../data/indiaStates.dashboard.json'
import { ENABLE_EAST_THIRD_PARTY_CALLOUT_LAYOUT, ENABLE_NLC_BLOCK_DRILLDOWN } from '../config/featureFlags'

const statusOf = (plant) => {
  if (plant.siteCommunicationStatus === 'failed') return { label: 'Offline', color: '#ff4d62' }
  if (plant.siteCommunicationStatus === 'partial') return { label: 'Partial communication', color: '#ff9f32' }
  if (plant.siteCommunicationStatus === 'stuck') return { label: 'Data stuck', color: '#ffd23f' }
  if (plant.siteCommunicationStatus === 'healthy') return { label: 'Online', color: '#42ec61' }
  if (plant.communication === 'Failed' || plant.communicationIssue) return { label: 'Offline', color: '#ff4d62' }
  if (plant.communication === 'Pending' || plant.communication === 'Degraded') return { label: 'Communication issue', color: '#ff9f32' }
  if (plant.telemetrySource === 'SCADA') return { label: 'Online', color: '#42ec61' }
  if (plant.name === 'Mundargi') return { label: 'Offline', color: '#ff4057' }
  if (plant.communication === 'Failed') return { label: 'Offline', color: '#ff4d62' }
  return { label: 'Online', color: '#42ec61' }
}
const normalizedPlantName = (value = '') => value.toLowerCase().replace(/^[bu]\d+[_ -]*/, '').replace(/_live$/i, '').replace(/[^a-z0-9]/g, '')
const mappedLivePlant = (realtime, mappedPlant) => (realtime?.plants || []).find((plant) =>
  plant.collection === mappedPlant.collection
  || normalizedPlantName(plant.name) === normalizedPlantName(mappedPlant.plantName)
  || normalizedPlantName(plant.collection) === normalizedPlantName(mappedPlant.plantName))
const mappedPlantDisplayName = (siteName, mappedPlant) => ENABLE_NLC_BLOCK_DRILLDOWN && siteName === 'NLC Poolangal' ? 'NLC' : mappedPlant.plantName
const NLC_SITE = 'NLC Poolangal'
const BLOCK_DRILLDOWN_SITES = new Set([NLC_SITE, 'PGCIL'])
const NLC_BLOCK_INVERTER = /^Block\s+(\d+)\s+Inv\s+(\d+)$/i
const nlcBlocksFor = (livePlant) => Object.values((livePlant?.inverters || []).reduce((blocks, inverter) => {
  const match = String(inverter.inverter).match(NLC_BLOCK_INVERTER)
  if (!match) return blocks
  const number = Number(match[1])
  const block = blocks[number] ||= { number, inverters: [] }
  block.inverters.push({ ...inverter, inverterNumber: Number(match[2]) })
  return blocks
}, {})).sort((left, right) => left.number - right.number)

const OVERVIEW_CENTER = [21.7, 82.4]
const OVERVIEW_ZOOM = 4

const legacyCalloutPositions = {
  BEL1MW: [31.0, 68.8],
  PGCIL: [28.0, 68.8],
  Zaheerabad: [25.0, 68.8],
  Mandrup: [22.0, 68.8],
  Kumbhari: [19.0, 68.8],
  Karajagi: [16.0, 68.8],
  Tuljapur: [13.0, 68.8],
  Mundargi: [10.0, 68.8],
  BEL2MW: [31.0, 80.5],
  Umri: [22.0, 85.2],
  Bhokar: [18.5, 85.2],
  Turmamidi: [15.0, 85.2],
  'NLC Poolangal': [9.5, 84.0],
}

const westEnrichCalloutPositions = {
  // Exact column swap: these eight Enrich sites use the former third-party slots.
  BEL1MW: [34.0, 96], PGCIL: [30.5, 96], Zaheerabad: [27.0, 96], Mandrup: [23.5, 96],
  Kumbhari: [20.0, 96], Karajagi: [16.5, 96], Tuljapur: [13.0, 96], Mundargi: [9.5, 96],
  // All other Enrich callouts retain their original positions.
  BEL2MW: [31.0, 80.5], Umri: [22.0, 85.2], Bhokar: [18.5, 85.2], Turmamidi: [15.0, 85.2],
  'NLC Poolangal': [9.5, 84.0],
}
const calloutPositions = ENABLE_EAST_THIRD_PARTY_CALLOUT_LAYOUT ? westEnrichCalloutPositions : legacyCalloutPositions

const calloutIcon = (plant, status, selected = false) => L.divIcon({
  className: 'site-callout-shell',
  html: `<div class="site-callout ${status.className || (status.label === 'Offline' ? 'offline' : status.label === 'Partial communication' ? 'communication-issue' : status.label === 'Data stuck' ? 'data-stuck' : '')} ${selected ? 'selected' : ''}"><b>${plant.name}</b><span>${plant.currentMw.toFixed(2)} MW</span></div>`,
  iconSize: [104, 38],
  iconAnchor: calloutPositions[plant.name]?.[1] < plant.lon ? [104, 19] : [0, 19],
})

const plantIcon = (status, selected = false) => L.divIcon({
  className: 'plant-marker-shell',
  html: `<span class="plant-marker ${status.className || (status.label === 'Offline' ? 'offline' : status.label === 'Partial communication' ? 'communication-issue' : status.label === 'Data stuck' ? 'data-stuck' : 'online')} ${selected ? 'selected-site' : ''}"><i></i></span>`,
  iconSize: [24, 24],
  iconAnchor: [12, 12],
  tooltipAnchor: [0, -12],
})

const nlcBlockIcon = (block, selected = false, statusClass = 'online') => L.divIcon({
  className: 'nlc-block-marker-shell',
  html: `<span class="nlc-block-marker ${statusClass} ${selected ? 'selected' : ''}"><i>${block.number}</i></span>`,
  iconSize: [28, 28], iconAnchor: [14, 14], tooltipAnchor: [0, -14], popupAnchor: [0, -12],
})

const nlcInverterIcon = (inverter, statusClass = 'online') => L.divIcon({
  className: 'nlc-inverter-marker-shell',
  html: `<span class="nlc-inverter-marker ${statusClass}"><i>INV-${inverter.inverterNumber}</i></span>`,
  iconSize: [40, 24], iconAnchor: [20, 12], tooltipAnchor: [0, -12], popupAnchor: [0, -10],
})

const thirdPartyIcon = (customer) => L.divIcon({
  className: 'third-party-marker-shell',
  html: `<span class="plant-marker third-party-customer ${customer.commonInfra ? 'common-infra-customer' : ''} comm-${customer.communicationStatus} ${customer.selected ? 'selected' : ''}"><i>${customer.commonInfra ? 'CI' : customer.name.split(' ').map((word) => word[0]).join('').slice(0, 2)}</i><b>${customer.plants.length}</b></span>`,
  iconSize: [24, 24],
  iconAnchor: [12, 12],
  popupAnchor: [0, -18],
})

const legacyThirdPartyCalloutPositions = {
  torrent: [34.0, 96],
  'jsw-renewable': [30.5, 96],
  'regency-ispat': [27.0, 96],
  atnu: [23.5, 96],
  reliance: [20.0, 96],
  'hero-future': [16.5, 96],
  'common-infra-tuljapur': [13.0, 96],
  'common-infra-mandrup': [9.5, 96],
}


const eastThirdPartyCalloutPositions = {
  // Exact column swap: third-party cards use the former BEL1MW -> Mundargi slots.
  torrent: [34.0, 68.8], 'jsw-renewable': [30.5, 68.8], 'regency-ispat': [27.0, 68.8],
  atnu: [23.5, 68.8], reliance: [20.0, 68.8], 'hero-future': [16.5, 68.8],
  'common-infra-tuljapur': [13.0, 68.8], 'common-infra-mandrup': [9.5, 68.8],
}
const thirdPartyCalloutPositions = ENABLE_EAST_THIRD_PARTY_CALLOUT_LAYOUT ? eastThirdPartyCalloutPositions : legacyThirdPartyCalloutPositions

const thirdPartyCalloutIcon = (customer, selected = false) => L.divIcon({
  className: 'site-callout-shell',
  html: `<div class="site-callout third-party-site-callout ${customer.commonInfra ? 'common-infra-site-callout' : ''} comm-${customer.communicationStatus} ${selected ? 'selected' : ''}"><b>${customer.name}</b><span>${customer.commonInfra ? `${customer.dc.toFixed(2)} MWp DC` : `${customer.simulatedMw.toFixed(2)} MW`}</span><small>${customer.commonInfra ? `${customer.plants.length} PLANTS · NO REAL-TIME DATA` : customer.communicationIssueCount ? `${customer.communicationIssueCount}/${customer.plants.length} COMMUNICATION ISSUE` : `${customer.plants.length} PLANTS · ALL COMM OK`}</small></div>`,
  iconSize: [140, 40],
  // Cards in the two left columns extend away from the map centre; right-side
  // cards extend toward the outer edge. This keeps every fixed slot separate.
  iconAnchor: (thirdPartyCalloutPositions[customer.id]?.[1] || 96) < 80 ? [140, 20] : [0, 20],
})

const thirdPartyPlantIcon = (plant) => L.divIcon({
  className: 'plant-marker-shell',
  html: `<span class="plant-marker third-party-plant-marker ${plant.commonInfra ? 'common-infra-plant' : ''} selected-site ${plant.communicationIssue ? 'communication-issue' : ''}"><i></i></span>`,
  iconSize: [24, 24], iconAnchor: [12, 12], tooltipAnchor: [0, -12],
})

const IndiaMap = ({ plants, scope, onSelectScope, plantMapping, siteWeather, siteRealtime, onOpenPlantDetails }) => {
  const containerRef = useRef(null)
  const mapRef = useRef(null)
  const markersRef = useRef({})
  const calloutsRef = useRef({})
  const thirdPartyMarkersRef = useRef({})
  const thirdPartyCalloutsRef = useRef({})
  const expandedPlantsRef = useRef(null)
  const enrichPlantsLayerRef = useRef(null)
  const lastAutoFitRef = useRef(null)
  const openPlantCollectionRef = useRef(null)
  const refreshingPlantLayerRef = useRef(false)
  const [thirdPartyCustomers, setThirdPartyCustomers] = useState(() => simulateThirdPartyCustomers(new Date(), siteWeather))
  const [selectedCustomerId, setSelectedCustomerId] = useState(null)
  const [showInactiveInverters, setShowInactiveInverters] = useState(false)
  const [selectedEnrichId, setSelectedEnrichId] = useState(null)

  useEffect(() => {
    const refresh = () => setThirdPartyCustomers(simulateThirdPartyCustomers(new Date(), siteWeather))
    const interval = window.setInterval(refresh, 30000)
    refresh()
    window.addEventListener('third-party-sites-updated', refresh)
    return () => { window.clearInterval(interval); window.removeEventListener('third-party-sites-updated', refresh) }
  }, [siteWeather])

  useEffect(() => {
    if (scope?.type === 'customer' || scope?.type === 'third-party-plant') setSelectedCustomerId(scope.customerId || scope.id)
    else setSelectedCustomerId(null)
    setSelectedEnrichId(scope?.type === 'enrich' ? scope.id : scope?.type === 'enrich-plant' || scope?.type === 'scada-block' ? scope.siteId : null)
  }, [scope])

  useEffect(() => {
    const selectCustomer = (event) => {
      setSelectedEnrichId(null)
      setSelectedCustomerId(event.detail || null)
    }
    window.addEventListener('third-party-customer-select', selectCustomer)
    return () => window.removeEventListener('third-party-customer-select', selectCustomer)
  }, [])

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return
    const map = L.map(containerRef.current, {
      zoomControl: true, attributionControl: false, minZoom: 4, maxZoom: 18,
      zoomSnap: 0.25, maxBounds: [[4, 63], [40, 102]],
    })
    const setOverview = (animate = false) => {
      map.invalidateSize({ animate: false })
      map.setView(OVERVIEW_CENTER, OVERVIEW_ZOOM, { animate })
    }
    setOverview()
    // The dashboard columns finish sizing just after Leaflet mounts. Reapply the
    // fixed camera then so every fresh load opens at exactly the same view.
    const overviewFrame = window.requestAnimationFrame(() => setOverview())
    mapRef.current = map
    const showOverview = () => {
      setSelectedCustomerId(null)
      setSelectedEnrichId(null)
      lastAutoFitRef.current = 'overview'
      map.closePopup()
      setOverview(true)
    }
    window.addEventListener('map-show-overview', showOverview)
    L.geoJSON(indiaStates, {
      style: { color: '#178cf2', weight: 0.8, opacity: 0.88, fillColor: '#06366c', fillOpacity: 0.64 },
      onEachFeature: (feature, layer) => {
        const name = feature.properties?.ST_NM || feature.properties?.NAME_1 || feature.properties?.state
        if (name) layer.bindTooltip(name, { className: 'state-tooltip' })
      },
    }).addTo(map)
    return () => {
      window.cancelAnimationFrame(overviewFrame)
      window.removeEventListener('map-show-overview', showOverview)
      map.remove()
      mapRef.current = null
      markersRef.current = {}
      calloutsRef.current = {}
      thirdPartyMarkersRef.current = {}
      thirdPartyCalloutsRef.current = {}
      expandedPlantsRef.current = null
      enrichPlantsLayerRef.current = null
    }
  }, [])

  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    const currentIds = new Set(plants.map((plant) => plant.id))
    Object.entries(markersRef.current).forEach(([id, marker]) => {
      if (!currentIds.has(id)) {
        map.removeLayer(marker)
        delete markersRef.current[id]
        const callout = calloutsRef.current[id]
        if (callout) {
          map.removeLayer(callout.line)
          map.removeLayer(callout.label)
          delete calloutsRef.current[id]
        }
      }
    })
    plants.forEach((plant) => {
      const mappedPlants = plantMapping[plant.name] || []
      const realtime = siteRealtime?.[plant.name]
      const issueCount = realtime?.plants
        ? realtime.plants.filter((item) => item.communicationIssue).length
        : mappedPlants.filter((item) => item.communicationIssue).length
      const warningCount = realtime?.plants
        ? realtime.plants.filter((item) => !item.communicationIssue && (item.dataStuck || item.inverterIssues?.length)).length : 0
      const siteCommunicationStatus = !realtime && (plant.communication === 'Failed' || plant.communicationIssue)
        ? 'failed'
        : issueCount === mappedPlants.length && mappedPlants.length > 0 ? 'failed'
          : issueCount > 0 ? 'partial' : warningCount > 0
            ? (realtime.plants.some((item) => !item.communicationIssue && item.inverterIssues?.length) ? 'partial' : 'stuck') : 'healthy'
      const status = statusOf({ ...plant, siteCommunicationStatus })
      const source = mappedPlants.length ? issueCount ? `${issueCount} of ${mappedPlants.length} plant communication issue` : warningCount ? `${warningCount} plant(s) have inverter warnings` : `${mappedPlants.length} plants · all communication healthy` : plant.communicationIssue ? 'SCADA communication issue' : plant.telemetrySource === 'SCADA' ? `SCADA · ${plant.inverterCount || 0} inverter(s)` : 'Real-time telemetry'
      const cumulative = Number.isFinite(plant.cumulativeGenerationMWh) ? `<span>Lifetime generation <strong>${(plant.cumulativeGenerationMWh / 1000).toLocaleString('en-IN', { maximumFractionDigits: 3 })} GWh</strong></span>` : ''
      const hoverContent = `<div class="plant-hover"><b>${plant.name}</b><span>${plant.state}</span><hr/><span>Capacity <strong>${plant.capacity} MW</strong></span><span>Live power <strong>${plant.currentMw.toFixed(2)} MW</strong></span>${cumulative}<span>Source <strong>${source}</strong></span><span>Status <strong style="color:${status.color}">${status.label}</strong></span>${mappedPlants.length ? `<span><strong>Click to view ${mappedPlants.length} plants</strong></span>` : ''}</div>`
      const popup = `<div class="plant-popup"><b>${plant.name} Solar Plant</b><span>${plant.state}</span><small>${plant.lat.toFixed(6)}° N, ${plant.lon.toFixed(6)}° E</small><hr/><span>Capacity <b>${plant.capacity} MW</b></span><span>Generation <b>${plant.currentMw.toFixed(2)} MW</b></span>${cumulative}<span>Source <b>${source}</b></span><span>PR <b>${plant.pr.toFixed(1)}%</b></span><span>Status <b style="color:${status.color}">${status.label}</b></span><span>Last scan <b>${plant.lastUpdated}</b></span></div>`
      const selectEnrichSite = () => {
        map.closePopup()
        setSelectedCustomerId(null)
        setSelectedEnrichId((current) => current === plant.id ? null : plant.id)
        onSelectScope?.(scope?.type === 'enrich' && scope.id === plant.id ? null : { type: 'enrich', id: plant.id, name: plant.name })
      }
      let marker = markersRef.current[plant.id]
      if (!marker) {
        marker = L.marker([plant.lat, plant.lon], { icon: plantIcon(status), riseOnHover: true })
          .addTo(map).bindTooltip('', { direction: 'top', offset: [0, -8], className: 'plant-label', opacity: 1 })
        if (!mappedPlants.length) marker.bindPopup(popup)
        markersRef.current[plant.id] = marker
      }
      marker.off('click').on('click', (event) => {
        if (event.originalEvent) L.DomEvent.stopPropagation(event.originalEvent)
        selectEnrichSite()
      })
      marker.setIcon(plantIcon(status, selectedEnrichId === plant.id))
      marker.setTooltipContent(hoverContent)
      if (mappedPlants.length) marker.unbindPopup()
      else if (marker.getPopup()) marker.setPopupContent(popup)
      else marker.bindPopup(popup)

      const anchor = calloutPositions[plant.name]
      if (anchor) {
        let callout = calloutsRef.current[plant.id]
        if (!callout) {
          const line = L.polyline([[plant.lat, plant.lon], anchor], {
            color: status.color, weight: 1, opacity: 0.72, dashArray: '3 3', interactive: false,
          }).addTo(map)
          const label = L.marker(anchor, {
            icon: calloutIcon(plant, status, selectedEnrichId === plant.id), interactive: true, keyboard: true,
            title: `Show ${plant.name} plant-wise details`,
          }).addTo(map)
          callout = { line, label }
          calloutsRef.current[plant.id] = callout
        }
        callout.line.setStyle({ color: status.color })
        callout.label.off('click').on('click', selectEnrichSite)
        callout.label.setIcon(calloutIcon(plant, status, selectedEnrichId === plant.id))
      }
    })
    const openMappedCollection = openPlantCollectionRef.current
    if (enrichPlantsLayerRef.current) {
      refreshingPlantLayerRef.current = true
      map.removeLayer(enrichPlantsLayerRef.current)
      enrichPlantsLayerRef.current = null
    }
    if ((scope?.type === 'enrich' || scope?.type === 'enrich-plant' || scope?.type === 'scada-block') && plants.length === 1) {
      const site = plants[0]
      const mappedPlants = plantMapping[site.name] || []
      const mappedSiteAcCapacity = mappedPlants.reduce((sum, mappedPlant) => sum + Number(mappedPlant.ac || 0), 0) || Number(site.capacity || 0)
      const nlcLivePlant = BLOCK_DRILLDOWN_SITES.has(site.name)
        ? mappedLivePlant(siteRealtime?.[site.name], mappedPlants[0] || {})
          || (siteRealtime?.[site.name]?.plants || []).find((plant) => plant.inverters?.some((inverter) => NLC_BLOCK_INVERTER.test(String(inverter.inverter))))
        : null
      const nlcBlocks = ENABLE_NLC_BLOCK_DRILLDOWN && BLOCK_DRILLDOWN_SITES.has(site.name) ? nlcBlocksFor(nlcLivePlant) : []
      const nlcMappedBlocks = nlcBlocks.map((block) => ({
        ...mappedPlants[0], id: `nlc-block-${block.number}`, plantName: `Block ${block.number}`,
        ac: Number(mappedPlants[0]?.ac || 0) / Math.max(1, nlcBlocks.length),
        dc: Number(mappedPlants[0]?.dc || 0) / Math.max(1, nlcBlocks.length),
        nlcBlock: block,
      }))
      const selectedNlcBlock = scope.type === 'scada-block' ? nlcBlocks.find((block) => block.number === scope.blockNumber) : null
      const nlcMappedInverters = selectedNlcBlock?.inverters.map((inverter) => ({
        ...mappedPlants[0], id: `nlc-block-${selectedNlcBlock.number}-inv-${inverter.inverterNumber}`,
        plantName: `INV ${inverter.inverterNumber}`, nlcInverter: inverter, parentBlockNumber: selectedNlcBlock.number,
        ac: Number(mappedPlants[0]?.ac || 0) / 48, dc: Number(mappedPlants[0]?.dc || 0) / 48,
      })) || []
      const selectedMappedPlant = scope.type === 'enrich-plant' ? mappedPlants.find((plant) => plant.id === scope.id) : null
      const selectedLivePlant = selectedMappedPlant ? mappedLivePlant(siteRealtime?.[site.name], selectedMappedPlant) : null
      const mappedPlantInverters = selectedMappedPlant && !BLOCK_DRILLDOWN_SITES.has(site.name)
        ? (selectedLivePlant?.inverters || []).map((inverter, index, all) => {
          const displayNumber = index + 1
          return {
            ...selectedMappedPlant, id: `${selectedMappedPlant.id}-inv-${inverter.inverter}`,
            plantName: `INV-${displayNumber}`, nlcInverter: { ...inverter, inverterNumber: displayNumber, sourceInverter: inverter.inverter },
            parentPlantName: selectedMappedPlant.plantName,
            inverterCenterLat: Number(selectedMappedPlant.lat) || site.lat,
            inverterCenterLon: Number(selectedMappedPlant.lon) || site.lon,
            inverterIndex: index, inverterCount: all.length,
            ac: Number(selectedMappedPlant.ac || 0) / Math.max(1, all.length),
            dc: Number(selectedMappedPlant.dc || 0) / Math.max(1, all.length),
          }
        }) : []
      const displayedMappedPlants = mappedPlantInverters.length
        ? mappedPlantInverters
        : nlcMappedInverters.length
        ? nlcMappedInverters
        : nlcMappedBlocks.length ? nlcMappedBlocks
        : scope.type === 'enrich-plant' ? mappedPlants.filter((item) => item.id === scope.id) : mappedPlants
      if (displayedMappedPlants.length) {
        const parentMarker = markersRef.current[site.id]
        if (parentMarker) {
          map.removeLayer(parentMarker)
          delete markersRef.current[site.id]
        }
        const layer = L.layerGroup()
        let markerToReopen = null
        const mappedPositions = displayedMappedPlants.map((mappedPlant) => {
          const originalIndex = mappedPlant.inverterIndex ?? (mappedPlant.nlcInverter ? Number(mappedPlant.nlcInverter.inverterNumber) - 1 : mappedPlant.nlcBlock ? mappedPlant.nlcBlock.number - 1 : mappedPlants.findIndex((item) => item.id === mappedPlant.id))
          const seed = [...mappedPlant.id].reduce((sum, character) => sum + character.charCodeAt(0), 0)
          const angle = originalIndex * 2.399963 + (seed % 29) * .017
          const radiusVariation = .88 + (seed % 17) / 50
          const radius = mappedPlant.nlcInverter ? .0018 : mappedPlant.nlcBlock
            ? .006 + .0025 * Math.floor(originalIndex / 6)
            : (.045 + .048 * Math.sqrt(originalIndex + 1)) * radiusVariation
          const latJitter = mappedPlant.nlcInverter ? 0 : ((seed % 11) - 5) * .0022
          const lonJitter = mappedPlant.nlcInverter ? 0 : (((seed * 7) % 13) - 6) * .0022
          const hasActualCoordinate = !mappedPlant.nlcBlock && !mappedPlant.nlcInverter
            && mappedPlant.lat != null && mappedPlant.lat !== '' && mappedPlant.lon != null && mappedPlant.lon !== ''
            && Number.isFinite(Number(mappedPlant.lat)) && Number.isFinite(Number(mappedPlant.lon))
          const blockAngle = ((mappedPlant.parentBlockNumber || 1) - 1) * 2.399963
          const inverterCenterLat = mappedPlant.inverterCenterLat ?? site.lat + Math.sin(blockAngle) * .007
          const inverterCenterLon = mappedPlant.inverterCenterLon ?? site.lon + Math.cos(blockAngle) * .007
          // A golden-angle scatter keeps markers naturally dispersed and stable
          // between refreshes, while the growing radius prevents overlap.
          const scatterAngle = originalIndex * 2.3999632297 + (seed % 37) * .071
          const scatterRadius = .0019 * Math.sqrt(originalIndex + 1)
          const inverterLat = inverterCenterLat + Math.sin(scatterAngle) * scatterRadius
          const inverterLon = inverterCenterLon + Math.cos(scatterAngle) * scatterRadius
          const actualLat = hasActualCoordinate ? Number(mappedPlant.lat) : mappedPlant.nlcInverter ? inverterLat : site.lat + Math.sin(angle) * radius + latJitter
          const actualLon = hasActualCoordinate ? Number(mappedPlant.lon) : mappedPlant.nlcInverter ? inverterLon : site.lon + Math.cos(angle) * radius + lonJitter
          const coordinateMatches = hasActualCoordinate ? displayedMappedPlants.filter((item) =>
            Number(item.lat) === actualLat && Number(item.lon) === actualLon) : []
          const duplicateIndex = coordinateMatches.findIndex((item) => item.id === mappedPlant.id)
          const duplicateAngle = duplicateIndex * 2.3999632297
          const displayOffset = coordinateMatches.length > 1 ? .006 * Math.sqrt(duplicateIndex + 1) : 0
          const lat = actualLat + Math.sin(duplicateAngle) * displayOffset
          const lon = actualLon + Math.cos(duplicateAngle) * displayOffset
          // A communication issue belongs to the individual plant, so its marker is
          // fully offline (red). The parent site remains partial/amber while any of
          // its other plants are still communicating.
          const mappedCommunicationIssue = mappedPlant.communicationIssue || site.name === 'Mundargi' || site.name === 'NLC Poolangal'
          const realtime = siteRealtime?.[site.name]
          const livePlant = realtime ? mappedLivePlant(realtime, mappedPlant) : null
          const realtimeCommunicationIssue = Boolean(realtime) && Boolean(livePlant?.communicationIssue)
          const plantCommunicationIssue = realtime ? realtimeCommunicationIssue : mappedCommunicationIssue
          const blockInverterNames = new Set((mappedPlant.nlcBlock?.inverters || []).map((inverter) => inverter.inverter))
          const unavailableInverters = [...new Set([...(livePlant?.inactiveInverters || []), ...(livePlant?.inverterIssues || [])])]
          const hasRelevantInverterIssue = mappedPlant.nlcInverter
            ? unavailableInverters.includes(mappedPlant.nlcInverter.inverter)
            : mappedPlant.nlcBlock
            ? unavailableInverters.some((inverter) => blockInverterNames.has(inverter))
            : unavailableInverters.length > 0
          const mappedStatus = plantCommunicationIssue ? { label: 'Offline', color: '#ff4d62', className: 'offline' }
            : hasRelevantInverterIssue ? { label: mappedPlant.nlcBlock ? 'Block inverter communication issue' : livePlant.statusMessage || 'Inverter communication issue', color: '#ff9f32', className: 'communication-issue' }
              : livePlant?.dataStuck ? { label: 'Data stuck', color: '#ffd23f', className: 'data-stuck' }
              : { label: 'Healthy', color: '#42ec61' }
          const blockInverters = mappedPlant.nlcInverter ? [mappedPlant.nlcInverter] : mappedPlant.nlcBlock?.inverters || []
          const simulatedShare = Number(mappedPlant.ac || 0) / Math.max(.001, mappedSiteAcCapacity)
          const activePower = blockInverters.length ? blockInverters.reduce((sum, inverter) => sum + (Number(inverter.activePowerMw) || 0), 0) : livePlant ? Number(livePlant.currentMw) || 0 : Number(site.currentMw || 0) * simulatedShare
          const dailyGeneration = blockInverters.length ? blockInverters.reduce((sum, inverter) => sum + (Number(inverter.dailyGenerationMWh) || 0), 0) : livePlant ? Number(livePlant.dailyGenerationMWh) || 0 : Number(site.todayMwh || 0) * simulatedShare
          const lifetimeValues = blockInverters.length
            ? blockInverters.map((inverter) => inverter.cumulativeGenerationMWh).filter((value) => value != null)
            : livePlant?.cumulativeGenerationMWh == null ? [] : [livePlant.cumulativeGenerationMWh]
          const lifetimeGenerationGWh = lifetimeValues.length ? lifetimeValues.reduce((sum, value) => sum + Number(value), 0) / 1000 : null
          const lastUpdate = livePlant?.timestamp ? new Date(livePlant.timestamp).toLocaleTimeString('en-IN') : 'No sample'
          const displayName = mappedPlant.nlcInverter ? mappedPlant.parentBlockNumber ? `Block ${mappedPlant.parentBlockNumber} · INV ${mappedPlant.nlcInverter.inverterNumber}` : `${mappedPlant.parentPlantName} · INV ${mappedPlant.nlcInverter.inverterNumber}` : mappedPlant.nlcBlock ? mappedPlant.plantName : mappedPlantDisplayName(site.name, mappedPlant)
          const inverterReadings = blockInverters.map((inverter) => `<div class="map-inverter-reading"><span>INV ${inverter.inverterNumber}</span><i>LIVE</i><strong>${(Number(inverter.activePowerMw) || 0).toFixed(3)} MW</strong></div>`).join('')
          const selectedInverter = mappedPlant.nlcInverter
          const inverterCommunicating = selectedInverter && !plantCommunicationIssue && !unavailableInverters.includes(selectedInverter.inverter)
          const inverterHealth = inverterCommunicating ? Number(selectedInverter.activePowerMw) > 0 ? 'HEALTHY · GENERATING' : 'HEALTHY · STANDBY' : 'COMMUNICATION ISSUE'
          const inverterHealthColor = inverterCommunicating ? '#55ef75' : '#ff6073'
          const inverterPopup = selectedInverter ? `<div class="plant-hover plant-click-card inverter-detail-card"><b>${displayName}</b><span>${mappedPlant.customerName}</span><hr/><span>Site <strong>${site.name}</strong></span><span>Plant / Block <strong>${mappedPlant.parentBlockNumber ? `Block ${mappedPlant.parentBlockNumber}` : mappedPlant.parentPlantName}</strong></span><span>Active power <strong>${selectedInverter.activePowerMw == null ? 'Not available' : `${Number(selectedInverter.activePowerMw).toFixed(3)} MW`}</strong></span><span>Daily generation <strong>${selectedInverter.dailyGenerationMWh == null ? 'Not available' : `${Number(selectedInverter.dailyGenerationMWh).toFixed(3)} MWh`}</strong></span><span>Lifetime generation <strong>${selectedInverter.cumulativeGenerationMWh == null ? 'Not available' : `${(Number(selectedInverter.cumulativeGenerationMWh) / 1000).toLocaleString('en-IN', { maximumFractionDigits: 3 })} GWh`}</strong></span><span>Health <strong style="color:${inverterHealthColor}">${inverterHealth}</strong></span><span>Live sample <strong>${lastUpdate}</strong></span></div>` : ''
          const popup = inverterPopup || `<div class="plant-hover plant-click-card"><b>${displayName}</b><span>${mappedPlant.customerName}</span><hr/><span>Site <strong>${site.name}</strong></span><span>State <strong>${mappedPlant.state}</strong></span><span>AC / DC <strong>${mappedPlant.ac.toFixed(2)} / ${mappedPlant.dc.toFixed(2)} MW</strong></span><span>Active power <strong>${livePlant ? `${activePower.toFixed(3)} MW` : 'No realtime data'}</strong></span><span>Daily generation <strong>${livePlant ? `${dailyGeneration.toFixed(3)} MWh` : 'No realtime data'}</strong></span><span>Lifetime generation <strong>${lifetimeGenerationGWh == null ? 'Not available' : `${lifetimeGenerationGWh.toLocaleString('en-IN', { maximumFractionDigits: 3 })} GWh`}</strong></span><span>Inverters <strong>${blockInverters.length || livePlant?.inverters?.length || 'Not mapped'}</strong></span><span>Status <strong style="color:${mappedStatus.color}">${livePlant ? mappedStatus.label : 'Plant mapped · no realtime data'}</strong></span><span>Live sample <strong>${lastUpdate}</strong></span>${blockInverters.length ? `<div class="map-inverter-list">${inverterReadings}</div>` : livePlant?.inverters?.length ? `<button type="button" class="plant-details-button" data-view-details="${mappedPlant.collection}">View details</button>` : ''}</div>`
          const marker = L.marker([lat, lon], { icon: mappedPlant.nlcInverter ? nlcInverterIcon(mappedPlant.nlcInverter, mappedStatus.className || 'online') : mappedPlant.nlcBlock ? nlcBlockIcon(mappedPlant.nlcBlock, true, mappedStatus.className || 'online') : plantIcon(mappedStatus, true), riseOnHover: true })
            .bindTooltip(`<div class="plant-hover"><b>${displayName}</b><span>${mappedPlant.customerName}</span><hr/><span>Active power <strong>${activePower.toFixed(3)} MW</strong></span><span>Status <strong style="color:${selectedInverter ? inverterHealthColor : mappedStatus.color}">${selectedInverter ? inverterHealth : mappedStatus.label}</strong></span><span>Live sample <strong>${lastUpdate}</strong></span></div>`, { direction: 'top', className: 'plant-label' })
            .bindPopup(popup, { mappedCollection: mappedPlant.collection, maxWidth: 310, minWidth: 270, className: 'realtime-plant-popup' }).addTo(layer)
          if (mappedPlant.nlcBlock) marker.on('click', (event) => {
            if (event.originalEvent) L.DomEvent.stopPropagation(event.originalEvent)
            onSelectScope?.({
              type: 'scada-block', id: `${site.id}-block-${mappedPlant.nlcBlock.number}`,
              blockNumber: mappedPlant.nlcBlock.number, siteId: site.id, name: `Block ${mappedPlant.nlcBlock.number}`,
              parent: site, customerName: mappedPlant.customerName,
            })
          })
          else if (!mappedPlant.nlcInverter) marker.on('click', (event) => {
            if (event.originalEvent) L.DomEvent.stopPropagation(event.originalEvent)
            onSelectScope?.({
              type: 'enrich-plant', id: mappedPlant.id, siteId: site.id, name: mappedPlant.plantName,
              parent: site, mappedPlant,
            })
          })
          marker.on('popupopen', () => {
            openPlantCollectionRef.current = mappedPlant.nlcInverter ? `${mappedPlant.collection}:block-${mappedPlant.parentBlockNumber}:inv-${mappedPlant.nlcInverter.inverterNumber}` : mappedPlant.nlcBlock ? `${mappedPlant.collection}:block-${mappedPlant.nlcBlock.number}` : mappedPlant.collection
            marker.getPopup()?.getElement()?.querySelector('[data-view-details]')?.addEventListener('click', () => {
              onOpenPlantDetails?.(site.name, mappedPlant.collection)
            }, { once: true })
          })
          marker.on('popupclose', () => {
            if (!refreshingPlantLayerRef.current) openPlantCollectionRef.current = null
          })
          const popupKey = mappedPlant.nlcInverter ? `${mappedPlant.collection}:block-${mappedPlant.parentBlockNumber}:inv-${mappedPlant.nlcInverter.inverterNumber}` : mappedPlant.nlcBlock ? `${mappedPlant.collection}:block-${mappedPlant.nlcBlock.number}` : mappedPlant.collection
          if (openMappedCollection === popupKey) markerToReopen = marker
          return [lat, lon]
        })
        layer.addTo(map)
        enrichPlantsLayerRef.current = layer
        if (markerToReopen) markerToReopen.openPopup()
        refreshingPlantLayerRef.current = false
        const displayedKind = displayedMappedPlants.some((plant) => plant.nlcInverter)
          ? 'inverters' : displayedMappedPlants.some((plant) => plant.nlcBlock) ? 'blocks' : 'plants'
        const fitKey = `${scope.type}:${scope.id}:${displayedKind}:${displayedMappedPlants.length}`
        if (lastAutoFitRef.current !== fitKey) {
          const isNlcInverterLayer = displayedMappedPlants.some((plant) => plant.nlcInverter)
          const isNlcBlockLayer = displayedMappedPlants.some((plant) => plant.nlcBlock)
          const hasActualCoordinates = displayedMappedPlants.every((plant) => plant.lat != null && plant.lat !== '' && plant.lon != null && plant.lon !== ''
            && Number.isFinite(Number(plant.lat)) && Number.isFinite(Number(plant.lon)))
          if (isNlcInverterLayer) {
            map.invalidateSize({ animate: false })
            map.fitBounds(L.latLngBounds(mappedPositions), { paddingTopLeft: [75, 75], paddingBottomRight: [340, 75], maxZoom: 15, animate: true })
          } else if (scope.type === 'enrich-plant' && mappedPositions.length === 1) map.setView(mappedPositions[0], isNlcBlockLayer ? 14 : hasActualCoordinates ? 16 : 11, { animate: true })
          else if (scope.type === 'enrich-plant') map.fitBounds(L.latLngBounds(mappedPositions), { paddingTopLeft: [85, 85], paddingBottomRight: [340, 85], maxZoom: 15, animate: true })
          else map.fitBounds(L.latLngBounds(mappedPositions), { paddingTopLeft: [60, 60], paddingBottomRight: [340, 70], maxZoom: isNlcBlockLayer ? 14 : hasActualCoordinates ? 16 : 10, animate: true })
          lastAutoFitRef.current = fitKey
        }
      }
    }
    refreshingPlantLayerRef.current = false
    if (scope?.type === 'enrich' && plants.length === 1 && !(plantMapping[plants[0].name] || []).length) {
      const fitKey = `enrich:${scope.id}`
      if (lastAutoFitRef.current !== fitKey) {
        map.setView([plants[0].lat, plants[0].lon], 7, { animate: true })
        lastAutoFitRef.current = fitKey
      }
    }
  }, [plants, selectedEnrichId, onSelectScope, onOpenPlantDetails, scope, plantMapping, siteRealtime])

  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    const displayedCustomers = scope?.type === 'customer' || scope?.type === 'third-party-plant'
      ? thirdPartyCustomers.filter((customer) => customer.id === (scope.customerId || scope.id))
      : scope?.type === 'portfolio-common-infra' ? thirdPartyCustomers.filter((customer) => customer.commonInfra)
        : scope?.type === 'portfolio-third-party' ? thirdPartyCustomers.filter((customer) => !customer.commonInfra)
        : scope?.type === 'enrich' || scope?.type === 'enrich-plant' || scope?.type === 'scada-block' || scope?.type === 'portfolio-enrich' ? [] : thirdPartyCustomers
    const displayedCustomerIds = new Set(displayedCustomers.map((customer) => customer.id))
    Object.entries(thirdPartyMarkersRef.current).forEach(([id, marker]) => {
      if (!displayedCustomerIds.has(id)) {
        map.removeLayer(marker)
        delete thirdPartyMarkersRef.current[id]
        const callout = thirdPartyCalloutsRef.current[id]
        if (callout) {
          map.removeLayer(callout.line)
          map.removeLayer(callout.label)
          delete thirdPartyCalloutsRef.current[id]
        }
      }
    })
    displayedCustomers.forEach((customer) => {
      const customerCommunicationColor = customer.commonInfra ? '#22c7c9' : customer.communicationStatus === 'failed' ? '#ff4057' : customer.communicationStatus === 'partial' ? '#ff9f32' : '#9b5de5'
      const tooltipContent = `<b>${customer.name}</b><br>${customer.plants.length} ${customer.commonInfra ? 'common-infrastructure' : 'third-party'} plants · ${customer.dc.toFixed(2)} MWp DC · click to expand`
      const selectCustomer = () => {
        setSelectedEnrichId(null)
        setSelectedCustomerId((current) => current === customer.id ? null : customer.id)
        onSelectScope?.(scope?.type === 'customer' && scope.id === customer.id ? null : { type: 'customer', id: customer.id, customerId: customer.id, name: customer.name, customer })
      }
      let marker = thirdPartyMarkersRef.current[customer.id]
      if (!marker) {
        marker = L.marker([customer.lat, customer.lon], { icon: thirdPartyIcon(customer), riseOnHover: true, zIndexOffset: 500 })
          .addTo(map)
          .bindTooltip(tooltipContent, { direction: 'top', className: 'third-party-tooltip' })
        thirdPartyMarkersRef.current[customer.id] = marker
      }
      marker.setLatLng([customer.lat, customer.lon])
      marker.setTooltipContent(tooltipContent)
      marker.off('click').on('click', selectCustomer)
      marker.setIcon(thirdPartyIcon({ ...customer, selected: selectedCustomerId === customer.id }))

      let callout = thirdPartyCalloutsRef.current[customer.id]
      const anchor = thirdPartyCalloutPositions[customer.id] || [customer.lat, 96]
      if (!callout) {
        const line = L.polyline([[customer.lat, customer.lon], anchor], {
          color: customerCommunicationColor, weight: 1, opacity: .68, dashArray: '3 3', interactive: false,
        }).addTo(map)
        const label = L.marker(anchor, {
          icon: thirdPartyCalloutIcon(customer), interactive: true, keyboard: true,
          title: `Open ${customer.name} commissioned plants`,
        }).addTo(map)
        callout = { line, label }
        thirdPartyCalloutsRef.current[customer.id] = callout
      }
      callout.line.setLatLngs([[customer.lat, customer.lon], anchor])
      callout.line.setStyle({ color: customerCommunicationColor })
      callout.label.setLatLng(anchor)
      callout.label.off('click').on('click', selectCustomer)
      callout.label.setIcon(thirdPartyCalloutIcon(customer, selectedCustomerId === customer.id))
    })

    if (expandedPlantsRef.current) {
      map.removeLayer(expandedPlantsRef.current)
      expandedPlantsRef.current = null
    }
    const selected = thirdPartyCustomers.find((customer) => customer.id === selectedCustomerId)
    if (!selected) {
      if (scope?.type === 'enrich' || scope?.type === 'enrich-plant' || scope?.type === 'scada-block' || scope?.type === 'portfolio-enrich') return
      return
    }
    const layer = L.layerGroup()
    const displayedThirdPartyPlants = scope?.type === 'third-party-plant'
      ? selected.plants.filter((plant) => plant.id === scope.plant.id)
      : selected.plants
    displayedThirdPartyPlants.forEach((plant, index) => {
      const communicationColor = plant.communicationIssue ? '#ff9f32' : '#43f467'
      const markerPosition = selected.commonInfra
        ? [plant.lat + Math.sin(index * 2.4) * 0.06, plant.lon + Math.cos(index * 2.4) * 0.06]
        : [plant.lat, plant.lon]
      const popup = `<div class="plant-popup third-party-site-popup"><b>${plant.site}</b><span>${selected.name} · ${plant.cluster}</span><hr/><span>DC capacity <b>${plant.dc.toFixed(2)} MWp</b></span><span>Live power <b>${plant.simulatedMw.toFixed(2)} MW</b></span><span>Today's generation <b>${plant.todayMwh.toFixed(2)} MWh</b></span><span>Data source <b>${selected.noTelemetry ? 'Not available' : 'Real-time telemetry'}</b></span><span>Communication <b style="color:${selected.noTelemetry ? '#22c7c9' : communicationColor}">${selected.noTelemetry ? 'NOT MONITORED' : plant.communicationIssue ? 'ISSUE' : 'HEALTHY'}</b></span><span>Status <b>${plant.status}</b></span></div>`
      const plantMarker = L.marker(markerPosition, { icon: thirdPartyPlantIcon(plant), riseOnHover: true })
        .bindTooltip(`<div class="plant-hover"><b>${plant.site}</b><span>${selected.name} · ${plant.cluster}</span><hr/><span>Live power <strong>${plant.simulatedMw.toFixed(2)} MW</strong></span><span>DC capacity <strong>${plant.dc.toFixed(2)} MWp</strong></span><span>Data <strong>${selected.noTelemetry ? 'Not available' : 'Real-time'}</strong></span></div>`, { direction: 'top', className: 'plant-label' })
        .bindPopup(popup).addTo(layer)
      plantMarker.on('click', () => onSelectScope?.(scope?.type === 'third-party-plant' && scope.id === plant.id ? null : { type: 'third-party-plant', id: plant.id, customerId: selected.id, name: plant.site, customer: selected, plant }))
    })
    layer.addTo(map)
    expandedPlantsRef.current = layer
    const fitKey = `${scope?.type || 'customer'}:${selected.id}:${scope?.plant?.id || 'all'}`
    if (lastAutoFitRef.current !== fitKey) {
      map.fitBounds(L.latLngBounds(displayedThirdPartyPlants.map((plant, index) => selected.commonInfra
        ? [plant.lat + Math.sin(index * 2.4) * 0.06, plant.lon + Math.cos(index * 2.4) * 0.06]
        : [plant.lat, plant.lon])), { padding: [20, 20], maxZoom: 8 })
      lastAutoFitRef.current = fitKey
    }
  }, [thirdPartyCustomers, selectedCustomerId, scope, onSelectScope])

  const enrichPlantCounts = plants.reduce((counts, site) => {
    const mapped = plantMapping[site.name] || []
    if (!mapped.length) {
      counts.total += 1
      counts.reporting += statusOf(site).label === 'Online' ? 1 : 0
      return counts
    }
    const realtime = siteRealtime?.[site.name]
    counts.total += mapped.length
    counts.reporting += mapped.filter((plant) => {
      if (site.name === 'Mundargi' || site.name === 'NLC Poolangal') return false
      if (realtime) {
        const livePlant = mappedLivePlant(realtime, plant)
        return Boolean(livePlant?.available && livePlant?.dataAvailable !== false && !livePlant?.communicationIssue)
      }
      return !plant.communicationIssue && site.communication !== 'Failed' && !site.communicationIssue
    }).length
    return counts
  }, { total: 0, reporting: 0 })
  const scopedMapCustomers = scope?.type === 'portfolio-common-infra'
    ? thirdPartyCustomers.filter((customer) => customer.commonInfra)
    : scope?.type === 'portfolio-third-party' ? thirdPartyCustomers.filter((customer) => !customer.commonInfra) : thirdPartyCustomers
  const thirdPartyCapacity = scopedMapCustomers.reduce((sum, customer) => sum + customer.dc, 0)
  const selectedThirdPartyCapacity = scope?.plant?.dc ?? scope?.customer?.dc
  const selectedThirdPartyGeneration = scope?.plant?.simulatedMw ?? scope?.customer?.simulatedMw
  const thirdPartyGeneration = scopedMapCustomers.reduce((sum, customer) => sum + customer.simulatedMw, 0)
  const thirdPartyPlantCount = scopedMapCustomers.reduce((sum, customer) => sum + customer.plants.length, 0)
  const thirdPartyReportingCount = scopedMapCustomers.reduce((sum, customer) => sum + (customer.noTelemetry ? 0 : customer.plants.length), 0)
  const isExternalPortfolio = scope?.type === 'portfolio-third-party' || scope?.type === 'portfolio-common-infra'
  const selectedEnrichDc = scope && plants[0]
    ? (plantMapping[plants[0].name] || []).reduce((sum, plant) => sum + Number(plant.dc || 0), 0)
    : 0
  const reportingCount = scope?.type === 'third-party-plant' ? 1 : scope?.type === 'customer' ? scope.customer.plants.length : isExternalPortfolio ? thirdPartyPlantCount : enrichPlantCounts.total + (scope ? 0 : thirdPartyPlantCount)
  const reportingOnline = scope?.type === 'customer' || scope?.type === 'third-party-plant'
    ? (scope?.customer?.noTelemetry || scope?.plant?.noTelemetry ? 0 : reportingCount)
    : isExternalPortfolio ? thirdPartyReportingCount : enrichPlantCounts.reporting + (scope ? 0 : thirdPartyReportingCount)
  const installedCapacity = selectedThirdPartyCapacity ?? (isExternalPortfolio ? thirdPartyCapacity : selectedEnrichDc || plants.reduce((sum, plant) => sum + plant.capacity, 0) + (scope ? 0 : thirdPartyCapacity))
  const liveGeneration = selectedThirdPartyGeneration ?? (isExternalPortfolio ? thirdPartyGeneration : plants.reduce((sum, plant) => sum + plant.currentMw, 0) + (scope ? 0 : thirdPartyGeneration))
  const fleetAvailability = scope?.type === 'customer' || scope?.type === 'third-party-plant' || isExternalPortfolio
    ? (scope?.customer?.noTelemetry || scope?.plant?.noTelemetry ? 0 : isExternalPortfolio ? (thirdPartyReportingCount / Math.max(1, thirdPartyPlantCount)) * 100 : 100)
    : reportingCount
      ? ((enrichPlantCounts.reporting + (scope ? 0 : thirdPartyReportingCount)) * 100) / reportingCount
      : 100
  const activeMappedPlants = (scope?.type === 'enrich' || scope?.type === 'enrich-plant' || scope?.type === 'scada-block') && plants[0] ? plantMapping[plants[0].name] || [] : []
  const activeNlcBlocks = ENABLE_NLC_BLOCK_DRILLDOWN && BLOCK_DRILLDOWN_SITES.has(plants[0]?.name)
    ? nlcBlocksFor(mappedLivePlant(siteRealtime?.[plants[0]?.name], activeMappedPlants[0] || {})) : []
  const selectedSite = activeMappedPlants.length ? plants[0] : null
  const selectedSiteRealtime = selectedSite ? siteRealtime?.[selectedSite.name] : null
  const selectedSiteAc = activeMappedPlants.reduce((sum, plant) => sum + Number(plant.ac || 0), 0) || selectedSite?.capacity || 0
  const selectedSiteDc = activeMappedPlants.reduce((sum, plant) => sum + Number(plant.dc || 0), 0) || (selectedSite?.capacity || 0) * 1.2
  const selectedSiteDaily = selectedSiteRealtime?.dailyGenerationMWh ?? selectedSite?.todayMwh
  const selectedSiteLifetime = selectedSiteRealtime?.cumulativeGenerationMWh ?? selectedSite?.cumulativeGenerationMWh
  const selectedSiteTimestamp = selectedSiteRealtime?.timestamp ? new Date(selectedSiteRealtime.timestamp).toLocaleTimeString('en-IN') : selectedSite?.lastUpdated
  const selectedSiteStatus = selectedSite?.communication === 'Failed' || selectedSite?.communicationIssue ? 'COMMUNICATION ISSUE' : 'HEALTHY · LIVE DATA'
  const selectedMappedPlant = scope?.type === 'enrich-plant' ? activeMappedPlants.find((plant) => plant.id === scope.id) || scope.mappedPlant : null
  const selectedMappedLive = selectedMappedPlant ? mappedLivePlant(selectedSiteRealtime, selectedMappedPlant) : null
  const selectedBlock = scope?.type === 'scada-block' ? activeNlcBlocks.find((block) => block.number === Number(scope.blockNumber)) : null
  const summaryLivePlants = selectedMappedLive ? [selectedMappedLive] : selectedBlock ? [] : (selectedSiteRealtime?.plants || [])
  const summaryInverterRows = selectedBlock?.inverters || selectedMappedLive?.inverters || summaryLivePlants.flatMap((plant) => plant.inverters || [])
  const summaryUnavailableNames = new Set(selectedBlock
    ? [...(selectedSiteRealtime?.plants?.[0]?.inactiveInverters || []), ...(selectedSiteRealtime?.plants?.[0]?.inverterIssues || [])].filter((name) => selectedBlock.inverters.some((inverter) => inverter.inverter === name))
    : summaryLivePlants.flatMap((plant) => [...(plant.inactiveInverters || []), ...(plant.inverterIssues || [])]))
  const selectedSiteInverters = summaryLivePlants.length ? summaryLivePlants.reduce((totals, plant) => {
    const total = Number(plant.inverterTotal ?? plant.inverters?.length ?? 0)
    const active = Number(plant.communicatingInverters ?? (plant.communicationIssue ? 0 : total))
    return { active: totals.active + active, total: totals.total + total }
  }, { active: 0, total: 0 }) : { active: summaryInverterRows.length - summaryUnavailableNames.size, total: summaryInverterRows.length }
  const selectedInactiveInverters = [...summaryUnavailableNames].map((inverter) => ({
    plant: selectedBlock ? `Block ${selectedBlock.number}` : selectedMappedPlant?.plantName || selectedSite?.name,
    inverter: String(inverter).replace(/^INV\s*/i, 'INV '),
  }))
  const summaryCapacityShare = selectedMappedPlant ? Number(selectedMappedPlant.ac || 0) / Math.max(.001, selectedSiteAc) : 1
  const summaryTitle = selectedBlock ? `${selectedSite.name} · Block ${selectedBlock.number}` : selectedMappedPlant?.plantName || selectedSite?.name
  const summaryCustomer = selectedMappedPlant?.customerName || [...new Set(activeMappedPlants.map((plant) => plant.customerName).filter(Boolean))].slice(0, 2).join(' · ')
  const summaryAc = selectedBlock ? selectedSiteAc / Math.max(1, activeNlcBlocks.length) : selectedMappedPlant ? Number(selectedMappedPlant.ac || 0) : selectedSiteAc
  const summaryDc = selectedBlock ? selectedSiteDc / Math.max(1, activeNlcBlocks.length) : selectedMappedPlant ? Number(selectedMappedPlant.dc || 0) : selectedSiteDc
  const summaryCurrent = selectedBlock ? summaryInverterRows.reduce((sum, inverter) => sum + Number(inverter.activePowerMw || 0), 0) : selectedMappedLive ? Number(selectedMappedLive.currentMw || 0) : selectedMappedPlant ? Number(selectedSite.currentMw || 0) * summaryCapacityShare : Number(selectedSite?.currentMw || 0)
  const summaryDaily = selectedBlock ? summaryInverterRows.reduce((sum, inverter) => sum + Number(inverter.dailyGenerationMWh || 0), 0) : selectedMappedLive ? selectedMappedLive.dailyGenerationMWh : selectedMappedPlant ? Number(selectedSiteDaily || 0) * summaryCapacityShare : selectedSiteDaily
  const summaryLifetime = selectedBlock || selectedMappedLive ? summaryInverterRows.map((inverter) => inverter.cumulativeGenerationMWh).filter((value) => value != null).reduce((sum, value) => sum + Number(value), 0) : selectedSiteLifetime
  const summaryStatus = summaryLivePlants.some((plant) => plant.communicationIssue) ? 'COMMUNICATION ISSUE' : summaryLivePlants.some((plant) => plant.dataStuck) ? 'DATA STUCK' : selectedInactiveInverters.length ? 'INVERTER ATTENTION' : selectedSiteStatus
  const mapTitle = !scope ? 'ENRICH INSTALLED BASE'
    : scope.type === 'enrich' ? String(scope.name || plants[0]?.name || 'SITE').toUpperCase()
      : scope.type === 'enrich-plant' ? `${scope.parent?.name || plants[0]?.name || 'SITE'} (${scope.mappedPlant?.customerName || scope.name || 'PLANT'})`.toUpperCase()
        : scope.type === 'scada-block' ? `${scope.parent?.name || plants[0]?.name || 'SITE'} (${scope.customerName || 'CUSTOMER'}) · BLOCK ${scope.blockNumber}`.toUpperCase()
          : String(scope.name || 'ENRICH INSTALLED BASE').toUpperCase()
  return (
    <Paper elevation={0} className="glass-panel map-panel">
      <Box className="panel-heading">
        <Typography className="panel-title">{mapTitle}</Typography>
        <Box className="map-legend"><span><i className="green-dot" />Enrich site</span><span><i className="third-party-dot" />Third-party customer</span><span><i className="common-infra-dot" />Common infra</span></Box>
      </Box>
      <Box className="india-map-wrap"><div ref={containerRef} className="india-leaflet-map" />{selectedSite && <div className="map-site-summary-card">
        <b>{summaryTitle}</b><small>{summaryCustomer}</small><hr />
        <span>Site <strong>{selectedSite.name}</strong></span><span>State <strong>{selectedSite.state}</strong></span>
        <span>AC / DC <strong>{summaryAc.toFixed(2)} / {summaryDc.toFixed(2)} MW</strong></span>
        <span>Active power <strong>{summaryCurrent.toFixed(3)} MW</strong></span>
        <span>Daily generation <strong>{summaryDaily == null ? 'Not available' : `${Number(summaryDaily).toFixed(3)} MWh`}</strong></span>
        <span>Lifetime generation <strong>{summaryLifetime == null ? 'Not available' : `${(Number(summaryLifetime) / 1000).toLocaleString('en-IN', { maximumFractionDigits: 3 })} GWh`}</strong></span>
        <span>{selectedBlock ? 'Inverters' : selectedMappedPlant ? 'Plant' : activeNlcBlocks.length ? 'Blocks' : 'Plants'} <strong>{selectedBlock ? summaryInverterRows.length : selectedMappedPlant ? 1 : activeNlcBlocks.length || activeMappedPlants.length}</strong></span>
        <button type="button" className={`map-inverter-status-toggle ${selectedInactiveInverters.length ? 'has-issues' : ''}`} onClick={() => setShowInactiveInverters((value) => !value)}><span>Active inverters</span><strong>{selectedSiteInverters.active} / {selectedSiteInverters.total}</strong><i>{selectedInactiveInverters.length ? `${showInactiveInverters ? 'Hide' : 'Show'} ${selectedInactiveInverters.length} inactive` : 'All communicating'}</i></button>
        {showInactiveInverters && selectedInactiveInverters.length > 0 && <div className="map-inactive-inverters"><b>INACTIVE / NO COMM</b>{selectedInactiveInverters.map((item) => <span key={`${item.plant}-${item.inverter}`}><i>{item.plant}</i><strong>{item.inverter}</strong></span>)}</div>}
        <span>Status <strong className={summaryStatus.startsWith('HEALTHY') ? 'healthy' : 'issue'}>{summaryStatus}</strong></span>
        <span>Live sample <strong>{selectedSiteTimestamp || 'No sample'}</strong></span>
      </div>}<div className="map-live-badge">● LIVE GPS / SCADA</div>
      </Box>
      <div className="map-layer-key">
        <button className={scope?.type === 'portfolio-enrich' ? 'active enrich-filter' : 'enrich-filter'} aria-pressed={scope?.type === 'portfolio-enrich'} onClick={() => onSelectScope?.(scope?.type === 'portfolio-enrich' ? null : { type: 'portfolio-enrich', name: 'Enrich commissioned' })}><i className="enrich-key" />Enrich commissioned</button>
        <button className={scope?.type === 'portfolio-third-party' ? 'active third-party-filter' : 'third-party-filter'} aria-pressed={scope?.type === 'portfolio-third-party'} onClick={() => onSelectScope?.(scope?.type === 'portfolio-third-party' ? null : { type: 'portfolio-third-party', name: 'Third-party sites' })}><i className="third-party-key" />Third-party sites</button>
        <button className={scope?.type === 'portfolio-common-infra' ? 'active common-infra-filter' : 'common-infra-filter'} aria-pressed={scope?.type === 'portfolio-common-infra'} onClick={() => onSelectScope?.(scope?.type === 'portfolio-common-infra' ? null : { type: 'portfolio-common-infra', name: 'Common infra' })}><i className="common-infra-key" />Common infra</button>
      </div>
      <Box className="map-summary">
        <div className="map-reading"><span>Plants reporting</span><strong>{reportingOnline} / {reportingCount}</strong></div>
        <div className="map-reading"><span>DC capacity</span><strong>{installedCapacity.toFixed(2)} MWp</strong></div>
        <div className="map-reading"><span>Live generation</span><strong>{liveGeneration.toFixed(1)} MW</strong></div>
        <div className="map-reading"><span>Fleet availability</span><strong>{fleetAvailability.toFixed(1)}%</strong></div>
      </Box>
    </Paper>
  )
}

export default IndiaMap
