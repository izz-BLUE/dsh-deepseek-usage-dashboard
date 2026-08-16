/**
 * Staged form model behind the plugin settings card.
 *
 * A card stages what the user types and writes it only when they save — the
 * settings write is a durable, revision-fenced document mutation. The form
 * is self-contained (this package must not depend on sibling UI packages):
 * scalar drafts for enabled/providerId/refreshMinutes and a row editor for
 * the prices array.
 */
import type { SettingsScope, SnapshotStore } from '@deepseek-ai/dsh-client-runtime/client';
import type { PriceEntryWire } from '../api.ts';
/**
 * A minimal local snapshot store. The client-runtime bundle's
 * `createSnapshotStore` is a closure-factory artifact that only materializes
 * inside the GUI's module loader, so this form keeps its own tiny
 * implementation (structurally a SnapshotStore) — tests and the slot
 * renderer both consume the same shape.
 */
export interface LocalSnapshotStore<T> {
    getSnapshot(): T;
    set(value: T): void;
    subscribe(listener: () => void): () => void;
}
/** Create a minimal snapshot store. */
export declare function createLocalSnapshotStore<T>(initial: T): LocalSnapshotStore<T>;
/** One pricing schedule as configured in the settings document (read-only here). */
export interface PricingScheduleConfigWire {
    id: string;
    effectiveFrom: string;
    timezone?: string;
    currency?: string;
    windows: Array<{
        id: string;
        start: string;
        end: string;
        bandId?: string;
    }>;
    models: Array<{
        model: string;
        ratesByBand: Record<string, unknown>;
    }>;
}
/** The settings section this card edits (mirror of the host schema). */
export interface UsageSettings {
    enabled?: boolean;
    providerId?: string;
    balanceRefreshMinutes?: number;
    /** Time-aware pricing schedules (read-only here; editor ships later). */
    pricingSchedules?: PricingScheduleConfigWire[];
    /** Legacy per-model price table (still fully editable). */
    prices?: PriceEntryWire[];
}
/** Form state every plugin settings card shares. */
export interface CardShell {
    /** False while the namespace is still loading. */
    available: boolean;
    /** Whether the namespace is actually served to this client. */
    exposed: boolean;
    /** Whether the Host document accepts writes. */
    writable: boolean;
    /** Whether the form holds edits that a save would write. */
    dirty: boolean;
    /** Whether any staged draft is invalid, which blocks the save. */
    invalid: boolean;
    /** Whether a save is crossing the wire. */
    saving: boolean;
    /** Whether the last save did not land as staged. */
    failed: boolean;
}
/** The full state the card renders. */
export interface UsageSettingsFormState extends CardShell {
    /** Draft text for the enabled select ('' = inherit). */
    enabled: string;
    /** Draft text for the provider id. */
    providerId: string;
    /** Draft text for the refresh interval. */
    balanceRefreshMinutes: string;
    /** How pricing is expressed in the EFFECTIVE config (matches the host). */
    pricingMode: 'legacy' | 'time-aware';
    /** The schedules' timezone (also the legacy normalization zone). */
    pricingTimezone: string;
    /** True when the effective time-aware pricing is the BUILT-IN default set. */
    pricingBuiltinDefault: boolean;
    /** The configured schedule identities + windows (read-only display). */
    pricingSchedules: Array<{
        id: string;
        effectiveFrom: string;
        currency: string;
        windows: Array<{
            id: string;
            start: string;
            end: string;
            bandId?: string;
        }>;
    }>;
    /** Draft price rows. */
    prices: PriceEntryWire[];
    /** Whether the prices array is user-overridden. */
    pricesOverridden: boolean;
}
/** The actions the card's slot entry injects. */
export interface UsageSettingsActions {
    editEnabled: (text: string) => void;
    editProviderId: (text: string) => void;
    editRefreshMinutes: (text: string) => void;
    editPrice: (index: number, patch: Partial<PriceEntryWire>) => void;
    addPriceRow: () => void;
    removePriceRow: (index: number) => void;
    resetPrices: () => void;
    save: () => void;
    discard: () => void;
}
/** The pristine default price rows (composition defaults). */
export declare function defaultPriceRows(): PriceEntryWire[];
/** Stages one card's edits over one settings namespace and writes on save. */
export declare class UsageSettingsForm {
    private readonly scope;
    private readonly staged;
    private readonly listeners;
    private saving;
    private failed;
    /** @param scope - the bound settings scope for this card's namespace. */
    constructor(scope: SettingsScope<UsageSettings>);
    /** Publish a projection of this form, rebuilt on scope or draft changes. */
    bind(): SnapshotStore<UsageSettingsFormState>;
    /** The actions the card's slot registration injects. */
    actions(): UsageSettingsActions;
    private projection;
    /** Whether any staged edit actually differs from the effective section. */
    private isDirty;
    /** Render one scalar field's draft (staged, else the effective section). */
    private fieldText;
    /** Render the draft price rows (staged array, else the section's rows). */
    private draftPrices;
    private userHas;
    private stageBoolean;
    private stageText;
    private stageNumber;
    private editPrice;
    private addPriceRow;
    private removePriceRow;
    private currentDraftRows;
    /** Write every staged edit, then re-seed from what the Host accepted. */
    private save;
    private publish;
}
//# sourceMappingURL=usage-settings-form.d.ts.map