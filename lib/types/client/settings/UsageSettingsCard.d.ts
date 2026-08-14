/**
 * The plugin settings card: enables the dashboard, configures the provider
 * route and the balance refresh interval, and edits the per-model price
 * table (DeepSeek adjusts prices — users must be able to update them).
 *
 * Registers into the `web-ui.plugin.item` child slot the Web UI plugin
 * group renders (same seat dsh-live-stats uses), bound to the
 * `deepseek-usage` settings namespace.
 */
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots';
import type { SettingsScope, SnapshotStore } from '@deepseek-ai/dsh-client-runtime/client';
import { type ReactNode } from 'react';
import { type UsageSettings, type UsageSettingsActions, type UsageSettingsFormState } from './usage-settings-form.ts';
/** The registration-side face the card's slot entry injects. */
export interface UsageSettingsCardFace extends UsageSettingsActions {
    hooks: {
        /** Card snapshot bound by the renderer as useUsageSettingsCard. */
        usageSettingsCard: SnapshotStore<UsageSettingsFormState>;
    };
}
/** Bridges the `deepseek-usage` scope onto the card's staged form. */
export declare class UsageSettingsCardController {
    private readonly form;
    private readonly store;
    /** @param scope - the bound settings scope for the `deepseek-usage` namespace. */
    constructor(scope: SettingsScope<UsageSettings>);
    /** Build the face the card's slot registration injects. */
    inject(): UsageSettingsCardFace;
}
/** Props the renderer binds for the card. */
export type UsageSettingsCardProps = PropsRuntime<'web-ui.plugin.item'> & PropsLocale<'deepseek-usage'> & InjectFace<UsageSettingsCardFace>;
/** The card chrome (self-contained mirror of the settings card shell). */
export declare function SettingsCardShell(props: {
    title: string;
    description: string;
    state: Pick<UsageSettingsFormState, 'available' | 'exposed' | 'writable' | 'dirty' | 'invalid' | 'saving' | 'failed'>;
    onSave: () => void;
    onDiscard: () => void;
    children: ReactNode;
}): import("react").JSX.Element | null;
/**
 * Render the deepseek-usage settings card.
 * @param props - locale copy, the card snapshot, and its form actions.
 */
export declare function UsageSettingsCard(props: UsageSettingsCardProps): import("react").JSX.Element;
//# sourceMappingURL=UsageSettingsCard.d.ts.map