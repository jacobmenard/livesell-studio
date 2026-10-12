import type { Plan } from '../lib/types'

/**
 * How each plan is presented. Prices, live limits and team seats always come from the plan
 * itself (editable in Admin); this is only the copy around them.
 */
export interface PlanMarketing {
  emoji: string
  title: string
  tagline: string
  idealFor: string
  /** Shown after the plan's limits, e.g. "1 live session • 1080p • TikTok". */
  extras: string[]
  cta: string
  popular?: boolean
}

const MARKETING: Record<string, PlanMarketing> = {
  trial: { emoji: '🆓', title: 'Studio Starter', tagline: 'Try the studio and build your first live setup.', idealFor: 'Trying the studio', extras: [], cta: 'Start Free' },
  solo: { emoji: '🟢', title: 'Solo Seller', tagline: 'For individual sellers', idealFor: 'Solo sellers', extras: ['1080p', 'TikTok', 'Facebook', 'YouTube'], cta: 'Start Selling' },
  duo: {
    emoji: '🔵',
    title: 'Seller + Assistant',
    tagline: 'For sellers with an assistant',
    idealFor: 'Seller + assistant',
    extras: ['Shared setups'],
    cta: 'Choose Duo',
    popular: true,
  },
  team: { emoji: '🟣', title: 'MSME Team', tagline: 'For growing businesses', idealFor: 'Growing MSME', extras: ['Team collaboration'], cta: 'Grow Your Team' },
}

export function marketingFor(plan: Plan): PlanMarketing {
  return MARKETING[plan.code] ?? { emoji: '', title: plan.name, tagline: '', idealFor: '', extras: [], cta: `Choose ${plan.name}` }
}

const count = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

/** The plan's limits (from its data) followed by its extras. */
export function planHighlights(plan: Plan): string[] {
  const limits: string[] = []
  if (plan.max_live_setups > 0) limits.push(count(plan.max_live_setups, 'live session', 'live sessions'))
  if (plan.max_subusers > 0) limits.push(count(plan.max_subusers, 'team member', 'team members'))
  return [...limits, ...marketingFor(plan).extras]
}

/** A comparison cell: included, not included, available as a preview only, or a value. */
export type Cell = boolean | 'Preview' | string

type ByCode = Record<'trial' | 'solo' | 'duo' | 'team', Cell>

const EVERY: ByCode = { trial: true, solo: true, duo: true, team: true }
const PAID: ByCode = { trial: false, solo: true, duo: true, team: true }
const PAID_PREVIEW_ON_FREE: ByCode = { trial: 'Preview', solo: true, duo: true, team: true }
const TEAMS: ByCode = { trial: false, solo: false, duo: true, team: true }

export interface CompareRow {
  label: string
  cell: (plan: Plan) => Cell
}

const fixed = (label: string, values: ByCode): CompareRow => ({ label, cell: (plan) => values[plan.code as keyof ByCode] ?? false })

/** The full comparison, grouped. Free's going-live items are previews: it can't go live. */
export const COMPARE: { group: string; rows: CompareRow[] }[] = [
  {
    group: 'Plan',
    rows: [
      { label: 'Ideal for', cell: (plan) => marketingFor(plan).idealFor },
      { label: 'Live sessions at once', cell: (plan) => (plan.max_live_setups > 0 ? String(plan.max_live_setups) : false) },
      { label: 'Team members', cell: (plan) => (plan.max_subusers > 0 ? String(plan.max_subusers) : false) },
      fixed('Saved setups', EVERY),
      fixed('Starter templates', EVERY),
    ],
  },
  {
    group: 'Camera',
    rows: [
      fixed('Camera / webcam', EVERY),
      fixed('720p', EVERY),
      fixed('1080p', PAID_PREVIEW_ON_FREE),
      fixed('Landscape 16:9', EVERY),
      fixed('Portrait 9:16', EVERY),
      fixed('Brightness / mirror / zoom', EVERY),
      fixed('Camera microphone', EVERY),
    ],
  },
  {
    group: 'Looks',
    rows: [
      fixed('Foreground images', EVERY),
      fixed('Background blur', EVERY),
      fixed('Person background removal', PAID_PREVIEW_ON_FREE),
      fixed('Green screen', PAID_PREVIEW_ON_FREE),
      fixed('Custom backgrounds', EVERY),
      fixed('Custom foregrounds', EVERY),
    ],
  },
  {
    group: 'Popups & sound',
    rows: [
      fixed('Built-in popups', EVERY),
      fixed('Custom text popups', EVERY),
      fixed('Custom image popups', EVERY),
      fixed('Popup animations', EVERY),
      fixed('Visual effects', EVERY),
      fixed('Sound effects', EVERY),
      fixed('Soundboard', EVERY),
      fixed('Custom sounds', EVERY),
    ],
  },
  {
    group: 'Going live',
    rows: [
      fixed('Clean live screen', PAID_PREVIEW_ON_FREE),
      fixed('OBS support', PAID),
      fixed('TikTok Live', PAID_PREVIEW_ON_FREE),
      fixed('Facebook Live', PAID_PREVIEW_ON_FREE),
      fixed('YouTube Live', PAID_PREVIEW_ON_FREE),
      fixed('Direct RTMPS streaming', PAID),
      fixed('Live status monitoring', PAID),
      fixed('Stream-key protection', EVERY),
    ],
  },
  {
    group: 'Team',
    rows: [
      fixed('Shared setups', TEAMS),
      fixed('Shared uploads', TEAMS),
      fixed('Team collaboration', TEAMS),
      fixed('Team member permissions', TEAMS),
      fixed('Priority support', { trial: false, solo: false, duo: false, team: true }),
    ],
  },
]
