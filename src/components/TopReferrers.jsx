import { Box, Typography } from '@mui/material'

export default function TopReferrers({ plants }) {
  const referrers = [
    { name: 'google.com', visits: 4821, percent: 45 },
    { name: 'twitter.com', visits: 2145, percent: 20 },
    { name: 'facebook.com', visits: 1842, percent: 17 },
    { name: 'github.com', visits: 1200, percent: 12 },
  ]

  return (
    <Box className="glass-panel chart-panel">
      <Typography className="section-label" sx={{ mb: 1.5 }}>TOP REFERRERS</Typography>
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.2 }}>
        {referrers.map((ref) => (
          <Box key={ref.name}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
              <Typography sx={{ fontSize: 11, color: '#9fb3d1', fontFamily: 'monospace', truncate: true }}>
                {ref.name.slice(0, 16)}
              </Typography>
              <Typography sx={{ fontSize: 12, color: '#8b5cf6', fontWeight: 600 }}>{ref.visits}</Typography>
            </Box>
            <Box sx={{ height: 4, background: 'rgba(255,255,255,0.05)', borderRadius: 2, overflow: 'hidden' }}>
              <Box sx={{ height: '100%', background: 'linear-gradient(90deg, #8b5cf6, #00d4ff)', width: `${ref.percent}%` }} />
            </Box>
          </Box>
        ))}
      </Box>
    </Box>
  )
}
