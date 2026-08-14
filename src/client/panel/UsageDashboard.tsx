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

/** A labeled stat card. */
function StatCard(props: { label: string; value: string; hint?: string; accent?: boolean }) {
  return (
    <div className={props.accent === true ? `${css.statCard} ${css.statAccent}` : css.statCard}>
      <span className={css.statLabel}>{props.label}</span>
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
      <div className={css.trendSummary}>
        <span>{tt('panel.trendTotal')} <strong>{formatCompactCount(total)}</strong></span>
        <span>{tt('panel.trendAverage')} <strong>{formatCompactCount(Math.round(total / divisor))}</strong></span>
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
                <StatCard label={t('panel.cacheHit')} value={formatCount(data.daily.cacheHitInputTokens)} />
                <StatCard label={t('panel.cacheMiss')} value={formatCount(data.daily.cacheMissInputTokens)} />
                <StatCard label={t('panel.output')} value={formatCount(data.daily.outputTokens)} />
                {data.daily.reasoningTokens > 0
                  ? <StatCard label={t('panel.reasoning')} value={formatCount(data.daily.reasoningTokens)} />
                  : null}
                <StatCard
                  label={t('panel.hitRate')}
                  value={data.daily.cacheHitRate === null ? '--' : `${(data.daily.cacheHitRate * 100).toFixed(1)}%`}
                />
                <StatCard label={t('panel.requestCount')} value={formatCount(data.daily.requestCount)} />
                <StatCard label={t('panel.failedRequests')} value={formatCount(data.daily.failedRequestCount)} />
                <StatCard
                  label={t('panel.totalTokens')}
                  value={formatCount(data.daily.totalTokens)}
                  hint={t('panel.totalInput') + ` ${formatCount(data.daily.totalInputTokens)}`}
                  accent
                />
              </div>
              <CacheBar hit={data.daily.cacheHitInputTokens} miss={data.daily.cacheMissInputTokens} />
            </section>

            <div className={css.twoCol}>
              <section aria-label={t('panel.estimateLabel')}>
                <h2 className={css.sectionTitle}>{t('panel.estimateLabel')}</h2>
                <div className={css.estimateCard}>
                  <span className={css.estimateValue}>
                    {formatAmount(data.estimatedCost.total, data.estimatedCost.currency)}
                  </span>
                  <span className={css.estimateNote}>{t('panel.estimateNote')}</span>
                  <span className={css.estimateMeta}>
                    {t('panel.priceVersion')}: {data.prices.version}
                    {data.prices.updatedAt !== null ? ` · ${t('panel.priceUpdated')}: ${new Date(data.prices.updatedAt).toLocaleString()}` : ''}
                  </span>
                </div>
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
