import ReactECharts from 'echarts-for-react'
import { Box, Paper, Typography } from '@mui/material'

const TrendChart = ({ history }) => {
  const trendSeries = history.map((item) => item.generation)
  const exportSeries = history.map((item) => item.exportValue)
  const labels = history.map((item) => item.hourLabel)

  const option = {
    backgroundColor: 'transparent',
    tooltip: { trigger: 'axis', backgroundColor: '#07111f' },
    legend: { top: 0, textStyle: { color: '#9fb3d1' } },
    grid: { left: '3%', right: '4%', bottom: '8%', containLabel: true },
    xAxis: { type: 'category', data: labels, axisLine: { lineStyle: { color: '#254560' } }, axisLabel: { color: '#86a2bd' } },
    yAxis: { type: 'value', axisLabel: { color: '#86a2bd' }, splitLine: { lineStyle: { color: 'rgba(255,255,255,0.06)' } } },
    series: [
      { name: 'Generation', type: 'line', smooth: true, data: trendSeries, lineStyle: { color: '#38bdf8' }, areaStyle: { color: 'rgba(56,189,248,0.16)' } },
      { name: 'Export', type: 'line', smooth: true, data: exportSeries, lineStyle: { color: '#34d399' } },
    ],
  }

  return (
    <Paper elevation={0} className="glass-panel chart-panel">
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
        <Box>
          <Typography variant="overline" className="section-label">BOTTOM PANEL</Typography>
          <Typography variant="h6">LIVE GENERATION TREND</Typography>
        </Box>
      </Box>
      <ReactECharts option={option} style={{ height: 270 }} />
    </Paper>
  )
}

export default TrendChart
