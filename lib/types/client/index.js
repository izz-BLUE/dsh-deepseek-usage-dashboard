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
import { UsageApi } from "./api.js";
import { en, zh } from "./locales.js";
import { UsageStore } from "./store.js";
import { setUsageStore } from "./store-host.js";
import { PanelController } from "./controller.js";
import { mountSidebarEntry } from "./sidebar-entry.js";
import { mountPanel } from "./mount.js";
import { DockLineEntry } from "./dock/DockLine.js";
import { UsageSettingsCard, UsageSettingsCardController } from "./settings/UsageSettingsCard.js";
/** Locale namespace this plugin owns. */
const NS = 'deepseek-usage';
/** Settings namespace the card edits (the Host plugin registers it). */
const USAGE_NS = 'deepseek-usage';
/** Required services (fiber inject waiting — the runtime must be up first). */
export const inject = ['slots', 'locale', 'connection', 'settingsScope', 'remote'];
/**
 * Mount the usage dashboard surface.
 * @param ctx - client root context.
 */
export function apply(ctx) {
    ctx.effect(() => ctx.locale.register(NS, 'zh', zh), 'deepseek-usage: zh dictionary');
    ctx.effect(() => ctx.locale.register(NS, 'en', en), 'deepseek-usage: en dictionary');
    // One shared store polls /api/deepseek-usage/stats for the panel and the
    // dock line; polling is a local HTTP GET — zero tokens.
    const store = new UsageStore(new UsageApi());
    setUsageStore(store);
    store.start();
    const controller = new PanelController();
    const disposers = [];
    try {
        disposers.push(mountSidebarEntry(controller));
        disposers.push(mountPanel(controller, store));
    }
    catch (error) {
        // DOM failures degrade the panel, never the GUI.
        console.warn('[deepseek-usage] mount failed:', error);
    }
    // The composer dock today-line (session-scoped seat, framework standard
    // kit supplies useProjection; the line itself reads the shared store).
    ctx.slots.inject('conversation.composer.dock', () => ctx.slots.register({
        name: 'conversation.composer.dock',
        id: 'deepseek-usage-dashboard',
        order: 90,
        locale: NS,
        inject: () => ({}),
    }, DockLineEntry));
    // Plugin configuration card over the `deepseek-usage` namespace (rc.7
    // keyed slot: the key must be the settings namespace the card edits).
    const settingsCard = new UsageSettingsCardController(ctx.settingsScope.bind({ namespace: USAGE_NS }));
    ctx.slots.inject('settings.plugin.item', () => ctx.slots.register({
        name: 'settings.plugin.item',
        key: USAGE_NS,
        locale: NS,
        inject: () => settingsCard.inject(),
    }, UsageSettingsCard));
    ctx.effect(() => () => {
        for (const dispose of disposers.splice(0))
            dispose();
        store.stop();
        setUsageStore(undefined);
    }, 'deepseek-usage: ui teardown');
}
