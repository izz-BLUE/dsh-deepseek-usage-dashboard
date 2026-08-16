/**
 * The plugin settings card: enables the dashboard, configures the provider
 * route and the balance refresh interval, and edits the per-model price
 * table (DeepSeek adjusts prices — users must be able to update them).
 *
 * Registers into the `web-ui.plugin.item` child slot the Web UI plugin
 * group renders (same seat dsh-live-stats uses), bound to the
 * `deepseek-usage` settings namespace.
 */

import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { SettingsScope, SnapshotStore } from '@deepseek-ai/dsh-client-runtime/client'
import { useState, type ReactNode } from 'react'
import { UsageSettingsForm, type UsageSettings, type UsageSettingsActions, type UsageSettingsFormState } from './usage-settings-form.ts'
import { tt, type UsageKey } from '../locales.ts'
import css from './settings-card.module.css'

/** The registration-side face the card's slot entry injects. */
export interface UsageSettingsCardFace extends UsageSettingsActions {
  hooks: {
    /** Card snapshot bound by the renderer as useUsageSettingsCard. */
    usageSettingsCard: SnapshotStore<UsageSettingsFormState>
  }
}

/** Bridges the `deepseek-usage` scope onto the card's staged form. */
export class UsageSettingsCardController {
  private readonly form: UsageSettingsForm
  private readonly store: SnapshotStore<UsageSettingsFormState>

  /** @param scope - the bound settings scope for the `deepseek-usage` namespace. */
  constructor(scope: SettingsScope<UsageSettings>) {
    this.form = new UsageSettingsForm(scope)
    this.store = this.form.bind()
  }

  /** Build the face the card's slot registration injects. */
  inject(): UsageSettingsCardFace {
    return { hooks: { usageSettingsCard: this.store }, ...this.form.actions() }
  }
}

/** Props the renderer binds for the card. */
export type UsageSettingsCardProps =
  PropsRuntime<'web-ui.plugin.item'>
  & PropsLocale<'deepseek-usage'>
  & InjectFace<UsageSettingsCardFace>

/** The card chrome (self-contained mirror of the settings card shell). */
export function SettingsCardShell(props: {
  title: string
  description: string
  state: Pick<UsageSettingsFormState, 'available' | 'exposed' | 'writable' | 'dirty' | 'invalid' | 'saving' | 'failed'>
  onSave: () => void
  onDiscard: () => void
  children: ReactNode
}) {
  const [open, setOpen] = useState(false)
  const { state } = props
  if (!state.available) return null
  const cardClass = open ? `${css.cardOpen} ${css.card}` : css.card
  if (!state.exposed) {
    return (
      <li className={cardClass}>
        <button type="button" className={css.header} aria-expanded={open} onClick={() => { setOpen(!open) }}>
          <span className={css.headText}>
            <span className={css.name}>{props.title}</span>
            <span className={css.description}>{props.description}</span>
          </span>
          <span className={open ? css.chevronOpen : css.chevron}>▾</span>
        </button>
        {open ? <div className={css.body}><p className={css.notExposed} role="status">{tt('settings.notExposed')}</p></div> : null}
      </li>
    )
  }
  const blocked = !state.dirty || state.invalid || state.saving
  return (
    <li className={cardClass}>
      <button type="button" className={css.header} aria-expanded={open} onClick={() => { setOpen(!open) }}>
        <span className={css.headText}>
          <span className={css.name}>{props.title}</span>
          <span className={css.description}>{props.description}</span>
        </span>
        {state.dirty ? <span className={css.pending}>{tt('settings.unsaved')}</span> : null}
        <span className={open ? css.chevronOpen : css.chevron}>▾</span>
      </button>
      {open
        ? (
          <div className={css.body}>
            {!state.writable ? <p className={css.readOnly} role="status">{tt('settings.readOnly')}</p> : null}
            {props.children}
            <div className={css.footer}>
              {state.failed ? <p className={css.failed} role="status">{tt('settings.saveFailed')}</p> : null}
              <button type="button" className={css.discard} disabled={!state.dirty || state.saving} onClick={props.onDiscard}>
                {tt('settings.discard')}
              </button>
              <button type="button" className={css.save} disabled={blocked} onClick={props.onSave}>
                {tt(!state.saving ? 'settings.save' : 'settings.saving')}
              </button>
            </div>
          </div>
        )
        : null}
    </li>
  )
}

/** One text field row. */
function TextField(props: {
  id: string
  label: string
  hint: string
  text: string
  disabled: boolean
  onEdit: (text: string) => void
  placeholder?: string
}) {
  return (
    <div className={css.field}>
      <label className={css.label} htmlFor={props.id}>{props.label}</label>
      <input
        id={props.id}
        className={css.input}
        type="text"
        value={props.text}
        placeholder={props.placeholder ?? ''}
        disabled={props.disabled}
        onChange={(event) => { props.onEdit(event.target.value) }}
      />
      <p className={css.hint}>{props.hint}</p>
    </div>
  )
}

/**
 * Render the deepseek-usage settings card.
 * @param props - locale copy, the card snapshot, and its form actions.
 */
export function UsageSettingsCard(props: UsageSettingsCardProps) {
  const { t } = props
  const state = props.useUsageSettingsCard(snapshot => snapshot)
  const disabled = !state.writable

  return (
    <SettingsCardShell
      title={t('settings.title')}
      description={t('settings.description')}
      state={state}
      onSave={props.save}
      onDiscard={props.discard}
    >
      <div className={css.field}>
        <label className={css.label} htmlFor="usage-settings-enabled">{t('settings.enabled')}</label>
        <select
          id="usage-settings-enabled"
          className={css.select}
          value={state.enabled}
          disabled={disabled}
          onChange={(event) => { props.editEnabled(event.target.value) }}
        >
          <option value="">{t('settings.inherit')}</option>
          <option value="true">{t('settings.on')}</option>
          <option value="false">{t('settings.off')}</option>
        </select>
        <p className={css.hint}>{t('settings.enabledHint')}</p>
      </div>
      <TextField
        id="usage-settings-provider"
        label={t('settings.providerId')}
        hint={t('settings.providerIdHint')}
        text={state.providerId}
        disabled={disabled}
        onEdit={props.editProviderId}
      />
      <TextField
        id="usage-settings-refresh"
        label={t('settings.refreshMinutes')}
        hint={t('settings.refreshMinutesHint')}
        text={state.balanceRefreshMinutes}
        disabled={disabled}
        onEdit={props.editRefreshMinutes}
        placeholder="10"
      />
      <div className={css.field}>
        <span className={css.label}>{t('settings.pricingMode')}</span>
        <p className={css.hint}>
          {state.pricingMode === 'time-aware' ? t('settings.pricingModeSchedules') : t('settings.pricingModeLegacy')}
        </p>
        {state.pricingMode === 'time-aware'
          ? (
            <>
              <p className={css.hint}>{t('settings.pricingTimezone')}: {state.pricingTimezone}</p>
              {state.pricingBuiltinDefault
                ? <p className={css.hint} role="status">{t('settings.pricingBuiltinDefault')}</p>
                : (
                  <ul className={css.scheduleList}>
                    {state.pricingSchedules.map(schedule => (
                      <li key={schedule.id}>
                        <span className={css.scheduleLine}>
                          {schedule.id} · {schedule.effectiveFrom} · {schedule.currency}
                        </span>
                        {schedule.windows.length > 0
                          ? (
                            <span className={css.scheduleWindows}>
                              {schedule.windows.map(window => `${window.id} ${window.start}–${window.end}`).join(' · ')}
                            </span>
                          )
                          : null}
                      </li>
                    ))}
                  </ul>
                )}
              <p className={css.hint} role="status">{t('settings.pricingOffPeakHint')}</p>
              {!state.pricingBuiltinDefault ? <p className={css.hint} role="status">{t('settings.pricingSchedulesHint')}</p> : null}
            </>
          )
          : null}
      </div>
      <div className={css.pricesHead}>
        <span className={css.label}>{t('settings.prices')}</span>
        {state.pricesOverridden
          ? (
            <button type="button" className={css.reset} disabled={disabled} onClick={props.resetPrices}>
              {t('settings.reset')}
            </button>
          )
          : null}
        <button type="button" className={css.addRow} disabled={disabled} onClick={props.addPriceRow}>
          {t('settings.addRow')}
        </button>
      </div>
      <p className={css.hint}>{t('settings.pricesHint')}</p>
      {state.invalid ? <p className={css.invalid} role="status">{t('settings.invalidPrice')}</p> : null}
      <div className={css.priceTable}>
        <div className={css.priceRowHead}>
          <span>{t('settings.model')}</span>
          <span>{t('settings.hitPrice')}</span>
          <span>{t('settings.missPrice')}</span>
          <span>{t('settings.outputPrice')}</span>
          <span>{t('settings.currency')}</span>
          <span>{t('settings.effectiveFrom')}</span>
          <span />
        </div>
        {state.prices.map((row, index) => (
          <div key={`${index}-${row.model}`} className={css.priceRow}>
            <input
              aria-label={t('settings.model')}
              className={css.priceInput}
              type="text"
              value={row.model}
              disabled={disabled}
              onChange={(event) => { props.editPrice(index, { model: event.target.value }) }}
            />
            <input
              aria-label={t('settings.hitPrice')}
              className={css.priceInput}
              type="number"
              min="0"
              step="0.000001"
              value={row.cacheHitInputPricePerMillion}
              disabled={disabled}
              onChange={(event) => { props.editPrice(index, { cacheHitInputPricePerMillion: Number(event.target.value) }) }}
            />
            <input
              aria-label={t('settings.missPrice')}
              className={css.priceInput}
              type="number"
              min="0"
              step="0.000001"
              value={row.cacheMissInputPricePerMillion}
              disabled={disabled}
              onChange={(event) => { props.editPrice(index, { cacheMissInputPricePerMillion: Number(event.target.value) }) }}
            />
            <input
              aria-label={t('settings.outputPrice')}
              className={css.priceInput}
              type="number"
              min="0"
              step="0.000001"
              value={row.outputPricePerMillion}
              disabled={disabled}
              onChange={(event) => { props.editPrice(index, { outputPricePerMillion: Number(event.target.value) }) }}
            />
            <input
              aria-label={t('settings.currency')}
              className={css.priceInput}
              type="text"
              value={row.currency}
              disabled={disabled}
              onChange={(event) => { props.editPrice(index, { currency: event.target.value }) }}
            />
            <input
              aria-label={t('settings.effectiveFrom')}
              className={css.priceInput}
              type="text"
              value={row.effectiveFrom}
              disabled={disabled}
              onChange={(event) => { props.editPrice(index, { effectiveFrom: event.target.value }) }}
            />
            <button
              type="button"
              className={css.removeRow}
              aria-label={t('settings.removeRow')}
              title={t('settings.removeRow')}
              disabled={disabled}
              onClick={() => { props.removePriceRow(index) }}
            >
              ×
            </button>
          </div>
        ))}
      </div>
      <p className={css.fallbackHint}>{t('settings.fallbackModel')}</p>
    </SettingsCardShell>
  )
}
