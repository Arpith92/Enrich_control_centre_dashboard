import { Box, Paper, Typography } from '@mui/material'
import { motion } from 'framer-motion'

const GaugeCard = ({ label, value, max, unit, color }) => {
  const pct = Math.min(100, Math.max(0, (value / max) * 100))
  const radius = 52
  const circumference = 2 * Math.PI * radius
  const offset = circumference - (pct / 100) * circumference

  return (
    <motion.div whileHover={{ scale: 1.01 }}>
      <Paper elevation={0} className="glass-panel gauge-card">
        <Typography variant="subtitle2" className="subtle-text">{label}</Typography>
        <Box className="gauge-wrapper">
          <svg viewBox="0 0 140 140" className="gauge-svg">
            <circle cx="70" cy="70" r={radius} className="gauge-track" />
            <circle
              cx="70"
              cy="70"
              r={radius}
              className="gauge-progress"
              style={{ stroke: color, strokeDasharray: circumference, strokeDashoffset: offset }}
            />
          </svg>
          <Box className="gauge-center">
            <Typography variant="h4">{value}</Typography>
            <Typography variant="caption">{unit}</Typography>
          </Box>
        </Box>
      </Paper>
    </motion.div>
  )
}

export default GaugeCard
