import { Box, Typography } from '@mui/material'

export default function TopPages({ plants }) {
  const pages = [
    { name: '/home', views: 5284, bounce: 42 },
    { name: '/products', views: 3891, bounce: 35 },
    { name: '/blog/post-1', views: 2145, bounce: 28 },
    { name: '/pricing', views: 1842, bounce: 51 },
  ]

  return (
    <Box className="glass-panel chart-panel">
      <Typography className="section-label" sx={{ mb: 1.5 }}>TOP PAGES</Typography>
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.2 }}>
        {pages.map((page) => (
          <Box key={page.name}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.5 }}>
              <Typography sx={{ fontSize: 11, color: '#9fb3d1', fontFamily: 'monospace' }}>{page.name}</Typography>
              <Typography sx={{ fontSize: 12, color: '#00d4ff', fontWeight: 600 }}>{page.views}</Typography>
            </Box>
            <Box sx={{ display: 'flex', gap: 0.5, alignItems: 'center' }}>
              <Box sx={{ height: 2, background: 'rgba(255,255,255,0.05)', borderRadius: 1, flex: 1, overflow: 'hidden' }}>
                <Box sx={{ height: '100%', background: '#00d949', width: `${100 - page.bounce}%` }} />
              </Box>
              <Typography sx={{ fontSize: 10, color: '#7a8fa3', minWidth: 24 }}>{page.bounce}%</Typography>
            </Box>
          </Box>
        ))}
      </Box>
    </Box>
  )
}
