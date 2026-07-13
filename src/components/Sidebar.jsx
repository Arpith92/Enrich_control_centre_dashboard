import { Box, Button, Stack, Tooltip } from '@mui/material'
import { Dashboard, Notifications, BarChart, Analytics, Cloud, Layers, Settings } from '@mui/icons-material'

const Sidebar = ({ activeView, onViewChange }) => {
  const navItems = [
    { id: 'dashboard', icon: <Dashboard />, label: 'Dashboard', tooltip: 'Control Centre' },
    { id: 'plants', icon: <Layers />, label: 'Plants', tooltip: 'Plant Overview' },
    { id: 'alerts', icon: <Notifications />, label: 'Alerts', tooltip: 'Live Alarms' },
    { id: 'reports', icon: <BarChart />, label: 'Reports', tooltip: 'Performance Reports' },
    { id: 'analytics', icon: <Analytics />, label: 'Analytics', tooltip: 'Data Analytics' },
    { id: 'weather', icon: <Cloud />, label: 'Weather', tooltip: 'Weather Data' },
    { id: 'settings', icon: <Settings />, label: 'Settings', tooltip: 'Configuration' },
  ]

  return (
    <Box
      sx={{
        width: 80,
        height: '100vh',
        background: 'linear-gradient(180deg, rgba(10, 14, 39, 0.95), rgba(15, 20, 56, 0.95))',
        border: '1px solid rgba(0, 212, 255, 0.1)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        py: 2,
        gap: 1,
        position: 'fixed',
        left: 0,
        top: 0,
      }}
    >
      {/* Logo */}
      <Box
        sx={{
          width: 48,
          height: 48,
          borderRadius: '50%',
          background: 'linear-gradient(135deg, #00d4ff, #8b5cf6)',
          display: 'grid',
          placeItems: 'center',
          color: '#fff',
          fontWeight: 700,
          fontSize: 20,
          mb: 2,
          cursor: 'pointer',
        }}
      >
        ☀️
      </Box>

      {/* Navigation Items */}
      <Stack spacing={1} sx={{ flex: 1 }}>
        {navItems.map((item) => (
          <Tooltip key={item.id} title={item.tooltip} placement="right" arrow>
            <Button
              onClick={() => onViewChange(item.id)}
              sx={{
                width: 56,
                height: 56,
                borderRadius: 2,
                minWidth: 'unset',
                display: 'grid',
                placeItems: 'center',
                background: activeView === item.id ? 'rgba(0, 212, 255, 0.2)' : 'transparent',
                border: activeView === item.id ? '1px solid rgba(0, 212, 255, 0.5)' : '1px solid rgba(255,255,255,0.1)',
                color: activeView === item.id ? '#00d4ff' : '#7a8fa3',
                transition: 'all 0.3s ease',
                '&:hover': {
                  background: 'rgba(0, 212, 255, 0.15)',
                  color: '#00d4ff',
                },
              }}
            >
              {item.icon}
            </Button>
          </Tooltip>
        ))}
      </Stack>

      {/* Bottom Status Indicator */}
      <Box
        sx={{
          width: 12,
          height: 12,
          borderRadius: '50%',
          background: '#00d949',
          boxShadow: '0 0 8px rgba(0, 217, 73, 0.6)',
        }}
      />
    </Box>
  )
}

export default Sidebar
