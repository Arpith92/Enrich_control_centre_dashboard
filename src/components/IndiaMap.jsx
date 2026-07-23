import { useEffect, useRef, useState } from 'react'
import { Box, Paper, Typography } from '@mui/material'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { simulateThirdPartyCustomers } from '../data/thirdPartySites'

const statusOf = (plant) => {
  if (plant.siteCommunicationStatus === 'failed') return { label: 'Offline', color: '#ff4d62' }
  if (plant.siteCommunicationStatus === 'partial') return { label: 'Communication issue', color: '#ff9f32' }
  if (plant.siteCommunicationStatus === 'healthy') return { label: 'Online', color: '#42ec61' }
  if (plant.communication === 'Failed' || plant.communicationIssue) return { label: 'Offline', color: '#ff4d62' }
  if (plant.communication === 'Pending' || plant.communication === 'Degraded') return { label: 'Communication issue', color: '#ff9f32' }
  if (plant.telemetrySource === 'SCADA') return { label: 'Online', color: '#42ec61' }
  if (plant.name === 'Mundargi') return { label: 'Offline', color: '#ff4057' }
  if (plant.communication === 'Failed') return { label: 'Offline', color: '#ff4d62' }
  return { label: 'Online', color: '#42ec61' }
}
const normalizedPlantName = (value = '') => value.toLowerCase().replace(/^b\d+[_ -]*/, '').replace(/_live$/i, '').replace(/[^a-z0-9]/g, '')
const bhokarLivePlant = (realtime, mappedPlant) => (realtime?.plants || []).find((plant) =>
  normalizedPlantName(plant.name) === normalizedPlantName(mappedPlant.plantName)
  || normalizedPlantName(plant.collection) === normalizedPlantName(mappedPlant.plantName))

const calloutPositions = {
  BEL2MW: [32.2, 80.5],
  PGCIL: [28.5, 68.8],
  BEL1MW: [27.2, 91.5],
  Umri: [24.8, 85.2],
  Bhokar: [20.5, 85.2],
  Zaheerabad: [25.5, 68.8],
  Mandrup: [22.5, 68.8],
  Kumbhari: [19.5, 68.8],
  Karajagi: [16.5, 68.8],
  Tuljapur: [13.5, 68.8],
  Mundargi: [10.5, 68.8],
  Turmamidi: [16.3, 85.2],
  'NLC Poolangal': [9.2, 84],
}

const calloutIcon = (plant, status, selected = false) => L.divIcon({
  className: 'site-callout-shell',
  html: `<div class="site-callout ${status.label === 'Offline' ? 'offline' : status.label === 'Communication issue' ? 'communication-issue' : ''} ${selected ? 'selected' : ''}"><b>${plant.name}</b><span>${plant.currentMw.toFixed(2)} MW${status.label === 'Online' && plant.telemetrySource === 'SCADA' ? ' · 1-MIN AVG' : ''}</span></div>`,
  iconSize: [104, 38],
  iconAnchor: calloutPositions[plant.name]?.[1] < plant.lon ? [104, 19] : [0, 19],
})

const plantIcon = (status, selected = false) => L.divIcon({
  className: 'plant-marker-shell',
  html: `<span class="plant-marker ${status.label === 'Offline' ? 'offline' : status.label === 'Communication issue' ? 'communication-issue' : 'online'} ${selected ? 'selected-site' : ''}"><i></i></span>`,
  iconSize: [24, 24],
  iconAnchor: [12, 12],
  tooltipAnchor: [0, -12],
})

const thirdPartyIcon = (customer) => L.divIcon({
  className: 'third-party-marker-shell',
  html: `<span class="plant-marker third-party-customer comm-${customer.communicationStatus} ${customer.selected ? 'selected' : ''}"><i>${customer.name.split(' ').map((word) => word[0]).join('').slice(0, 2)}</i><b>${customer.plants.length}</b></span>`,
  iconSize: [24, 24],
  iconAnchor: [12, 12],
  popupAnchor: [0, -18],
})

const thirdPartyCalloutPositions = {
  torrent: [30.5, 96],
  atnu: [18.0, 96],
  reliance: [13.5, 96],
  'hero-future': [9.0, 96],
}

const thirdPartyCalloutIcon = (customer, selected = false) => L.divIcon({
  className: 'site-callout-shell',
  html: `<div class="site-callout third-party-site-callout comm-${customer.communicationStatus} ${selected ? 'selected' : ''}"><b>${customer.name}</b><span>${customer.simulatedMw.toFixed(2)} MW</span><small>${customer.communicationIssueCount ? `${customer.communicationIssueCount}/${customer.plants.length} COMMUNICATION ISSUE` : `${customer.plants.length} PLANTS · ALL COMM OK`}</small></div>`,
  iconSize: [104, 38],
  // Keep third-party cards in their own column to the right of the connector.
  iconAnchor: [0, 19],
})

const thirdPartyPlantIcon = (plant) => L.divIcon({
  className: 'plant-marker-shell',
  html: `<span class="plant-marker third-party-plant-marker selected-site ${plant.communicationIssue ? 'communication-issue' : ''}"><i></i></span>`,
  iconSize: [24, 24], iconAnchor: [12, 12], tooltipAnchor: [0, -12],
})

const IndiaMap = ({ plants, scope, onSelectScope, plantMapping, siteWeather, bhokarRealtime, onOpenBhokarPlant }) => {
  const containerRef = useRef(null)
  const mapRef = useRef(null)
  const markersRef = useRef({})
  const calloutsRef = useRef({})
  const thirdPartyMarkersRef = useRef({})
  const thirdPartyCalloutsRef = useRef({})
  const expandedPlantsRef = useRef(null)
  const enrichPlantsLayerRef = useRef(null)
  const [thirdPartyCustomers, setThirdPartyCustomers] = useState(() => simulateThirdPartyCustomers(new Date(), siteWeather))
  const [selectedCustomerId, setSelectedCustomerId] = useState(null)
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
    setSelectedEnrichId(scope?.type === 'enrich' ? scope.id : scope?.type === 'enrich-plant' ? scope.siteId : null)
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
      zoomControl: true, attributionControl: false, minZoom: 4, maxZoom: 9,
      zoomSnap: 0.25, maxBounds: [[4, 63], [40, 102]],
    })
    map.fitBounds([[7.5, 68], [35.8, 97.5]], { padding: [26, 26] })
    map.setZoom(map.getZoom() + 0.25, { animate: false })
    mapRef.current = map
    fetch('/india_states.min.geojson').then((response) => response.json()).then((data) => {
      if (!mapRef.current) return
      L.geoJSON(data, {
        style: { color: '#178cf2', weight: 0.8, opacity: 0.88, fillColor: '#06366c', fillOpacity: 0.64 },
        onEachFeature: (feature, layer) => {
          const name = feature.properties?.ST_NM || feature.properties?.NAME_1 || feature.properties?.state
          if (name) layer.bindTooltip(name, { className: 'state-tooltip' })
        },
      }).addTo(map)
    })
    return () => {
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
      const issueCount = plant.name === 'Bhokar' && bhokarRealtime?.plants
        ? bhokarRealtime.plants.filter((item) => !item.available || item.stale).length
        : mappedPlants.filter((item) => item.communicationIssue).length
      const siteCommunicationStatus = plant.name !== 'Bhokar' && (plant.communication === 'Failed' || plant.communicationIssue)
        ? 'failed'
        : issueCount === 0 ? 'healthy' : issueCount === mappedPlants.length ? 'failed' : 'partial'
      const status = statusOf({ ...plant, siteCommunicationStatus })
      const source = mappedPlants.length ? issueCount ? `${issueCount} of ${mappedPlants.length} plant communication issue` : `${mappedPlants.length} plants · all communication healthy` : plant.communicationIssue ? 'SCADA communication issue' : plant.telemetrySource === 'SCADA' ? `SCADA 1-minute average · ${plant.inverterCount || 0} inverter(s)` : 'Real-time telemetry'
      const cumulative = Number.isFinite(plant.cumulativeGenerationMWh) ? `<span>Cumulative generation <strong>${plant.cumulativeGenerationMWh.toLocaleString('en-IN')} MWh</strong></span>` : ''
      const hoverContent = `<div class="plant-hover"><b>${plant.name}</b><span>${plant.state}</span><hr/><span>Capacity <strong>${plant.capacity} MW</strong></span><span>Live power <strong>${plant.currentMw.toFixed(2)} MW</strong></span>${cumulative}<span>Source <strong>${source}</strong></span><span>Status <strong style="color:${status.color}">${status.label}</strong></span>${mappedPlants.length ? `<span><strong>Click to view ${mappedPlants.length} plants</strong></span>` : ''}</div>`
      const popup = `<div class="plant-popup"><b>${plant.name} Solar Plant</b><span>${plant.state}</span><small>${plant.lat.toFixed(6)}° N, ${plant.lon.toFixed(6)}° E</small><hr/><span>Capacity <b>${plant.capacity} MW</b></span><span>Generation <b>${plant.currentMw.toFixed(2)} MW</b></span>${cumulative}<span>Source <b>${source}</b></span><span>PR <b>${plant.pr.toFixed(1)}%</b></span><span>Status <b style="color:${status.color}">${status.label}</b></span><span>Last scan <b>${plant.lastUpdated}</b></span></div>`
      let marker = markersRef.current[plant.id]
      if (!marker) {
        marker = L.marker([plant.lat, plant.lon], { icon: plantIcon(status), riseOnHover: true })
          .addTo(map).bindTooltip('', { direction: 'top', offset: [0, -8], className: 'plant-label', opacity: 1 })
        if (!mappedPlants.length) marker.bindPopup(popup)
        marker.on('click', (event) => {
          map.closePopup()
          if (event.originalEvent) L.DomEvent.stopPropagation(event.originalEvent)
          setSelectedCustomerId(null)
          setSelectedEnrichId((current) => current === plant.id ? null : plant.id)
          onSelectScope?.(scope?.type === 'enrich' && scope.id === plant.id ? null : { type: 'enrich', id: plant.id, name: plant.name })
        })
        markersRef.current[plant.id] = marker
      }
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
          label.on('click', () => {
            setSelectedCustomerId(null)
            setSelectedEnrichId((current) => current === plant.id ? null : plant.id)
            onSelectScope?.(scope?.type === 'enrich' && scope.id === plant.id ? null : { type: 'enrich', id: plant.id, name: plant.name })
          })
          callout = { line, label }
          calloutsRef.current[plant.id] = callout
        }
        callout.line.setStyle({ color: status.color })
        callout.label.setIcon(calloutIcon(plant, status, selectedEnrichId === plant.id))
      }
    })
    if (enrichPlantsLayerRef.current) {
      map.removeLayer(enrichPlantsLayerRef.current)
      enrichPlantsLayerRef.current = null
    }
    if ((scope?.type === 'enrich' || scope?.type === 'enrich-plant') && plants.length === 1) {
      const site = plants[0]
      const mappedPlants = plantMapping[site.name] || []
      const displayedMappedPlants = scope.type === 'enrich-plant' ? mappedPlants.filter((item) => item.id === scope.id) : mappedPlants
      if (displayedMappedPlants.length) {
        const parentMarker = markersRef.current[site.id]
        if (parentMarker) {
          map.removeLayer(parentMarker)
          delete markersRef.current[site.id]
        }
        const operationalCapacity = mappedPlants
          .filter((item) => !item.communicationIssue && site.name !== 'Mundargi')
          .reduce((sum, item) => sum + item.ac, 0) || site.capacity
        const layer = L.layerGroup()
        const mappedPositions = displayedMappedPlants.map((mappedPlant) => {
          const originalIndex = mappedPlants.findIndex((item) => item.id === mappedPlant.id)
          const seed = [...mappedPlant.id].reduce((sum, character) => sum + character.charCodeAt(0), 0)
          const angle = originalIndex * 2.399963 + (seed % 29) * .017
          const radiusVariation = .88 + (seed % 17) / 50
          const radius = (.045 + .048 * Math.sqrt(originalIndex + 1)) * radiusVariation
          const latJitter = ((seed % 11) - 5) * .0022
          const lonJitter = (((seed * 7) % 13) - 6) * .0022
          const lat = site.lat + Math.sin(angle) * radius + latJitter
          const lon = site.lon + Math.cos(angle) * radius + lonJitter
          // A communication issue belongs to the individual plant, so its marker is
          // fully offline (red). The parent site remains partial/amber while any of
          // its other plants are still communicating.
          const mappedCommunicationIssue = mappedPlant.communicationIssue || site.name === 'Mundargi'
          const livePlant = site.name === 'Bhokar' ? bhokarLivePlant(bhokarRealtime, mappedPlant) : null
          const realtimeCommunicationIssue = site.name === 'Bhokar' && (!livePlant?.available || livePlant?.stale)
          const plantCommunicationIssue = site.name === 'Bhokar' ? realtimeCommunicationIssue : mappedCommunicationIssue
          const generation = site.name === 'Bhokar'
            ? Number(livePlant?.currentMw) || 0
            : plantCommunicationIssue ? 0 : site.currentMw * (mappedPlant.ac / operationalCapacity)
          const mappedStatus = plantCommunicationIssue ? { label: 'Offline', color: '#ff4d62' } : { label: 'Online', color: '#42ec61' }
          const issueLabel = site.name === 'Mundargi' ? 'SCADA SERVER ISSUE' : 'COMMUNICATION DOWN'
          const popup = `<div class="plant-popup"><b>${mappedPlant.plantName}</b><span>${mappedPlant.customerName}</span><small>${site.name} · ${mappedPlant.state}</small><hr/><span>AC capacity <b>${mappedPlant.ac.toFixed(2)} MW</b></span><span>DC capacity <b>${mappedPlant.dc.toFixed(2)} MWp</b></span><span>Current generation <b>${generation.toFixed(2)} MW</b></span><span>Communication <b style="color:${mappedStatus.color}">${plantCommunicationIssue ? issueLabel : 'HEALTHY'}</b></span><span>Commissioned <b>${mappedPlant.commissioningDate || '—'}</b></span></div>`
          const marker = L.marker([lat, lon], { icon: plantIcon(mappedStatus, true), riseOnHover: true })
            .bindTooltip(`<div class="plant-hover"><b>${mappedPlant.plantName}</b><span>${mappedPlant.customerName}</span><hr/><span>Site <strong>${site.name}</strong></span><span>Generation <strong>${generation.toFixed(2)} MW</strong></span><span>Communication <strong style="color:${mappedStatus.color}">${plantCommunicationIssue ? issueLabel : 'HEALTHY'}</strong></span></div>`, { direction: 'top', className: 'plant-label' })
            .bindPopup(popup).addTo(layer)
          marker.on('click', () => {
            if (site.name === 'Bhokar') onOpenBhokarPlant?.(mappedPlant)
            else onSelectScope?.(scope.type === 'enrich-plant' && scope.id === mappedPlant.id ? null : { type: 'enrich-plant', id: mappedPlant.id, siteId: site.id, name: mappedPlant.plantName, parent: site, mappedPlant })
          })
          return [lat, lon]
        })
        layer.addTo(map)
        enrichPlantsLayerRef.current = layer
        if (scope.type === 'enrich-plant') map.setView(mappedPositions[0], 9, { animate: true })
        else map.fitBounds(L.latLngBounds(mappedPositions), { padding: [80, 80], maxZoom: 9 })
      }
    }
    if (scope?.type === 'enrich' && plants.length === 1 && !(plantMapping[plants[0].name] || []).length) map.setView([plants[0].lat, plants[0].lon], 7, { animate: true })
  }, [plants, selectedEnrichId, onSelectScope, scope, plantMapping, bhokarRealtime, onOpenBhokarPlant])

  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    const displayedCustomers = scope?.type === 'customer' || scope?.type === 'third-party-plant'
      ? thirdPartyCustomers.filter((customer) => customer.id === (scope.customerId || scope.id))
      : scope?.type === 'enrich' || scope?.type === 'enrich-plant' || scope?.type === 'portfolio-enrich' ? [] : thirdPartyCustomers
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
      const customerCommunicationColor = customer.communicationStatus === 'failed' ? '#ff4057' : customer.communicationStatus === 'partial' ? '#ff9f32' : '#9b5de5'
      let marker = thirdPartyMarkersRef.current[customer.id]
      if (!marker) {
        marker = L.marker([customer.lat, customer.lon], { icon: thirdPartyIcon(customer), riseOnHover: true, zIndexOffset: 500 })
          .addTo(map)
          .bindTooltip(`<b>${customer.name}</b><br>${customer.plants.length} third-party plants · click to expand`, { direction: 'top', className: 'third-party-tooltip' })
        marker.on('click', () => {
          setSelectedEnrichId(null)
          setSelectedCustomerId((current) => current === customer.id ? null : customer.id)
          onSelectScope?.(scope?.type === 'customer' && scope.id === customer.id ? null : { type: 'customer', id: customer.id, customerId: customer.id, name: customer.name, customer })
        })
        thirdPartyMarkersRef.current[customer.id] = marker
      }
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
        label.on('click', () => {
          setSelectedEnrichId(null)
          setSelectedCustomerId((current) => current === customer.id ? null : customer.id)
          onSelectScope?.(scope?.type === 'customer' && scope.id === customer.id ? null : { type: 'customer', id: customer.id, customerId: customer.id, name: customer.name, customer })
        })
        callout = { line, label }
        thirdPartyCalloutsRef.current[customer.id] = callout
      }
      callout.line.setStyle({ color: customerCommunicationColor })
      callout.label.setIcon(thirdPartyCalloutIcon(customer, selectedCustomerId === customer.id))
    })

    if (expandedPlantsRef.current) {
      map.removeLayer(expandedPlantsRef.current)
      expandedPlantsRef.current = null
    }
    const selected = thirdPartyCustomers.find((customer) => customer.id === selectedCustomerId)
    if (!selected) {
      if (scope?.type === 'enrich' || scope?.type === 'enrich-plant' || scope?.type === 'portfolio-enrich') return
      map.fitBounds([[7.5, 68], [35.8, 97.5]], { padding: [26, 26] })
      return
    }
    const layer = L.layerGroup()
    const displayedThirdPartyPlants = scope?.type === 'third-party-plant'
      ? selected.plants.filter((plant) => plant.id === scope.plant.id)
      : selected.plants
    displayedThirdPartyPlants.forEach((plant) => {
      const communicationColor = plant.communicationIssue ? '#ff9f32' : '#43f467'
      const popup = `<div class="plant-popup third-party-site-popup"><b>${plant.site}</b><span>${selected.name} · ${plant.cluster}</span><hr/><span>Installed capacity <b>${plant.ac} MW AC</b></span><span>Live power <b>${plant.simulatedMw.toFixed(2)} MW</b></span><span>Data source <b>Real-time telemetry</b></span><span>Communication <b style="color:${communicationColor}">${plant.communicationIssue ? 'ISSUE' : 'HEALTHY'}</b></span><span>Status <b>${plant.status}</b></span></div>`
      const plantMarker = L.marker([plant.lat, plant.lon], { icon: thirdPartyPlantIcon(plant), riseOnHover: true })
        .bindTooltip(`<div class="plant-hover"><b>${plant.site}</b><span>${selected.name}</span><hr/><span>Live power <strong>${plant.simulatedMw.toFixed(2)} MW</strong></span><span>Capacity <strong>${plant.ac} MW AC</strong></span><span>Communication <strong style="color:${communicationColor}">${plant.communicationIssue ? 'ISSUE' : 'HEALTHY'}</strong></span></div>`, { direction: 'top', className: 'plant-label' })
        .bindPopup(popup).addTo(layer)
      plantMarker.on('click', () => onSelectScope?.(scope?.type === 'third-party-plant' && scope.id === plant.id ? null : { type: 'third-party-plant', id: plant.id, customerId: selected.id, name: plant.site, customer: selected, plant }))
    })
    layer.addTo(map)
    expandedPlantsRef.current = layer
    map.fitBounds(L.latLngBounds(displayedThirdPartyPlants.map((plant) => [plant.lat, plant.lon])), { padding: [65, 65], maxZoom: 8 })
  }, [thirdPartyCustomers, selectedCustomerId, scope, onSelectScope])

  const online = plants.filter((plant) => statusOf(plant).label === 'Online').length
  const thirdPartyCapacity = thirdPartyCustomers.reduce((sum, customer) => sum + customer.ac, 0)
  const selectedThirdPartyCapacity = scope?.plant?.ac ?? scope?.customer?.ac
  const selectedThirdPartyGeneration = scope?.plant?.simulatedMw ?? scope?.customer?.simulatedMw
  const thirdPartyGeneration = thirdPartyCustomers.reduce((sum, customer) => sum + customer.simulatedMw, 0)
  const thirdPartyPlantCount = thirdPartyCustomers.reduce((sum, customer) => sum + customer.plants.length, 0)
  const reportingCount = scope?.type === 'third-party-plant' ? 1 : scope?.type === 'customer' ? scope.customer.plants.length : scope?.type === 'portfolio-third-party' ? thirdPartyPlantCount : plants.length + (scope ? 0 : thirdPartyPlantCount)
  const reportingOnline = scope?.type === 'customer' || scope?.type === 'third-party-plant'
    ? reportingCount
    : scope?.type === 'portfolio-third-party' ? thirdPartyPlantCount : online + (scope ? 0 : thirdPartyPlantCount)
  const installedCapacity = selectedThirdPartyCapacity ?? (scope?.type === 'portfolio-third-party' ? thirdPartyCapacity : plants.reduce((sum, plant) => sum + plant.capacity, 0) + (scope ? 0 : thirdPartyCapacity))
  const liveGeneration = selectedThirdPartyGeneration ?? (scope?.type === 'portfolio-third-party' ? thirdPartyGeneration : plants.reduce((sum, plant) => sum + plant.currentMw, 0) + (scope ? 0 : thirdPartyGeneration))
  const fleetAvailability = scope?.type === 'customer' || scope?.type === 'third-party-plant' || scope?.type === 'portfolio-third-party'
    ? 100
    : reportingCount
      ? (plants.reduce((sum, plant) => sum + plant.availability, 0) + (scope ? 0 : thirdPartyPlantCount * 100)) / reportingCount
      : 100
  const activeMappedPlants = (scope?.type === 'enrich' || scope?.type === 'enrich-plant') && plants[0] ? plantMapping[plants[0].name] || [] : []
  return (
    <Paper elevation={0} className="glass-panel map-panel">
      <Box className="panel-heading">
        <Typography className="panel-title">LIVE SITE MAP - INDIA</Typography>
        <Box className="map-legend"><span><i className="green-dot" />Enrich site</span><span><i className="third-party-dot" />Third-party customer</span></Box>
      </Box>
      <Box className="india-map-wrap"><div ref={containerRef} className="india-leaflet-map" />{activeMappedPlants.length > 0 && <div className="map-drilldown-badge"><b>{plants[0].name}</b><span>{scope?.type === 'enrich-plant' ? `1 of ${activeMappedPlants.length} plants selected` : `${activeMappedPlants.length} plants · live generation ${plants[0].currentMw.toFixed(2)} MW`}</span></div>}<div className="map-live-badge">● LIVE GPS / SCADA</div></Box>
      <div className="map-layer-key">
        <button className={scope?.type === 'portfolio-enrich' ? 'active enrich-filter' : 'enrich-filter'} aria-pressed={scope?.type === 'portfolio-enrich'} onClick={() => onSelectScope?.(scope?.type === 'portfolio-enrich' ? null : { type: 'portfolio-enrich', name: 'Enrich commissioned' })}><i className="enrich-key" />Enrich commissioned</button>
        <button className={scope?.type === 'portfolio-third-party' ? 'active third-party-filter' : 'third-party-filter'} aria-pressed={scope?.type === 'portfolio-third-party'} onClick={() => onSelectScope?.(scope?.type === 'portfolio-third-party' ? null : { type: 'portfolio-third-party', name: 'Third-party sites' })}><i className="third-party-key" />Third-party sites</button>
      </div>
      <Box className="map-summary">
        <div className="map-reading"><span>Plants reporting</span><strong>{reportingOnline} / {reportingCount}</strong></div>
        <div className="map-reading"><span>Installed capacity</span><strong>{installedCapacity.toFixed(0)} MW</strong></div>
        <div className="map-reading"><span>Live generation</span><strong>{liveGeneration.toFixed(1)} MW</strong></div>
        <div className="map-reading"><span>Fleet availability</span><strong>{fleetAvailability.toFixed(1)}%</strong></div>
      </Box>
    </Paper>
  )
}

export default IndiaMap
