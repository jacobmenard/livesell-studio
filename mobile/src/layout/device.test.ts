import { columnsFor, deviceLayout, editorPreviewSize, gridColumns, isTabletScreen, liveLayout } from './device'

jest.mock('react-native', () => ({ useWindowDimensions: () => ({ width: 0, height: 0 }) }))
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }))

const none = { top: 0, bottom: 0, left: 0, right: 0 }
const phone = { width: 390, height: 844 }
const tabletWide = { width: 1280, height: 800 }
const tabletTall = { width: 800, height: 1280 }

describe('phone or tablet', () => {
  it('uses Android’s 600 dp line on the shorter side', () => {
    expect(isTabletScreen(phone)).toBe(false)
    expect(isTabletScreen({ width: 599, height: 960 })).toBe(false)
    expect(isTabletScreen({ width: 600, height: 960 })).toBe(true)
    expect(isTabletScreen(tabletWide)).toBe(true)
  })

  it('lays out by the window: wide only with room for panes', () => {
    expect(deviceLayout(tabletWide)).toMatchObject({ tablet: true, wide: true, landscape: true })
    expect(deviceLayout(tabletTall)).toMatchObject({ tablet: true, wide: false, landscape: false })
    expect(deviceLayout(phone)).toMatchObject({ tablet: false, wide: false })
  })

  it('shows setups in 1, 2 or 3 columns', () => {
    expect(gridColumns(deviceLayout(phone))).toBe(1)
    expect(gridColumns(deviceLayout(tabletTall))).toBe(2)
    expect(gridColumns(deviceLayout(tabletWide))).toBe(3)
  })

  it('fits tiles across a width', () => {
    expect(columnsFor(752, 120, 12)).toBe(5)
    expect(columnsFor(100, 120, 12)).toBe(1)
  })
})

describe('the editor preview', () => {
  it('keeps the phone sizes', () => {
    expect(editorPreviewSize(true, null, 0)).toEqual({ stageW: 168, stageH: 300 })
    expect(editorPreviewSize(false, null, 0)).toEqual({ stageW: 320, stageH: 180 })
  })

  it('grows on an upright tablet', () => {
    expect(editorPreviewSize(true, null, 800)).toEqual({ stageW: 236, stageH: 420 })
    expect(editorPreviewSize(false, null, 800)).toEqual({ stageW: 640, stageH: 360 })
  })

  it('fills the tablet editor’s pane at the setup’s shape', () => {
    const tall = editorPreviewSize(true, { width: 620, height: 704 }, 1280)
    expect(tall.stageH).toBe(672)
    expect(tall.stageW / tall.stageH).toBeCloseTo(9 / 16, 2)
    const flat = editorPreviewSize(false, { width: 620, height: 704 }, 1280)
    expect(flat.stageW).toBe(588)
    expect(flat.stageW / flat.stageH).toBeCloseTo(16 / 9, 1)
  })
})

describe('the live screen', () => {
  it('keeps the phone layout on phones', () => {
    expect(liveLayout(phone, none, false)).toMatchObject({ mode: 'phone', stage: { x: 0, y: 0, w: 390, h: 844 }, turn: null })
    const wide = liveLayout(phone, none, true)
    expect(wide.mode).toBe('phone')
    expect(wide.stage.w / wide.stage.h).toBeCloseTo(16 / 9, 1)
  })

  it('fills an upright tablet with a portrait live', () => {
    expect(liveLayout(tabletTall, none, false)).toMatchObject({ mode: 'overlay', stage: { w: 800, h: 1280 }, panel: null, turn: null })
  })

  it('puts a landscape live top left on a sideways tablet, popups under it, controls on the right', () => {
    const l = liveLayout(tabletWide, none, true)
    expect(l.mode).toBe('columns')
    expect(l.turn).toBeNull()
    expect(l.stage.w / l.stage.h).toBeCloseTo(16 / 9, 1)
    expect(l.under!.y).toBeGreaterThan(l.stage.y + l.stage.h)
    expect(l.under!.h).toBeGreaterThanOrEqual(186)
    expect(l.panel!.x).toBeGreaterThan(l.stage.x + l.stage.w)
    expect(l.panel!.x + l.panel!.w).toBeLessThanOrEqual(1280)
  })

  it('asks to turn the tablet when it is held across the live’s shape', () => {
    const tall = liveLayout(tabletWide, none, false)
    expect(tall).toMatchObject({ mode: 'columns', turn: 'upright', under: null })
    expect(tall.stage.h / tall.stage.w).toBeCloseTo(16 / 9, 1)
    expect(tall.panel!.x).toBeGreaterThan(tall.stage.x + tall.stage.w)

    const flat = liveLayout(tabletTall, none, true)
    expect(flat).toMatchObject({ mode: 'stacked', turn: 'sideways', stage: { x: 0, y: 0, w: 800, h: 450 } })
    expect(flat.panel!.y).toBeGreaterThan(450)
  })

  it('stays inside the safe area', () => {
    const l = liveLayout(tabletWide, { top: 24, bottom: 48, left: 0, right: 0 }, true)
    expect(l.stage.y).toBe(48)
    expect(l.panel!.y + l.panel!.h).toBe(800 - 48 - 24)
  })
})
