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
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client';
import { type UsageKey } from './locales.ts';
declare module '@deepseek-ai/dsh-client-ui-slots' {
    interface LocaleNamespaceMap {
        /** deepseek-usage surface copy. */
        'deepseek-usage': UsageKey;
    }
    interface SlotMap {
        /**
         * The child slot the Web UI plugin group declares; this card registers
         * into the group instead of the top-level `settings.plugin.item` list.
         * Spelled here with the same shape so this package can register without
         * depending on the sibling UI package.
         */
        'web-ui.plugin.item': {
            kind: 'list';
            scope: 'root';
            owner: SettingsPluginItemOwnerProps;
        };
    }
}
/** Owner share of a plugin card (the section supplies nothing). */
export interface SettingsPluginItemOwnerProps {
    /** Marker field: card owner props are intentionally empty. */
    children?: never;
}
/** Required services (fiber inject waiting — the runtime must be up first). */
export declare const inject: string[];
/** Type-only surface (export discipline: no value exports beyond the plugin contract). */
export type { UsageDashboardProps } from './panel/UsageDashboard.tsx';
export type { UsageKey } from './locales.ts';
export type { UsageStoreSnapshot } from './store.ts';
export type { UsageStatsWire, DailyStatsWire, BalanceSnapshotWire, PriceEntryWire } from './api.ts';
/**
 * Mount the usage dashboard surface.
 * @param ctx - client root context.
 */
export declare function apply(ctx: ClientContext): void;
//# sourceMappingURL=index.d.ts.map