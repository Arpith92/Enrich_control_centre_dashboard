import { Box, Typography } from '@mui/material'
import { useEffect, useRef } from 'react'
import * as echarts from 'echarts'

export default function ConversionsChart({ plants }) {
  const chartRef = useRef(null)

  useEffect(() => {
    if (!chartRef.current) return

    const chart = echarts.init(chartRef.current)
    const option = {
      backgroundColor: 'transparent',
      grid: { left: 50, right: 20, top: 30, bottom: 30 },
      tooltip: {
        trigger: 'axis',
        backgroundColor: 'rgba(10, 14, 39, 0.8)',
        borderColor: 'rgba(0, 212, 255, 0.2)',
        textStyle: { color: '#d4e4f7', fontSize: 12 },
      },
      xAxis: {
        type: 'category',
        data: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'],
        boundaryGap: true,
        axisLine: { lineStyle: { color: 'rgba(255,255,255,0.1)' } },
        axisLabel: { color: '#7a8fa3', fontSize: 10 },
      },
      yAxis: {
        type: 'value',
        axisLine: { lineStyle: { color: 'rgba(255,255,255,0.1)' } },
        axisLabel: { color: '#7a8fa3', fontSize: 10 },
        splitLine: { lineStyle: { color: 'rgba(255,255,255,0.05)' } },
      },
      series: [
        {
          name: 'Conversions',
          data: [1200, 1400, 1100, 1600, 1900, 2100],
          type: 'bar',
          itemStyle: {
            color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
              { offset: 0, color: '#8b5cf6' },
              { offset: 1, color: '#00d4ff' },
            ]),
            borderRadius: [4, 4, 0, 0],
          },
          barWidth: '60%',
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
      <Typography className="section-label" sx={{ mb: 1.5 }}>CONVERSIONS</Typography>
      <Box ref={chartRef} sx={{ width: '100%', height: 280 }} />
    </Box>
  )
}
