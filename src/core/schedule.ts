/**
 * Time-aware pricing schedules (the Phase-1 pricing engine).
 *
 * A {@link PricingSchedule} is a versioned price table bound to an explicit
 * effective instant, priced in ONE currency, split into daily time bands
 * (windows). Every usage row is priced by the schedule that was effective AT
 * THE REQUEST TIME:
 *
 *   schedule.effectiveFrom <= requestTime   (inclusive boundary)
 *
 * so a later price change never reprices history, and a request that started
 * before a midnight boundary is priced under the OLD schedule even when its
 * usage settles after the boundary.
 *
 * Band resolution: a request's wall clock (in the schedule's own timezone,
 * never the system local zone) is matched against the schedule's windows —
 * `start` inclusive, `end` exclusive. Unmatched minutes fall into the
 * implicit `off-peak` band, so a schedule may declare only its peak windows.
 * A window with `start === end` covers the whole day (all-day schedule).
 *
 * Unknown models are a NORMAL, expressible state: without an explicit user
 * configured `*` (wildcard) model entry the resolver returns `unpriced`
 * instead of inventing a price, and the dashboard shows the estimate with a
 * "partly unpriced" marker rather than a false exact number.
 *
 * The 2026-08-17 DeepSeek price change is NOT part of this module: only the
 * legacy 2026-04-24 table ships here (as {@link LEGACY_SCHEDULE}), preserving
 * current behavior. New schedules are added later, without touching the
 * resolver.
 */

import type { UsageBuckets } from './mapping.ts'
import { formatMicro } from './money.ts'
import { costOfBuckets } from './pricing.ts'
import { dayRangeMsInTimezone, minuteOfDayInTimezone, timezoneOffsetMs } from './day.ts'
import type { PriceEntry, TokenRates } from './pricing.ts'

/**
 * One daily time band. `start` inclusive, `end` exclusive, both in the
 * schedule's local wall clock ("HH:MM"; `end` may be "24:00"). A window
 * whose `start === end` covers the full day. `end < start` crosses midnight.
 */
export interface PricingWindow {
  id: string
  /** Local wall-clock "HH:MM", inclusive. */
  start: string
  /** Local wall-clock "HH:MM" or "24:00", exclusive. */
  end: string
}

/** One model's rates inside a schedule; `*` is an EXPLICIT user wildcard. */
export interface ModelPricing {
  /** Exact model id, or `*` when the user explicitly configured a fallback. */
  model: string
  /** Rates by band id (window ids, or the implicit `off-peak` band). */
  ratesByBand: Record<string, TokenRates>
}

/**
 * One versioned price table. `effectiveFrom` is an ISO 8601 instant with
 * offset (e.g. `2026-08-17T00:00:00+08:00`); legacy `YYYY-MM-DD` values are
 * normalized to midnight in the schedule's timezone on load.
 */
export interface PricingSchedule {
  id: string
  /** ISO 8601 instant with offset — the inclusive effectiveness boundary. */
  effectiveFrom: string
  /** IANA timezone id the windows and `effectiveFrom` are expressed in. */
  timezone: string
  /** ISO 4217 currency code — one schedule set shares ONE currency. */
  currency: string
  windows: PricingWindow[]
  models: ModelPricing[]
}

/** The full pricing configuration (one currency across all schedules). */
export interface PricingScheduleSet {
  schedules: PricingSchedule[]
}

/** The implicit band for minutes not covered by any declared window. */
export const OFF_PEAK_BAND_ID = 'off-peak'

/** A window whose `start === end` covers the full day (all-day schedule). */
export const ALL_DAY_WINDOW_ID = 'all-day'

/** The default timezone for schedules and legacy normalization. */
export const DEFAULT_SCHEDULE_TIMEZONE = 'Asia/Shanghai'

/** Parse "HH:MM" into minutes of day; "24:00" (end only) becomes 1440. */
function parseMinuteOfDay(text: string, what: string): number {
  const match = /^(\d{1,2}):(\d{2})$/.exec(text)
  if (match === null) throw new Error(`deepseek-usage: ${what} must be "HH:MM", got "${text}"`)
  const hours = Number.parseInt(match[1], 10)
  const minutes = Number.parseInt(match[2], 10)
  if (minutes > 59) throw new Error(`deepseek-usage: ${what} minutes out of range in "${text}"`)
  const value = hours * 60 + minutes
  if (value < 0 || value > 1440) throw new Error(`deepseek-usage: ${what} out of range in "${text}"`)
  return value
}

/** Whether one minute-of-day falls inside one window (start inclusive, end exclusive). */
export function isInsideWindow(minuteOfDay: number, window: PricingWindow): boolean {
  const start = parseMinuteOfDay(window.start, `window ${window.id} start`)
  const end = parseMinuteOfDay(window.end, `window ${window.id} end`)
  if (start === end) return true // all-day
  if (end > start) return minuteOfDay >= start && minuteOfDay < end
  return minuteOfDay >= start || minuteOfDay < end // cross-midnight
}

/** The band id covering one minute of day (a window id, or implicit off-peak). */
export function bandForMinute(schedule: PricingSchedule, minuteOfDay: number): { bandId: string; window: PricingWindow | null } {
  for (const window of schedule.windows) {
    if (isInsideWindow(minuteOfDay, window)) return { bandId: window.id, window }
  }
  return { bandId: OFF_PEAK_BAND_ID, window: null }
}

/** Whether a value is an ISO 8601 instant with an explicit offset/Z designator. */
const ISO_INSTANT_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/

/** A legacy `YYYY-MM-DD` date (interpreted as midnight in the timezone). */
const LEGACY_DATE_RE = /^\d{4}-\d{2}-\d{2}$/

/** Render an offset as `±HH:MM` (milliseconds east of UTC). */
function formatOffset(offsetMs: number): string {
  const sign = offsetMs < 0 ? '-' : '+'
  const absolute = Math.abs(offsetMs)
  const hours = Math.floor(absolute / 3_600_000)
  const minutes = Math.floor((absolute % 3_600_000) / 60_000)
  return `${sign}${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`
}

/**
 * Normalize an `effectiveFrom` value into an ISO 8601 instant with offset.
 * A legacy `YYYY-MM-DD` becomes midnight in `timezone` (e.g.
 * `2026-04-24T00:00:00+08:00`), so existing configs keep working unchanged.
 */
export function normalizeEffectiveFrom(value: string, timezone: string): string {
  const trimmed = value.trim()
  if (LEGACY_DATE_RE.test(trimmed)) {
    // `dayRangeMsInTimezone`'s startMs IS midnight of that date; its wall
    // clock in `timezone` is exactly 00:00:00, so the instant can be
    // rendered as the date itself plus the zone's offset at that moment.
    const startMs = dayRangeMsInTimezone(trimmed, timezone).startMs
    return `${trimmed}T00:00:00${formatOffset(timezoneOffsetMs(startMs, timezone))}`
  }
  if (!ISO_INSTANT_RE.test(trimmed) || Number.isNaN(Date.parse(trimmed))) {
    throw new Error(`deepseek-usage: effectiveFrom "${value}" must be YYYY-MM-DD or an ISO 8601 instant with offset`)
  }
  return trimmed
}

/** The epoch-millisecond instant a schedule becomes effective (inclusive). */
export function effectiveFromEpochMs(schedule: PricingSchedule): number {
  const parsed = Date.parse(normalizeEffectiveFrom(schedule.effectiveFrom, schedule.timezone))
  if (Number.isNaN(parsed)) {
    throw new Error(`deepseek-usage: schedule ${schedule.id} has an invalid effectiveFrom "${schedule.effectiveFrom}"`)
  }
  return parsed
}

/** A schedule prepared for repeated resolution (effective instant precomputed). */
export interface PreparedSchedule {
  schedule: PricingSchedule
  /** Epoch ms of the inclusive effectiveness boundary. */
  effectiveMs: number
}

/**
 * Sort and precompute the effective instants of a schedule list. The
 * resolved schedule for a request is the one with the largest
 * `effectiveFrom <= requestTime` — later schedules never reprice earlier
 * requests, because the list is only ever scanned up to the request time.
 */
export function prepareScheduleSet(schedules: readonly PricingSchedule[]): PreparedSchedule[] {
  return schedules
    .map(schedule => ({ schedule, effectiveMs: effectiveFromEpochMs(schedule) }))
    .sort((a, b) => a.effectiveMs - b.effectiveMs)
}

/** The outcome of pricing one usage row. */
export type ResolvedPricing =
  | {
    status: 'priced'
    scheduleId: string
    effectiveFrom: string
    timezone: string
    bandId: string
    model: string
    currency: string
    rates: TokenRates
  }
  | {
    status: 'unpriced'
    model: string
    reason: 'no-schedule' | 'unknown-model' | 'no-rates-for-band'
  }

/**
 * Resolve the pricing of one model at one request instant.
 *
 * Selection: schedules with `effectiveFrom <= requestTime`, taking the
 * LATEST one; the request's wall clock in the schedule's timezone picks the
 * band; then an exact model match, then an EXPLICIT user `*` wildcard. Any
 * other outcome is `unpriced` — never thrown, never a silent fake number.
 */
export function resolvePricing(prepared: readonly PreparedSchedule[], model: string, requestTimeMs: number): ResolvedPricing {
  let schedule: PreparedSchedule | undefined
  for (const candidate of prepared) {
    if (candidate.effectiveMs <= requestTimeMs) schedule = candidate
    else break // sorted ascending; later schedules are not effective yet
  }
  if (schedule === undefined) return { status: 'unpriced', model, reason: 'no-schedule' }
  const { bandId } = bandForMinute(schedule.schedule, minuteOfDayInTimezone(requestTimeMs, schedule.schedule.timezone))
  const entry = schedule.schedule.models.find(item => item.model === model)
    ?? schedule.schedule.models.find(item => item.model === '*')
  if (entry === undefined) return { status: 'unpriced', model, reason: 'unknown-model' }
  const rates = entry.ratesByBand[bandId]
  if (rates === undefined) return { status: 'unpriced', model, reason: 'no-rates-for-band' }
  return {
    status: 'priced',
    scheduleId: schedule.schedule.id,
    effectiveFrom: schedule.schedule.effectiveFrom,
    timezone: schedule.schedule.timezone,
    bandId,
    model,
    currency: schedule.schedule.currency,
    rates,
  }
}

/** Validate one rates object (non-negative finite numbers). */
function assertValidRates(rates: TokenRates, where: string): void {
  for (const [name, value] of [
    ['cacheHitInputPricePerMillion', rates.cacheHitInputPricePerMillion],
    ['cacheMissInputPricePerMillion', rates.cacheMissInputPricePerMillion],
    ['outputPricePerMillion', rates.outputPricePerMillion],
  ] as const) {
    if (!Number.isFinite(value) || value < 0) {
      throw new Error(`deepseek-usage: ${where} ${name} must be a non-negative number`)
    }
  }
}

/** The minute-of-day intervals one window covers (cross-midnight splits). */
function windowIntervals(window: PricingWindow): Array<[number, number]> {
  const start = parseMinuteOfDay(window.start, `window ${window.id} start`)
  const end = parseMinuteOfDay(window.end, `window ${window.id} end`)
  if (start === end) return [[0, 1440]] // all-day
  if (end > start) return [[start, end]]
  return [[start, 1440], [0, end]]
}

/** Validate the whole schedule set; throws with a specific message. */
export function validatePricingScheduleSet(set: PricingScheduleSet): void {
  if (set.schedules.length === 0) throw new Error('deepseek-usage: pricingSchedules must contain at least one schedule')
  const seenIds = new Set<string>()
  const seenEffective = new Set<number>()
  let currency: string | undefined
  for (const schedule of set.schedules) {
    if (schedule.id.trim() === '') throw new Error('deepseek-usage: every pricing schedule needs a non-empty id')
    if (seenIds.has(schedule.id)) throw new Error(`deepseek-usage: duplicate pricing schedule id "${schedule.id}"`)
    seenIds.add(schedule.id)
    if (schedule.currency.trim() === '') throw new Error(`deepseek-usage: schedule ${schedule.id} has an empty currency`)
    // One schedule set must share ONE currency — mixed currencies would
    // silently sum into a single ¥ figure, which is never valid.
    if (currency === undefined) currency = schedule.currency
    else if (currency !== schedule.currency) {
      throw new Error(`deepseek-usage: schedule ${schedule.id} uses ${schedule.currency} but the set is priced in ${currency}; mixed currencies are not supported`)
    }
    const effectiveMs = effectiveFromEpochMs(schedule)
    if (seenEffective.has(effectiveMs)) {
      throw new Error(`deepseek-usage: schedules ${schedule.id} and a sibling share the same effectiveFrom instant`)
    }
    seenEffective.add(effectiveMs)
    if (schedule.windows.length === 0) {
      throw new Error(`deepseek-usage: schedule ${schedule.id} needs at least one window (use start "00:00" end "00:00" for all-day)`)
    }
    const windowIds = new Set<string>()
    const intervals: Array<[number, number]> = []
    for (const window of schedule.windows) {
      if (window.id.trim() === '') throw new Error(`deepseek-usage: schedule ${schedule.id} has a window with an empty id`)
      if (windowIds.has(window.id)) throw new Error(`deepseek-usage: schedule ${schedule.id} has duplicate window id "${window.id}"`)
      windowIds.add(window.id)
      const parts = windowIntervals(window) // throws on malformed times
      for (const interval of parts) intervals.push(interval)
    }
    // Overlap check on minute granularity (all-day windows overlap anything).
    intervals.sort((a, b) => a[0] - b[0])
    for (let index = 1; index < intervals.length; index += 1) {
      const previous = intervals[index - 1]!
      const current = intervals[index]!
      if (previous[1] > current[0]) {
        throw new Error(`deepseek-usage: schedule ${schedule.id} has overlapping windows`)
      }
    }
    for (const model of schedule.models) {
      if (model.model.trim() === '') throw new Error(`deepseek-usage: schedule ${schedule.id} has a model with an empty id`)
      for (const [bandId, rates] of Object.entries(model.ratesByBand)) {
        if (bandId !== OFF_PEAK_BAND_ID && !windowIds.has(bandId)) {
          throw new Error(`deepseek-usage: schedule ${schedule.id} model ${model.model} references unknown band "${bandId}"`)
        }
        assertValidRates(rates, `schedule ${schedule.id} model ${model.model} band ${bandId}`)
      }
    }
    if (schedule.models.filter(item => item.model === '*').length > 1) {
      throw new Error(`deepseek-usage: schedule ${schedule.id} has more than one "*" wildcard entry`)
    }
  }
}

/**
 * Build one all-day schedule per `effectiveFrom` group from a legacy
 * `PriceEntry[]` config (backward compatibility: existing `prices` keep
 * working, including user-configured `*` fallback rows).
 */
export function buildSchedulesFromPriceEntries(entries: readonly PriceEntry[]): PricingSchedule[] {
  if (entries.length === 0) throw new Error('deepseek-usage: prices must contain at least one entry')
  const currency = entries[0]!.currency
  const byDate = new Map<string, ModelPricing[]>()
  for (const entry of entries) {
    if (entry.currency !== currency) {
      throw new Error(`deepseek-usage: price entry ${entry.model} uses ${entry.currency} but the table is priced in ${currency}; mixed currencies are not supported`)
    }
    const models = byDate.get(entry.effectiveFrom) ?? []
    models.push({
      model: entry.model,
      ratesByBand: {
        [ALL_DAY_WINDOW_ID]: {
          cacheHitInputPricePerMillion: entry.cacheHitInputPricePerMillion,
          cacheMissInputPricePerMillion: entry.cacheMissInputPricePerMillion,
          outputPricePerMillion: entry.outputPricePerMillion,
        },
      },
    })
    byDate.set(entry.effectiveFrom, models)
  }
  return [...byDate.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, models]) => ({
      id: `user-legacy-${date}`,
      effectiveFrom: normalizeEffectiveFrom(date, DEFAULT_SCHEDULE_TIMEZONE),
      timezone: DEFAULT_SCHEDULE_TIMEZONE,
      currency,
      windows: [{ id: ALL_DAY_WINDOW_ID, start: '00:00', end: '00:00' }],
      models,
    }))
}

/**
 * The built-in legacy schedule: the repository's current 2026-04-24 DeepSeek
 * table, migrated VERBATIM (only the numbers already present in this repo —
 * no new price is invented here). It deliberately has NO `*` fallback: a
 * built-in default must never silently price an unknown model.
 */
export const LEGACY_SCHEDULE: PricingSchedule = {
  id: 'legacy-2026-04-24',
  effectiveFrom: '2026-04-24T00:00:00+08:00',
  timezone: DEFAULT_SCHEDULE_TIMEZONE,
  currency: 'CNY',
  windows: [{ id: ALL_DAY_WINDOW_ID, start: '00:00', end: '00:00' }],
  models: [
    {
      model: 'deepseek-v4-flash',
      ratesByBand: { [ALL_DAY_WINDOW_ID]: { cacheHitInputPricePerMillion: 0.02, cacheMissInputPricePerMillion: 1, outputPricePerMillion: 2 } },
    },
    {
      model: 'deepseek-v4-pro',
      ratesByBand: { [ALL_DAY_WINDOW_ID]: { cacheHitInputPricePerMillion: 0.025, cacheMissInputPricePerMillion: 3, outputPricePerMillion: 6 } },
    },
    {
      model: 'deepseek-chat',
      ratesByBand: { [ALL_DAY_WINDOW_ID]: { cacheHitInputPricePerMillion: 0.02, cacheMissInputPricePerMillion: 1, outputPricePerMillion: 2 } },
    },
    {
      model: 'deepseek-reasoner',
      ratesByBand: { [ALL_DAY_WINDOW_ID]: { cacheHitInputPricePerMillion: 0.02, cacheMissInputPricePerMillion: 1, outputPricePerMillion: 2 } },
    },
  ],
}

/** Structural equality of two schedule sets (pricing-config change detection). */
export function pricingSetsEqual(a: PricingScheduleSet, b: PricingScheduleSet): boolean {
  if (a.schedules.length !== b.schedules.length) return false
  return a.schedules.every((schedule, index) => {
    const other = b.schedules[index]!
    if (schedule.id !== other.id
      || schedule.effectiveFrom !== other.effectiveFrom
      || schedule.timezone !== other.timezone
      || schedule.currency !== other.currency
      || schedule.windows.length !== other.windows.length
      || schedule.models.length !== other.models.length) {
      return false
    }
    if (!schedule.windows.every((window, windowIndex) => {
      const sibling = other.windows[windowIndex]!
      return window.id === sibling.id && window.start === sibling.start && window.end === sibling.end
    })) {
      return false
    }
    return schedule.models.every((model, modelIndex) => {
      const sibling = other.models[modelIndex]!
      if (model.model !== sibling.model) return false
      const bands = Object.keys(model.ratesByBand)
      const siblingBands = Object.keys(sibling.ratesByBand)
      if (bands.length !== siblingBands.length) return false
      return bands.every(band => {
        const rates = model.ratesByBand[band]!
        const siblingRates = sibling.ratesByBand[band]
        return siblingRates !== undefined
          && rates.cacheHitInputPricePerMillion === siblingRates.cacheHitInputPricePerMillion
          && rates.cacheMissInputPricePerMillion === siblingRates.cacheMissInputPricePerMillion
          && rates.outputPricePerMillion === siblingRates.outputPricePerMillion
      })
    })
  })
}

/** One row priced by the aggregate: request time falls back to settlement time. */
export interface PricableRow {
  model: string
  failed: boolean
  cacheHit: number
  cacheMiss: number
  output: number
  /** Settlement time (epoch ms) — the existing `time` field, untouched. */
  time: number
  /** Request start time (epoch ms); historical rows use the settlement approximation. */
  requestTime: number
}

/** One day's cost estimate with explicit priced/unpriced accounting. */
export interface DayCostEstimate {
  /** Total estimated cost as a decimal string in `currency` units. */
  total: string
  /** Total estimated cost in integer micro-units (1e-6 of `currency`). */
  totalMicro: string
  currency: string
  /** Rows priced under a schedule (failed rows never count). */
  pricedRequestCount: number
  /** Rows with usage that could not be priced (unknown model / no rates). */
  unpricedRequestCount: number
  /** Tokens of the unpriced rows — NEVER folded into `total`. */
  unpriced: {
    cacheHitInputTokens: number
    cacheMissInputTokens: number
    outputTokens: number
  }
  /** The schedule ids that priced this day (empty while everything is unpriced). */
  scheduleIdsUsed: string[]
}

/** The zero estimate (no store / no rows yet). */
export function emptyDayCostEstimate(currency = 'CNY'): DayCostEstimate {
  return {
    total: '0',
    totalMicro: '0',
    currency,
    pricedRequestCount: 0,
    unpricedRequestCount: 0,
    unpriced: { cacheHitInputTokens: 0, cacheMissInputTokens: 0, outputTokens: 0 },
    scheduleIdsUsed: [],
  }
}

/** Turn a row's stored buckets into the mapping shape the cost math needs. */
function bucketsOf(row: PricableRow): UsageBuckets {
  return {
    cacheHitInputTokens: row.cacheHit,
    cacheMissInputTokens: row.cacheMiss,
    outputTokens: row.output,
    reasoningTokens: 0,
    totalInputTokens: row.cacheHit + row.cacheMiss,
    totalTokens: row.cacheHit + row.cacheMiss + row.output,
  }
}

/**
 * Aggregate one day's rows into a cost estimate. Every row is priced at its
 * OWN request time against the schedule set — never "today's tokens × the
 * current price". Failed rows carry no usage and are ignored entirely.
 */
export function aggregateDayCost(schedules: readonly PricingSchedule[], rows: readonly PricableRow[]): DayCostEstimate {
  const prepared = prepareScheduleSet(schedules)
  const currency = schedules[0]?.currency ?? 'CNY'
  let total = 0n
  let priced = 0
  let unpricedCount = 0
  const unpricedTokens = { cacheHitInputTokens: 0, cacheMissInputTokens: 0, outputTokens: 0 }
  const scheduleIds = new Set<string>()
  for (const row of rows) {
    if (row.failed) continue // failed requests have no known usage — never priced
    const resolved = resolvePricing(prepared, row.model, row.requestTime)
    if (resolved.status === 'unpriced') {
      unpricedCount += 1
      unpricedTokens.cacheHitInputTokens += row.cacheHit
      unpricedTokens.cacheMissInputTokens += row.cacheMiss
      unpricedTokens.outputTokens += row.output
      continue
    }
    priced += 1
    scheduleIds.add(resolved.scheduleId)
    total += costOfBuckets(resolved.rates, bucketsOf(row)).total
  }
  return {
    total: formatMicro(total, 6),
    totalMicro: total.toString(),
    currency,
    pricedRequestCount: priced,
    unpricedRequestCount: unpricedCount,
    unpriced: unpricedTokens,
    scheduleIdsUsed: [...scheduleIds],
  }
}
