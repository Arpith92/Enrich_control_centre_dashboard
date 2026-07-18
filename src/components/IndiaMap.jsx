import { useEffect, useRef, useState } from 'react'
import { Box, Paper, Typography } from '@mui/material'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { simulateThirdPartyCustomers } from '../data/thirdPartySites'

const statusOf = (plant) => {
  if (plant.communication === 'Failed' || plant.communicationIssue) return { label: 'Offline', color: '#ff4d62' }
  if (plant.telemetrySource === 'SCADA') return { label: 'Online', color: '#42ec61' }
  if (plant.name === 'Mundargi') return { label: 'Offline', color: '#ff4057' }
  if (plant.communication === 'Failed') return { label: 'Offline', color: '#ff4d62' }
  return { label: 'Online', color: '#42ec61' }
}

const calloutPositions = {
  BEL2MW: [32.2, 80.5],
  PGCIL: [28.5, 68.8],
  BEL1MW: [27.2, 91.5],
  Umri: [24.8, 85.2],
  Bhokar: [20.5, 85.2],
  Zaheerabad: [25.5, 68.8],
  Mandrup: [22.5, 68.8],
  Kumbhari: [19.5, 68.8],
  Karajgi: [16.5, 68.8],
  Tuljapur: [13.5, 68.8],
  Mundargi: [10.5, 68.8],
  Turmamidi: [16.3, 85.2],
  'NLC Poolangal': [9.2, 84],
}

const calloutIcon = (plant, status) => L.divIcon({
  className: 'site-callout-shell',
  html: `<div class="site-callout ${status.label === 'Offline' ? 'offline' : ''}"><b>${plant.name}</b><span>${plant.currentMw.toFixed(2)} MW${plant.communicationIssue ? ' · COMM ISSUE' : plant.telemetrySource === 'SCADA' ? ' · 1-MIN AVG' : ''}</span></div>`,
  iconSize: [104, 38],
  iconAnchor: calloutPositions[plant.name]?.[1] < plant.lon ? [104, 19] : [0, 19],
})

const plantIcon = (status) => L.divIcon({
  className: 'plant-marker-shell',
  html: `<span class="plant-marker ${status.label === 'Offline' ? 'offline' : 'online'}"><i></i></span>`,
  iconSize: [24, 24],
  iconAnchor: [12, 12],
  tooltipAnchor: [0, -12],
})

const thirdPartyIcon = (customer) => L.divIcon({
  className: 'third-party-marker-shell',
  html: `<span class="plant-marker third-party-customer ${customer.selected ? 'selected' : ''}"><i>${customer.name.split(' ').map((word) => word[0]).join('').slice(0, 2)}</i><b>${customer.plants.length}</b></span>`,
  iconSize: [38, 38],
  // Atnu and Reliance centroids are close; offset their icons to keep both clickable.
  iconAnchor: customer.id === 'atnu' ? [40, 36] : customer.id === 'reliance' ? [-2, 2] : [19, 19],
  popupAnchor: [0, -18],
})

const thirdPartyPlantIcon = (plant) => L.divIcon({
  className: 'plant-marker-shell',
  html: `<span class="plant-marker third-party-plant-marker ${plant.status === 'Warning' ? 'warning' : ''}"><i></i></span>`,
  iconSize: [24, 24], iconAnchor: [12, 12], tooltipAnchor: [0, -12],
})

const IndiaMap = ({ plants }) => {
  const containerRef = useRef(null)
  const mapRef = useRef(null)
  const markersRef = useRef({})
  const calloutsRef = useRef({})
  const thirdPartyMarkersRef = useRef({})
  const expandedPlantsRef = useRef(null)
  const [thirdPartyCustomers, setThirdPartyCustomers] = useState(() => simulateThirdPartyCustomers())
  const [selectedCustomerId, setSelectedCustomerId] = useState(null)

  useEffect(() => {
    const interval = window.setInterval(() => setThirdPartyCustomers(simulateThirdPartyCustomers()), 30000)
    return () => window.clearInterval(interval)
  }, [])

  useEffect(() => {
    const selectCustomer = (event) => setSelectedCustomerId(event.detail || null)
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
      expandedPlantsRef.current = null
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
      }
    })
    plants.forEach((plant) => {
      const status = statusOf(plant)
      const source = plant.communicationIssue ? 'SCADA communication issue' : plant.telemetrySource === 'SCADA' ? `SCADA 1-minute average · ${plant.inverterCount || 0} inverter(s)` : 'Simulation fallback'
      const cumulative = Number.isFinite(plant.cumulativeGenerationMWh) ? `<span>Cumulative generation <strong>${plant.cumulativeGenerationMWh.toLocaleString('en-IN')} MWh</strong></span>` : ''
      const hoverContent = `<div class="plant-hover"><b>${plant.name}</b><span>${plant.state}</span><hr/><span>Capacity <strong>${plant.capacity} MW</strong></span><span>Live power <strong>${plant.currentMw.toFixed(2)} MW</strong></span>${cumulative}<span>Source <strong>${source}</strong></span><span>Status <strong style="color:${status.color}">${status.label}</strong></span></div>`
      const popup = `<div class="plant-popup"><b>${plant.name} Solar Plant</b><span>${plant.state}</span><small>${plant.lat.toFixed(6)}° N, ${plant.lon.toFixed(6)}° E</small><hr/><span>Capacity <b>${plant.capacity} MW</b></span><span>Generation <b>${plant.currentMw.toFixed(2)} MW</b></span>${cumulative}<span>Source <b>${source}</b></span><span>PR <b>${plant.pr.toFixed(1)}%</b></span><span>Status <b style="color:${status.color}">${status.label}</b></span><span>Last scan <b>${plant.lastUpdated}</b></span></div>`
      let marker = markersRef.current[plant.id]
      if (!marker) {
        marker = L.marker([plant.lat, plant.lon], { icon: plantIcon(status), riseOnHover: true })
          .addTo(map).bindTooltip('', { direction: 'top', offset: [0, -8], className: 'plant-label', opacity: 1 }).bindPopup(popup)
        markersRef.current[plant.id] = marker
      }
      marker.setIcon(plantIcon(status))
      marker.setTooltipContent(hoverContent)
      marker.setPopupContent(popup)

      const anchor = calloutPositions[plant.name]
      if (anchor) {
        let callout = calloutsRef.current[plant.id]
        if (!callout) {
          const line = L.polyline([[plant.lat, plant.lon], anchor], {
            color: status.color, weight: 1, opacity: 0.72, dashArray: '3 3', interactive: false,
          }).addTo(map)
          const isBhokar = plant.name === 'Bhokar'
          const label = L.marker(anchor, {
            icon: calloutIcon(plant, status), interactive: isBhokar, keyboard: isBhokar,
            title: isBhokar ? 'Open Bhokar live SCADA details' : '',
          }).addTo(map)
          if (isBhokar) label.on('click', () => { window.location.hash = 'bhokar' })
          callout = { line, label }
          calloutsRef.current[plant.id] = callout
        }
        callout.line.setStyle({ color: status.color })
        callout.label.setIcon(calloutIcon(plant, status))
      }
    })
  }, [plants])

  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    thirdPartyCustomers.forEach((customer) => {
      let marker = thirdPartyMarkersRef.current[customer.id]
      if (!marker) {
        marker = L.marker([customer.lat, customer.lon], { icon: thirdPartyIcon(customer), riseOnHover: true, zIndexOffset: 500 })
          .addTo(map)
          .bindTooltip(`<b>${customer.name}</b><br>${customer.plants.length} third-party plants · click to expand`, { direction: 'top', className: 'third-party-tooltip' })
        marker.on('click', () => setSelectedCustomerId((current) => current === customer.id ? null : customer.id))
        thirdPartyMarkersRef.current[customer.id] = marker
      }
      marker.setIcon(thirdPartyIcon({ ...customer, selected: selectedCustomerId === customer.id }))
    })

    if (expandedPlantsRef.current) {
      map.removeLayer(expandedPlantsRef.current)
      expandedPlantsRef.current = null
    }
    const selected = thirdPartyCustomers.find((customer) => customer.id === selectedCustomerId)
    if (!selected) {
      map.fitBounds([[7.5, 68], [35.8, 97.5]], { padding: [26, 26] })
      return
    }
    const layer = L.layerGroup()
    selected.plants.forEach((plant) => {
      const popup = `<div class="plant-popup third-party-site-popup"><b>${plant.site}</b><span>${selected.name} · ${plant.cluster}</span><hr/><span>Installed capacity <b>${plant.ac} MW AC</b></span><span>Simulated power <b>${plant.simulatedMw.toFixed(2)} MW</b></span><span>Data source <b>Simulation</b></span><span>Status <b>${plant.status}</b></span></div>`
      L.marker([plant.lat, plant.lon], { icon: thirdPartyPlantIcon(plant), riseOnHover: true })
        .bindTooltip(`<div class="plant-hover"><b>${plant.site}</b><span>${selected.name}</span><hr/><span>Simulated <strong>${plant.simulatedMw.toFixed(2)} MW</strong></span><span>Capacity <strong>${plant.ac} MW AC</strong></span></div>`, { direction: 'top', className: 'plant-label' })
        .bindPopup(popup).addTo(layer)
    })
    layer.addTo(map)
    expandedPlantsRef.current = layer
    map.fitBounds(L.latLngBounds(selected.plants.map((plant) => [plant.lat, plant.lon])), { padding: [65, 65], maxZoom: 8 })
  }, [thirdPartyCustomers, selectedCustomerId])

  const online = plants.filter((plant) => statusOf(plant).label === 'Online').length
  const thirdPartyCapacity = thirdPartyCustomers.reduce((sum, customer) => sum + customer.ac, 0)
  return (
    <Paper elevation={0} className="glass-panel map-panel">
      <Box className="panel-heading">
        <Typography className="panel-title">LIVE SITE MAP - INDIA</Typography>
        <Box className="map-legend"><span><i className="green-dot" />Enrich site</span><span><i className="third-party-dot" />Third-party customer</span></Box>
      </Box>
      <Box className="india-map-wrap"><div ref={containerRef} className="india-leaflet-map" /><div className="map-live-badge">● LIVE GPS / SCADA</div></Box>
      <div className="map-layer-key"><span><i className="enrich-key" />Enrich installed</span><span><i className="third-party-key" />Third party · simulated</span></div>
      <Box className="map-summary">
        <div className="map-reading"><span>Plants reporting</span><strong>{online} / {plants.length}</strong></div>
        <div className="map-reading"><span>Installed capacity · all sites</span><strong>{(plants.reduce((s,p)=>s+p.capacity,0) + thirdPartyCapacity).toFixed(0)} MW</strong></div>
        <div className="map-reading"><span>Live generation</span><strong>{plants.reduce((s,p)=>s+p.currentMw,0).toFixed(1)} MW</strong></div>
        <div className="map-reading"><span>Fleet availability</span><strong>{(plants.reduce((s,p)=>s+p.availability,0)/plants.length).toFixed(1)}%</strong></div>
      </Box>
    </Paper>
  )
}

export default IndiaMap
