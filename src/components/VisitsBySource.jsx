import { Box, Typography } from '@mui/material'
import { useEffect, useRef } from 'react'
import * as echarts from 'echarts'

export default function VisitsBySource({ plants }) {
  const chartRef = useRef(null)

  useEffect(() => {
    if (!chartRef.current) return

    const chart = echarts.init(chartRef.current)
    const option = {
      backgroundColor: 'transparent',
      tooltip: {
        trigger: 'item',
        backgroundColor: 'rgba(10, 14, 39, 0.8)',
        borderColor: 'rgba(0, 212, 255, 0.2)',
        textStyle: { color: '#d4e4f7', fontSize: 12 },
      },
      series: [
        {
          type: 'pie',
          radius: ['35%', '65%'],
          center: ['50%', '50%'],
          data: [
            { value: 3245, name: 'Direct', itemStyle: { color: '#00d4ff' } },
            { value: 1842, name: 'Search', itemStyle: { color: '#8b5cf6' } },
            { value: 1290, name: 'Social', itemStyle: { color: '#00d949' } },
            { value: 890, name: 'Other', itemStyle: { color: '#ffb347' } },
          ],
          emphasis: { itemStyle: { shadowBlur: 10, shadowOffsetX: 0, shadowColor: 'rgba(0, 212, 255, 0.5)' } },
          label: { color: '#d4e4f7', fontSize: 10, formatter: '{b}: {c}' },
          labelLine: { lineStyle: { color: 'rgba(0, 212, 255, 0.2)' } },
        },
      ],
    }

    chart.setOption(option)
    const handleResize = () => chart.resize()
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  return (
    <Box className="glass-panel">
      <Typography className="section-label" sx={{ mb: 1.5 }}>VISITS BY SOURCE</Typography>
      <Box ref={chartRef} sx={{ width: '100%', height: 280 }} />
    </Box>
  )
}
