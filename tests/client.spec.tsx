/**
 * Client surface: React rendering of the dashboard and the dock line,
 * zh/en locale completeness, the interpolator, and the staged settings form.
 */

import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { DashboardView } from '../src/client/panel/UsageDashboard.tsx'
import { DockLine } from '../src/client/dock/DockLine.tsx'
import { UsageApi, formatCount, type UsageStatsWire } from '../src/client/api.ts'
import { UsageStore } from '../src/client/store.ts'
import { setUsageStore } from '../src/client/store-host.ts'
import { en, interpolate, tt, zh } from '../src/client/locales.ts'
import { UsageSettingsForm, type UsageSettings } from '../src/client/settings/usage-settings-form.ts'
import type { SettingsScope, SettingsScopeSnapshot } from '@deepseek-ai/dsh-client-runtime/client'

afterEach(() => {
  cleanup()
  setUsageStore(undefined)
})

/** A fully-populated stats payload. */
const SAMPLE: UsageStatsWire = {
  daily: {
    date: '2026-01-07',
    cacheHitInputTokens: 1234,
    cacheMissInputTokens: 5678,
    outputTokens: 901,
    reasoningTokens: 42,
    totalInputTokens: 6912,
    totalTokens: 7813,
    requestCount: 17,
    failedRequestCount: 2,
    cacheHitRate: 0.1785,
  },
  trend: ['2026-01-01', '2026-01-02', '2026-01-03', '2026-01-04', '2026-01-05', '2026-01-06', '2026-01-07'].map(date => ({
    date,
    cacheHitInputTokens: 0,
    cacheMissInputTokens: 0,
    outputTokens: 0,
    reasoningTokens: 0,
    totalInputTokens: 0,
    totalTokens: 100,
    requestCount: 1,
    failedRequestCount: 0,
    cacheHitRate: null,
  })),
  estimatedCost: {
    total: '1.234567',
    totalMicro: '1234567',
    currency: 'CNY',
    pricedRequestCount: 16,
    unpricedRequestCount: 1,
    unpriced: { cacheHitInputTokens: 10, cacheMissInputTokens: 20, outputTokens: 30 },
    scheduleIdsUsed: ['legacy-2026-04-24'],
    bandCosts: [],
  },
  prices: {
    version: 3,
    updatedAt: '2026-01-01T00:00:00.000Z',
    entries: [{ model: 'deepseek-chat', cacheHitInputPricePerMillion: 0.02, cacheMissInputPricePerMillion: 1, outputPricePerMillion: 2, currency: 'CNY', effectiveFrom: '2026-04-24' }],
    mode: 'legacy',
    timezone: 'Asia/Shanghai',
    schedules: [{
      id: 'legacy-2026-04-24',
      effectiveFrom: '2026-04-24T00:00:00+08:00',
      currency: 'CNY',
      windowCount: 1,
      windows: [{ id: 'all-day', start: '00:00', end: '00:00', bandId: null }],
      offPeakSpans: [],
      models: [{ model: 'deepseek-chat', ratesByBand: { 'all-day': { cacheHitInputPricePerMillion: 0.02, cacheMissInputPricePerMillion: 1, outputPricePerMillion: 2 } } }],
    }],
    currentBand: null,
  },
  balance: {
    isAvailable: true,
    infos: [{ currency: 'CNY', totalBalance: '12.34', grantedBalance: '2.00', toppedUpBalance: '10.34' }],
  },
  balanceOmitted: false,
  balanceState: { state: 'ok', lastSuccessAt: 1_700_000_000_000, lastErrorCode: null },
  meta: {
    timezone: 'Asia/Shanghai',
    dataSource: 'session logs',
    endpointBaseUrl: 'https://api.deepseek.com',
    endpointMatching: true,
    providerId: 'deepseek-official',
    updatedAt: 1_700_000_000_000,
  },
}

const EMPTY_SNAPSHOT = { data: null, error: null, loading: false, refreshing: false }

/** The official 2026-08-17 schedule exactly as served on the wire. */
const OFFICIAL_SCHEDULE_WIRE = {
  id: 'deepseek-2026-08-17',
  effectiveFrom: '2026-08-17T00:00:00+08:00',
  currency: 'CNY',
  windowCount: 2,
  windows: [
    { id: 'peak-morning', start: '09:00', end: '12:00', bandId: 'peak' },
    { id: 'peak-afternoon', start: '14:00', end: '18:00', bandId: 'peak' },
  ],
  offPeakSpans: [
    { start: '00:00', end: '09:00' },
    { start: '12:00', end: '14:00' },
    { start: '18:00', end: '24:00' },
  ],
  models: [
    { model: 'deepseek-v4-flash', ratesByBand: { peak: { cacheHitInputPricePerMillion: 0.1, cacheMissInputPricePerMillion: 3, outputPricePerMillion: 9 }, 'off-peak': { cacheHitInputPricePerMillion: 0.05, cacheMissInputPricePerMillion: 1.5, outputPricePerMillion: 4.5 } } },
    { model: 'deepseek-v4-pro', ratesByBand: { peak: { cacheHitInputPricePerMillion: 0.3, cacheMissInputPricePerMillion: 9, outputPricePerMillion: 27 }, 'off-peak': { cacheHitInputPricePerMillion: 0.15, cacheMissInputPricePerMillion: 4.5, outputPricePerMillion: 13.5 } } },
  ],
}

/** Render the dashboard in a given document language. */
function renderDashboard(lang: string) {
  document.documentElement.lang = lang
  return render(<DashboardView snapshot={{ ...EMPTY_SNAPSHOT, data: SAMPLE }} onRefresh={() => undefined} />)
}

describe('dashboard rendering', () => {
  it('renders the zh dashboard with all required sections', () => {
    renderDashboard('zh')
    expect(screen.getByText('DeepSeek API 用量')).toBeDefined()
    expect(screen.getByText('今日用量（Asia/Shanghai）')).toBeDefined()
    expect(screen.getByText('缓存命中输入')).toBeDefined()
    expect(screen.getByText('缓存未命中输入')).toBeDefined()
    expect(screen.getByText('输出')).toBeDefined()
    expect(screen.getByText('推理')).toBeDefined()
    expect(screen.getByText('缓存命中率')).toBeDefined()
    expect(screen.getByText('今日估算费用')).toBeDefined()
    expect(screen.getByText('当前可用余额')).toBeDefined()
    expect(screen.getByText('赠送余额')).toBeDefined()
    expect(screen.getByText('充值余额')).toBeDefined()
    expect(screen.getByText('最近 7 天用量趋势')).toBeDefined()
    expect(screen.getByText('7 天合计')).toBeDefined()
    expect(screen.getAllByText('日均')).toHaveLength(2)
    expect(screen.getByText('输入占比 17.9%')).toBeDefined()
    expect(screen.getByText('11.76% 失败率')).toBeDefined()
    expect(screen.getByText('Token 用量趋势')).toBeDefined()
    expect(screen.getByText(/数据来源/)).toBeDefined() // footer line is one template string
    expect(screen.getByText(/1,234/)).toBeDefined() // grouped token counts
    expect(screen.getByText('17.8%')).toBeDefined() // hit rate
    expect(screen.getByText(/¥1\.234567/)).toBeDefined() // estimate
  })

  it('renders the en dashboard', () => {
    renderDashboard('en')
    expect(screen.getByText('Estimated cost today')).toBeDefined()
    expect(screen.getByText('Available balance')).toBeDefined()
    expect(screen.getByText('Cache hit rate')).toBeDefined()
    expect(screen.getByText('7-day total')).toBeDefined()
    expect(screen.getAllByText('Daily average')).toHaveLength(2)
  })

  it('exposes all seven trend bars with exact accessible values', () => {
    renderDashboard('zh')
    const meters = screen.getAllByRole('meter')
    expect(meters).toHaveLength(7)
    expect(meters[0]?.getAttribute('aria-valuenow')).toBe('100')
    expect(meters[0]?.getAttribute('aria-valuemax')).toBe('100')
  })

  it('keeps zero-usage trend days accessible without drawing a fake bar', () => {
    document.documentElement.lang = 'zh'
    const trend = SAMPLE.trend.map((day, index) => index === 0 ? { ...day, totalTokens: 0 } : day)
    render(<DashboardView snapshot={{ ...EMPTY_SNAPSHOT, data: { ...SAMPLE, trend } }} onRefresh={() => undefined} />)
    expect(screen.getByRole('meter', { name: '2026-01-01: 0' }).getAttribute('aria-valuenow')).toBe('0')
  })

  it('shows the estimate note; the internal price version moves to a tooltip', () => {
    renderDashboard('zh')
    expect(screen.getByText(/估算，非官方账单/)).toBeDefined()
    // Internal provenance (version / updatedAt) is SECONDARY now — tooltip
    // only, never a first-class line on the card.
    expect(document.querySelector('[title*="价格版本 3"]')).not.toBeNull()
    expect(screen.queryByText(/^价格版本/)).toBeNull()
  })

  it('renders the legacy pricing provenance under the estimate', () => {
    renderDashboard('zh')
    expect(screen.getByText(/自定义旧版价格 · 2026-04-24/)).toBeDefined()
  })

  it('renders the partial-unpriced state without hiding the priced total', () => {
    renderDashboard('zh')
    expect(screen.getByText(/部分用量未计价/)).toBeDefined()
    expect(screen.getByText(/1 个请求未计价/)).toBeDefined()
    // The priced total is still shown as-is (¥1.234567 — the unpriced rows
    // are NOT folded into it).
    expect(screen.getByText(/¥1\.234567/)).toBeDefined()
  })

  it('renders time-aware schedule provenance and multiple-schedule days', () => {
    document.documentElement.lang = 'zh'
    const schedulesMode = {
      ...SAMPLE,
      prices: {
        ...SAMPLE.prices,
        mode: 'time-aware' as const,
        entries: [],
        schedules: [{
          id: 'sched-2026-08-17',
          effectiveFrom: '2026-08-17T00:00:00+08:00',
          currency: 'CNY',
          windowCount: 2,
          windows: [{ id: 'peak-morning', start: '09:00', end: '12:00', bandId: 'peak' }],
          offPeakSpans: [{ start: '00:00', end: '09:00' }, { start: '12:00', end: '24:00' }],
          models: [{ model: 'deepseek-v4-flash', ratesByBand: { peak: { cacheHitInputPricePerMillion: 0.1, cacheMissInputPricePerMillion: 3, outputPricePerMillion: 9 }, 'off-peak': { cacheHitInputPricePerMillion: 0.05, cacheMissInputPricePerMillion: 1.5, outputPricePerMillion: 4.5 } } }],
        }],
        currentBand: { scheduleId: 'sched-2026-08-17', bandId: 'off-peak', windowId: null, window: { id: null, start: '00:00', end: '09:00' }, timezone: 'Asia/Shanghai' },
      },
      estimatedCost: { ...SAMPLE.estimatedCost, unpricedRequestCount: 0, scheduleIdsUsed: ['sched-2026-08-17'] },
    }
    render(<DashboardView snapshot={{ ...EMPTY_SNAPSHOT, data: schedulesMode }} onRefresh={() => undefined} />)
    expect(screen.getByText(/sched-2026-08-17 · 分时定价 · 北京时间 Asia\/Shanghai/)).toBeDefined()
    expect(screen.getByText('空闲时段')).toBeDefined()
    expect(screen.queryByText(/部分用量未计价/)).toBeNull()

    const multi = { ...schedulesMode, estimatedCost: { ...schedulesMode.estimatedCost, scheduleIdsUsed: ['a', 'b'] } }
    render(<DashboardView snapshot={{ ...EMPTY_SNAPSHOT, data: multi }} onRefresh={() => undefined} />)
    expect(screen.getByText('多种价格计划')).toBeDefined()
  })

  it('shows the current peak band badge (off-peak → 空闲时段, peak → 高峰时段)', () => {
    document.documentElement.lang = 'zh'
    const peak = {
      ...SAMPLE,
      prices: {
        ...SAMPLE.prices,
        mode: 'time-aware' as const,
        entries: [],
        currentBand: { scheduleId: 'deepseek-2026-08-17', bandId: 'peak', windowId: 'peak-morning', window: { id: 'peak-morning', start: '09:00', end: '12:00' }, timezone: 'Asia/Shanghai' },
      },
    }
    render(<DashboardView snapshot={{ ...EMPTY_SNAPSHOT, data: peak }} onRefresh={() => undefined} />)
    expect(screen.getByText('高峰时段')).toBeDefined()
    expect(screen.queryByText('空闲时段')).toBeNull()
  })

  it('shows the off-peak badge with official provenance, period, rates, and window tooltip', () => {
    document.documentElement.lang = 'zh'
    const mode = {
      ...SAMPLE,
      prices: {
        ...SAMPLE.prices,
        mode: 'time-aware' as const,
        entries: [],
        schedules: [OFFICIAL_SCHEDULE_WIRE],
        currentBand: { scheduleId: 'deepseek-2026-08-17', bandId: 'off-peak', windowId: null, window: { id: null, start: '00:00', end: '09:00' }, timezone: 'Asia/Shanghai' },
      },
      estimatedCost: { ...SAMPLE.estimatedCost, unpricedRequestCount: 0, scheduleIdsUsed: ['deepseek-2026-08-17'] },
    }
    render(<DashboardView snapshot={{ ...EMPTY_SNAPSHOT, data: mode }} onRefresh={() => undefined} />)
    const badge = document.querySelector('[data-band="off-peak"]')
    expect(badge?.textContent).toContain('空闲时段')
    expect(screen.getByText('DeepSeek 2026-08-17 · 分时定价 · 北京时间 Asia/Shanghai')).toBeDefined()
    expect(screen.getByText('当前时段：00:00–09:00')).toBeDefined()
    expect(screen.getByText('当前费率为高峰时段的 50%')).toBeDefined()
    expect(screen.getByText(/当前费率（deepseek-v4-flash）：命中 ¥0\.05\/1M · 未命中 ¥1\.50\/1M · 输出 ¥4\.50\/1M/)).toBeDefined()
    // The full window picture lives in the badge tooltip, not on the card.
    expect(badge?.getAttribute('title')).toContain('高峰时段：09:00–12:00、14:00–18:00')
    expect(badge?.getAttribute('title')).toContain('空闲时段：00:00–09:00、12:00–14:00、18:00–24:00')
  })

  it('shows the peak badge with the matched window; no 50% note during peak', () => {
    document.documentElement.lang = 'zh'
    const mode = {
      ...SAMPLE,
      prices: {
        ...SAMPLE.prices,
        mode: 'time-aware' as const,
        entries: [],
        schedules: [OFFICIAL_SCHEDULE_WIRE],
        currentBand: { scheduleId: 'deepseek-2026-08-17', bandId: 'peak', windowId: 'peak-morning', window: { id: 'peak-morning', start: '09:00', end: '12:00' }, timezone: 'Asia/Shanghai' },
      },
      estimatedCost: { ...SAMPLE.estimatedCost, unpricedRequestCount: 0, scheduleIdsUsed: ['deepseek-2026-08-17'] },
    }
    render(<DashboardView snapshot={{ ...EMPTY_SNAPSHOT, data: mode }} onRefresh={() => undefined} />)
    const badge = document.querySelector('[data-band="peak"]')
    expect(badge?.textContent).toContain('高峰时段')
    expect(screen.getByText('当前时段：09:00–12:00')).toBeDefined()
    expect(screen.queryByText('当前费率为高峰时段的 50%')).toBeNull()
  })

  it('renders the peak/off-peak cost split and dims zero bands', () => {
    document.documentElement.lang = 'zh'
    const withSplit = {
      ...SAMPLE,
      estimatedCost: {
        ...SAMPLE.estimatedCost,
        unpricedRequestCount: 0,
        bandCosts: [
          { bandId: 'off-peak', totalMicro: '812891', requestCount: 1, cacheHitInputTokens: 8263680, cacheMissInputTokens: 99113, outputTokens: 55786 },
          { bandId: 'peak', totalMicro: '0', requestCount: 0, cacheHitInputTokens: 0, cacheMissInputTokens: 0, outputTokens: 0 },
        ],
      },
    }
    render(<DashboardView snapshot={{ ...EMPTY_SNAPSHOT, data: withSplit }} onRefresh={() => undefined} />)
    expect(screen.getByText(/空闲时段 ¥0\.812891 · 1 次/)).toBeDefined()
    expect(screen.getByText(/高峰时段 ¥0\.000000 · 0 次/)).toBeDefined()
    const peakRow = document.querySelector('[data-band="peak"]')
    expect(peakRow?.className).toContain('bandBreakdownRowZero')
    expect(peakRow?.getAttribute('title')).toContain('命中 0 · 未命中 0 · 输出 0')
  })

  it('keeps the band badge and the unpriced marker together', () => {
    document.documentElement.lang = 'zh'
    const mode = {
      ...SAMPLE,
      prices: {
        ...SAMPLE.prices,
        mode: 'time-aware' as const,
        entries: [],
        schedules: [OFFICIAL_SCHEDULE_WIRE],
        currentBand: { scheduleId: 'deepseek-2026-08-17', bandId: 'off-peak', windowId: null, window: { id: null, start: '00:00', end: '09:00' }, timezone: 'Asia/Shanghai' },
      },
    }
    render(<DashboardView snapshot={{ ...EMPTY_SNAPSHOT, data: mode }} onRefresh={() => undefined} />)
    // SAMPLE keeps unpricedRequestCount = 1 → both the badge and the marker
    // coexist without hiding the priced total.
    expect(screen.getByText('空闲时段')).toBeDefined()
    expect(screen.getByText(/部分用量未计价/)).toBeDefined()
    expect(screen.getByText(/¥1\.234567/)).toBeDefined()
  })

  it('renders an empty state without data', () => {
    document.documentElement.lang = 'zh'
    render(<DashboardView snapshot={EMPTY_SNAPSHOT} onRefresh={() => undefined} />)
    expect(document.body.textContent).toContain('…')
  })

  it('degrades gracefully on an old-host payload (v0.1.0 shape)', () => {
    // The 0.1.0 Host serves estimatedCost as {total,totalMicro,currency} and
    // prices as {version,updatedAt,entries} — no band fields at all. The new
    // card must render the total without crashing during the transition.
    document.documentElement.lang = 'zh'
    const oldHost = {
      ...SAMPLE,
      estimatedCost: { total: '1.234567', totalMicro: '1234567', currency: 'CNY' },
      prices: { version: 1, updatedAt: '2026-08-14T06:41:50.591Z', entries: SAMPLE.prices.entries },
    } as unknown as UsageStatsWire
    render(<DashboardView snapshot={{ ...EMPTY_SNAPSHOT, data: oldHost }} onRefresh={() => undefined} />)
    expect(screen.getByText(/¥1\.234567/)).toBeDefined()
    expect(screen.getByText(/-- · 分时定价 · 北京时间 Asia\/Shanghai/)).toBeDefined()
    expect(screen.queryByText('空闲时段')).toBeNull()
    expect(screen.queryByText(/时段分解/)).toBeNull()
  })

  it('warns when the endpoint is not api.deepseek.com', () => {
    document.documentElement.lang = 'zh'
    const filtered = { ...SAMPLE, meta: { ...SAMPLE.meta, endpointMatching: false, endpointBaseUrl: 'https://gateway.internal.example' } }
    render(<DashboardView snapshot={{ ...EMPTY_SNAPSHOT, data: filtered }} onRefresh={() => undefined} />)
    expect(screen.getByText(/不属于 api\.deepseek\.com/)).toBeDefined()
  })

  it('shows stale balance state', () => {
    document.documentElement.lang = 'zh'
    const stale = { ...SAMPLE, balanceState: { ...SAMPLE.balanceState, state: 'stale' as const } }
    render(<DashboardView snapshot={{ ...EMPTY_SNAPSHOT, data: stale }} onRefresh={() => undefined} />)
    expect(screen.getByText(/余额数据已过期/)).toBeDefined()
  })
})

describe('dock line', () => {
  it('renders the today line from the shared store', async () => {
    document.documentElement.lang = 'zh'
    class FakeApi extends UsageApi {
      override async stats(): Promise<UsageStatsWire> {
        return SAMPLE
      }
    }
    const store = new UsageStore(new FakeApi())
    setUsageStore(store)
    await store.fetch()
    render(<DockLine />)
    const text = document.body.textContent ?? ''
    expect(text).toContain('今日：命中 1,234 · 未命中 5,678 · 输出 901 · 估算 ¥1.234567 · 余额 ¥12.34')
  })

  it('renders nothing before the first fetch', () => {
    document.documentElement.lang = 'zh'
    const store = new UsageStore(new (class extends UsageApi {})())
    setUsageStore(store)
    render(<DockLine />)
    expect(document.body.textContent?.trim() ?? '').toBe('')
  })

  it('appends the current band word to the dock line when known', async () => {
    document.documentElement.lang = 'zh'
    const withBand = {
      ...SAMPLE,
      prices: {
        ...SAMPLE.prices,
        mode: 'time-aware' as const,
        entries: [],
        schedules: [OFFICIAL_SCHEDULE_WIRE],
        currentBand: { scheduleId: 'deepseek-2026-08-17', bandId: 'off-peak', windowId: null, window: { id: null, start: '00:00', end: '09:00' }, timezone: 'Asia/Shanghai' },
      },
    }
    class FakeApi extends UsageApi {
      override async stats(): Promise<UsageStatsWire> {
        return withBand
      }
    }
    const store = new UsageStore(new FakeApi())
    setUsageStore(store)
    await store.fetch()
    render(<DockLine />)
    const text = document.body.textContent ?? ''
    expect(text).toContain('估算 ¥1.234567 · 余额 ¥12.34 · 空闲时段')
  })
})

describe('locales', () => {
  it('declares the same key set in zh and en', () => {
    expect(Object.keys(zh).sort()).toEqual(Object.keys(en).sort())
    for (const key of Object.keys(zh)) {
      expect(en[key as keyof typeof zh]).toBeTruthy()
    }
  })

  it('interpolates {name} placeholders', () => {
    expect(interpolate('hit {hit} · cost {cost}', { hit: 12, cost: '¥1.00' })).toBe('hit 12 · cost ¥1.00')
    expect(interpolate('no params')).toBe('no params')
  })

  it('picks the dictionary from the document language', () => {
    document.documentElement.lang = 'zh-CN'
    expect(tt('entry.label')).toBe('API 用量')
    document.documentElement.lang = 'en'
    expect(tt('entry.label')).toBe('API Usage')
  })

  it('formats counts with grouping', () => {
    expect(formatCount(0)).toBe('0')
    expect(formatCount(1234567)).toBe('1,234,567')
  })
})

describe('settings form (staged)', () => {
  /** A fake SettingsScope. */
  function fakeScope(initial: UsageSettings = {}) {
    let value: UsageSettings | undefined = Object.keys(initial).length > 0 ? initial : undefined
    const listeners = new Set<() => void>()
    const scope: SettingsScope<UsageSettings> = {
      getSnapshot: (): SettingsScopeSnapshot<UsageSettings> => ({
        status: 'ready',
        value,
        base: undefined,
        user: value,
        revision: 1,
        writable: true,
        mode: 'host',
      }),
      subscribe: (listener) => {
        listeners.add(listener)
        return () => { listeners.delete(listener) }
      },
      set: async (field, next) => {
        value = { ...(value ?? {}), [field]: next }
        for (const listener of listeners) listener()
      },
      unset: async (field) => {
        value = { ...(value ?? {}) }
        delete value[field as keyof UsageSettings]
        for (const listener of listeners) listener()
      },
    }
    return scope
  }

  it('stages an edit, saves it, and re-seeds', async () => {
    const scope = fakeScope({ providerId: 'deepseek-official' })
    const form = new UsageSettingsForm(scope)
    const store = form.bind()
    const actions = form.actions()

    actions.editProviderId('deepseek-official')
    expect(store.getSnapshot().dirty).toBe(false) // same as current -> not dirty

    actions.editProviderId('pi-ai')
    expect(store.getSnapshot().dirty).toBe(true)
    expect(store.getSnapshot().providerId).toBe('pi-ai')

    await actions.save()
    expect(store.getSnapshot().dirty).toBe(false)
    expect(scope.getSnapshot().value?.providerId).toBe('pi-ai')
  })

  it('stages price rows and validates them', () => {
    const scope = fakeScope()
    const form = new UsageSettingsForm(scope)
    const store = form.bind()
    const actions = form.actions()

    actions.addPriceRow()
    const state = store.getSnapshot()
    expect(state.dirty).toBe(true)
    expect(state.invalid).toBe(true) // the empty new row blocks saving

    // Fill the appended row without coupling the test to the default table size.
    const appendedIndex = state.prices.length - 1
    actions.editPrice(appendedIndex, { model: 'my-model', cacheHitInputPricePerMillion: 0.5, cacheMissInputPricePerMillion: 2, outputPricePerMillion: 8 })
    expect(store.getSnapshot().invalid).toBe(false)

    actions.editPrice(appendedIndex, { outputPricePerMillion: -1 })
    expect(store.getSnapshot().invalid).toBe(true)
  })

  it('discards staged edits', () => {
    const scope = fakeScope({ providerId: 'deepseek-official' })
    const form = new UsageSettingsForm(scope)
    const store = form.bind()
    form.actions().editProviderId('pi-ai')
    expect(store.getSnapshot().dirty).toBe(true)
    form.actions().discard()
    expect(store.getSnapshot().dirty).toBe(false)
    expect(store.getSnapshot().providerId).toBe('deepseek-official')
  })

  it('loads an old prices-only config without crashing (legacy mode)', () => {
    const scope = fakeScope({
      prices: [{ model: 'deepseek-chat', cacheHitInputPricePerMillion: 0.5, cacheMissInputPricePerMillion: 2, outputPricePerMillion: 8, currency: 'CNY', effectiveFrom: '2025-09-05' }],
    })
    const form = new UsageSettingsForm(scope)
    const state = form.bind().getSnapshot()
    expect(state.pricingMode).toBe('legacy')
    expect(state.pricingBuiltinDefault).toBe(false)
    expect(state.pricingSchedules).toEqual([])
    expect(state.prices).toEqual([{ model: 'deepseek-chat', cacheHitInputPricePerMillion: 0.5, cacheMissInputPricePerMillion: 2, outputPricePerMillion: 8, currency: 'CNY', effectiveFrom: '2025-09-05' }])
    expect(state.invalid).toBe(false)
  })

  it('a persisted copy of the pristine default table is NOT legacy (upgrade path)', () => {
    // v0.1.0 persisted its schema default into `prices` — the settings card
    // must report the SAME effective mode as the host (time-aware builtin),
    // not "custom legacy".
    const scope = fakeScope({
      prices: [
        { model: 'deepseek-v4-flash', cacheHitInputPricePerMillion: 0.02, cacheMissInputPricePerMillion: 1, outputPricePerMillion: 2, currency: 'CNY', effectiveFrom: '2026-04-24' },
        { model: 'deepseek-v4-pro', cacheHitInputPricePerMillion: 0.025, cacheMissInputPricePerMillion: 3, outputPricePerMillion: 6, currency: 'CNY', effectiveFrom: '2026-04-24' },
        { model: 'deepseek-chat', cacheHitInputPricePerMillion: 0.02, cacheMissInputPricePerMillion: 1, outputPricePerMillion: 2, currency: 'CNY', effectiveFrom: '2026-04-24' },
        { model: 'deepseek-reasoner', cacheHitInputPricePerMillion: 0.02, cacheMissInputPricePerMillion: 1, outputPricePerMillion: 2, currency: 'CNY', effectiveFrom: '2026-04-24' },
        { model: '*', cacheHitInputPricePerMillion: 0.02, cacheMissInputPricePerMillion: 1, outputPricePerMillion: 2, currency: 'CNY', effectiveFrom: '2026-04-24' },
      ],
    })
    const form = new UsageSettingsForm(scope)
    const state = form.bind().getSnapshot()
    expect(state.pricingMode).toBe('time-aware')
    expect(state.pricingBuiltinDefault).toBe(true)
    // Row ORDER must not flip the verdict.
    const reordered = fakeScope({
      prices: [
        { model: '*', cacheHitInputPricePerMillion: 0.02, cacheMissInputPricePerMillion: 1, outputPricePerMillion: 2, currency: 'CNY', effectiveFrom: '2026-04-24' },
        { model: 'deepseek-v4-flash', cacheHitInputPricePerMillion: 0.02, cacheMissInputPricePerMillion: 1, outputPricePerMillion: 2, currency: 'CNY', effectiveFrom: '2026-04-24' },
      ],
    })
    // Two rows only → not the builtin table → legacy (correct: a trimmed table is a customization).
    const trimmed = new UsageSettingsForm(reordered).bind().getSnapshot()
    expect(trimmed.pricingMode).toBe('legacy')
    expect(trimmed.pricingBuiltinDefault).toBe(false)
  })

  it('no prices configured at all → builtin time-aware default', () => {
    const form = new UsageSettingsForm(fakeScope({}))
    const state = form.bind().getSnapshot()
    expect(state.pricingMode).toBe('time-aware')
    expect(state.pricingBuiltinDefault).toBe(true)
  })

  it('reads configured pricing schedules as read-only mode info', () => {
    const scope = fakeScope({
      pricingSchedules: [
        { id: 'sched-2026-08-17', effectiveFrom: '2026-08-17T00:00:00+08:00', timezone: 'Asia/Shanghai', currency: 'CNY', windows: [{ id: 'peak', start: '08:00', end: '18:00' }], models: [{ model: 'm', ratesByBand: { peak: { cacheHitInputPricePerMillion: 1, cacheMissInputPricePerMillion: 2, outputPricePerMillion: 3 } } }] },
      ],
    })
    const form = new UsageSettingsForm(scope)
    const state = form.bind().getSnapshot()
    expect(state.pricingMode).toBe('time-aware')
    expect(state.pricingBuiltinDefault).toBe(false)
    expect(state.pricingTimezone).toBe('Asia/Shanghai')
    expect(state.pricingSchedules).toEqual([{ id: 'sched-2026-08-17', effectiveFrom: '2026-08-17T00:00:00+08:00', currency: 'CNY', windows: [{ id: 'peak', start: '08:00', end: '18:00', bandId: undefined }] }])
    expect(state.invalid).toBe(false)
  })
})
