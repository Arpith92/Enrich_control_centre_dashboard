// Source: Thrid_party_site_details.xlsx. Third-party telemetry is simulated only.
const customer = (id, name, lat, lon, rows) => ({
  id, name, lat, lon,
  plants: rows.map(([site, cluster, ac, dc], index) => ({
    id: `${id}-${index + 1}`, site, cluster: cluster || 'Independent', ac, dc,
  })),
})

export const thirdPartyCustomers = [
  customer('torrent', 'Torrent Power', 20.18, 74.08, [
    ['Deshwandi','Nashik',10,12],['Deshwandi (Wadzare)','Nashik',4,4.8],['Naigaon','Nashik',5,6],['Talwade','Nashik',5,6],['Deopur','Nashik',10,12],['Chondi','Nashik',9,10.8],['Mungsare','Nashik',4,4.8],['Nanashi','Nashik',5,6],['Samangoan','Nashik',7,8.4],['Lahvit','Nashik',4,4.8],['Padhali','Nashik',4,4.8],['Pimple','Nashik',4,4.8],['Sonwewadi','Nashik',3,3.6],['Dubere','Nashik',7,8.4],['Mohadi','Nashik',2,2.4],['Sakur','Baglan',2,2.4],['Nandgaon BK1','Nashik',5,6],['Khakurdi','Baglan',14,16.8],['Virane','Baglan',3,3.6],['Ajang','Baglan',8,9.6],['Khamtane','Baglan',7,8.4],['Bhendi','Baglan',5,6],['Satwaichiwadi','Baglan',5,6],['Nimbola','Baglan',4,4.8],['Mahalpatne','Baglan',7,8.4],['Virgaon','Baglan',5,6],['Kikwari','Baglan',10,12],['Tandulwadi','Baglan',5,6],['Askheda','Baglan',5,6],['Dongargaon','Chandwad',16,19.2],['Dahyane','Chandwad',10,12],['Savkarwadi','Chandwad',3,3.6],['Zadi','Chandwad',2,2.4],['Kazi Sanghvi','Chandwad',11,13.2],['Shirur','Chandwad',5,6],['Khadkozar','Chandwad',5,6],['Undirwadi','Chandwad',2,2.4],['Mohegaon','Chandwad',4,4.8],['Devergaon','Chandwad',2,2.4],['Nandur Kh','Nashik',4,4.8],['Sawargaon','Chandwad',4,4.8],['Khaprale','Nashik',5,6],['Nandgaon BK 2','Nashik',3,3.6],['Navi Nirpur','Chandwad',5,6],['Jalgaon BK','Chandwad',3,3.6],['Lohner','Chandwad',12,14.4],
  ]),
  customer('atnu', 'Atnu Solar', 19.22, 75.60, [
    ['Kinwat',null,10,14],['Kannad',null,10,14],['Mantha',null,10,14],['Wadwani',null,10,14],['Parner',null,10,14],['Mohol',null,10,14],['Jawla',null,10,14],
  ]),
  customer('reliance', 'Reliance Power', 19.02, 75.68, [
    ['LIMBARUI','BHEED',2,2.4],['RUIGAVHAN','BHEED',3,3.6],['KAMKHEDA','BHEED',5,6],['WADVANI','BHEED',5,6],['KAKADHIRA','BHEED',3,3.6],['DEVLA BK.','BHEED',2,2.4],['KEKAT PANGRI','BHEED',1,1.2],['RAKSHASABHUWAN','BHEED',1,1.2],['GULAJ','BHEED',2,2.4],['MIRGAON','BHEED',2,2.4],['BELGAON','BHEED',3,3.6],['SURDI BK.','BHEED',3,3.6],['CHAKLAMBA','BHEED',5,6],['MAHINDA','ASHTI',2,2.4],['POKHARI','ASHTI',4,4.8],['HARINRAYAN','ASHTI',4,4.8],['MHASOBACHIWADI','ASHTI',4,4.8],['DAULAWADGAON','ASHTI',5,6],['TAKALI AMAYA','ASHTI',10,12],['PATTIWADGAON','Ambejogai',4,4.8],['LAMAN TANDA','Ambejogai',2,2.4],['ASARDHAV','Ambejogai',2,2.4],['NATHRA','Ambejogai',3,3.6],['SARADGAON','Ambejogai',2,2.4],
  ]),
]

// Coordinates are kept separately so the compact plant table above stays readable.
// The Wadzare latitude was invalid in the workbook (longitude duplicated), so the
// nearby Deshwandi latitude is used for map presentation.
const coordinates = {
  torrent: [
    [19.9191253,73.9927383],[19.9191253,73.9924987],[19.9499956,73.9814095],[19.9361115,74.0460413],[19.8714,74.133441],[19.9431398,74.1894997],[20.0081313,73.7152375],[20.3360517,73.640145],[19.9752926,73.8781088],[19.8270563,73.8116849],[19.7022567,74.003625],[19.7069164,74.004801],[19.6652968,74.0999538],[19.7943025,73.969927],[20.1456549,73.8628715],[19.7558784,73.7573543],[19.8026032,73.7084422],[20.70968698,74.42114646],[20.74190436,74.45427517],[20.70968698,74.42114646],[20.60815118,74.15734822],[20.49500645,74.07547445],[20.49252527,74.170639],[20.525043,74.342856],[20.526149,74.326876],[20.69908399,74.1588814],[20.683737,74.087323],[20.802871,74.249916],[20.762691,74.266229],[20.090033,74.217382],[20.324642,74.001112],[20.3938131,74.4399224],[20.389438,74.424077],[20.2514483,74.273825],[20.3532783,74.1620577],[20.2438333,74.1307859],[19.9782407,74.5278354],[20.195005,74.530466],[20.212823,74.1751899],[20.20264,74.130721],[20.207145,74.1372],[19.822212,73.914816],[19.8026032,73.7084422],[20.614828,74.104285],[20.24612712,74.74732571],[20.528248,74.239136],
  ],
  atnu: [[19.471184,78.218099],[20.434868,75.196062],[19.827706,76.404214],[19.002756,76.164448],[19.270447,74.389744],[17.937531,75.668513],[18.577171,75.278112]],
  reliance: [[19.004785,75.679079],[18.6804298,75.6578815],[19.082094,75.705406],[18.9984945,76.0012898],[18.953309,75.584398],[18.947807,75.953622],[19.2786,75.820063],[19.37771,75.6362],[19.366559,75.564548],[19.353177,75.826482],[19.31342,75.714212],[19.2659719,75.748256],[19.2597214,75.504922],[19.089807,75.207476],[18.7389251,75.2940222],[18.7389251,75.2940222],[19.008483,75.040202],[19.046101,74.955608],[18.854967,75.0631223],[18.7085686,76.6829592],[18.7384538,76.3892307],[18.845862,76.259675],[18.9575265,76.4756482],[18.83687,76.6111245]],
}

export const simulateThirdPartyCustomers = (date = new Date()) => {
  const hour = date.getHours() + date.getMinutes() / 60
  const solarCurve = Math.max(0, Math.sin(((hour - 6) / 12) * Math.PI))
  const tick = Math.floor(date.getTime() / 30000)
  return thirdPartyCustomers.map((entry, customerIndex) => {
    const plants = entry.plants.map((plant, plantIndex) => {
      const factor = 0.72 + (((plantIndex * 17 + customerIndex * 11 + tick) % 18) / 100)
      const simulatedMw = plant.ac * solarCurve * factor
      const [lat, lon] = coordinates[entry.id][plantIndex]
      return { ...plant, lat, lon, simulatedMw, status: solarCurve === 0 ? 'Standby' : factor < 0.76 ? 'Warning' : 'Generating' }
    })
    return { ...entry, plants, ac: plants.reduce((sum, plant) => sum + plant.ac, 0), simulatedMw: plants.reduce((sum, plant) => sum + plant.simulatedMw, 0) }
  })
}
