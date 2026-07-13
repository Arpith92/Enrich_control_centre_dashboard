import { Box, Typography } from '@mui/material'

export default function ActivityFeed({ events, plants }) {
  const activities = events?.slice(0, 8) || []

  const getActivityIcon = (type) => {
    const iconMap = {
      'user': '👤',
      'alert': '⚠️',
      'check': '✓',
      'chart': '📊',
    }
    return iconMap[type] || '•'
  }

  const getActivityColor = (severity) => {
    const colorMap = {
      'critical': '#ff6b6b',
      'warning': '#ffb347',
      'info': '#00d4ff',
      'success': '#00d949',
    }
    return colorMap[severity] || '#00d4ff'
  }

  return (
    <Box className="glass-panel chart-panel">
      <Typography className="section-label" sx={{ mb: 1.5 }}>LIVE ACTIVITY</Typography>
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, maxHeight: 340, overflowY: 'auto' }}>
        {activities.map((activity, idx) => (
          <Box key={idx} sx={{ display: 'flex', gap: 1, pb: 1, borderBottom: idx < activities.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none' }}>
            <Box sx={{
              width: 32,
              height: 32,
              borderRadius: '50%',
              background: `${getActivityColor(activity.severity)}20`,
              display: 'grid',
              placeItems: 'center',
              color: getActivityColor(activity.severity),
              fontSize: 14,
              flexShrink: 0,
            }}>
              {getActivityIcon(activity.type)}
            </Box>
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography sx={{ fontSize: 11, color: '#d4e4f7', lineHeight: 1.3 }}>
                {activity.message || `Event from ${activity.plant}`}
              </Typography>
              <Typography sx={{ fontSize: 9, color: '#7a8fa3', mt: 0.3 }}>
                {activity.timestamp || 'Just now'}
              </Typography>
            </Box>
          </Box>
        ))}
      </Box>
    </Box>
  )
}
