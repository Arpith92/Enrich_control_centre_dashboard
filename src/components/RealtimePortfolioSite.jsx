import { useEffect, useState } from 'react'
import { ENABLE_NLC_BLOCK_DRILLDOWN } from '../config/featureFlags'

// Rollback switches: set either flag to false to restore the previous behavior.
const ENABLE_PORTFOLIO_DRILLDOWN = true

const NLC_SITE = 'NLC Poolangal'
const BLOCK_DRILLDOWN_SITES = {
  [NLC_SITE]: 'NLC India Limited',
  PGCIL: 'Power Grid Corporation of India Limited',
}
const blockInverterPattern = /^Block\s+(\d+)\s+Inv\s+(\d+)$/i

const livePlantFor = (realtime, mappedPlant) => (realtime?.plants || []).find((item) => item.collection === mappedPlant.collection)

export default function RealtimePortfolioSite({ plant, mappedPlants, realtime, scope, onSelectScope }) {
  const [expandedCollection, setExpandedCollection] = useState(null)
  const [expandedBlock, setExpandedBlock] = useState(null)
  const selected = (scope?.type === 'enrich' && scope.id === plant.id)
    || (scope?.type === 'enrich-plant' && scope.siteId === plant.id)
    || (scope?.type === 'scada-block' && scope.siteId === plant.id)
  const communicationIssueCount = realtime?.plants
    ? realtime.plants.filter((item) => item.communicationIssue).length
    : mappedPlants.filter((item) => item.communicationIssue).length
  const inverterIssueCount = realtime?.plants?.filter((item) => !item.communicationIssue && item.inverterIssues?.length).length || 0
  const dataStuckCount = realtime?.plants?.filter((item) => !item.communicationIssue && !item.inverterIssues?.length && item.dataStuck).length || 0
  const monitoredPlantCount = realtime?.plants?.length || mappedPlants.length
  const failed = (!realtime && (plant.communication === 'Failed' || plant.communicationIssue))
    || (monitoredPlantCount > 0 && communicationIssueCount === monitoredPlantCount)
  const partial = !failed && (communicationIssueCount > 0 || inverterIssueCount > 0)
  const stuck = !failed && !partial && dataStuckCount > 0
  const dcCapacity = mappedPlants.reduce((sum, item) => sum + item.dc, 0) || plant.capacity * 1.2

  useEffect(() => {
    if (!selected) {
      setExpandedCollection(null)
      setExpandedBlock(null)
    }
  }, [selected])

  const toggleSite = () => {
    setExpandedCollection(null)
    setExpandedBlock(null)
    onSelectScope(selected ? null : { type: 'enrich', id: plant.id, name: plant.name })
  }
  const togglePlant = (mappedPlant, live) => {
    const isOpen = expandedCollection === mappedPlant.collection
    setExpandedCollection(live?.inverters?.length && !isOpen ? mappedPlant.collection : null)
    onSelectScope(isOpen
      ? { type: 'enrich', id: plant.id, name: plant.name }
      : { type: 'enrich-plant', id: mappedPlant.id, siteId: plant.id, name: mappedPlant.plantName, parent: plant, mappedPlant })
  }
  const toggleBlock = (block) => {
    const isOpen = expandedBlock === block.number
    setExpandedBlock(isOpen ? null : block.number)
    onSelectScope(isOpen
      ? { type: 'enrich', id: plant.id, name: plant.name }
      : { type: 'scada-block', id: `${plant.id}-block-${block.number}`, blockNumber: block.number, siteId: plant.id, name: `Block ${block.number}`, parent: plant, customerName: BLOCK_DRILLDOWN_SITES[plant.name] })
  }

  const liveRows = mappedPlants.map((mappedPlant) => ({ mappedPlant, live: livePlantFor(realtime, mappedPlant) }))
  const mappedAcCapacity = mappedPlants.reduce((sum, mappedPlant) => sum + Number(mappedPlant.ac || 0), 0)
  const rowActivePower = (mappedPlant, live) => live
    ? Number(live.currentMw || 0)
    : Number(plant.currentMw || 0) * (Number(mappedPlant.ac || 0) / Math.max(.001, mappedAcCapacity || plant.capacity))
  const plantSubtotal = liveRows.reduce((sum, row) => sum + rowActivePower(row.mappedPlant, row.live), 0)
  const isBlockSite = ENABLE_NLC_BLOCK_DRILLDOWN && Boolean(BLOCK_DRILLDOWN_SITES[plant.name])
  const blockLivePlant = liveRows.find((row) => row.live?.inverters?.some((inverter) => blockInverterPattern.test(String(inverter.inverter))))?.live
    || (realtime?.plants || []).find((item) => item.inverters?.some((inverter) => blockInverterPattern.test(String(inverter.inverter))))
  const siteBlocks = isBlockSite
    ? Object.values((blockLivePlant?.inverters || []).reduce((blocks, inverter) => {
      const match = String(inverter.inverter).match(blockInverterPattern)
      if (!match) return blocks
      const blockNumber = Number(match[1])
      const block = blocks[blockNumber] ||= { number: blockNumber, inverters: [] }
      block.inverters.push({ ...inverter, inverterNumber: Number(match[2]) })
      return blocks
    }, {})).sort((a, b) => a.number - b.number)
    : []

  return <div className={`realtime-portfolio-site ${selected ? 'expanded' : ''}`}>
    <button className={`portfolio-site enrich-site-row ${failed ? 'site-offline' : partial ? 'site-partial' : stuck ? 'site-stuck' : 'site-online'} ${selected ? 'active' : ''}`} title={`${mappedPlants.length || 1} plant(s) · click to drill down`} onClick={toggleSite}>
      <span><b>{plant.name}</b></span><strong>{dcCapacity.toFixed(2)} MWp</strong><strong>{plant.currentMw.toFixed(3)} MW</strong>
    </button>
    {ENABLE_PORTFOLIO_DRILLDOWN && selected && <div className="portfolio-plant-drilldown">
      {isBlockSite ? siteBlocks.map((block) => {
        const open = expandedBlock === block.number
        const blockMw = block.inverters.reduce((sum, inverter) => sum + (Number(inverter.activePowerMw) || 0), 0)
        const blockUnavailableInverters = [...new Set([...(blockLivePlant?.inactiveInverters || []), ...(blockLivePlant?.inverterIssues || [])])]
        const blockHasInverterIssue = block.inverters.some((inverter) => blockUnavailableInverters.includes(inverter.inverter))
        const blockStatus = blockLivePlant?.communicationIssue ? 'status-offline' : blockHasInverterIssue ? 'status-partial' : blockLivePlant?.dataStuck ? 'status-stuck' : 'status-online'
        return <div className={`portfolio-drill-plant portfolio-drill-block ${blockStatus} ${open ? 'expanded' : ''}`} key={block.number}>
          <button onClick={() => toggleBlock(block)} title={`Show Block ${block.number} inverters`}>
            <span><b>Block {block.number}</b><small>{BLOCK_DRILLDOWN_SITES[plant.name]}</small></span><strong>{block.inverters.length} INV</strong><strong>{blockMw.toFixed(3)} MW</strong>
          </button>
          {open && <div className="portfolio-inverter-list">
            {block.inverters.sort((a, b) => a.inverterNumber - b.inverterNumber).map((inverter) => <div className="portfolio-inverter-row" key={inverter.inverter} title={`Daily ${Number(inverter.dailyGenerationMWh || 0).toFixed(3)} MWh · Lifetime ${inverter.cumulativeGenerationMWh == null ? 'Not available' : `${Number(inverter.cumulativeGenerationMWh).toFixed(3)} MWh`}`}>
              <span>INV {inverter.inverterNumber}</span><i>LIVE</i><strong>{(Number(inverter.activePowerMw) || 0).toFixed(3)} MW</strong>
            </div>)}
            <div className="portfolio-drill-subtotal"><span>BLOCK {block.number} SUBTOTAL</span><i>{block.inverters.length} INV</i><strong>{blockMw.toFixed(3)} MW</strong></div>
          </div>}
        </div>
      }) : liveRows.map(({ mappedPlant, live }) => {
        const open = expandedCollection === mappedPlant.collection
        const inverters = live?.inverters || []
        const inverterSubtotal = inverters.reduce((sum, inverter) => sum + (Number(inverter.activePowerMw) || 0), 0)
        const plantActivePower = rowActivePower(mappedPlant, live)
        const rowStatus = live?.communicationIssue ? 'status-offline' : live?.inverterIssues?.length ? 'status-partial' : live?.dataStuck ? 'status-stuck' : 'status-online'
        return <div className={`portfolio-drill-plant ${rowStatus} ${open ? 'expanded' : ''}`} key={mappedPlant.id || mappedPlant.collection}>
          <button onClick={() => togglePlant(mappedPlant, live)} title={live?.inverters?.length ? `Show ${mappedPlant.plantName} inverters` : `${mappedPlant.plantName} · plant-level details only · no realtime inverter data`}>
            <span><b>{mappedPlant.plantName}</b><small>{mappedPlant.customerName}</small></span><strong>{mappedPlant.dc.toFixed(2)} MWp</strong><strong>{plantActivePower.toFixed(3)} MW</strong>
          </button>
          {open && live?.inverters?.length > 0 && <div className="portfolio-inverter-list">
            {inverters.map((inverter) => <div className="portfolio-inverter-row" key={inverter.inverter}>
              <span>{typeof inverter.inverter === 'number' ? `INV ${inverter.inverter}` : inverter.inverter}</span><i>—</i><strong>{(Number(inverter.activePowerMw) || 0).toFixed(3)} MW</strong>
            </div>)}
            <div className="portfolio-drill-subtotal"><span>INVERTER SUBTOTAL</span><i>{inverters.length} INV</i><strong>{inverterSubtotal.toFixed(3)} MW</strong></div>
          </div>}
        </div>
      })}
      <div className="portfolio-drill-subtotal site-subtotal"><span>{isBlockSite ? `${plant.name} SUBTOTAL` : 'PLANT SUBTOTAL'}</span><i>{isBlockSite ? `${siteBlocks.length} blocks` : `${mappedPlants.length} plants`}</i><strong>{plantSubtotal.toFixed(3)} MW</strong></div>
    </div>}
  </div>
}
