import dayjs from 'dayjs'

export const plantCatalog = [
  { name: 'Mandrup', lat: 17.499444, lon: 75.766806, capacity: 43.45, state: 'Maharashtra' },
  { name: 'Karajagi', lat: 17.454857, lon: 76.059762, capacity: 49.43, state: 'Karnataka' },
  { name: 'Kumbhari', lat: 17.610862, lon: 76.015165, capacity: 28.375, state: 'Maharashtra' },
  { name: 'Umri', lat: 19.087861, lon: 77.696167, capacity: 39.7, state: 'Maharashtra' },
  { name: 'Bhokar', lat: 19.210592, lon: 77.639007, capacity: 30.2, state: 'Maharashtra' },
  { name: 'Tuljapur', lat: 17.897663, lon: 75.94767, capacity: 44.85, state: 'Maharashtra' },
  { name: 'Mundargi', lat: 15.19261993, lon: 75.8836564, capacity: 1, state: 'Karnataka' },
  { name: 'NLC Poolangal', lat: 9.3020735, lon: 78.3028107, capacity: 100, state: 'Tamil Nadu' },
  { name: 'BEL1MW', lat: 25.033906, lon: 85.445297, capacity: 1, state: 'Bihar' },
  { name: 'BEL2MW', lat: 28.757474, lon: 77.521135, capacity: 2, state: 'Uttar Pradesh' },
  { name: 'Zaheerabad', lat: 17.6555171, lon: 77.554114, capacity: 57.5, state: 'Telangana' },
  { name: 'Turmamidi', lat: 17.4453098, lon: 77.6287568, capacity: 9, state: 'Telangana' },
  { name: 'PGCIL', lat: 23.41134, lon: 75.4809, capacity: 85, state: 'Rajasthan' },
]

const solarCurve = {
  0: 0,
  1: 0,
  2: 0,
  3: 0,
  4: 0,
  5: 0.08,
  6: 0.2,
  7: 0.4,
  8: 0.6,
  9: 0.78,
  10: 0.9,
  11: 0.96,
  12: 1,
  13: 0.97,
  14: 0.9,
  15: 0.7,
  16: 0.45,
  17: 0.15,
  18: 0,
  19: 0,
  20: 0,
  21: 0,
  22: 0,
  23: 0,
}

const clamp = (value, min, max) => Math.min(max, Math.max(min, value))

const interpolateCurve = (hour) => {
  const base = Math.floor(hour)
  const next = base + 1 > 23 ? 0 : base + 1
  const start = solarCurve[base] ?? 0
  const end = solarCurve[next] ?? 0
  const fraction = hour - base
  return start + (end - start) * fraction
}

export const generateInitialPlants = () =>
  plantCatalog.map((plant, index) => ({
    ...plant,
    id: `${plant.name}-${index}`,
    currentMw: plant.capacity * 0.32,
    todayMwh: plant.capacity * 4.6,
    pr: 84 + (index % 4) * 1.2,
    cuf: 22 + (index % 3) * 1.8,
    availability: 99.2,
    temperature: 31,
    humidity: 58,
    windSpeed: 20,
    cloudCover: 18,
    communication: 'Healthy',
    health: 'Healthy',
    alarm: 'None',
    lastUpdated: dayjs().format('HH:mm:ss'),
  }))

export const simulatePlantTelemetry = (plant, now, previousPlant, liveWeather) => {
  const hour = now.hour() + now.minute() / 60
  const curve = interpolateCurve(hour)
  const isMonsoon = [5, 6, 7, 8].includes(now.month())
  const monsoonFactor = isMonsoon ? 0.42 + Math.random() * 0.22 : 1
  const siteSeed = [...plant.name].reduce((sum, char) => sum + char.charCodeAt(0), 0)
  const siteEfficiency = 0.76 + (siteSeed % 13) / 100
  const liveIrradiance = Number(liveWeather?.global_tilted_irradiance ?? liveWeather?.shortwave_radiation)
  const hasLiveIrradiance = Number.isFinite(liveIrradiance) && liveIrradiance >= 0
  const targetMw = hasLiveIrradiance
    ? plant.capacity * (liveIrradiance / 1000) * siteEfficiency
    : plant.capacity * curve * monsoonFactor * siteEfficiency
  const randomFactor = 0.985 + Math.random() * 0.03
  const nextMw = clamp(
    previousPlant.currentMw * 0.32 + targetMw * randomFactor * 0.68,
    0,
    plant.capacity * 1.05,
  )
  const pr = clamp(78 + curve * 12 + Math.random() * 4.5, 78, 92)
  const cuf = clamp(18 + curve * 12 + Math.random() * 3.5, 18, 31)
  const availability = clamp(98.5 + Math.random() * 1.4, 98, 100)
  const temperature = liveWeather ? Number(liveWeather.temperature_2m) : clamp(25 + curve * 18 + Math.random() * 4, 25, 45)
  const humidity = liveWeather ? Number(liveWeather.relative_humidity_2m) : isMonsoon ? clamp(76 + Math.random() * 18, 76, 94) : clamp(20 + Math.random() * 60, 20, 85)
  const windSpeed = liveWeather ? Number(liveWeather.wind_speed_10m) : isMonsoon ? clamp(14 + Math.random() * 16, 14, 30) : clamp(5 + Math.random() * 28, 5, 35)
  const cloudCover = isMonsoon
    ? clamp(72 + Math.random() * 24, 72, 96)
    : clamp(Math.max(0, 90 * (1 - curve)) + Math.random() * 8, 0, 90)
  const dailyGti = Number(liveWeather?.gti_kwh_m2)
  const todayMwh = Number.isFinite(dailyGti)
    ? clamp(plant.capacity * Math.max(0, dailyGti) * siteEfficiency, 0, plant.capacity * 8)
    : clamp(previousPlant.todayMwh + nextMw / 1800, 0, plant.capacity * 8)
  const communication = nextMw > 0.2 * plant.capacity && availability > 99 ? 'Healthy' : availability > 98 ? 'Pending' : 'Degraded'
  const health = nextMw > 0.15 * plant.capacity && pr > 82 ? 'Healthy' : pr > 74 ? 'Warning' : 'Critical'
  const alarm = nextMw < 0.08 * plant.capacity ? 'Offline' : pr < 80 ? 'Low PR' : cloudCover > 70 ? 'Weather Alert' : 'None'

  return {
    ...plant,
    telemetrySource: 'Simulation',
    cumulativeGenerationMWh: undefined,
    inverterCount: 0,
    currentMw: plant.name === 'Mundargi' ? 0 : Number(nextMw.toFixed(2)),
    todayMwh: Number(todayMwh.toFixed(2)),
    pr: Number(pr.toFixed(1)),
    cuf: Number(cuf.toFixed(1)),
    availability: Number(availability.toFixed(1)),
    temperature: Number(temperature.toFixed(0)),
    humidity: Number(humidity.toFixed(0)),
    windSpeed: Number(windSpeed.toFixed(0)),
    cloudCover: Number(cloudCover.toFixed(0)),
    irradiance: hasLiveIrradiance ? liveIrradiance : Math.round(curve * 1000 * monsoonFactor),
    pressure: liveWeather ? Number(liveWeather.surface_pressure) : 1010,
    rain: liveWeather ? Number(liveWeather.precipitation_mm ?? liveWeather.precipitation ?? liveWeather.rain ?? 0) : 0,
    communication: plant.name === 'Mundargi' ? 'Failed' : communication,
    health: plant.name === 'Mundargi' ? 'Critical' : health,
    alarm: plant.name === 'Mundargi' ? 'Communication Lost' : alarm,
    lastUpdated: now.format('HH:mm:ss'),
  }
}

export const createEventFeed = (plants, now) => {
  const topPlant = [...plants].sort((a, b) => b.currentMw - a.currentMw)[0]
  const warningPlants = plants.filter((plant) => plant.alarm !== 'None').slice(0, 3)
  const baseEvents = [
    { id: 1, title: 'Communication Restored', detail: `${topPlant.name} link stabilised`, severity: 'normal', time: now.format('HH:mm') },
    { id: 2, title: 'Grid Export Normal', detail: 'Net export has remained within band', severity: 'info', time: now.format('HH:mm') },
    { id: 3, title: 'Weather Advisory', detail: `Cloud cover at ${topPlant.name} is ${topPlant.cloudCover}%`, severity: 'warning', time: now.format('HH:mm') },
  ]
  if (warningPlants.length) {
    baseEvents.push({
      id: 4,
      title: warningPlants[0].alarm,
      detail: `${warningPlants[0].name} requires focus`,
      severity: 'critical',
      time: now.format('HH:mm'),
    })
  }
  return baseEvents
}

export const createTrendData = (plants, now) => {
  const generation = plants.reduce((sum, plant) => sum + plant.currentMw, 0)
  const exportValue = plants.reduce((sum, plant) => sum + plant.currentMw * 0.98, 0)
  const revenue = plants.reduce((sum, plant) => sum + plant.currentMw * 4.2, 0)

  return {
    generation,
    exportValue,
    revenue,
    hourLabel: now.format('HH:mm'),
  }
}
