import { useEffect, useRef } from 'react'
import { Box, Paper, Typography } from '@mui/material'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

const statusOf = (plant) => {
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
  html: `<div class="site-callout ${status.label === 'Offline' ? 'offline' : ''}"><b>${plant.name}</b><span>${plant.currentMw.toFixed(2)} MW</span></div>`,
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

const IndiaMap = ({ plants }) => {
  const containerRef = useRef(null)
  const mapRef = useRef(null)
  const markersRef = useRef({})
  const calloutsRef = useRef({})

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
      const hoverContent = `<div class="plant-hover"><b>${plant.name}</b><span>${plant.state}</span><hr/><span>Capacity <strong>${plant.capacity} MW</strong></span><span>Live power <strong>${plant.currentMw.toFixed(2)} MW</strong></span><span>Status <strong style="color:${status.color}">${status.label}</strong></span></div>`
      const popup = `<div class="plant-popup"><b>${plant.name} Solar Plant</b><span>${plant.state}</span><small>${plant.lat.toFixed(6)}° N, ${plant.lon.toFixed(6)}° E</small><hr/><span>Capacity <b>${plant.capacity} MW</b></span><span>Generation <b>${plant.currentMw.toFixed(2)} MW</b></span><span>PR <b>${plant.pr.toFixed(1)}%</b></span><span>Status <b style="color:${status.color}">${status.label}</b></span><span>Last scan <b>${plant.lastUpdated}</b></span></div>`
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
          const label = L.marker(anchor, {
            icon: calloutIcon(plant, status), interactive: false, keyboard: false,
          }).addTo(map)
          callout = { line, label }
          calloutsRef.current[plant.id] = callout
        }
        callout.line.setStyle({ color: status.color })
        callout.label.setIcon(calloutIcon(plant, status))
      }
    })
  }, [plants])

  const online = plants.filter((plant) => statusOf(plant).label === 'Online').length
  return (
    <Paper elevation={0} className="glass-panel map-panel">
      <Box className="panel-heading">
        <Typography className="panel-title">LIVE SITE MAP - INDIA</Typography>
        <Box className="map-legend"><span><i className="green-dot" />Online</span><span><i className="amber-dot" />Warning</span><span><i className="red-dot" />Offline</span></Box>
      </Box>
      <Box className="india-map-wrap"><div ref={containerRef} className="india-leaflet-map" /><div className="map-live-badge">● LIVE GPS / SCADA</div></Box>
      <Box className="map-summary">
        <div className="map-reading"><span>Plants reporting</span><strong>{online} / {plants.length}</strong></div>
        <div className="map-reading"><span>Installed capacity</span><strong>{plants.reduce((s,p)=>s+p.capacity,0).toFixed(0)} MW</strong></div>
        <div className="map-reading"><span>Live generation</span><strong>{plants.reduce((s,p)=>s+p.currentMw,0).toFixed(1)} MW</strong></div>
        <div className="map-reading"><span>Fleet availability</span><strong>{(plants.reduce((s,p)=>s+p.availability,0)/plants.length).toFixed(1)}%</strong></div>
      </Box>
    </Paper>
  )
}

export default IndiaMap
