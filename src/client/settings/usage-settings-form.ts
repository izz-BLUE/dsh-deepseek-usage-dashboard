/**
 * Staged form model behind the plugin settings card.
 *
 * A card stages what the user types and writes it only when they save — the
 * settings write is a durable, revision-fenced document mutation. The form
 * is self-contained (this package must not depend on sibling UI packages):
 * scalar drafts for enabled/providerId/refreshMinutes and a row editor for
 * the prices array.
 */

import type { SettingsScope, SettingsScopeSnapshot, SnapshotStore } from '@deepseek-ai/dsh-client-runtime/client'
import type { PriceEntryWire } from '../api.ts'

/**
 * A minimal local snapshot store. The client-runtime bundle's
 * `createSnapshotStore` is a closure-factory artifact that only materializes
 * inside the GUI's module loader, so this form keeps its own tiny
 * implementation (structurally a SnapshotStore) — tests and the slot
 * renderer both consume the same shape.
 */
export interface LocalSnapshotStore<T> {
  getSnapshot(): T
  set(value: T): void
  subscribe(listener: () => void): () => void
}

/** Create a minimal snapshot store. */
export function createLocalSnapshotStore<T>(initial: T): LocalSnapshotStore<T> {
  let value = initial
  const listeners = new Set<() => void>()
  return {
    getSnapshot: () => value,
    set: (next) => {
      value = next
      for (const listener of listeners) listener()
    },
    subscribe: (listener) => {
      listeners.add(listener)
      return () => { listeners.delete(listener) }
    },
  }
}

/** One pricing schedule as configured in the settings document (read-only here). */
export interface PricingScheduleConfigWire {
  id: string
  effectiveFrom: string
  timezone?: string
  currency?: string
  windows: Array<{ id: string; start: string; end: string; bandId?: string }>
  models: Array<{ model: string; ratesByBand: Record<string, unknown> }>
}

/** The settings section this card edits (mirror of the host schema). */
export interface UsageSettings {
  enabled?: boolean
  providerId?: string
  balanceRefreshMinutes?: number
  /** Time-aware pricing schedules (read-only here; editor ships later). */
  pricingSchedules?: PricingScheduleConfigWire[]
  /** Legacy per-model price table (still fully editable). */
  prices?: PriceEntryWire[]
}

/** Form state every plugin settings card shares. */
export interface CardShell {
  /** False while the namespace is still loading. */
  available: boolean
  /** Whether the namespace is actually served to this client. */
  exposed: boolean
  /** Whether the Host document accepts writes. */
  writable: boolean
  /** Whether the form holds edits that a save would write. */
  dirty: boolean
  /** Whether any staged draft is invalid, which blocks the save. */
  invalid: boolean
  /** Whether a save is crossing the wire. */
  saving: boolean
  /** Whether the last save did not land as staged. */
  failed: boolean
}

/** The full state the card renders. */
export interface UsageSettingsFormState extends CardShell {
  /** Draft text for the enabled select ('' = inherit). */
  enabled: string
  /** Draft text for the provider id. */
  providerId: string
  /** Draft text for the refresh interval. */
  balanceRefreshMinutes: string
  /** How pricing is expressed in the effective config. */
  pricingMode: 'legacy' | 'time-aware'
  /** The schedules' timezone (also the legacy normalization zone). */
  pricingTimezone: string
  /** The configured schedule identities + windows (read-only display). */
  pricingSchedules: Array<{
    id: string
    effectiveFrom: string
    currency: string
    windows: Array<{ id: string; start: string; end: string; bandId?: string }>
  }>
  /** Draft price rows. */
  prices: PriceEntryWire[]
  /** Whether the prices array is user-overridden. */
  pricesOverridden: boolean
}

/** The actions the card's slot entry injects. */
export interface UsageSettingsActions {
  editEnabled: (text: string) => void
  editProviderId: (text: string) => void
  editRefreshMinutes: (text: string) => void
  editPrice: (index: number, patch: Partial<PriceEntryWire>) => void
  addPriceRow: () => void
  removePriceRow: (index: number) => void
  resetPrices: () => void
  save: () => void
  discard: () => void
}

/** Validate one draft price row ('' means "not yet edited"). */
function priceRowValid(row: PriceEntryWire): boolean {
  if (row.model.trim() === '') return false
  if (row.currency.trim() === '') return false
  if (!/^\d{4}-\d{2}-\d{2}$/.test(row.effectiveFrom)) return false
  for (const price of [row.cacheHitInputPricePerMillion, row.cacheMissInputPricePerMillion, row.outputPricePerMillion]) {
    if (!Number.isFinite(price) || price < 0) return false
  }
  return true
}

/** Structural equality over price rows. */
function priceRowsEqual(a: readonly PriceEntryWire[], b: readonly PriceEntryWire[]): boolean {
  if (a.length !== b.length) return false
  return a.every((row, index) => {
    const other = b[index]
    return row.model === other.model
      && row.cacheHitInputPricePerMillion === other.cacheHitInputPricePerMillion
      && row.cacheMissInputPricePerMillion === other.cacheMissInputPricePerMillion
      && row.outputPricePerMillion === other.outputPricePerMillion
      && row.currency === other.currency
      && row.effectiveFrom === other.effectiveFrom
  })
}

/** The pristine default price rows (composition defaults). */
export function defaultPriceRows(): PriceEntryWire[] {
  return [
    { model: 'deepseek-v4-flash', cacheHitInputPricePerMillion: 0.02, cacheMissInputPricePerMillion: 1, outputPricePerMillion: 2, currency: 'CNY', effectiveFrom: '2026-04-24' },
    { model: 'deepseek-v4-pro', cacheHitInputPricePerMillion: 0.025, cacheMissInputPricePerMillion: 3, outputPricePerMillion: 6, currency: 'CNY', effectiveFrom: '2026-04-24' },
    { model: 'deepseek-chat', cacheHitInputPricePerMillion: 0.02, cacheMissInputPricePerMillion: 1, outputPricePerMillion: 2, currency: 'CNY', effectiveFrom: '2026-04-24' },
    { model: 'deepseek-reasoner', cacheHitInputPricePerMillion: 0.02, cacheMissInputPricePerMillion: 1, outputPricePerMillion: 2, currency: 'CNY', effectiveFrom: '2026-04-24' },
    { model: '*', cacheHitInputPricePerMillion: 0.02, cacheMissInputPricePerMillion: 1, outputPricePerMillion: 2, currency: 'CNY', effectiveFrom: '2026-04-24' },
  ]
}

/** One staged field edit. */
type StagedField =
  | { kind: 'set'; value: unknown }
  | { kind: 'clear' }

/** Stages one card's edits over one settings namespace and writes on save. */
export class UsageSettingsForm {
  private readonly staged = new Map<string, StagedField>()
  private readonly listeners = new Set<() => void>()
  private saving = false
  private failed = false

  /** @param scope - the bound settings scope for this card's namespace. */
  constructor(private readonly scope: SettingsScope<UsageSettings>) {
    scope.subscribe(() => { this.publish() })
  }

  /** Publish a projection of this form, rebuilt on scope or draft changes. */
  bind(): SnapshotStore<UsageSettingsFormState> {
    const store = createLocalSnapshotStore(this.projection()) as SnapshotStore<UsageSettingsFormState>
    this.listeners.add(() => { store.set(this.projection()) })
    return store
  }

  /** The actions the card's slot registration injects. */
  actions(): UsageSettingsActions {
    return {
      editEnabled: (text) => this.stageBoolean('enabled', text),
      editProviderId: (text) => this.stageText('providerId', text),
      editRefreshMinutes: (text) => this.stageNumber('balanceRefreshMinutes', text),
      editPrice: (index, patch) => this.editPrice(index, patch),
      addPriceRow: () => this.addPriceRow(),
      removePriceRow: (index) => this.removePriceRow(index),
      resetPrices: () => {
        this.staged.set('prices', { kind: 'clear' })
        this.failed = false
        this.publish()
      },
      save: () => { void this.save() },
      discard: () => {
        if (this.staged.size === 0 && !this.failed) return
        this.staged.clear()
        this.failed = false
        this.publish()
      },
    }
  }

  private projection(): UsageSettingsFormState {
    const snapshot = this.scope.getSnapshot()
    const section = snapshot.value ?? ({} as UsageSettings)
    const enabled = this.fieldText(snapshot, 'enabled', value => typeof value === 'boolean' ? String(value) : '')
    const providerId = this.fieldText(snapshot, 'providerId', value => typeof value === 'string' ? value : '')
    const refresh = this.fieldText(snapshot, 'balanceRefreshMinutes', value => typeof value === 'number' ? String(value) : '')
    const prices = this.draftPrices(snapshot, section)
    const overridden = this.userHas(snapshot, 'prices')
    const schedules = Array.isArray(section.pricingSchedules) ? section.pricingSchedules : []
    return {
      available: snapshot.status !== 'loading',
      exposed: snapshot.status === 'ready',
      writable: snapshot.writable,
      dirty: this.isDirty(snapshot),
      invalid: !prices.every(priceRowValid),
      saving: this.saving,
      failed: this.failed,
      enabled,
      providerId,
      balanceRefreshMinutes: refresh,
      pricingMode: schedules.length > 0 ? 'time-aware' : 'legacy',
      pricingTimezone: schedules[0]?.timezone ?? 'Asia/Shanghai',
      pricingSchedules: schedules.map(schedule => ({
        id: schedule.id,
        effectiveFrom: schedule.effectiveFrom,
        currency: schedule.currency ?? 'CNY',
        windows: Array.isArray(schedule.windows) ? schedule.windows.map(window => ({ id: window.id, start: window.start, end: window.end, bandId: window.bandId })) : [],
      })),
      prices,
      pricesOverridden: overridden,
    }
  }

  /** Whether any staged edit actually differs from the effective section. */
  private isDirty(snapshot: SettingsScopeSnapshot<UsageSettings>): boolean {
    if (this.staged.size === 0) return false
    const section = snapshot.value ?? ({} as UsageSettings)
    for (const [field, edit] of this.staged) {
      const current = section[field as keyof UsageSettings]
      if (edit.kind === 'clear') {
        if (this.userHas(snapshot, field)) return true
        continue
      }
      if (field === 'prices') {
        const currentRows = Array.isArray(current) ? current as PriceEntryWire[] : []
        if (!priceRowsEqual(currentRows, edit.value as PriceEntryWire[])) return true
        continue
      }
      if (current !== edit.value) return true
    }
    return false
  }

  /** Render one scalar field's draft (staged, else the effective section). */
  private fieldText(
    snapshot: SettingsScopeSnapshot<UsageSettings>,
    field: keyof UsageSettings,
    format: (value: unknown) => string,
  ): string {
    const staged = this.staged.get(field)
    if (staged === undefined) {
      const value = (snapshot.value ?? {})[field]
      return value === undefined ? '' : format(value)
    }
    if (staged.kind === 'clear') return ''
    if (typeof staged.value === 'boolean' || typeof staged.value === 'string' || typeof staged.value === 'number') {
      return String(staged.value)
    }
    return ''
  }

  /** Render the draft price rows (staged array, else the section's rows). */
  private draftPrices(snapshot: SettingsScopeSnapshot<UsageSettings>, section: UsageSettings): PriceEntryWire[] {
    const staged = this.staged.get('prices')
    if (staged !== undefined && staged.kind === 'set') {
      return structuredClone(staged.value as PriceEntryWire[])
    }
    const rows = Array.isArray(section.prices) ? section.prices : defaultPriceRows()
    return rows.length > 0 ? structuredClone(rows) : defaultPriceRows()
  }

  private userHas(snapshot: SettingsScopeSnapshot<UsageSettings>, field: string): boolean {
    const user = snapshot.user
    return typeof user === 'object' && user !== null && Object.hasOwn(user, field)
  }

  private stageBoolean(field: string, text: string): void {
    const trimmed = text.trim()
    if (trimmed === '') this.staged.set(field, { kind: 'clear' })
    else if (trimmed === 'true') this.staged.set(field, { kind: 'set', value: true })
    else if (trimmed === 'false') this.staged.set(field, { kind: 'set', value: false })
    else this.staged.set(field, { kind: 'set', value: trimmed })
    this.failed = false
    this.publish()
  }

  private stageText(field: string, text: string): void {
    const trimmed = text.trim()
    this.staged.set(field, trimmed === '' ? { kind: 'clear' } : { kind: 'set', value: trimmed })
    this.failed = false
    this.publish()
  }

  private stageNumber(field: string, text: string): void {
    const trimmed = text.trim()
    if (trimmed === '') {
      this.staged.set(field, { kind: 'clear' })
    } else {
      const parsed = Number(trimmed)
      this.staged.set(field, Number.isFinite(parsed) ? { kind: 'set', value: parsed } : { kind: 'set', value: trimmed })
    }
    this.failed = false
    this.publish()
  }

  private editPrice(index: number, patch: Partial<PriceEntryWire>): void {
    const rows = this.currentDraftRows()
    const row = rows[index]
    if (row === undefined) return
    rows[index] = { ...row, ...patch }
    this.staged.set('prices', { kind: 'set', value: rows })
    this.failed = false
    this.publish()
  }

  private addPriceRow(): void {
    const rows = this.currentDraftRows()
    rows.push({ model: '', cacheHitInputPricePerMillion: 0, cacheMissInputPricePerMillion: 0, outputPricePerMillion: 0, currency: 'CNY', effectiveFrom: new Date().toISOString().slice(0, 10) })
    this.staged.set('prices', { kind: 'set', value: rows })
    this.failed = false
    this.publish()
  }

  private removePriceRow(index: number): void {
    const rows = this.currentDraftRows()
    rows.splice(index, 1)
    this.staged.set('prices', { kind: 'set', value: rows })
    this.failed = false
    this.publish()
  }

  private currentDraftRows(): PriceEntryWire[] {
    const staged = this.staged.get('prices')
    if (staged !== undefined && staged.kind === 'set') return structuredClone(staged.value as PriceEntryWire[])
    const section = this.scope.getSnapshot().value ?? {}
    const rows = Array.isArray(section.prices) && section.prices.length > 0 ? section.prices : defaultPriceRows()
    return structuredClone(rows)
  }

  /** Write every staged edit, then re-seed from what the Host accepted. */
  private async save(): Promise<void> {
    if (this.saving || this.staged.size === 0) return
    if (this.projection().invalid) return
    this.saving = true
    this.failed = false
    this.publish()
    let landed = true
    for (const [field, edit] of this.staged) {
      try {
        if (edit.kind === 'clear') await this.scope.unset(field)
        else await this.scope.set(field, edit.value)
      } catch {
        landed = false
      }
    }
    if (landed) this.staged.clear()
    this.saving = false
    this.failed = !landed
    this.publish()
  }

  private publish(): void {
    for (const listener of this.listeners) listener()
  }
}
