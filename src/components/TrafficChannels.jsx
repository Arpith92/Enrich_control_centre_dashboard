import { Box, Typography } from '@mui/material'

export default function TrafficChannels({ plants }) {
  const channels = [
    { name: 'Direct', value: 2852, percent: 42 },
    { name: 'Organic', value: 1834, percent: 28 },
    { name: 'Referral', value: 1290, percent: 20 },
    { name: 'Social', value: 412, percent: 10 },
  ]

  return (
    <Box className="glass-panel chart-panel">
      <Typography className="section-label" sx={{ mb: 1.5 }}>TRAFFIC CHANNELS</Typography>
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.2 }}>
        {channels.map((ch) => (
          <Box key={ch.name}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
              <Typography sx={{ fontSize: 12, color: '#d4e4f7' }}>{ch.name}</Typography>
              <Typography sx={{ fontSize: 12, color: '#00d4ff', fontWeight: 600 }}>{ch.value}</Typography>
            </Box>
            <Box sx={{ height: 4, background: 'rgba(255,255,255,0.05)', borderRadius: 2, overflow: 'hidden' }}>
              <Box sx={{ height: '100%', background: 'linear-gradient(90deg, #00d4ff, #8b5cf6)', width: `${ch.percent}%` }} />
            </Box>
          </Box>
        ))}
      </Box>
    </Box>
  )
}
