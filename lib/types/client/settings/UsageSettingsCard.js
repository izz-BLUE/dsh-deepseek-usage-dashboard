import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useState } from 'react';
import { UsageSettingsForm } from "./usage-settings-form.js";
import { tt } from "../locales.js";
import css from './settings-card.module.css';
/** Bridges the `deepseek-usage` scope onto the card's staged form. */
export class UsageSettingsCardController {
    form;
    store;
    /** @param scope - the bound settings scope for the `deepseek-usage` namespace. */
    constructor(scope) {
        this.form = new UsageSettingsForm(scope);
        this.store = this.form.bind();
    }
    /** Build the face the card's slot registration injects. */
    inject() {
        return { hooks: { usageSettingsCard: this.store }, ...this.form.actions() };
    }
}
/** The card chrome (self-contained mirror of the settings card shell). */
export function SettingsCardShell(props) {
    const [open, setOpen] = useState(false);
    const { state } = props;
    if (!state.available)
        return null;
    const cardClass = open ? `${css.cardOpen} ${css.card}` : css.card;
    if (!state.exposed) {
        return (_jsxs("li", { className: cardClass, children: [_jsxs("button", { type: "button", className: css.header, "aria-expanded": open, onClick: () => { setOpen(!open); }, children: [_jsxs("span", { className: css.headText, children: [_jsx("span", { className: css.name, children: props.title }), _jsx("span", { className: css.description, children: props.description })] }), _jsx("span", { className: open ? css.chevronOpen : css.chevron, children: "\u25BE" })] }), open ? _jsx("div", { className: css.body, children: _jsx("p", { className: css.notExposed, role: "status", children: tt('settings.notExposed') }) }) : null] }));
    }
    const blocked = !state.dirty || state.invalid || state.saving;
    return (_jsxs("li", { className: cardClass, children: [_jsxs("button", { type: "button", className: css.header, "aria-expanded": open, onClick: () => { setOpen(!open); }, children: [_jsxs("span", { className: css.headText, children: [_jsx("span", { className: css.name, children: props.title }), _jsx("span", { className: css.description, children: props.description })] }), state.dirty ? _jsx("span", { className: css.pending, children: tt('settings.unsaved') }) : null, _jsx("span", { className: open ? css.chevronOpen : css.chevron, children: "\u25BE" })] }), open
                ? (_jsxs("div", { className: css.body, children: [!state.writable ? _jsx("p", { className: css.readOnly, role: "status", children: tt('settings.readOnly') }) : null, props.children, _jsxs("div", { className: css.footer, children: [state.failed ? _jsx("p", { className: css.failed, role: "status", children: tt('settings.saveFailed') }) : null, _jsx("button", { type: "button", className: css.discard, disabled: !state.dirty || state.saving, onClick: props.onDiscard, children: tt('settings.discard') }), _jsx("button", { type: "button", className: css.save, disabled: blocked, onClick: props.onSave, children: tt(!state.saving ? 'settings.save' : 'settings.saving') })] })] }))
                : null] }));
}
/** One text field row. */
function TextField(props) {
    return (_jsxs("div", { className: css.field, children: [_jsx("label", { className: css.label, htmlFor: props.id, children: props.label }), _jsx("input", { id: props.id, className: css.input, type: "text", value: props.text, placeholder: props.placeholder ?? '', disabled: props.disabled, onChange: (event) => { props.onEdit(event.target.value); } }), _jsx("p", { className: css.hint, children: props.hint })] }));
}
/**
 * Render the deepseek-usage settings card.
 * @param props - locale copy, the card snapshot, and its form actions.
 */
export function UsageSettingsCard(props) {
    const { t } = props;
    const state = props.useUsageSettingsCard(snapshot => snapshot);
    const disabled = !state.writable;
    return (_jsxs(SettingsCardShell, { title: t('settings.title'), description: t('settings.description'), state: state, onSave: props.save, onDiscard: props.discard, children: [_jsxs("div", { className: css.field, children: [_jsx("label", { className: css.label, htmlFor: "usage-settings-enabled", children: t('settings.enabled') }), _jsxs("select", { id: "usage-settings-enabled", className: css.select, value: state.enabled, disabled: disabled, onChange: (event) => { props.editEnabled(event.target.value); }, children: [_jsx("option", { value: "", children: t('settings.inherit') }), _jsx("option", { value: "true", children: t('settings.on') }), _jsx("option", { value: "false", children: t('settings.off') })] }), _jsx("p", { className: css.hint, children: t('settings.enabledHint') })] }), _jsx(TextField, { id: "usage-settings-provider", label: t('settings.providerId'), hint: t('settings.providerIdHint'), text: state.providerId, disabled: disabled, onEdit: props.editProviderId }), _jsx(TextField, { id: "usage-settings-refresh", label: t('settings.refreshMinutes'), hint: t('settings.refreshMinutesHint'), text: state.balanceRefreshMinutes, disabled: disabled, onEdit: props.editRefreshMinutes, placeholder: "10" }), _jsxs("div", { className: css.field, children: [_jsx("span", { className: css.label, children: t('settings.pricingMode') }), _jsx("p", { className: css.hint, children: state.pricingMode === 'schedules' ? t('settings.pricingModeSchedules') : t('settings.pricingModeLegacy') }), state.pricingMode === 'schedules'
                        ? (_jsxs(_Fragment, { children: [_jsxs("p", { className: css.hint, children: [t('settings.pricingTimezone'), ": ", state.pricingTimezone] }), _jsx("ul", { className: css.scheduleList, children: state.pricingSchedules.map(schedule => (_jsxs("li", { children: [schedule.id, " \u00B7 ", schedule.effectiveFrom, " \u00B7 ", schedule.currency] }, schedule.id))) }), _jsx("p", { className: css.hint, role: "status", children: t('settings.pricingSchedulesHint') })] }))
                        : null] }), _jsxs("div", { className: css.pricesHead, children: [_jsx("span", { className: css.label, children: t('settings.prices') }), state.pricesOverridden
                        ? (_jsx("button", { type: "button", className: css.reset, disabled: disabled, onClick: props.resetPrices, children: t('settings.reset') }))
                        : null, _jsx("button", { type: "button", className: css.addRow, disabled: disabled, onClick: props.addPriceRow, children: t('settings.addRow') })] }), _jsx("p", { className: css.hint, children: t('settings.pricesHint') }), state.invalid ? _jsx("p", { className: css.invalid, role: "status", children: t('settings.invalidPrice') }) : null, _jsxs("div", { className: css.priceTable, children: [_jsxs("div", { className: css.priceRowHead, children: [_jsx("span", { children: t('settings.model') }), _jsx("span", { children: t('settings.hitPrice') }), _jsx("span", { children: t('settings.missPrice') }), _jsx("span", { children: t('settings.outputPrice') }), _jsx("span", { children: t('settings.currency') }), _jsx("span", { children: t('settings.effectiveFrom') }), _jsx("span", {})] }), state.prices.map((row, index) => (_jsxs("div", { className: css.priceRow, children: [_jsx("input", { "aria-label": t('settings.model'), className: css.priceInput, type: "text", value: row.model, disabled: disabled, onChange: (event) => { props.editPrice(index, { model: event.target.value }); } }), _jsx("input", { "aria-label": t('settings.hitPrice'), className: css.priceInput, type: "number", min: "0", step: "0.000001", value: row.cacheHitInputPricePerMillion, disabled: disabled, onChange: (event) => { props.editPrice(index, { cacheHitInputPricePerMillion: Number(event.target.value) }); } }), _jsx("input", { "aria-label": t('settings.missPrice'), className: css.priceInput, type: "number", min: "0", step: "0.000001", value: row.cacheMissInputPricePerMillion, disabled: disabled, onChange: (event) => { props.editPrice(index, { cacheMissInputPricePerMillion: Number(event.target.value) }); } }), _jsx("input", { "aria-label": t('settings.outputPrice'), className: css.priceInput, type: "number", min: "0", step: "0.000001", value: row.outputPricePerMillion, disabled: disabled, onChange: (event) => { props.editPrice(index, { outputPricePerMillion: Number(event.target.value) }); } }), _jsx("input", { "aria-label": t('settings.currency'), className: css.priceInput, type: "text", value: row.currency, disabled: disabled, onChange: (event) => { props.editPrice(index, { currency: event.target.value }); } }), _jsx("input", { "aria-label": t('settings.effectiveFrom'), className: css.priceInput, type: "text", value: row.effectiveFrom, disabled: disabled, onChange: (event) => { props.editPrice(index, { effectiveFrom: event.target.value }); } }), _jsx("button", { type: "button", className: css.removeRow, "aria-label": t('settings.removeRow'), title: t('settings.removeRow'), disabled: disabled, onClick: () => { props.removePriceRow(index); }, children: "\u00D7" })] }, `${index}-${row.model}`)))] }), _jsx("p", { className: css.fallbackHint, children: t('settings.fallbackModel') })] }));
}
