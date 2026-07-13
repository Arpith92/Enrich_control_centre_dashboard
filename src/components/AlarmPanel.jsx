import { Box, Chip, Paper, Typography } from '@mui/material'
import { Cloud, Wifi, WarningAmber } from '@mui/icons-material'

const AlarmPanel = ({ events, plants }) => {
  const criticalAlerts = events.filter(e => e.severity === 'critical').slice(0, 5)
  const warningAlerts = events.filter(e => e.severity === 'warning').slice(0, 3)
  const allAlerts = [...criticalAlerts, ...warningAlerts].slice(0, 8)

  const getAlertColor = (severity) => {
    const colors = {
      critical: '#ff6b6b',
      warning: '#ffb347',
      info: '#00d4ff',
      success: '#00d949',
    }
    return colors[severity] || '#00d4ff'
  }

  return (
    <Paper elevation={0} className="glass-panel side-panel" sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
      {/* Header */}
      <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', pb: 1, borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
        <WarningAmber sx={{ color: '#ff6b6b', fontSize: 18 }} />
        <Typography variant="h6" sx={{ fontSize: 13, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.1 }}>
          LIVE ALARMS
        </Typography>
        <Chip
          label={allAlerts.length}
          size="small"
          sx={{ ml: 'auto', background: '#ff6b6b', color: '#fff', fontSize: 10, height: 20 }}
        />
      </Box>

      {/* Alerts List */}
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, maxHeight: 300, overflowY: 'auto' }}>
        {allAlerts.length > 0 ? (
          allAlerts.map((alert, idx) => (
            <Box
              key={idx}
              sx={{
                p: 1,
                background: `${getAlertColor(alert.severity)}15`,
                border: `1px solid ${getAlertColor(alert.severity)}40`,
                borderRadius: 1,
                display: 'flex',
                gap: 1,
              }}
            >
              <Box
                sx={{
                  width: 3,
                  background: getAlertColor(alert.severity),
                  borderRadius: '2px',
                  flexShrink: 0,
                }}
              />
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography sx={{ fontSize: 11, color: '#d4e4f7', fontWeight: 600 }}>
                  {alert.plant}
                </Typography>
                <Typography sx={{ fontSize: 10, color: '#9fb3d1', mt: 0.3 }}>
                  {alert.message || alert.title}
                </Typography>
                <Typography sx={{ fontSize: 9, color: '#7a8fa3', mt: 0.3 }}>
                  {alert.time || alert.timestamp}
                </Typography>
              </Box>
              <Box
                sx={{
                  px: 1,
                  py: 0.5,
                  background: getAlertColor(alert.severity),
                  borderRadius: '4px',
                  fontSize: 9,
                  fontWeight: 700,
                  color: '#fff',
                  textTransform: 'uppercase',
                  textAlign: 'center',
                  minWidth: 50,
                }}
              >
                {alert.severity === 'critical' ? 'HIGH' : alert.severity === 'warning' ? 'MED' : 'LOW'}
              </Box>
            </Box>
          ))
        ) : (
          <Typography sx={{ fontSize: 12, color: '#7a8fa3', py: 2, textAlign: 'center' }}>
            No active alarms
          </Typography>
        )}
      </Box>

      {/* Weather Summary */}
      <Box sx={{ pb: 1, borderTop: '1px solid rgba(255,255,255,0.05)', pt: 1 }}>
        <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', mb: 1 }}>
          <Cloud sx={{ fontSize: 16, color: '#00d4ff' }} />
          <Typography sx={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.1 }}>
            WEATHER SUMMARY
          </Typography>
        </Box>
        <Typography sx={{ fontSize: 10, color: '#9fb3d1' }}>
          Irradiance: 812 W/m² • Wind: 18 km/h • Humidity: 42%
        </Typography>
      </Box>

      {/* Communication Status */}
      <Box sx={{ pb: 1, borderTop: '1px solid rgba(255,255,255,0.05)', pt: 1 }}>
        <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', mb: 1 }}>
          <Wifi sx={{ fontSize: 16, color: '#00d949' }} />
          <Typography sx={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.1 }}>
            COMMUNICATION STATUS
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
          <Box sx={{ width: 8, height: 8, borderRadius: '50%', background: '#00d949' }} />
          <Typography sx={{ fontSize: 10, color: '#9fb3d1' }}>
            {plants.filter(p => p.communication !== 'Failed').length}/{plants.length} plants connected
          </Typography>
        </Box>
      </Box>
    </Paper>
  )
}

export default AlarmPanel
