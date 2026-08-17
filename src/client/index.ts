/**
 * Browser-half entry for dsh-deepseek-usage-dashboard — runs inside the dsh
 * web GUI.
 *
 * Registers the locale dictionaries, mounts the "API 用量" sidebar entry and
 * the dashboard panel (family DOM-level pattern), registers the composer
 * dock today-line, and contributes the plugin settings card. Failure policy:
 * DOM mounting problems are logged, never thrown — an external plugin must
 * not take the GUI down.
 */

import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
// Type-only: pulls the locale plugin's Context merge (ctx.locale).
import type {} from '@deepseek-ai/dsh-client-locale/client'
// Type-only: pulls the LocaleNamespaceMap merge table and the
// settings-surface SlotMap merges (settingsScope, settings.plugin.item).
import type {} from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import { UsageApi } from './api.ts'
import { en, zh, type UsageKey } from './locales.ts'
import { UsageStore } from './store.ts'
import { setUsageStore } from './store-host.ts'
import { PanelController } from './controller.ts'
import { mountSidebarEntry } from './sidebar-entry.ts'
import { mountPanel } from './mount.tsx'
import { DockLineEntry } from './dock/DockLine.tsx'
import { UsageSettingsCard, UsageSettingsCardController } from './settings/UsageSettingsCard.tsx'
import type { UsageSettings } from './settings/usage-settings-form.ts'

/** Locale namespace this plugin owns. */
const NS = 'deepseek-usage'

/** Settings namespace the card edits (the Host plugin registers it). */
const USAGE_NS = 'deepseek-usage'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** deepseek-usage surface copy. */
    'deepseek-usage': UsageKey
  }

  interface SlotMap {
    /**
     * The plugin-configuration section's card seat, keyed by the settings
     * namespace the card edits (rc.7 keyed-slot contract, declared at runtime
     * by the official settings-plugins surface). Spelled here with the same
     * shape so this package can register without depending on the sibling UI
     * package.
     */
    'settings.plugin.item': { kind: 'keyed'; scope: 'root'; owner: SettingsPluginItemOwnerProps }
  }
}

/** Owner share of a plugin card (the section supplies nothing). */
export interface SettingsPluginItemOwnerProps {
  /** Marker field: card owner props are intentionally empty. */
  children?: never
}

/** Required services (fiber inject waiting — the runtime must be up first). */
export const inject = ['slots', 'locale', 'connection', 'settingsScope', 'remote']

/** Type-only surface (export discipline: no value exports beyond the plugin contract). */
export type { UsageDashboardProps } from './panel/UsageDashboard.tsx'
export type { UsageKey } from './locales.ts'
export type { UsageStoreSnapshot } from './store.ts'
export type { UsageStatsWire, DailyStatsWire, BalanceSnapshotWire, PriceEntryWire } from './api.ts'

/**
 * Mount the usage dashboard surface.
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, 'zh', zh), 'deepseek-usage: zh dictionary')
  ctx.effect(() => ctx.locale.register(NS, 'en', en), 'deepseek-usage: en dictionary')

  // One shared store polls /api/deepseek-usage/stats for the panel and the
  // dock line; polling is a local HTTP GET — zero tokens.
  const store = new UsageStore(new UsageApi())
  setUsageStore(store)
  store.start()

  const controller = new PanelController()
  const disposers: Array<() => void> = []
  try {
    disposers.push(mountSidebarEntry(controller))
    disposers.push(mountPanel(controller, store))
  } catch (error) {
    // DOM failures degrade the panel, never the GUI.
    console.warn('[deepseek-usage] mount failed:', error)
  }

  // The composer dock today-line (session-scoped seat, framework standard
  // kit supplies useProjection; the line itself reads the shared store).
  ctx.slots.inject('conversation.composer.dock', () => ctx.slots.register({
    name: 'conversation.composer.dock',
    id: 'deepseek-usage-dashboard',
    order: 90,
    locale: NS,
    inject: () => ({}),
  }, DockLineEntry))

  // Plugin configuration card over the `deepseek-usage` namespace (rc.7
  // keyed slot: the key must be the settings namespace the card edits).
  const settingsCard = new UsageSettingsCardController(
    ctx.settingsScope.bind<UsageSettings>({ namespace: USAGE_NS }),
  )
  ctx.slots.inject('settings.plugin.item', () => ctx.slots.register({
    name: 'settings.plugin.item',
    key: USAGE_NS,
    locale: NS,
    inject: () => settingsCard.inject(),
  }, UsageSettingsCard))

  ctx.effect(() => () => {
    for (const dispose of disposers.splice(0)) dispose()
    store.stop()
    setUsageStore(undefined)
  }, 'deepseek-usage: ui teardown')
}
