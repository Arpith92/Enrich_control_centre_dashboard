import { Box, Typography } from '@mui/material'
import { useEffect, useRef } from 'react'
import * as echarts from 'echarts'

export default function WebsiteTraffic({ history }) {
  const chartRef = useRef(null)

  useEffect(() => {
    if (!chartRef.current) return

    const chart = echarts.init(chartRef.current)
    const hours = Array.from({ length: 24 }, (_, i) => `${String(i).padStart(2, '0')}:00`)
    const trafficData = Array.from({ length: 24 }, () => Math.floor(Math.random() * 3000 + 2000))
    const conversionsData = Array.from({ length: 24 }, () => Math.floor(Math.random() * 300 + 150))

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
        data: hours,
        boundaryGap: false,
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
          name: 'Traffic',
          data: trafficData,
          type: 'line',
          smooth: true,
          itemStyle: { color: '#00d4ff' },
          lineStyle: { color: '#00d4ff', width: 2 },
          areaStyle: { color: { type: 'linear', x: 0, y: 0, x2: 0, y2: 1, colorStops: [{ offset: 0, color: 'rgba(0, 212, 255, 0.2)' }, { offset: 1, color: 'rgba(0, 212, 255, 0)' }] } },
          symbolSize: 0,
        },
        {
          name: 'Conversions',
          data: conversionsData,
          type: 'line',
          smooth: true,
          itemStyle: { color: '#8b5cf6' },
          lineStyle: { color: '#8b5cf6', width: 2 },
          areaStyle: { color: { type: 'linear', x: 0, y: 0, x2: 0, y2: 1, colorStops: [{ offset: 0, color: 'rgba(139, 92, 246, 0.2)' }, { offset: 1, color: 'rgba(139, 92, 246, 0)' }] } },
          symbolSize: 0,
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
      <Typography className="section-label" sx={{ mb: 1.5 }}>WEBSITE TRAFFIC (24H)</Typography>
      <Box ref={chartRef} sx={{ width: '100%', height: 280 }} />
    </Box>
  )
}
