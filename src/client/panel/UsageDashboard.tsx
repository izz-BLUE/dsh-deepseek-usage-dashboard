/**
 * The API usage dashboard panel: today's token cards, cache hit/miss
 * comparison, output, hit rate, estimated cost, balance, 7-day trend, and
 * the data-source footer. Rendered inside a plain React root (family
 * pattern), so locale comes from the document language, and every color
 * comes from DSH CSS tokens.
 */

import { useSyncExternalStore } from 'react'
import type { PanelController } from '../controller.ts'
import type { UsageStore, UsageStoreSnapshot } from '../store.ts'
import { formatCount, type BalanceSnapshotWire } from '../api.ts'
import { tt } from '../locales.ts'
import css from './dashboard.module.css'

/** Props the panel receives. */
export interface UsageDashboardProps {
  controller: PanelController
  store: UsageStore
}

/** Format an epoch-ms timestamp for display. */
function formatTime(epochMs: number): string {
  return new Date(epochMs).toLocaleString()
}

/** Format a currency amount string with a currency prefix. */
function formatAmount(total: string, currency: string): string {
  return `${currency === 'CNY' ? '¥' : `${currency} `}${total}`
}

/** Render a micro-unit string as a 6-decimal amount ("812891" → "0.812891"). */
function microDecimal(micro: string): string {
  const negative = micro.startsWith('-')
  const digits = negative ? micro.slice(1) : micro
  const padded = digits.padStart(7, '0')
  const whole = padded.slice(0, -6)
  const fraction = padded.slice(-6)
  return `${negative ? '-' : ''}${whole}.${fraction}`
}

/** One per-million rate with the currency prefix ("¥0.05/1M", two decimals). */
function rateText(currency: string, rate: number): string {
  return `${currency === 'CNY' ? '¥' : `${currency} `}${rate.toFixed(2)}/1M`
}

/** The user-facing band label for a resolved band id. */
function bandLabel(t: typeof tt, bandId: string): string {
  if (bandId === 'off-peak') return t('panel.currentBandOffPeak')
  if (bandId === 'peak') return t('panel.currentBandPeak')
  if (bandId === 'all-day') return t('panel.currentBandAllDay')
  return bandId
}

/** The display name of a schedule (the official one reads as a product name). */
function scheduleName(scheduleId: string): string {
  return scheduleId === 'deepseek-2026-08-17' ? 'DeepSeek 2026-08-17' : scheduleId
}

type StatTone = 'accent' | 'positive' | 'danger'

/** A labeled stat card with a compact, semantic visual treatment. */
function StatCard(props: { label: string; value: string; hint?: string; icon: string; tone?: StatTone }) {
  const toneClass = props.tone === 'accent'
    ? css.statAccent
    : props.tone === 'positive'
      ? css.statPositive
      : props.tone === 'danger'
        ? css.statDanger
        : ''
  return (
    <div className={`${css.statCard} ${toneClass}`.trim()}>
      <span className={css.statLabelRow}>
        <span className={css.statIcon} aria-hidden="true">{props.icon}</span>
        <span className={css.statLabel}>{props.label}</span>
      </span>
      <span className={css.statValue}>{props.value}</span>
      {props.hint !== undefined ? <span className={css.statHint}>{props.hint}</span> : null}
    </div>
  )
}

/** The cache hit/miss proportion bar. */
function CacheBar(props: { hit: number; miss: number }) {
  const total = props.hit + props.miss
  if (total === 0) {
    return <div className={css.cacheBar}><div className={css.cacheBarEmpty} /></div>
  }
  const hitPercent = (props.hit / total) * 100
  return (
    <div className={css.cacheBar} role="img" aria-label={`hit ${props.hit} / miss ${props.miss}`}>
      <div className={css.cacheBarHit} style={{ width: `${hitPercent}%` }} />
      <div className={css.cacheBarMiss} style={{ width: `${100 - hitPercent}%` }} />
    </div>
  )
}

const TREND_WIDTH = 720
const TREND_HEIGHT = 178
const TREND_LEFT = 58
const TREND_RIGHT = 704
const TREND_TOP = 20
const TREND_BOTTOM = 138

/** The 7-day trend as a responsive line and area chart. */
function TrendChart(props: { data: Array<{ date: string; totalTokens: number }> }) {
  const max = Math.max(0, ...props.data.map(day => day.totalTokens))
  const total = props.data.reduce((sum, day) => sum + day.totalTokens, 0)
  const divisor = props.data.length === 0 ? 1 : props.data.length
  const average = Math.round(total / divisor)
  const averageY = max === 0
    ? TREND_BOTTOM
    : TREND_BOTTOM - ((TREND_BOTTOM - TREND_TOP) * average) / max
  const points = props.data.map((day, index) => {
    const x = props.data.length <= 1
      ? (TREND_LEFT + TREND_RIGHT) / 2
      : TREND_LEFT + ((TREND_RIGHT - TREND_LEFT) * index) / (props.data.length - 1)
    const y = max === 0
      ? TREND_BOTTOM
      : TREND_BOTTOM - ((TREND_BOTTOM - TREND_TOP) * day.totalTokens) / max
    return { ...day, x, y }
  })
  const linePoints = points.map(point => `${point.x},${point.y}`).join(' ')
  const areaPath = points.length === 0
    ? ''
    : `M ${points[0]?.x},${TREND_BOTTOM} L ${linePoints.replaceAll(' ', ' L ')} L ${points.at(-1)?.x},${TREND_BOTTOM} Z`

  return (
    <div className={css.trend}>
      <div className={css.trendChartHeader}>
        <strong className={css.trendChartTitle}>{tt('panel.trendChartTitle')}</strong>
        <div className={css.trendLegend}>
          <span><i className={css.legendTotal} />{tt('panel.trendTotalLegend')}</span>
          <span><i className={css.legendAverage} />{tt('panel.trendAverage')}</span>
        </div>
      </div>

      <svg
        className={css.trendSvg}
        viewBox={`0 0 ${TREND_WIDTH} ${TREND_HEIGHT}`}
        role="img"
        aria-label="7-day token usage"
        preserveAspectRatio="none"
      >
        {[TREND_TOP, (TREND_TOP + TREND_BOTTOM) / 2, TREND_BOTTOM].map((y, index) => (
          <g key={y} className={css.trendGrid}>
            <line x1={TREND_LEFT} x2={TREND_RIGHT} y1={y} y2={y} />
            <text x="4" y={y + 4}>
              {index === 0 ? formatCompactCount(max) : index === 1 ? formatCompactCount(Math.round(max / 2)) : '0'}
            </text>
          </g>
        ))}
        <line
          className={css.trendAverageLine}
          x1={TREND_LEFT}
          x2={TREND_RIGHT}
          y1={averageY}
          y2={averageY}
        />
        {areaPath !== '' ? <path className={css.trendArea} d={areaPath} /> : null}
        {linePoints !== '' ? <polyline className={css.trendLine} points={linePoints} /> : null}
        {points.map((point, index) => (
          <g key={point.date} className={index === points.length - 1 ? css.trendPointLatest : css.trendPoint}>
            <circle cx={point.x} cy={point.y} r={point.totalTokens === 0 ? 3 : 5}>
              <title>{`${point.date}: ${formatCount(point.totalTokens)}`}</title>
            </circle>
            {point.totalTokens > 0
              ? <text className={css.trendPointValue} x={point.x} y={Math.max(14, point.y - 10)}>{formatCompactCount(point.totalTokens)}</text>
              : null}
            <text className={css.trendDate} x={point.x} y="168">{point.date.slice(5)}</text>
          </g>
        ))}
      </svg>

      <div className={css.trendSummary}>
        <span>{tt('panel.trendTotal')} <strong>{formatCompactCount(total)}</strong></span>
        <span>{tt('panel.trendAverage')} <strong>{formatCompactCount(average)}</strong></span>
      </div>

      <div className={css.trendMeters} aria-hidden="false">
        {props.data.map(day => (
          <div
            key={day.date}
            role="meter"
            aria-label={`${day.date}: ${formatCount(day.totalTokens)}`}
            aria-valuemin={0}
            aria-valuemax={max}
            aria-valuenow={day.totalTokens}
          />
        ))}
      </div>
    </div>
  )
}

/** Compact chart labels that stay readable from units through millions. */
function formatCompactCount(value: number): string {
  if (value < 1_000) return String(value)
  if (value < 1_000_000) return `${trimDecimal(value / 1_000)}K`
  if (value < 1_000_000_000) return `${trimDecimal(value / 1_000_000)}M`
  return `${trimDecimal(value / 1_000_000_000)}B`
}

/** One decimal when useful, with trailing .0 removed. */
function trimDecimal(value: number): string {
  return value.toFixed(1).replace(/\.0$/, '')
}

/** The balance detail block (non-null balance, narrowed once). */
function BalanceDetail(props: { balance: BalanceSnapshotWire; stale: boolean; t: typeof tt }) {
  const { balance, stale, t } = props
  return (
    <>
      {stale ? <p className={css.balanceState}>{t('panel.balanceStale')}</p> : null}
      <span className={css.balanceValue}>
        {balance.infos.length > 0
          ? formatAmount(balance.infos[0].totalBalance, balance.infos[0].currency)
          : '--'}
      </span>
      {balance.infos.map(info => (
        <dl key={info.currency} className={css.balanceRows}>
          <div className={css.balanceRow}>
            <dt>{t('panel.granted')}</dt>
            <dd>{formatAmount(info.grantedBalance, info.currency)}</dd>
          </div>
          <div className={css.balanceRow}>
            <dt>{t('panel.toppedUp')}</dt>
            <dd>{formatAmount(info.toppedUpBalance, info.currency)}</dd>
          </div>
          <div className={css.balanceRow}>
            <dt>{t('panel.totalBalance')}</dt>
            <dd>{formatAmount(info.totalBalance, info.currency)}</dd>
          </div>
          <div className={css.balanceRow}>
            <dt>{t('panel.available')}</dt>
            <dd>{balance.isAvailable ? 'yes' : 'no'}</dd>
          </div>
        </dl>
      ))}
    </>
  )
}

/**
 * The estimated-cost card: amount, current-band badge (off-peak / peak),
 * pricing provenance (official schedule + timezone; internal version moves
 * to a tooltip), the current period and current rates, the peak/off-peak
 * cost split, and the unpriced marker.
 */
function EstimateCard(props: { data: NonNullable<UsageStoreSnapshot['data']>; t: typeof tt }) {
  const { data, t } = props
  const prices = data.prices
  const estimate = data.estimatedCost
  // Defensive: an older Host (v0.1.0 payload) lacks these fields entirely —
  // the card must degrade, never crash, during a mixed-version transition.
  const schedules = prices.schedules ?? []
  const bandCosts = estimate.bandCosts ?? []
  const band = prices.currentBand ?? null

  // Internal pricing-config identity — SECONDARY metadata, tooltip only.
  const metaTitle = `${t('panel.priceVersion')} ${prices.version}${prices.updatedAt !== null
    ? ` · ${t('panel.priceUpdated')}: ${new Date(prices.updatedAt).toLocaleString()}`
    : ''}`

  // The active schedule (the current instant's, falling back to the day's).
  const activeSchedule = schedules.find(schedule => schedule.id === (band?.scheduleId ?? estimate.scheduleIdsUsed[0] ?? schedules[0]?.id))

  // Band badge: label + tone (green off-peak / amber peak / neutral).
  let badge: { bandId: string; label: string; tone: 'off' | 'peak' | 'neutral'; title: string } | null = null
  if (band !== null) {
    const schedule = schedules.find(item => item.id === band.scheduleId)
    const peakList = (schedule?.windows ?? [])
      .filter(window => (window.bandId ?? window.id) === 'peak')
      .map(window => `${window.start}–${window.end}`)
      .join('、')
    const offPeakList = (schedule?.offPeakSpans ?? [])
      .map(span => `${span.start}–${span.end}`)
      .join('、')
    const tooltip = peakList !== '' || offPeakList !== ''
      ? t('panel.windowsTooltip', { peak: peakList, offpeak: offPeakList })
      : ''
    badge = {
      bandId: band.bandId,
      label: bandLabel(t, band.bandId),
      tone: band.bandId === 'off-peak' ? 'off' : band.bandId === 'peak' ? 'peak' : 'neutral',
      title: tooltip,
    }
  }

  // The current period ("当前时段：00:00–09:00").
  const currentWindow = band?.window !== undefined && band?.window !== null
    ? t('panel.currentWindow', { span: `${band.window.start}–${band.window.end}` })
    : null

  // The current band's rates of the primary model ("当前费率（deepseek-v4-flash）：…").
  let currentRates: string | null = null
  if (band !== null && activeSchedule !== undefined) {
    const model = activeSchedule.models.find(item => item.model === 'deepseek-v4-flash') ?? activeSchedule.models[0]
    const rates = model?.ratesByBand[band.bandId]
    if (model !== undefined && rates !== undefined) {
      currentRates = t('panel.currentRates', {
        model: model.model,
        hit: rateText(estimate.currency, rates.cacheHitInputPricePerMillion),
        miss: rateText(estimate.currency, rates.cacheMissInputPricePerMillion),
        out: rateText(estimate.currency, rates.outputPricePerMillion),
      })
    }
  }

  // Off-peak = exactly half of peak — a fact of the OFFICIAL schedule only.
  const offPeakHalf = band?.bandId === 'off-peak' && band?.scheduleId === 'deepseek-2026-08-17'

  return (
    <div className={css.estimateCard}>
      <span className={css.estimateValue}>
        {formatAmount(estimate.total, estimate.currency)}
      </span>
      {badge !== null
        ? (
          <span
            className={`${css.bandBadge} ${badge.tone === 'off' ? css.bandOffPeak : badge.tone === 'peak' ? css.bandPeak : css.bandNeutral}`.trim()}
            role="status"
            data-band={badge.bandId}
            title={badge.title}
          >
            {badge.label}
          </span>
        )
        : null}
      <span className={css.estimateProvenance} title={metaTitle}>{pricingProvenance(data, t)}</span>
      {estimate.scheduleIdsUsed.length > 1
        ? <span className={css.estimateBand}>{t('panel.pricingMultiple')}</span>
        : null}
      {currentWindow !== null
        ? <span className={css.estimateBand} data-window="current">{currentWindow}</span>
        : null}
      {currentRates !== null
        ? <span className={css.estimateRates}>{currentRates}</span>
        : null}
      {offPeakHalf
        ? <span className={css.estimateNote} role="status">{t('panel.offPeakHalfNote')}</span>
        : null}
      <span className={css.estimateNote}>{t('panel.estimateNote')}</span>
      {estimate.unpricedRequestCount > 0
        ? (
          <span className={css.estimateUnpriced} role="status">
            {t('panel.unpriced')} · {t('panel.unpricedDetail', { count: estimate.unpricedRequestCount })}
          </span>
        )
        : null}
      {bandCosts.length > 0
        ? (
          <div className={css.bandBreakdown} aria-label={t('panel.bandBreakdownLabel')}>
            <span className={css.bandBreakdownLabel}>{t('panel.bandBreakdownLabel')}</span>
            {bandCosts.map(share => (
              <span
                key={share.bandId}
                className={share.requestCount === 0 ? `${css.bandBreakdownRow} ${css.bandBreakdownRowZero}` : css.bandBreakdownRow}
                data-band={share.bandId}
                title={t('panel.bandCostTokens', {
                  hit: formatCount(share.cacheHitInputTokens),
                  miss: formatCount(share.cacheMissInputTokens),
                  out: formatCount(share.outputTokens),
                })}
              >
                {t('panel.bandCostRow', {
                  band: bandLabel(t, share.bandId),
                  cost: formatAmount(microDecimal(share.totalMicro), estimate.currency),
                  count: formatCount(share.requestCount),
                })}
              </span>
            ))}
          </div>
        )
        : null}
    </div>
  )
}

/** The pricing provenance line under the estimate (schedule aware). */
function pricingProvenance(data: NonNullable<UsageStoreSnapshot['data']>, t: typeof tt): string {
  const estimate = data.estimatedCost
  if (data.prices.mode === 'legacy') {
    const date = data.prices.entries[0]?.effectiveFrom ?? '--'
    return t('panel.pricingModeLegacy', { date })
  }
  const scheduleId = data.prices.currentBand?.scheduleId
    ?? estimate.scheduleIdsUsed[0]
    ?? (data.prices.schedules ?? [])[0]?.id
  const schedule = (data.prices.schedules ?? []).find(item => item.id === scheduleId)
  const name = schedule === undefined ? '--' : scheduleName(schedule.id)
  const timezone = data.prices.currentBand?.timezone ?? data.prices.timezone
  const timezoneText = timezone === 'Asia/Shanghai' ? t('panel.timezoneBeijing', { tz: timezone }) : timezone
  return t('panel.pricingNow', { name, timezone: timezoneText })
}

/**
 * Render the usage dashboard.
 * @param props - panel controller and the shared stats store.
 */
export function UsageDashboard({ store }: UsageDashboardProps) {
  const snapshot = useSyncExternalStore(
    (listener) => store.subscribe(listener),
    () => store.getSnapshot(),
  )
  return <DashboardView snapshot={snapshot} onRefresh={() => { void store.refresh() }} />
}

/** Pure view over one store snapshot (also used by tests). */
export function DashboardView(props: { snapshot: UsageStoreSnapshot; onRefresh: () => void }) {
  const { snapshot, onRefresh } = props
  const data = snapshot.data
  const t = tt
  const totalInput = data === null ? 0 : data.daily.cacheHitInputTokens + data.daily.cacheMissInputTokens
  const cacheHitShare = data === null || totalInput === 0 ? null : data.daily.cacheHitInputTokens / totalInput
  const cacheMissShare = data === null || totalInput === 0 ? null : data.daily.cacheMissInputTokens / totalInput
  const failureRate = data === null || data.daily.requestCount === 0
    ? 0
    : data.daily.failedRequestCount / data.daily.requestCount

  return (
    <div className={css.page}>
      <header className={css.header}>
        <h1 className={css.title}>{t('panel.title')}</h1>
        <div className={css.headerActions}>
          {data !== null
            ? (
              <span className={css.updated}>
                {t('panel.lastUpdated')}: {formatTime(data.meta.updatedAt)}
              </span>
            )
            : null}
          <button
            type="button"
            className={css.refresh}
            disabled={snapshot.refreshing}
            onClick={onRefresh}
          >
            {t(snapshot.refreshing ? 'panel.refreshing' : 'panel.refresh')}
          </button>
        </div>
      </header>

      {data === null
        ? (
          <section className={css.empty} role="status">
            {snapshot.error !== null ? snapshot.error : '…'}
          </section>
        )
        : (
          <>
            {!data.meta.endpointMatching
              ? (
                <p className={css.notice} role="status">
                  {t('panel.endpointFiltered', { baseUrl: data.meta.endpointBaseUrl })}
                </p>
              )
              : (
                <p className={css.noticeMuted}>
                  {t('panel.endpointOk', { baseUrl: data.meta.endpointBaseUrl, provider: data.meta.providerId })}
                </p>
              )}

            <section aria-label={t('panel.today')}>
              <h2 className={css.sectionTitle}>{t('panel.today')}</h2>
              <div className={css.grid}>
                <StatCard
                  label={t('panel.cacheHit')}
                  value={formatCount(data.daily.cacheHitInputTokens)}
                  hint={t('panel.inputShare', { percent: cacheHitShare === null ? '--' : `${(cacheHitShare * 100).toFixed(1)}%` })}
                  icon="⊙"
                  tone="accent"
                />
                <StatCard
                  label={t('panel.cacheMiss')}
                  value={formatCount(data.daily.cacheMissInputTokens)}
                  hint={t('panel.inputShare', { percent: cacheMissShare === null ? '--' : `${(cacheMissShare * 100).toFixed(1)}%` })}
                  icon="⊖"
                />
                <StatCard label={t('panel.output')} value={formatCount(data.daily.outputTokens)} hint={t('panel.tokensUnit')} icon="↗" />
                {data.daily.reasoningTokens > 0
                  ? <StatCard label={t('panel.reasoning')} value={formatCount(data.daily.reasoningTokens)} hint={t('panel.tokensUnit')} icon="◷" />
                  : null}
                <StatCard
                  label={t('panel.hitRate')}
                  value={data.daily.cacheHitRate === null ? '--' : `${(data.daily.cacheHitRate * 100).toFixed(1)}%`}
                  hint={data.daily.cacheHitRate !== null && data.daily.cacheHitRate >= 0.9 ? t('panel.excellent') : undefined}
                  icon="✓"
                  tone="positive"
                />
                <StatCard label={t('panel.requestCount')} value={formatCount(data.daily.requestCount)} hint={t('panel.timesUnit')} icon="#" />
                <StatCard
                  label={t('panel.failedRequests')}
                  value={formatCount(data.daily.failedRequestCount)}
                  hint={t('panel.failureRate', { rate: `${(failureRate * 100).toFixed(2)}%` })}
                  icon="!"
                  tone={data.daily.failedRequestCount > 0 ? 'danger' : 'positive'}
                />
                <StatCard
                  label={t('panel.totalTokens')}
                  value={formatCount(data.daily.totalTokens)}
                  hint={t('panel.totalInput') + ` ${formatCount(data.daily.totalInputTokens)}`}
                  icon="∑"
                  tone="accent"
                />
              </div>
              <CacheBar hit={data.daily.cacheHitInputTokens} miss={data.daily.cacheMissInputTokens} />
            </section>

            <div className={css.twoCol}>
              <section aria-label={t('panel.estimateLabel')}>
                <h2 className={css.sectionTitle}>{t('panel.estimateLabel')}</h2>
                <EstimateCard data={data} t={t} />
              </section>

              <section aria-label={t('panel.balance')}>
                <h2 className={css.sectionTitle}>{t('panel.balance')}</h2>
                <div className={css.balanceCard}>
                  {data.balance === null
                    ? (
                      <p className={css.balanceState}>
                        {data.balanceState.state === 'unconfigured' ? t('panel.balanceUnavailable') : t('panel.balanceStale')}
                      </p>
                    )
                    : (
                      <BalanceDetail balance={data.balance} stale={data.balanceState.state === 'stale'} t={t} />
                    )}
                </div>
              </section>
            </div>

            <section aria-label={t('panel.trend')}>
              <h2 className={css.sectionTitle}>{t('panel.trend')}</h2>
              <div className={css.trendCard}>
                <TrendChart data={data.trend.map(day => ({ date: day.date, totalTokens: day.totalTokens }))} />
              </div>
            </section>

            <footer className={css.footer}>
              <span>{t('panel.dataSource')}: {data.meta.dataSource}</span>
              <span>{t('panel.lastUpdated')}: {formatTime(data.meta.updatedAt)}</span>
            </footer>
          </>
        )}
    </div>
  )
}
