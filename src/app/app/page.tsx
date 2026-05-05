'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { claimLegacyVehicle, getCommunityPosts, getLegacyVehicles, getVehicles, photoUrl, visualIdentityUrl } from '@/lib/api'
import { getCurrentUser } from '@/lib/auth'
import type { CommunityPost, UserProfile, Vehicle } from '@/lib/types'

type Confidence = 'HIGH' | 'MEDIUM' | 'LOW'
type MaintenanceStatus = 'DOCUMENTED' | 'HEALTHY' | 'DUE SOON' | 'OVERDUE' | 'WATCHLIST' | 'NO RECORD'
type MaintenanceTone = 'green' | 'amber' | 'red' | 'muted'

type MatchedServiceEntry = {
  vehicle: Vehicle
  entry: Vehicle['entries'][number] & { mileage?: number }
}

type MaintenanceSpec = {
  key: string
  title: string
  terms: string[]
  intervalMiles?: number
  dueSoonMiles?: number
  intervalDays?: number
  dueSoonDays?: number
  noRecordStatus?: MaintenanceStatus
  noRecordDetail: string
  documentedOnly?: boolean
}

type MaintenanceRow = {
  key: string
  title: string
  detail: string
  status: MaintenanceStatus
  tone: MaintenanceTone
  vehicle?: Vehicle
  actionHref: string
  actionLabel: string
}

const ONBOARDING_CHECKLIST_HIDDEN_KEY = 'appreciate-me.onboarding-checklist-hidden'
const PROOF_PACKET_OPENED_KEY = 'appreciate-me.onboarding-proof-packet-opened'

function formatCurrency(value: number) {
  return `$${Math.round(Math.abs(value)).toLocaleString()}`
}

function formatSignedCurrency(value: number) {
  if (value === 0) return '$0'
  return `${value > 0 ? '+' : '-'}${formatCurrency(value)}`
}

function financialTone(value: number) {
  if (value > 0) return '#00e87a'
  if (value < 0) return '#ff4d4f'
  return 'var(--gray)'
}

function confidenceTone(confidence: Confidence) {
  if (confidence === 'HIGH') return '#00e87a'
  if (confidence === 'MEDIUM') return '#f5a524'
  return '#ff4d4f'
}

function median(values: number[]) {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  if (sorted.length % 2 === 0) {
    return (sorted[middle - 1] + sorted[middle]) / 2
  }
  return sorted[middle]
}

function hasProofAttachment(vehicle: Vehicle) {
  return vehicle.entries.some(entry => (entry.attachments || []).length > 0)
}

function buildPostVehicleId(post: CommunityPost) {
  return post.vehicleId || post.buildVehicleId || ''
}

function entryMatches(entry: Vehicle['entries'][number], terms: string[]) {
  const haystack = `${entry.type} ${entry.title} ${entry.description || ''}`.toLowerCase()
  return terms.some(term => haystack.includes(term))
}

function daysSince(date: string) {
  const time = new Date(`${date}T00:00:00`).getTime()
  if (!Number.isFinite(time)) return null
  return Math.max(0, Math.floor((Date.now() - time) / (1000 * 60 * 60 * 24)))
}

function formatAge(days: number | null) {
  if (days === null) return 'date unknown'
  if (days < 45) return `${days} day${days === 1 ? '' : 's'} ago`
  const months = Math.round(days / 30)
  if (months < 18) return `${months} month${months === 1 ? '' : 's'} ago`
  const years = Math.round((days / 365) * 10) / 10
  return `${years} years ago`
}

function maintenanceTone(status: MaintenanceStatus): MaintenanceTone {
  if (status === 'OVERDUE') return 'red'
  if (status === 'DUE SOON' || status === 'WATCHLIST') return 'amber'
  if (status === 'DOCUMENTED' || status === 'HEALTHY') return 'green'
  return 'muted'
}

function latestMatchingEntry(vehicles: Vehicle[], terms: string[]): MatchedServiceEntry | undefined {
  return vehicles
    .flatMap(vehicle => vehicle.entries.map(entry => ({ vehicle, entry })))
    .filter(item => entryMatches(item.entry, terms))
    .sort((a, b) => new Date(b.entry.date).getTime() - new Date(a.entry.date).getTime())[0]
}

function pickActionVehicle(vehicles: Vehicle[], match?: MatchedServiceEntry) {
  return match?.vehicle || vehicles[0]
}

function buildMaintenanceRow(vehicles: Vehicle[], spec: MaintenanceSpec): MaintenanceRow {
  const match = latestMatchingEntry(vehicles, spec.terms)
  const actionVehicle = pickActionVehicle(vehicles, match)
  const actionHref = actionVehicle ? `/app/vehicles/${actionVehicle.id}` : '/app/vehicles/new'

  if (vehicles.length === 0) {
    return {
      key: spec.key,
      title: spec.title,
      detail: 'Add your first vehicle to start tracking this.',
      status: 'WATCHLIST',
      tone: 'muted',
      actionHref,
      actionLabel: 'ADD VEHICLE',
    }
  }

  if (!match) {
    const status = spec.noRecordStatus || 'NO RECORD'
    return {
      key: spec.key,
      title: spec.title,
      detail: spec.noRecordDetail,
      status,
      tone: maintenanceTone(status),
      actionHref,
      actionLabel: 'ADD LOG',
    }
  }

  const days = daysSince(match.entry.date)
  const logMileage = typeof match.entry.mileage === 'number' && Number.isFinite(match.entry.mileage) ? match.entry.mileage : null
  const currentMileage = typeof match.vehicle.mileage === 'number' && Number.isFinite(match.vehicle.mileage) ? match.vehicle.mileage : null
  const milesSince = logMileage != null && currentMileage != null ? Math.max(0, currentMileage - logMileage) : null
  let status: MaintenanceStatus = spec.documentedOnly ? 'DOCUMENTED' : 'HEALTHY'

  if (!spec.documentedOnly) {
    const mileageOverdue = spec.intervalMiles != null && milesSince != null && milesSince >= spec.intervalMiles
    const mileageDueSoon = spec.intervalMiles != null && spec.dueSoonMiles != null && milesSince != null && milesSince >= spec.intervalMiles - spec.dueSoonMiles
    const dateOverdue = spec.intervalDays != null && days != null && days >= spec.intervalDays
    const dateDueSoon = spec.intervalDays != null && spec.dueSoonDays != null && days != null && days >= spec.intervalDays - spec.dueSoonDays

    if (mileageOverdue || dateOverdue) status = 'OVERDUE'
    else if (mileageDueSoon || dateDueSoon) status = 'DUE SOON'
    else if (milesSince == null && days == null) status = 'DOCUMENTED'
  }

  const vehicleName = `${match.vehicle.year} ${match.vehicle.make} ${match.vehicle.model}`
  const proofText = (match.entry.attachments || []).length > 0 ? 'Proof attached.' : 'Add proof when available.'
  const mileageText = milesSince == null ? 'mileage at service not logged' : `${milesSince.toLocaleString()} mi since`

  return {
    key: spec.key,
    title: spec.title,
    detail: `${vehicleName}: ${formatAge(days)} · ${mileageText}. ${proofText}`,
    status,
    tone: maintenanceTone(status),
    vehicle: match.vehicle,
    actionHref,
    actionLabel: 'OPEN VEHICLE',
  }
}

const MAINTENANCE_SPECS: MaintenanceSpec[] = [
  {
    key: 'oil',
    title: 'Oil change',
    terms: ['oil change', 'engine oil', 'oil service', 'oil/filter', 'oil filter'],
    intervalMiles: 5000,
    dueSoonMiles: 800,
    intervalDays: 183,
    dueSoonDays: 30,
    noRecordDetail: 'No record found yet. Add the next oil service log when available.',
  },
  {
    key: 'brake-fluid',
    title: 'Brake fluid',
    terms: ['brake fluid', 'brake flush', 'brake bleed'],
    intervalDays: 730,
    dueSoonDays: 60,
    noRecordDetail: 'No brake fluid record found yet. Watch the calendar and add proof when available.',
  },
  {
    key: 'cooling',
    title: 'Coolant / cooling system',
    terms: ['coolant', 'cooling system', 'radiator', 'water pump', 'thermostat'],
    intervalDays: 1825,
    dueSoonDays: 180,
    noRecordStatus: 'WATCHLIST',
    noRecordDetail: 'No cooling system record found yet. Keep this on the watchlist until documented.',
  },
  {
    key: 'transmission',
    title: 'Transmission fluid',
    terms: ['transmission fluid', 'trans fluid', 'gear oil', 'diff fluid', 'differential fluid'],
    intervalMiles: 60000,
    dueSoonMiles: 10000,
    noRecordStatus: 'WATCHLIST',
    noRecordDetail: 'No transmission fluid record found yet. Use 30k-60k miles as a basic planning interval when data exists.',
  },
  {
    key: 'timing',
    title: 'Timing belt / chain',
    terms: ['timing belt', 'timing chain', 'timing service'],
    documentedOnly: true,
    noRecordStatus: 'WATCHLIST',
    noRecordDetail: 'No timing service proof found yet. Watchlist unless documented for this vehicle.',
  },
  {
    key: 'tires',
    title: 'Tires',
    terms: ['tire', 'tires', 'alignment', 'rotation'],
    noRecordStatus: 'WATCHLIST',
    noRecordDetail: 'No tire record found yet. Add tire replacement, rotation, or alignment proof when available.',
  },
]

export default function GaragePage() {
  const [vehicles, setVehicles] = useState<Vehicle[]>([])
  const [legacyVehicles, setLegacyVehicles] = useState<Vehicle[]>([])
  const [communityPosts, setCommunityPosts] = useState<CommunityPost[]>([])
  const [user, setUser] = useState<UserProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const [claimingId, setClaimingId] = useState<string | null>(null)
  const [checklistHidden, setChecklistHidden] = useState(false)
  const [proofPacketOpened, setProofPacketOpened] = useState<Record<string, boolean>>({})

  useEffect(() => {
    getCurrentUser()
      .then(async (currentUser) => {
        setUser(currentUser)
        if (!currentUser) return
        const [owned, legacy, posts] = await Promise.all([
          getVehicles(),
          getLegacyVehicles(),
          getCommunityPosts().catch(() => [] as CommunityPost[]),
        ])
        setVehicles(owned)
        setLegacyVehicles(legacy)
        setCommunityPosts(posts)
      })
      .finally(() => setLoading(false))
  }, [])
  useEffect(() => {
    try {
      setChecklistHidden(window.localStorage.getItem(ONBOARDING_CHECKLIST_HIDDEN_KEY) === 'true')
      const savedProofPacketState = window.localStorage.getItem(PROOF_PACKET_OPENED_KEY)
      if (savedProofPacketState) setProofPacketOpened(JSON.parse(savedProofPacketState) || {})
    } catch {
      setChecklistHidden(false)
      setProofPacketOpened({})
    }
  }, [])

  async function handleClaimVehicle(id: string) {
    setClaimingId(id)
    try {
      const claimed = await claimLegacyVehicle(id)
      setVehicles(current => [claimed, ...current])
      setLegacyVehicles(current => current.filter(vehicle => vehicle.id !== id))
    } catch {
      alert('Failed to claim vehicle. It may have already been claimed.')
    } finally {
      setClaimingId(null)
    }
  }

  function setOnboardingHidden(hidden: boolean) {
    setChecklistHidden(hidden)
    try {
      window.localStorage.setItem(ONBOARDING_CHECKLIST_HIDDEN_KEY, hidden ? 'true' : 'false')
    } catch {}
  }

  function markProofPacketOpened(vehicleId: string) {
    setProofPacketOpened(current => {
      const next = { ...current, [vehicleId]: true }
      try {
        window.localStorage.setItem(PROOF_PACKET_OPENED_KEY, JSON.stringify(next))
      } catch {}
      return next
    })
  }

  const portfolioVehicles = vehicles.map((vehicle) => {
    const totalInvested = vehicle.entries.reduce((sum, entry) => sum + (entry.cost || 0), 0)
    const totalImpact = vehicle.entries.reduce((sum, entry) => sum + (entry.estimatedValueImpact || 0), 0)
    const netPosition = totalImpact - totalInvested
    const proofCount = vehicle.entries.reduce((sum, entry) => sum + (entry.attachments?.length || 0), 0)
    const logCount = vehicle.entries.length
    const buildPostCount = communityPosts.filter(post => buildPostVehicleId(post) === vehicle.id).length
    const marketComps = vehicle.marketComps || []
    const marketCompsCount = marketComps.length
    const soldCompsCount = marketComps.filter((c) => c.soldOrAsking === 'sold').length
    const soldPrices = marketComps
      .filter((c) => c.soldOrAsking === 'sold')
      .map((c) => c.price)
      .filter((price) => Number.isFinite(price))
    const allPrices = marketComps
      .map((c) => c.price)
      .filter((price) => Number.isFinite(price))
    const valuationPrices = soldPrices.length > 0 ? soldPrices : allPrices
    const estimatedMarketValue = median(valuationPrices)
    let confidence: Confidence = 'LOW'
    if (soldCompsCount >= 5) confidence = 'HIGH'
    else if (soldCompsCount >= 2) confidence = 'MEDIUM'

    return {
      vehicle,
      totalInvested,
      totalImpact,
      netPosition,
      proofCount,
      logCount,
      buildPostCount,
      marketCompsCount,
      soldCompsCount,
      estimatedMarketValue,
      confidence,
    }
  })

  const totalPortfolioValue = portfolioVehicles.reduce((sum, item) => sum + (item.estimatedMarketValue || 0), 0)
  const totalPortfolioInvested = portfolioVehicles.reduce((sum, item) => sum + item.totalInvested, 0)
  const totalProofFiles = portfolioVehicles.reduce((sum, item) => sum + item.proofCount, 0)
  const pendingValueTasks = vehicles.flatMap(vehicle => (vehicle.valueTasks || [])
    .filter(task => task.status === 'pending')
    .map(task => ({ vehicle, task })))
  const pricedPendingTasks = pendingValueTasks.filter(item => item.task.estimatedCost != null && Number.isFinite(item.task.estimatedCost))
  const estimatedPendingTaskTotal = pricedPendingTasks.reduce((sum, item) => sum + (item.task.estimatedCost || 0), 0)
  const unpricedPendingTaskCount = pendingValueTasks.filter(item => item.task.estimatedCost == null).length
  const maintenanceRows = MAINTENANCE_SPECS.map(spec => buildMaintenanceRow(vehicles, spec))
  const planningRows = maintenanceRows.filter(row => row.status === 'OVERDUE' || row.status === 'DUE SOON' || row.status === 'WATCHLIST' || row.status === 'NO RECORD')
  const forecastActionVehicle = pendingValueTasks[0]?.vehicle || vehicles[0]
  const forecastActionHref = forecastActionVehicle ? `/app/vehicles/${forecastActionVehicle.id}` : '/app/vehicles/new'
  const taskCategoryRows = [
    { name: 'Maintenance tasks', categories: ['maintenance'] },
    { name: 'Repair tasks', categories: ['repair'] },
    { name: 'Cosmetic / performance', categories: ['cosmetic', 'performance'] },
    { name: 'Documentation / proof tasks', categories: ['documentation'] },
  ].map(row => {
    const tasks = pendingValueTasks.filter(item => row.categories.includes(item.task.category || 'other'))
    const pricedTasks = tasks.filter(item => item.task.estimatedCost != null && Number.isFinite(item.task.estimatedCost))
    const estimate = pricedTasks.reduce((sum, item) => sum + (item.task.estimatedCost || 0), 0)
    const unpriced = tasks.length - pricedTasks.length
    return {
      name: row.name,
      count: tasks.length,
      estimate,
      unpriced,
    }
  })
  const taskRows = [
    ...taskCategoryRows,
    {
      name: 'Other / uncategorized',
      count: pendingValueTasks.filter(item => !item.task.category || item.task.category === 'other').length,
      estimate: pendingValueTasks
        .filter(item => !item.task.category || item.task.category === 'other')
        .reduce((sum, item) => sum + (item.task.estimatedCost || 0), 0),
      unpriced: pendingValueTasks.filter(item => (!item.task.category || item.task.category === 'other') && item.task.estimatedCost == null).length,
    },
  ]
  const onboardingTarget = portfolioVehicles
    .slice()
    .sort((a, b) => {
      const aScore = [
        true,
        a.vehicle.photoKeys.length >= 3,
        !!a.vehicle.coverPhotoKey,
        a.logCount > 0,
        a.proofCount > 0,
        a.buildPostCount > 0,
        !!proofPacketOpened[a.vehicle.id],
      ].filter(Boolean).length
      const bScore = [
        true,
        b.vehicle.photoKeys.length >= 3,
        !!b.vehicle.coverPhotoKey,
        b.logCount > 0,
        b.proofCount > 0,
        b.buildPostCount > 0,
        !!proofPacketOpened[b.vehicle.id],
      ].filter(Boolean).length
      if (aScore !== bScore) return bScore - aScore
      return new Date(b.vehicle.createdAt).getTime() - new Date(a.vehicle.createdAt).getTime()
    })[0]
  const checklistVehicle = onboardingTarget?.vehicle
  const checklistVehicleHref = checklistVehicle ? `/app/vehicles/${checklistVehicle.id}` : '/app/vehicles/new'
  const proofPacketHref = checklistVehicle ? `/share/${checklistVehicle.id}` : '/app/vehicles/new'
  const checklistItems = [
    {
      label: 'Add your first vehicle',
      detail: 'Start the proof-backed garage with one car.',
      complete: vehicles.length > 0,
      href: '/app/vehicles/new',
      action: vehicles.length > 0 ? 'DONE' : 'ADD VEHICLE',
    },
    {
      label: 'Upload 3+ photos',
      detail: 'Give the garage enough visual context for buyer trust.',
      complete: (checklistVehicle?.photoKeys.length || 0) >= 3,
      href: checklistVehicleHref,
      action: 'OPEN VEHICLE',
    },
    {
      label: 'Set a cover photo',
      detail: 'Choose the image that anchors the buyer-ready proof packet.',
      complete: !!checklistVehicle?.coverPhotoKey,
      href: checklistVehicleHref,
      action: 'SET COVER',
    },
    {
      label: 'Add a proof/maintenance log',
      detail: 'Turn work done into documented vehicle history.',
      complete: (checklistVehicle?.entries.length || 0) > 0,
      href: checklistVehicleHref,
      action: 'ADD LOG',
    },
    {
      label: 'Attach a receipt, screenshot, or work photo',
      detail: 'Proof files make the record more than just a claim.',
      complete: checklistVehicle ? hasProofAttachment(checklistVehicle) : false,
      href: checklistVehicleHref,
      action: 'ADD PROOF',
    },
    {
      label: 'Create a build post',
      detail: 'Build in public. Prove the work.',
      complete: !!onboardingTarget && onboardingTarget.buildPostCount > 0,
      href: checklistVehicleHref,
      action: 'POST BUILD',
    },
    {
      label: 'Open/copy public proof packet',
      detail: 'See what a buyer-ready proof packet looks like.',
      complete: !!checklistVehicle && !!proofPacketOpened[checklistVehicle.id],
      href: proofPacketHref,
      action: 'OPEN PACKET',
      onClick: () => checklistVehicle && markProofPacketOpened(checklistVehicle.id),
    },
  ]
  const checklistCompleteCount = checklistItems.filter(item => item.complete).length

  return (
    <div style={{ minHeight: '100vh', background: 'var(--black)', padding: 0 }}>
      <style jsx global>{`
        .garage-page-wrap {
          max-width: 1100px;
          margin: 0 auto;
          padding: 24px 24px 34px;
        }

        .garage-landing-section {
          position: relative;
          border-top: 1px solid rgba(255,255,255,0.07);
          margin: 0 -24px 24px;
          padding: 42px 24px 0;
          overflow: hidden;
        }

        .garage-landing-section::before {
          content: '';
          position: absolute;
          inset: 0;
          background:
            radial-gradient(circle at 72% 72%, rgba(0,232,122,0.09), transparent 28%),
            linear-gradient(180deg, rgba(0,0,0,0) 0%, rgba(0,232,122,0.018) 100%);
          pointer-events: none;
        }

        .garage-landing-inner {
          position: relative;
          max-width: 1000px;
          margin: 0 auto;
        }

        .garage-landing-head {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 22px;
        }

        .garage-sec-label {
          font-family: var(--font-mono);
          font-size: 10px;
          letter-spacing: 0.2em;
          text-transform: uppercase;
          color: var(--accent);
          margin-bottom: 16px;
          display: flex;
          align-items: center;
          gap: 10px;
        }

        .garage-sec-label::before {
          content: '';
          width: 20px;
          height: 1px;
          background: var(--accent);
          display: block;
        }

        .garage-sec-title {
          font-family: var(--font-display);
          font-size: clamp(52px, 7vw, 88px);
          font-weight: 900;
          line-height: 0.92;
          letter-spacing: 0.02em;
          text-transform: uppercase;
          color: var(--off-white);
          margin-bottom: 18px;
        }

        .garage-sec-title span {
          color: var(--accent);
        }

        .garage-sec-sub {
          color: #9999ab;
          font-size: 17px;
          font-weight: 300;
          line-height: 1.75;
          max-width: 580px;
        }

        .garage-primary-cta {
          flex: 0 0 auto;
          background: var(--accent);
          color: var(--black);
          font-family: var(--font-mono);
          font-size: 12px;
          font-weight: 700;
          padding: 10px 16px;
          border-radius: 5px;
          text-decoration: none;
          letter-spacing: 0.06em;
          box-shadow: 0 0 0 1px rgba(0,232,122,0.18), 0 16px 38px rgba(0,232,122,0.12);
        }

        .garage-maint-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 20px;
          margin-top: 32px;
        }

        .garage-maint-panel {
          background: #0d0d12;
          border: 1px solid rgba(255,255,255,0.07);
          border-radius: 14px;
          overflow: hidden;
          box-shadow: 0 24px 70px rgba(0,0,0,0.28);
        }

        .garage-maint-head {
          padding: 15px 20px;
          border-bottom: 1px solid rgba(255,255,255,0.07);
          font-family: var(--font-display);
          font-size: 16px;
          font-weight: 800;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          color: var(--off-white);
        }

        .garage-maint-item,
        .garage-forecast-item {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 16px;
          border-bottom: 1px solid rgba(255,255,255,0.07);
          transition: background 0.15s;
        }

        .garage-maint-item {
          padding: 13px 20px;
        }

        .garage-maint-item:hover,
        .garage-forecast-item:hover {
          background: #111118;
        }

        .garage-maint-title {
          color: var(--off-white);
          font-size: 14px;
          font-weight: 500;
          margin-bottom: 3px;
        }

        .garage-maint-desc {
          color: #6b6b80;
          font-size: 12px;
          line-height: 1.4;
        }

        .garage-maint-badge {
          font-family: var(--font-mono);
          font-size: 10px;
          font-weight: 500;
          padding: 5px 10px;
          border-radius: 4px;
          white-space: nowrap;
          flex-shrink: 0;
          letter-spacing: 0.06em;
          text-transform: uppercase;
          margin-top: 2px;
        }

        .garage-maint-badge.green {
          background: rgba(0,232,122,0.08);
          color: var(--accent);
          border: 1px solid rgba(0,232,122,0.2);
        }

        .garage-maint-badge.amber {
          background: rgba(255,165,2,0.08);
          color: #ffa502;
          border: 1px solid rgba(255,165,2,0.2);
        }

        .garage-maint-badge.red {
          background: rgba(255,71,87,0.08);
          color: #ff4757;
          border: 1px solid rgba(255,71,87,0.2);
        }

        .garage-maint-badge.muted {
          background: rgba(255,255,255,0.04);
          color: #9999ab;
          border: 1px solid rgba(255,255,255,0.07);
        }

        .garage-forecast-item {
          padding: 12px 20px;
          align-items: center;
          font-size: 13px;
        }

        .garage-forecast-name {
          color: #9999ab;
        }

        .garage-forecast-cost {
          font-family: var(--font-mono);
          font-weight: 500;
          color: var(--accent);
          white-space: nowrap;
        }

        .garage-forecast-total {
          padding: 14px 20px;
          border-top: 1px solid rgba(255,255,255,0.07);
        }

        .garage-forecast-label {
          font-family: var(--font-mono);
          font-size: 10px;
          color: #6b6b80;
          text-transform: uppercase;
          letter-spacing: 0.08em;
          margin-bottom: 8px;
        }

        .garage-forecast-value {
          font-family: var(--font-display);
          font-size: 34px;
          font-weight: 900;
          line-height: 1;
          color: var(--accent);
        }

        .garage-forecast-note {
          padding: 14px 20px;
          background: rgba(0,232,122,0.08);
          border-top: 1px solid rgba(0,232,122,0.15);
          color: #9999ab;
          font-size: 12px;
          line-height: 1.6;
        }

        .garage-row-action {
          align-self: flex-start;
          border: 1px solid rgba(255,255,255,0.12);
          border-radius: 4px;
          color: var(--gray-light);
          flex: 0 0 auto;
          font-family: var(--font-mono);
          font-size: 9px;
          letter-spacing: 0.06em;
          line-height: 1;
          margin-top: 7px;
          padding: 6px 8px;
          text-decoration: none;
          text-transform: uppercase;
        }

        .garage-row-action:hover,
        .garage-row-action:focus-visible {
          border-color: rgba(0,232,122,0.38);
          color: var(--accent);
          outline: 2px solid rgba(0,232,122,0.35);
          outline-offset: 2px;
        }

        .garage-actions {
          display: flex;
          justify-content: flex-end;
          margin-bottom: 16px;
        }

        .garage-card-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(min(300px, 100%), 1fr));
          gap: 16px;
        }

        @media (max-width: 640px) {
          .garage-page-wrap {
            padding: 18px 14px 28px !important;
          }

          .garage-landing-section {
            margin: 0 -14px 22px !important;
            padding: 32px 14px 0 !important;
          }

          .garage-landing-head {
            flex-direction: column !important;
            gap: 16px !important;
          }

          .garage-sec-title {
            font-size: clamp(40px, 14vw, 58px) !important;
            margin-bottom: 14px !important;
          }

          .garage-sec-sub {
            font-size: 15px !important;
            line-height: 1.55 !important;
          }

          .garage-primary-cta {
            width: 100%;
            text-align: center;
          }

          .garage-maint-grid {
            grid-template-columns: 1fr !important;
            gap: 14px !important;
            margin-top: 24px !important;
          }

          .garage-maint-item,
          .garage-forecast-item {
            flex-direction: column;
            gap: 9px !important;
          }

          .garage-maint-badge,
          .garage-forecast-cost {
            align-self: flex-start;
          }

          .garage-actions {
            justify-content: stretch !important;
          }

          .garage-actions a {
            width: 100%;
            text-align: center;
          }

          .garage-card-grid {
            grid-template-columns: 1fr !important;
            gap: 12px !important;
          }
        }
      `}</style>
      <div className="garage-page-wrap">
        <div className="fade-up" style={{ marginBottom: 18 }}>
          <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 10, color: 'var(--accent)', letterSpacing: '0.15em', textTransform: 'uppercase', marginBottom: 8 }}>
            — GARAGE
          </div>

          <h1 style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: 'clamp(36px,6vw,60px)', color: 'var(--off-white)', lineHeight: 1, letterSpacing: '0.02em' }}>
            ASSET PORTFOLIO
          </h1>

          <p style={{ color: 'var(--gray)', fontSize: 14, marginTop: 6 }}>
            {vehicles.length} vehicle{vehicles.length !== 1 ? 's' : ''} tracked across your automotive portfolio
          </p>
        </div>

        {!loading && user && (
          <section className="garage-landing-section fade-up delay-1" aria-label="Maintenance and cost overview">
            <div className="garage-landing-inner">
              <div className="garage-landing-head">
                <div>
                  <div className="garage-sec-label">Stay on top of it</div>
                  <h2 className="garage-sec-title">
                    Know what&apos;s due.<br />
                    <span>Know what you&apos;ve spent.</span>
                  </h2>
                  <p className="garage-sec-sub">
                    Your logged maintenance, proof files, and planned work become an owner dashboard that reads like the landing page, but runs on your real garage data.
                  </p>
                </div>
                <Link href="/app/vehicles/new" className="garage-primary-cta">
                  + ADD VEHICLE
                </Link>
              </div>

              <div className="garage-maint-grid">
                <div className="garage-maint-panel">
                  <div className="garage-maint-head">Maintenance dashboard</div>
                  {vehicles.length === 0 && (
                    <div className="garage-forecast-note">
                      Add your first vehicle to turn maintenance logs and proof records into due-date watchlists.
                    </div>
                  )}
                  {maintenanceRows.map(row => (
                    <div className="garage-maint-item" key={row.title}>
                      <div>
                        <div className="garage-maint-title">{row.title}</div>
                        <div className="garage-maint-desc">{row.detail}</div>
                        {row.vehicle && (
                          <div className="garage-maint-desc" style={{ marginTop: 4 }}>
                            Current mileage: {row.vehicle.mileage ? `${row.vehicle.mileage.toLocaleString()} mi` : 'not set'}
                          </div>
                        )}
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
                        <span className={`garage-maint-badge ${row.tone}`}>{row.status}</span>
                        <Link href={row.actionHref} className="garage-row-action">
                          {row.actionLabel}
                        </Link>
                      </div>
                    </div>
                  ))}
                  <div className="garage-forecast-note">
                    Recommendations are based on logged records and basic intervals, not a substitute for professional inspection.
                  </div>
                </div>

                <div className="garage-maint-panel">
                  <div className="garage-maint-head">12-month cost forecast</div>
                  {taskRows.map(row => (
                    <div className="garage-forecast-item" key={row.name}>
                      <span className="garage-forecast-name">
                        {row.name}
                        <span style={{ display: 'block', color: '#6b6b80', fontSize: 11, marginTop: 3 }}>
                          {row.count} pending{row.unpriced > 0 ? ` · ${row.unpriced} unpriced` : ''}
                        </span>
                      </span>
                      <span className="garage-forecast-cost">{row.estimate > 0 ? formatCurrency(row.estimate) : 'No estimate'}</span>
                    </div>
                  ))}
                  <div className="garage-forecast-item">
                    <span className="garage-forecast-name">
                      Unpriced tasks
                      <span style={{ display: 'block', color: '#6b6b80', fontSize: 11, marginTop: 3 }}>
                        Add estimates on the vehicle task list
                      </span>
                    </span>
                    <span className="garage-forecast-cost">{unpricedPendingTaskCount}</span>
                  </div>
                  <div className="garage-forecast-item">
                    <span className="garage-forecast-name">
                      Planning / watchlist items
                      <span style={{ display: 'block', color: '#6b6b80', fontSize: 11, marginTop: 3 }}>
                        Due, overdue, watchlist, or missing maintenance records
                      </span>
                    </span>
                    <span className="garage-forecast-cost">{planningRows.length}</span>
                  </div>
                  {pendingValueTasks.length === 0 && vehicles.length > 0 && (
                    <div className="garage-forecast-note">
                      No pending value tasks yet. Add tasks on a vehicle to start building a 12-month owner cost view.
                    </div>
                  )}
                  <div className="garage-forecast-total">
                    <div className="garage-forecast-label">Estimated total</div>
                    <div className="garage-forecast-value">{estimatedPendingTaskTotal > 0 ? formatCurrency(estimatedPendingTaskTotal) : 'NO ESTIMATE YET'}</div>
                    <div style={{ fontSize: 12, color: '#6b6b80', marginTop: 4 }}>
                      {estimatedPendingTaskTotal > 0
                        ? `Built from ${pricedPendingTasks.length} priced pending value-task estimate${pricedPendingTasks.length === 1 ? '' : 's'}${unpricedPendingTaskCount > 0 ? `, plus ${unpricedPendingTaskCount} unpriced task${unpricedPendingTaskCount === 1 ? '' : 's'}` : ''}.`
                        : 'Add estimated costs to value tasks to create a planning range.'}
                    </div>
                    <div style={{ marginTop: 12 }}>
                      <Link href={forecastActionHref} className="garage-row-action" style={{ display: 'inline-flex', marginTop: 0, color: 'var(--accent)', borderColor: 'rgba(0,232,122,0.28)' }}>
                        {vehicles.length === 0 ? 'ADD VEHICLE' : 'ADD TASK'}
                      </Link>
                    </div>
                  </div>
                  <div className="garage-forecast-note">
                    Forecasts use real pending value-task estimates. Maintenance rows add planning/watchlist signals only; they are not confirmed costs or guaranteed value impact.
                  </div>
                </div>
              </div>
            </div>
          </section>
        )}

        {!loading && user && (
          checklistHidden ? (
            <div className="fade-up delay-1" style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 24 }}>
              <button
                type="button"
                onClick={() => setOnboardingHidden(false)}
                style={{ background: 'transparent', border: 'none', color: 'var(--accent)', cursor: 'pointer', fontFamily: 'DM Mono, monospace', fontSize: 10, letterSpacing: '0.08em', padding: 0 }}
              >
                SHOW PROOF-BACKED GARAGE CHECKLIST
              </button>
            </div>
          ) : (
            <div className="fade-up delay-1" style={{ background: 'linear-gradient(135deg, #111110 0%, #080908 62%, rgba(0,232,122,0.07) 100%)', border: '1px solid rgba(0,232,122,0.2)', borderRadius: 10, padding: '18px 20px', marginBottom: 28 }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 14, flexWrap: 'wrap', marginBottom: 16 }}>
                <div>
                  <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 10, color: 'var(--accent)', letterSpacing: '0.15em', marginBottom: 8 }}>
                    — BETA LAUNCH CHECKLIST
                  </div>
                  <h2 style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: 32, color: 'var(--off-white)', lineHeight: 1, letterSpacing: '0.03em', marginBottom: 6 }}>
                    START YOUR PROOF-BACKED GARAGE
                  </h2>
                  <div style={{ color: 'var(--gray-light)', fontSize: 13, lineHeight: 1.5, maxWidth: 680 }}>
                    Add the essentials that make your vehicle feel real: photos, proof, a build update, and a buyer-ready proof packet.
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: 34, color: 'var(--accent)', lineHeight: 1 }}>
                    {checklistCompleteCount} / {checklistItems.length}
                  </div>
                  <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 10, color: 'var(--gray)', letterSpacing: '0.08em', marginBottom: 10 }}>
                    COMPLETE
                  </div>
                  <button
                    type="button"
                    onClick={() => setOnboardingHidden(true)}
                    style={{ background: 'transparent', border: 'none', color: 'var(--gray)', cursor: 'pointer', fontFamily: 'DM Mono, monospace', fontSize: 10, letterSpacing: '0.08em', padding: 0 }}
                  >
                    HIDE CHECKLIST
                  </button>
                </div>
              </div>

              <div style={{ height: 6, background: 'rgba(255,255,255,0.06)', borderRadius: 999, overflow: 'hidden', marginBottom: 16 }}>
                <div style={{ width: `${Math.round((checklistCompleteCount / checklistItems.length) * 100)}%`, height: '100%', background: 'var(--accent)', borderRadius: 999, transition: 'width 0.25s ease' }} />
              </div>

              {vehicles.length === 0 && (
                <div style={{ background: 'rgba(0,232,122,0.055)', border: '1px solid rgba(0,232,122,0.18)', borderRadius: 8, padding: '12px 13px', color: 'var(--gray-light)', fontSize: 13, lineHeight: 1.5, marginBottom: 14 }}>
                  Your garage is empty. Add one vehicle and this checklist will start filling itself in from real proof records.
                </div>
              )}

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(300px,100%),1fr))', gap: 10 }}>
                {checklistItems.map((item, index) => (
                  <div key={item.label} style={{ background: item.complete ? 'rgba(0,232,122,0.06)' : 'rgba(255,255,255,0.026)', border: `1px solid ${item.complete ? 'rgba(0,232,122,0.24)' : 'rgba(255,255,255,0.075)'}`, borderRadius: 8, padding: '12px 13px', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
                    <div style={{ display: 'flex', gap: 10, minWidth: 0 }}>
                      <div style={{ width: 22, height: 22, borderRadius: 999, background: item.complete ? 'var(--accent)' : 'transparent', border: `1px solid ${item.complete ? 'var(--accent)' : 'rgba(255,255,255,0.16)'}`, color: item.complete ? 'var(--black)' : 'var(--gray)', fontFamily: 'DM Mono, monospace', fontSize: 11, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 1 }}>
                        {item.complete ? '✓' : index + 1}
                      </div>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ color: 'var(--off-white)', fontWeight: 600, fontSize: 14, lineHeight: 1.3, marginBottom: 4 }}>
                          {item.label}
                        </div>
                        <div style={{ color: 'var(--gray)', fontSize: 12, lineHeight: 1.45 }}>
                          {item.detail}
                        </div>
                      </div>
                    </div>
                    <Link
                      href={item.href}
                      onClick={item.onClick}
                      style={{ background: item.complete ? 'transparent' : 'rgba(0,232,122,0.1)', border: `1px solid ${item.complete ? 'rgba(255,255,255,0.12)' : 'rgba(0,232,122,0.36)'}`, color: item.complete ? 'var(--gray-light)' : 'var(--accent)', fontFamily: 'DM Mono, monospace', fontSize: 9, padding: '6px 8px', borderRadius: 4, textDecoration: 'none', letterSpacing: '0.06em', whiteSpace: 'nowrap', flexShrink: 0 }}
                    >
                      {item.action}
                    </Link>
                  </div>
                ))}
              </div>
            </div>
          )
        )}

        {!loading && vehicles.length > 0 && (
          <div className="fade-up delay-1" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 12, marginBottom: 40 }}>
            {[
              { label: 'TOTAL VEHICLES', value: vehicles.length, tone: 'var(--off-white)' },
              { label: 'TOTAL ESTIMATED MARKET VALUE', value: formatCurrency(totalPortfolioValue), tone: 'var(--off-white)' },
              { label: 'TOTAL INVESTED', value: formatCurrency(totalPortfolioInvested), tone: 'var(--off-white)' },
              { label: 'TOTAL PROOF FILES', value: totalProofFiles, tone: 'var(--off-white)' },
            ].map((s, i) => (
              <div key={i} style={{ background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: 6, padding: '16px 20px' }}>
                <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 10, color: 'var(--gray)', letterSpacing: '0.12em', marginBottom: 8 }}>
                  {s.label}
                </div>
                <div style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: 32, color: s.tone, lineHeight: 1 }}>
                  {s.value}
                </div>
              </div>
            ))}
          </div>
        )}

        {loading ? (
          <div style={{ color: 'var(--gray)', fontFamily: 'DM Mono, monospace', fontSize: 13, padding: '60px 0', textAlign: 'center' }}>
            LOADING GARAGE...
          </div>
        ) : !user ? (
          <div className="fade-in" style={{ textAlign: 'center', padding: '80px 0' }}>
            <div style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: 38, color: 'var(--gray)', marginBottom: 16 }}>
              SIGN IN REQUIRED
            </div>
            <p style={{ color: 'var(--gray)', marginBottom: 24, fontSize: 15 }}>
              Create an account or sign in to view your personal garage.
            </p>
            <Link href="/app/login" style={{ background: 'var(--accent)', color: 'var(--black)', fontFamily: 'DM Mono, monospace', fontSize: 12, fontWeight: 600, padding: '12px 20px', borderRadius: 4, textDecoration: 'none', letterSpacing: '0.05em' }}>
              SIGN IN / SIGN UP
            </Link>
          </div>
        ) : vehicles.length === 0 ? (
          <div className="fade-in" style={{ textAlign: 'center', padding: '80px 0' }}>
            <div style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: 32, color: 'var(--gray)', marginBottom: 16 }}>
              NO VEHICLES YET
            </div>
            <p style={{ color: 'var(--gray)', marginBottom: 24, fontSize: 15 }}>
              Add your first vehicle to start building your documented history.
            </p>
            <Link href="/app/vehicles/new" style={{ background: 'var(--accent)', color: 'var(--black)', fontFamily: 'DM Mono, monospace', fontSize: 12, fontWeight: 500, padding: '12px 24px', borderRadius: 4, textDecoration: 'none', letterSpacing: '0.05em' }}>
              + ADD YOUR FIRST VEHICLE
            </Link>
          </div>
        ) : (
          <div className="garage-card-grid">
            {portfolioVehicles.map((item, i) => {
              const { vehicle: v } = item
              const visualIdentityKey = v.visualIdentity?.imageKey
              const coverPhotoKey = v.coverPhotoKey || v.photoKeys?.[0]
              const cardImageUrl = visualIdentityKey
                ? visualIdentityUrl(visualIdentityKey)
                : coverPhotoKey
                  ? photoUrl(coverPhotoKey)
                  : null

              return (
                <div
                  key={v.id}
                  className={`fade-up delay-${Math.min(i + 1, 6)}`}
                  style={{ textDecoration: 'none' }}
                >
                  <div
                    style={{ background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden', transition: 'border-color 0.2s, transform 0.2s', height: '100%', display: 'flex', flexDirection: 'column' }}
                    onMouseEnter={(e) => {
                      ;(e.currentTarget as HTMLElement).style.borderColor = 'rgba(0,232,122,0.35)'
                      ;(e.currentTarget as HTMLElement).style.transform = 'translateY(-2px)'
                    }}
                    onMouseLeave={(e) => {
                      ;(e.currentTarget as HTMLElement).style.borderColor = 'var(--border)'
                      ;(e.currentTarget as HTMLElement).style.transform = 'translateY(0)'
                    }}
                  >
                    <div style={{ height: 180, background: '#1a1a18', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      {cardImageUrl ? (
                        <img src={cardImageUrl} alt={`${v.year} ${v.make} ${v.model}`} className="card-photo" loading="lazy" style={{ width: '100%', height: '100%', objectFit: visualIdentityKey ? 'contain' : 'cover', display: 'block', background: '#1a1a18' }} />
                      ) : (
                        <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--gray)', fontFamily: 'DM Mono, monospace', fontSize: 11, letterSpacing: '0.1em' }}>
                          NO PHOTO
                        </div>
                      )}
                    </div>

                    <div style={{ padding: '16px 18px' }}>
                      <div style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: 22, color: 'var(--off-white)', letterSpacing: '0.03em', marginBottom: 2 }}>
                        {v.year} {v.make} {v.model}
                      </div>

                      <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 11, color: 'var(--gray)', marginBottom: 14 }}>
                        {[v.trim, v.color, v.mileage ? `${v.mileage.toLocaleString()} mi` : null].filter(Boolean).join(' · ') || '—'}
                      </div>

                      <div style={{ background: 'linear-gradient(180deg, rgba(0,232,122,0.08) 0%, rgba(0,232,122,0.02) 100%)', border: '1px solid rgba(0,232,122,0.16)', borderRadius: 6, padding: '12px 14px', marginBottom: 14 }}>
                        <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 9, color: 'var(--accent)', letterSpacing: '0.1em', marginBottom: 6 }}>
                          ESTIMATED MARKET VALUE
                        </div>
                        <div style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: 28, color: 'var(--off-white)', lineHeight: 1, marginBottom: 6 }}>
                          {item.estimatedMarketValue == null ? 'NO DATA' : formatCurrency(item.estimatedMarketValue)}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
                          <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 10, color: confidenceTone(item.confidence), letterSpacing: '0.08em' }}>
                            CONFIDENCE: {item.confidence}
                          </div>
                          <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 10, color: 'var(--gray)', letterSpacing: '0.08em' }}>
                            SOLD COMPS: {item.soldCompsCount}
                          </div>
                        </div>
                      </div>

                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px 12px' }}>
                        {[
                          { l: 'TOTAL INVESTED', v: formatCurrency(item.totalInvested), tone: 'var(--off-white)' },
                          { l: 'NET POSITION', v: formatSignedCurrency(item.netPosition), tone: financialTone(item.netPosition) },
                          { l: 'PROOF FILES', v: String(item.proofCount), tone: 'var(--off-white)' },
                          { l: 'LOG RECORDS', v: String(item.logCount), tone: 'var(--off-white)' },
                          { l: 'MARKET COMPS', v: String(item.marketCompsCount), tone: 'var(--off-white)' },
                          { l: 'VALUE IMPACT', v: formatSignedCurrency(item.totalImpact), tone: financialTone(item.totalImpact) },
                        ].map((s, j) => (
                          <div key={j}>
                            <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 9, color: 'var(--gray)', letterSpacing: '0.1em' }}>
                              {s.l}
                            </div>
                            <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 13, color: s.tone }}>
                              {s.v}
                            </div>
                          </div>
                        ))}
                      </div>

                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 16 }}>
                        <Link href={`/app/vehicles/${v.id}`} style={{ background: 'var(--accent)', color: 'var(--black)', fontFamily: 'DM Mono, monospace', fontSize: 11, fontWeight: 500, padding: '8px 12px', borderRadius: 4, textDecoration: 'none', letterSpacing: '0.05em' }}>
                          OPEN BUILD
                        </Link>
                        <Link href={`/share/${v.id}`} style={{ background: 'transparent', border: '1px solid var(--border)', color: 'var(--gray-light)', fontFamily: 'DM Mono, monospace', fontSize: 11, padding: '8px 12px', borderRadius: 4, textDecoration: 'none', letterSpacing: '0.05em' }}>
                          SHARE PACKET
                        </Link>
                      </div>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {!loading && user && legacyVehicles.length > 0 && (
          <div className="fade-up delay-2" style={{ marginTop: 44 }}>
            <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 10, color: 'var(--accent)', letterSpacing: '0.15em', marginBottom: 12 }}>
              — LEGACY VEHICLES
            </div>
            <div style={{ background: 'rgba(245,165,36,0.07)', border: '1px solid rgba(245,165,36,0.22)', borderRadius: 8, padding: '16px 18px', marginBottom: 12 }}>
              <div style={{ color: 'var(--gray-light)', fontSize: 13, lineHeight: 1.5 }}>
                These vehicles were created before accounts existed. Claim only vehicles that belong in your garage.
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {legacyVehicles.map(vehicle => (
                <div key={vehicle.id} style={{ background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: 6, padding: '14px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                  <div>
                    <div style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: 24, color: 'var(--off-white)', letterSpacing: '0.03em' }}>
                      {vehicle.year} {vehicle.make} {vehicle.model}
                    </div>
                    <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 10, color: 'var(--gray)', letterSpacing: '0.06em' }}>
                      UNOWNED LEGACY RECORD
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleClaimVehicle(vehicle.id)}
                    disabled={claimingId === vehicle.id}
                    style={{ background: 'transparent', border: '1px solid var(--accent)', color: 'var(--accent)', fontFamily: 'DM Mono, monospace', fontSize: 11, padding: '8px 12px', borderRadius: 4, cursor: claimingId === vehicle.id ? 'wait' : 'pointer', opacity: claimingId === vehicle.id ? 0.7 : 1, letterSpacing: '0.05em' }}
                  >
                    {claimingId === vehicle.id ? 'CLAIMING...' : 'CLAIM VEHICLE'}
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
