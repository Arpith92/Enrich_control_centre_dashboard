import { Box, Paper, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Typography } from '@mui/material'

const PlantTable = ({ plants }) => (
  <Paper elevation={0} className="glass-panel table-panel">
    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
      <Box>
        <Typography variant="overline" className="section-label">OPERATIONS</Typography>
        <Typography variant="h6">PLANT PERFORMANCE RANKING</Typography>
      </Box>
    </Box>
    <TableContainer>
      <Table size="small">
        <TableHead>
          <TableRow>
            <TableCell>Plant</TableCell>
            <TableCell>Capacity</TableCell>
            <TableCell>Current MW</TableCell>
            <TableCell>Today MWh</TableCell>
            <TableCell>PR</TableCell>
            <TableCell>CUF</TableCell>
            <TableCell>Availability</TableCell>
            <TableCell>Comm</TableCell>
            <TableCell>Health</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {plants.slice().sort((a, b) => b.currentMw - a.currentMw).map((plant) => (
            <TableRow key={plant.id} hover>
              <TableCell>{plant.name}</TableCell>
              <TableCell>{plant.capacity.toFixed(1)} MW</TableCell>
              <TableCell>{plant.currentMw.toFixed(2)}</TableCell>
              <TableCell>{plant.todayMwh.toFixed(1)}</TableCell>
              <TableCell>{plant.pr.toFixed(1)}%</TableCell>
              <TableCell>{plant.cuf.toFixed(1)}%</TableCell>
              <TableCell>{plant.availability.toFixed(1)}%</TableCell>
              <TableCell>{plant.communication}</TableCell>
              <TableCell>{plant.health}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  </Paper>
)

export default PlantTable
