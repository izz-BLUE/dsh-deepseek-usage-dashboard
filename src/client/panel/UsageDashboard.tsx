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

/** The 7-day trend as a CSS bar chart. */
function TrendChart(props: { data: Array<{ date: string; totalTokens: number }> }) {
  const max = Math.max(1, ...props.data.map(day => day.totalTokens))
  return (
    <div className={css.trend}>
      {props.data.map(day => (
        <div key={day.date} className={css.trendCol}>
          <div className={css.trendBarWrap}>
            <div
              className={css.trendBar}
              style={{ height: `${Math.max(2, (day.totalTokens / max) * 100)}%` }}
              title={`${day.date}: ${formatCount(day.totalTokens)}`}
            />
          </div>
          <span className={css.trendLabel}>{day.date.slice(5)}</span>
        </div>
      ))}
    </div>
  )
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
