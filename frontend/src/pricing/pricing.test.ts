import { describe, expect, it } from 'vitest'
import type { Plan } from '../lib/types'
import { COMPARE, marketingFor, planHighlights } from './planCatalog'

const plan = (code: string, live: number, team: number, price: number): Plan => ({
  id: 1,
  code,
  name: code,
  price_monthly: price,
  currency: 'PHP',
  max_subusers: team,
  max_live_setups: live,
  purchasable: code !== 'trial',
})

const free = plan('trial', 0, 0, 0)
const solo = plan('solo', 1, 0, 299)
const duo = plan('duo', 2, 1, 599)
const team = plan('team', 4, 3, 999)

const cell = (label: string, p: Plan) => COMPARE.flatMap((g) => g.rows).find((r) => r.label === label)!.cell(p)

describe('pricing copy', () => {
  it('builds card highlights from the plan’s real limits', () => {
    expect(planHighlights(free)).toEqual([])
    expect(planHighlights(solo).join(' • ')).toBe('1 live session • 1080p • TikTok • Facebook • YouTube')
    expect(planHighlights(duo).join(' • ')).toBe('2 live sessions • 1 team member • Shared setups')
    expect(planHighlights(team).join(' • ')).toBe('4 live sessions • 3 team members • Team collaboration')
  })

  it('marks only Duo as most popular and gives each plan its call to action', () => {
    expect([free, solo, duo, team].filter((p) => marketingFor(p).popular).map((p) => p.code)).toEqual(['duo'])
    expect([free, solo, duo, team].map((p) => marketingFor(p).cta)).toEqual(['Start Free', 'Start Selling', 'Choose Duo', 'Grow Your Team'])
  })

  it('shows Free’s going-live features as previews and team features from Duo up', () => {
    expect(cell('TikTok Live', free)).toBe('Preview')
    expect(cell('Clean live screen', free)).toBe('Preview')
    expect(cell('Direct RTMPS streaming', free)).toBe(false)
    expect(cell('Direct RTMPS streaming', solo)).toBe(true)
    expect(cell('Shared setups', solo)).toBe(false)
    expect(cell('Shared setups', duo)).toBe(true)
    expect(cell('Priority support', duo)).toBe(false)
    expect(cell('Priority support', team)).toBe(true)
    expect(cell('Live sessions at once', free)).toBe(false)
    expect(cell('Team members', team)).toBe('3')
  })
})
