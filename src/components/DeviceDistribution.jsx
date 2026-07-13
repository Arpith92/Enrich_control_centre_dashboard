import { Box, Typography } from '@mui/material'

export default function DeviceDistribution({ plants }) {
  const devices = [
    { name: 'Desktop', value: 58 },
    { name: 'Mobile', value: 30 },
    { name: 'Tablet', value: 12 },
  ]

  return (
    <Box className="glass-panel chart-panel">
      <Typography className="section-label" sx={{ mb: 1.5 }}>DEVICE DISTRIBUTION</Typography>
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.2 }}>
        {devices.map((dev) => (
          <Box key={dev.name}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
              <Typography sx={{ fontSize: 12, color: '#d4e4f7' }}>{dev.name}</Typography>
              <Typography sx={{ fontSize: 12, color: '#00d949', fontWeight: 600 }}>{dev.value}%</Typography>
            </Box>
            <Box sx={{ height: 4, background: 'rgba(255,255,255,0.05)', borderRadius: 2, overflow: 'hidden' }}>
              <Box sx={{ height: '100%', background: 'linear-gradient(90deg, #00d949, #00d4ff)', width: `${dev.value}%` }} />
            </Box>
          </Box>
        ))}
      </Box>
    </Box>
  )
}
