/**
 * The composer dock line: one compact row under the composer card with the
 * day's DeepSeek usage — `今日：命中 X · 未命中 X · 输出 X · 估算 ¥X · 余额 ¥X`.
 *
 * The row's `title` tooltip spells out the scope (today, Asia/Shanghai
 * 00:00 to now) so it is never mistaken for the session-scoped stats line
 * rendered by the harness next to it.
 *
 * Registers into the shipped `conversation.composer.dock` seat (the same
 * slot dsh-live-stats' TPS line uses). Data comes from the shared stats
 * store (a local HTTP poll — zero tokens), not from any projection, so the
 * line reflects the whole instance's day.
 */

import { memo, useSyncExternalStore } from 'react'
import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
// Type-only: pulls the ui-conversation SlotMap merge (conversation.composer.dock).
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import { formatCount } from '../api.ts'
import { tt } from '../locales.ts'
import { usageStore } from '../store-host.ts'

/** The one-line style: DSH tokens only, mirrors the shipped stats line. */
const STYLE = {
  boxSizing: 'border-box',
  color: 'var(--dsw-alias-label-tertiary)',
  fontSize: '12px',
  fontVariantNumeric: 'tabular-nums',
  lineHeight: '20px',
  margin: '0 auto',
  maxWidth: 'var(--dsh-chat-content-width)',
  overflow: 'hidden',
  padding: '0 var(--dsh-composer-side-clearance)',
  textAlign: 'center',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  width: '100%',
} as const

/** Format one currency amount (CNY renders as ¥). */
function amount(total: string, currency: string): string {
  return `${currency === 'CNY' ? '¥' : `${currency} `}${total}`
}

/** The compact today line for the composer dock. */
export const DockLine = memo(function DockLine() {
  const store = usageStore()
  const snapshot = useSyncExternalStore(
    (listener) => store?.subscribe(listener) ?? (() => undefined),
    () => store?.getSnapshot() ?? { data: null, error: null, loading: false, refreshing: false },
  )
  const data = snapshot.data
  if (data === null) return null
  const daily = data.daily
  const balance = data.balance
  const balanceText = balance !== null && balance.infos.length > 0
    ? amount(balance.infos[0].totalBalance, balance.infos[0].currency)
    : '--'
  const band = data.prices.currentBand ?? null
  const bandText = band === null
    ? ''
    : band.bandId === 'off-peak'
      ? tt('panel.currentBandOffPeak')
      : band.bandId === 'peak'
        ? tt('panel.currentBandPeak')
        : band.bandId === 'all-day'
          ? tt('panel.currentBandAllDay')
          : band.bandId
  return (
    <div style={STYLE} title={tt('dock.todayTooltip')}>
      {tt('dock.today', {
        hit: formatCount(daily.cacheHitInputTokens),
        miss: formatCount(daily.cacheMissInputTokens),
        out: formatCount(daily.outputTokens),
        cost: amount(data.estimatedCost.total, data.estimatedCost.currency),
        balance: balanceText,
      })}
      {bandText !== '' ? ` · ${bandText}` : null}
    </div>
  )
})

/**
 * Composer-dock entry: adapts the session-scoped `conversation.composer.dock`
 * runtime share (the framework standard kit) to the today line.
 */
export const DockLineEntry = memo(function DockLineEntry(_props: PropsRuntime<'conversation.composer.dock'>) {
  return <DockLine />
})
