import { Box, Paper, Typography, Chip } from '@mui/material'
import { Public } from '@mui/icons-material'

const getPlantColor = (plant) => {
  if (plant.alarm !== 'None') return '#ff6b6b'
  if (plant.communication === 'Degraded' || plant.health === 'Critical') return '#ffb347'
  if (plant.pr < 82) return '#ffd93d'
  return '#00d949'
}

const LiveMap = ({ plants }) => (
  <Paper elevation={0} className="glass-panel map-panel">
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
      <Public sx={{ fontSize: 18, color: '#00d4ff' }} />
      <Typography className="section-label">WORLD MAP</Typography>
    </Box>

    <Box className="map-shell" sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, p: 2 }}>
      {/* Map placeholder with world visualization */}
      <Box sx={{
        height: 300,
        background: 'radial-gradient(ellipse at center, rgba(0, 212, 255, 0.08) 0%, rgba(10, 14, 39, 0.6) 100%)',
        border: '1px solid rgba(0, 212, 255, 0.1)',
        borderRadius: 2,
        display: 'grid',
        placeItems: 'center',
        position: 'relative',
        overflow: 'hidden',
      }}>
        <Box sx={{
          position: 'absolute',
          inset: 0,
          background: 'url("data:image/svg+xml,%3Csvg width=%27100%27 height=%27100%27 xmlns=%27http://www.w3.org/2000/svg%27%3E%3Cpath d=%27M 20 30 Q 40 10 60 30 T 100 50 L 100 100 L 0 100 Z%27 fill=%27rgba(0,212,255,0.03)%27/%3E%3C/svg%3E") repeat',
          opacity: 0.3,
        }} />
        
        {/* Plant activity indicators */}
        <Box sx={{ position: 'relative', width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {plants.slice(0, 4).map((plant, idx) => (
            <Box
              key={plant.id}
              sx={{
                position: 'absolute',
                width: 12,
                height: 12,
                borderRadius: '50%',
                background: getPlantColor(plant),
                boxShadow: `0 0 12px ${getPlantColor(plant)}`,
                animation: 'pulse 2s infinite',
                left: `${20 + idx * 20}%`,
                top: `${30 + (idx % 2) * 30}%`,
              }}
            />
          ))}
        </Box>
      </Box>

      {/* Active locations summary */}
      <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
        <Chip icon={<Box sx={{ width: 8, height: 8, borderRadius: '50%', background: '#00d949' }} />} label="Online" size="small" />
        <Chip icon={<Box sx={{ width: 8, height: 8, borderRadius: '50%', background: '#ffb347' }} />} label="Warning" size="small" />
        <Chip icon={<Box sx={{ width: 8, height: 8, borderRadius: '50%', background: '#ff6b6b' }} />} label="Offline" size="small" />
      </Box>

      {/* Quick stats */}
      <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 1.5, pt: 1, borderTop: '1px solid rgba(255,255,255,0.05)' }}>
        <Box sx={{ textAlign: 'center' }}>
          <Typography sx={{ fontSize: 10, color: '#7a8fa3', textTransform: 'uppercase', letterSpacing: 0.1 }}>Active</Typography>
          <Typography sx={{ fontSize: 16, color: '#00d949', fontWeight: 700 }}>{plants.filter(p => p.communication !== 'Failed').length}</Typography>
        </Box>
        <Box sx={{ textAlign: 'center' }}>
          <Typography sx={{ fontSize: 10, color: '#7a8fa3', textTransform: 'uppercase', letterSpacing: 0.1 }}>Total</Typography>
          <Typography sx={{ fontSize: 16, color: '#00d4ff', fontWeight: 700 }}>{plants.length}</Typography>
        </Box>
        <Box sx={{ textAlign: 'center' }}>
          <Typography sx={{ fontSize: 10, color: '#7a8fa3', textTransform: 'uppercase', letterSpacing: 0.1 }}>Regions</Typography>
          <Typography sx={{ fontSize: 16, color: '#8b5cf6', fontWeight: 700 }}>6</Typography>
        </Box>
      </Box>
    </Box>
  </Paper>
)

export default LiveMap
