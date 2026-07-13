import { Box, Paper, Typography } from '@mui/material'
import { motion } from 'framer-motion'
import { Bolt, SolarPower, Wifi, Warning, TrendingUp, AttachMoney, Public, Speed, CheckCircle } from '@mui/icons-material'

const formatValue = (value, prefix = '', suffix = '') => {
  const numericValue = Number(value) || 0
  const formatted = new Intl.NumberFormat('en-IN', {
    maximumFractionDigits: numericValue % 1 === 0 ? 0 : 1,
  }).format(numericValue)

  return `${prefix}${formatted}${suffix}`
}

const cards = [
  { label: 'Total Plants', value: (m) => m.totalPlants, suffix: '', icon: <SolarPower />, accent: '#00d4ff' },
  { label: 'Installed Capacity', value: (m) => m.totalCapacity, suffix: ' MW', icon: <Bolt />, accent: '#8b5cf6' },
  { label: 'Current Generation', value: (m) => m.currentGeneration, suffix: ' MW', icon: <TrendingUp />, accent: '#00d949' },
  { label: "Today's Generation", value: (m) => m.todayGeneration, suffix: ' MWh', icon: <Public />, accent: '#ffb347' },
  { label: 'Revenue', value: (m) => m.revenue, prefix: '₹', suffix: 'k', icon: <AttachMoney />, accent: '#ff6b6b' },
  { label: 'Saved Today', value: (m) => (m.todayGeneration * 0.8).toFixed(0), suffix: ' t', icon: <CheckCircle />, accent: '#22d3ee' },
  { label: 'Average PR', value: (m) => m.averagePr, suffix: '%', icon: <Speed />, accent: '#fbbf24' },
  { label: 'Availability', value: (m) => m.averageAvailability, suffix: '%', icon: <Wifi />, accent: '#4ade80' },
  { label: 'Grid Export', value: (m) => (m.currentGeneration * 0.95), suffix: ' MW', icon: <TrendingUp />, accent: '#f59e0b' },
]

const KPICards = ({ metrics, plants }) => (
  <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)', md: 'repeat(3, 1fr)', lg: 'repeat(9, 1fr)' }, gap: 1 }}>
    {cards.map((card) => {
      const numericValue = card.value(metrics)
      return (
        <Box key={card.label}>
          <motion.div whileHover={{ y: -2, scale: 1.02 }} transition={{ duration: 0.2 }}>
            <Paper
              elevation={0}
              className="glass-panel kpi-card"
              sx={{
                minHeight: 90,
                position: 'relative',
                background: `linear-gradient(135deg, ${card.accent}15, rgba(139, 92, 246, 0.05))`,
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                '&::before': {
                  content: '""',
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  right: 0,
                  height: '2px',
                  background: `linear-gradient(90deg, ${card.accent}, transparent)`,
                },
              }}
            >
              <Box>
                <Typography sx={{ fontSize: 10, color: '#7a8fa3', textTransform: 'uppercase', letterSpacing: 0.1 }}>
                  {card.label}
                </Typography>
                <Typography sx={{ fontSize: 18, color: card.accent, fontWeight: 700, mt: 0.5, textShadow: `0 0 10px ${card.accent}40` }}>
                  {formatValue(numericValue, card.prefix || '', card.suffix || '')}
                </Typography>
              </Box>
            </Paper>
          </motion.div>
        </Box>
      )
    })}
  </Box>
)

export default KPICards
