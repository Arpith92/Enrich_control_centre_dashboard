import { Box, Chip, IconButton, Paper, Typography } from '@mui/material'
import { Fullscreen, Download } from '@mui/icons-material'
import { motion } from 'framer-motion'
import dayjs from 'dayjs'

const Header = ({ clock, bootTime, metrics, onFullscreen, onExport }) => {
  const uptime = `${dayjs().diff(bootTime, 'hour')}h ${dayjs().diff(bootTime, 'minute') % 60}m`

  return (
    <Paper elevation={0} className="glass-panel" sx={{ p: 2, mb: 2 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 3 }}>
        {/* Left: Branding */}
        <Box>
          <Typography variant="overline" className="section-label" sx={{ fontSize: 11 }}>
            ENRICH ENERGY | SCADA NETWORK OPERATIONS
          </Typography>
          <Typography variant="h5" className="hero-title" sx={{ fontSize: 20, mt: 0.5 }}>
            SOLAR OPERATIONS CONTROL CENTRE
          </Typography>
        </Box>

        {/* Middle: Status Indicators */}
        <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
          <Chip
            label="SCADA ONLINE"
            color="success"
            variant="outlined"
            sx={{ fontSize: 10, height: 24 }}
          />
          <Chip
            label="COMM LINK 99.8%"
            color="info"
            variant="outlined"
            sx={{ fontSize: 10, height: 24 }}
          />
          <Chip
            label={`UP ${uptime}`}
            color="warning"
            variant="outlined"
            sx={{ fontSize: 10, height: 24 }}
          />
        </Box>

        {/* Right: Time and Controls */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <Box sx={{ textAlign: 'right' }}>
            <Typography sx={{ color: '#7a8fa3', fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.1 }}>
              {clock.format('DD MMM YYYY')}
            </Typography>
            <Typography sx={{ color: '#00d4ff', fontSize: 18, fontWeight: 700, textShadow: '0 0 20px rgba(0, 212, 255, 0.4)' }}>
              {clock.format('HH:mm:ss')}
            </Typography>
          </Box>

          <Box sx={{ display: 'flex', gap: 1 }}>
            <motion.div whileTap={{ scale: 0.95 }}>
              <IconButton onClick={onExport} sx={{ color: '#00d4ff', '&:hover': { background: 'rgba(0, 212, 255, 0.1)' } }}>
                <Download sx={{ fontSize: 20 }} />
              </IconButton>
            </motion.div>
            <motion.div whileTap={{ scale: 0.95 }}>
              <IconButton onClick={onFullscreen} sx={{ color: '#00d4ff', '&:hover': { background: 'rgba(0, 212, 255, 0.1)' } }}>
                <Fullscreen sx={{ fontSize: 20 }} />
              </IconButton>
            </motion.div>
          </Box>
        </Box>
      </Box>
    </Paper>
  )
}

export default Header
