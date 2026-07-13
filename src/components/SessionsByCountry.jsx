import { Box, Typography } from '@mui/material'

export default function SessionsByCountry({ plants }) {
  const countries = [
    { name: 'United States', value: 3245, flag: '🇺🇸' },
    { name: 'United Kingdom', value: 1842, flag: '🇬🇧' },
    { name: 'Germany', value: 1450, flag: '🇩🇪' },
    { name: 'France', value: 892, flag: '🇫🇷' },
  ]

  return (
    <Box className="glass-panel chart-panel">
      <Typography className="section-label" sx={{ mb: 1.5 }}>SESSIONS BY COUNTRY</Typography>
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
        {countries.map((country) => (
          <Box key={country.name} sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 12 }}>
            <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
              <Typography sx={{ fontSize: 16 }}>{country.flag}</Typography>
              <Typography sx={{ color: '#d4e4f7' }}>{country.name}</Typography>
            </Box>
            <Typography sx={{ color: '#00d4ff', fontWeight: 600 }}>{country.value}</Typography>
          </Box>
        ))}
      </Box>
    </Box>
  )
}
