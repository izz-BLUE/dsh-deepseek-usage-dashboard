/**
 * Staged form model behind the plugin settings card.
 *
 * A card stages what the user types and writes it only when they save — the
 * settings write is a durable, revision-fenced document mutation. The form
 * is self-contained (this package must not depend on sibling UI packages):
 * scalar drafts for enabled/providerId/refreshMinutes and a row editor for
 * the prices array.
 */
/** Create a minimal snapshot store. */
export function createLocalSnapshotStore(initial) {
    let value = initial;
    const listeners = new Set();
    return {
        getSnapshot: () => value,
        set: (next) => {
            value = next;
            for (const listener of listeners)
                listener();
        },
        subscribe: (listener) => {
            listeners.add(listener);
            return () => { listeners.delete(listener); };
        },
    };
}
/** Validate one draft price row ('' means "not yet edited"). */
function priceRowValid(row) {
    if (row.model.trim() === '')
        return false;
    if (row.currency.trim() === '')
        return false;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(row.effectiveFrom))
        return false;
    for (const price of [row.cacheHitInputPricePerMillion, row.cacheMissInputPricePerMillion, row.outputPricePerMillion]) {
        if (!Number.isFinite(price) || price < 0)
            return false;
    }
    return true;
}
/** Structural equality over price rows. */
function priceRowsEqual(a, b) {
    if (a.length !== b.length)
        return false;
    return a.every((row, index) => {
        const other = b[index];
        return row.model === other.model
            && row.cacheHitInputPricePerMillion === other.cacheHitInputPricePerMillion
            && row.cacheMissInputPricePerMillion === other.cacheMissInputPricePerMillion
            && row.outputPricePerMillion === other.outputPricePerMillion
            && row.currency === other.currency
            && row.effectiveFrom === other.effectiveFrom;
    });
}
/** The pristine default price rows (composition defaults). */
export function defaultPriceRows() {
    return [
        { model: 'deepseek-v4-flash', cacheHitInputPricePerMillion: 0.02, cacheMissInputPricePerMillion: 1, outputPricePerMillion: 2, currency: 'CNY', effectiveFrom: '2026-04-24' },
        { model: 'deepseek-v4-pro', cacheHitInputPricePerMillion: 0.025, cacheMissInputPricePerMillion: 3, outputPricePerMillion: 6, currency: 'CNY', effectiveFrom: '2026-04-24' },
        { model: 'deepseek-chat', cacheHitInputPricePerMillion: 0.02, cacheMissInputPricePerMillion: 1, outputPricePerMillion: 2, currency: 'CNY', effectiveFrom: '2026-04-24' },
        { model: 'deepseek-reasoner', cacheHitInputPricePerMillion: 0.02, cacheMissInputPricePerMillion: 1, outputPricePerMillion: 2, currency: 'CNY', effectiveFrom: '2026-04-24' },
        { model: '*', cacheHitInputPricePerMillion: 0.02, cacheMissInputPricePerMillion: 1, outputPricePerMillion: 2, currency: 'CNY', effectiveFrom: '2026-04-24' },
    ];
}
/** Stages one card's edits over one settings namespace and writes on save. */
export class UsageSettingsForm {
    scope;
    staged = new Map();
    listeners = new Set();
    saving = false;
    failed = false;
    /** @param scope - the bound settings scope for this card's namespace. */
    constructor(scope) {
        this.scope = scope;
        scope.subscribe(() => { this.publish(); });
    }
    /** Publish a projection of this form, rebuilt on scope or draft changes. */
    bind() {
        const store = createLocalSnapshotStore(this.projection());
        this.listeners.add(() => { store.set(this.projection()); });
        return store;
    }
    /** The actions the card's slot registration injects. */
    actions() {
        return {
            editEnabled: (text) => this.stageBoolean('enabled', text),
            editProviderId: (text) => this.stageText('providerId', text),
            editRefreshMinutes: (text) => this.stageNumber('balanceRefreshMinutes', text),
            editPrice: (index, patch) => this.editPrice(index, patch),
            addPriceRow: () => this.addPriceRow(),
            removePriceRow: (index) => this.removePriceRow(index),
            resetPrices: () => {
                this.staged.set('prices', { kind: 'clear' });
                this.failed = false;
                this.publish();
            },
            save: () => { void this.save(); },
            discard: () => {
                if (this.staged.size === 0 && !this.failed)
                    return;
                this.staged.clear();
                this.failed = false;
                this.publish();
            },
        };
    }
    projection() {
        const snapshot = this.scope.getSnapshot();
        const section = snapshot.value ?? {};
        const enabled = this.fieldText(snapshot, 'enabled', value => typeof value === 'boolean' ? String(value) : '');
        const providerId = this.fieldText(snapshot, 'providerId', value => typeof value === 'string' ? value : '');
        const refresh = this.fieldText(snapshot, 'balanceRefreshMinutes', value => typeof value === 'number' ? String(value) : '');
        const prices = this.draftPrices(snapshot, section);
        const overridden = this.userHas(snapshot, 'prices');
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
            prices,
            pricesOverridden: overridden,
        };
    }
    /** Whether any staged edit actually differs from the effective section. */
    isDirty(snapshot) {
        if (this.staged.size === 0)
            return false;
        const section = snapshot.value ?? {};
        for (const [field, edit] of this.staged) {
            const current = section[field];
            if (edit.kind === 'clear') {
                if (this.userHas(snapshot, field))
                    return true;
                continue;
            }
            if (field === 'prices') {
                const currentRows = Array.isArray(current) ? current : [];
                if (!priceRowsEqual(currentRows, edit.value))
                    return true;
                continue;
            }
            if (current !== edit.value)
                return true;
        }
        return false;
    }
    /** Render one scalar field's draft (staged, else the effective section). */
    fieldText(snapshot, field, format) {
        const staged = this.staged.get(field);
        if (staged === undefined) {
            const value = (snapshot.value ?? {})[field];
            return value === undefined ? '' : format(value);
        }
        if (staged.kind === 'clear')
            return '';
        if (typeof staged.value === 'boolean' || typeof staged.value === 'string' || typeof staged.value === 'number') {
            return String(staged.value);
        }
        return '';
    }
    /** Render the draft price rows (staged array, else the section's rows). */
    draftPrices(snapshot, section) {
        const staged = this.staged.get('prices');
        if (staged !== undefined && staged.kind === 'set') {
            return structuredClone(staged.value);
        }
        const rows = Array.isArray(section.prices) ? section.prices : defaultPriceRows();
        return rows.length > 0 ? structuredClone(rows) : defaultPriceRows();
    }
    userHas(snapshot, field) {
        const user = snapshot.user;
        return typeof user === 'object' && user !== null && Object.hasOwn(user, field);
    }
    stageBoolean(field, text) {
        const trimmed = text.trim();
        if (trimmed === '')
            this.staged.set(field, { kind: 'clear' });
        else if (trimmed === 'true')
            this.staged.set(field, { kind: 'set', value: true });
        else if (trimmed === 'false')
            this.staged.set(field, { kind: 'set', value: false });
        else
            this.staged.set(field, { kind: 'set', value: trimmed });
        this.failed = false;
        this.publish();
    }
    stageText(field, text) {
        const trimmed = text.trim();
        this.staged.set(field, trimmed === '' ? { kind: 'clear' } : { kind: 'set', value: trimmed });
        this.failed = false;
        this.publish();
    }
    stageNumber(field, text) {
        const trimmed = text.trim();
        if (trimmed === '') {
            this.staged.set(field, { kind: 'clear' });
        }
        else {
            const parsed = Number(trimmed);
            this.staged.set(field, Number.isFinite(parsed) ? { kind: 'set', value: parsed } : { kind: 'set', value: trimmed });
        }
        this.failed = false;
        this.publish();
    }
    editPrice(index, patch) {
        const rows = this.currentDraftRows();
        const row = rows[index];
        if (row === undefined)
            return;
        rows[index] = { ...row, ...patch };
        this.staged.set('prices', { kind: 'set', value: rows });
        this.failed = false;
        this.publish();
    }
    addPriceRow() {
        const rows = this.currentDraftRows();
        rows.push({ model: '', cacheHitInputPricePerMillion: 0, cacheMissInputPricePerMillion: 0, outputPricePerMillion: 0, currency: 'CNY', effectiveFrom: new Date().toISOString().slice(0, 10) });
        this.staged.set('prices', { kind: 'set', value: rows });
        this.failed = false;
        this.publish();
    }
    removePriceRow(index) {
        const rows = this.currentDraftRows();
        rows.splice(index, 1);
        this.staged.set('prices', { kind: 'set', value: rows });
        this.failed = false;
        this.publish();
    }
    currentDraftRows() {
        const staged = this.staged.get('prices');
        if (staged !== undefined && staged.kind === 'set')
            return structuredClone(staged.value);
        const section = this.scope.getSnapshot().value ?? {};
        const rows = Array.isArray(section.prices) && section.prices.length > 0 ? section.prices : defaultPriceRows();
        return structuredClone(rows);
    }
    /** Write every staged edit, then re-seed from what the Host accepted. */
    async save() {
        if (this.saving || this.staged.size === 0)
            return;
        if (this.projection().invalid)
            return;
        this.saving = true;
        this.failed = false;
        this.publish();
        let landed = true;
        for (const [field, edit] of this.staged) {
            try {
                if (edit.kind === 'clear')
                    await this.scope.unset(field);
                else
                    await this.scope.set(field, edit.value);
            }
            catch {
                landed = false;
            }
        }
        if (landed)
            this.staged.clear();
        this.saving = false;
        this.failed = !landed;
        this.publish();
    }
    publish() {
        for (const listener of this.listeners)
            listener();
    }
}
