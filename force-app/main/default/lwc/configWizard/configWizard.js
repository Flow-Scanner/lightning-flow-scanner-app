import { LightningElement, api, track } from 'lwc';

// Guided rule configuration, mirroring the VS Code extension's Configure
// Scanner flow: rule mode → beta opt-in → rule selection → per-rule options →
// review. On apply it emits a config in the same shape as .flow-scanner.json,
// so the parent can run it through the regular import pipeline.
export default class ConfigWizard extends LightningElement {
    @api rules = [];
    @api initialRuleMode;

    @track step = 1;
    @track ruleMode = 'merged';
    @track includeBeta = false;
    @track searchTerm = '';
    // ruleId -> boolean
    @track selection = {};
    // ruleId -> { optionName: string value }
    @track optionValues = {};

    // Snapshot of the seeded option values, to detect options the user cleared
    // (an import can only set values, so clears must be reported explicitly).
    initialOptionValues = {};

    ruleModeOptions = [
        { label: 'Merged — run all rules, override the ones you select', value: 'merged' },
        { label: 'Isolated — run only the rules you select', value: 'isolated' }
    ];

    connectedCallback() {
        this.ruleMode = this.initialRuleMode === 'isolated' ? 'isolated' : 'merged';
        this.includeBeta = (this.rules || []).some(r => r.isBeta && r.isActive);
        const selection = {};
        const values = {};
        (this.rules || []).forEach(r => {
            selection[r.ruleId] = !!r.isActive;
            (r.options || []).forEach(o => {
                if (o.value !== '' && o.value != null) {
                    values[r.ruleId] = { ...values[r.ruleId], [o.name]: String(o.value) };
                }
            });
        });
        this.selection = selection;
        this.optionValues = values;
        this.initialOptionValues = JSON.parse(JSON.stringify(values));
    }

    /* ────────────────────── STEP STATE ────────────────────── */
    get stepValue()    { return String(this.step); }
    get isStepMode()   { return this.step === 1; }
    get isStepRules()  { return this.step === 2; }
    get isStepOptions(){ return this.step === 3; }
    get isStepReview() { return this.step === 4; }
    get showBack()     { return this.step > 1; }
    get showNext()     { return this.step < 4; }

    get ruleModeHelp() {
        return this.ruleMode === 'isolated'
            ? 'Only the rules you select in the next step will run. Everything else is turned off.'
            : 'All rules run with their defaults; your selections and options below override them. Deselected rules are disabled.';
    }

    /* ────────────────────── RULE SELECTION ────────────────────── */
    get eligibleRules() {
        const rules = this.rules || [];
        return this.includeBeta ? rules : rules.filter(r => !r.isBeta);
    }

    get selectableRules() {
        const term = this.searchTerm.toLowerCase();
        return this.eligibleRules
            .filter(
                r =>
                    !term ||
                    (r.name || '').toLowerCase().includes(term) ||
                    (r.ruleId || '').toLowerCase().includes(term) ||
                    (r.description || '').toLowerCase().includes(term)
            )
            .map(r => ({ ...r, checked: !!this.selection[r.ruleId] }));
    }

    get selectedCount() {
        return this.eligibleRules.filter(r => this.selection[r.ruleId]).length;
    }

    get selectionSummary() {
        return `${this.selectedCount} of ${this.eligibleRules.length} rules selected`;
    }

    /* ────────────────────── OPTION EDITING ────────────────────── */
    get optionRules() {
        return this.eligibleRules
            .filter(r => this.selection[r.ruleId] && r.configurableOptions?.length)
            .map(r => ({
                ...r,
                optionEditors: r.configurableOptions.map(o => ({
                    ...o,
                    inputType: o.type === 'number' ? 'number' : 'text',
                    value: (this.optionValues[r.ruleId] || {})[o.name] ?? '',
                    placeholder: `Default: ${String(o.defaultValue ?? '')}`
                }))
            }));
    }

    get hasOptionRules() { return this.optionRules.length > 0; }

    /* ────────────────────── REVIEW ────────────────────── */
    get reviewModeLabel() {
        return this.ruleMode === 'isolated'
            ? 'Isolated — only selected rules run'
            : 'Merged — all rules run, with your overrides';
    }

    get reviewBetaLabel() { return this.includeBeta ? 'Included' : 'Excluded'; }

    get reviewOverrides() {
        const overrides = [];
        this.optionRules.forEach(r => {
            r.optionEditors.forEach(o => {
                if (o.value !== '' && o.value != null) {
                    overrides.push({ key: `${r.ruleId}-${o.name}`, label: `${r.name}: ${o.name} = ${o.value}` });
                }
            });
        });
        return overrides;
    }

    get hasReviewOverrides() { return this.reviewOverrides.length > 0; }

    /* ────────────────────── EVENT HANDLERS ────────────────────── */
    handleRuleModeChange(event) { this.ruleMode = event.detail.value; }
    handleBetaChange(event)     { this.includeBeta = event.target.checked; }
    handleSearch(event)         { this.searchTerm = event.target.value || ''; }

    handleRuleCheck(event) {
        const ruleId = event.target.dataset.ruleId;
        this.selection = { ...this.selection, [ruleId]: event.target.checked };
    }

    handleSelectAll()  { this.setAll(true); }
    handleDeselectAll(){ this.setAll(false); }

    setAll(checked) {
        const selection = { ...this.selection };
        this.eligibleRules.forEach(r => { selection[r.ruleId] = checked; });
        this.selection = selection;
    }

    handleOptionInput(event) {
        const ruleId = event.target.dataset.ruleId;
        const name = event.target.dataset.option;
        const value = event.target.value ?? '';
        this.optionValues = {
            ...this.optionValues,
            [ruleId]: { ...this.optionValues[ruleId], [name]: value }
        };
    }

    handleBack() { this.step -= 1; }

    handleNext() {
        if (this.isStepOptions && !this.validateOptions()) return;
        this.step += 1;
    }

    validateOptions() {
        const inputs = [...this.template.querySelectorAll('lightning-input[data-option]')];
        // reportValidity is absent (or a no-op returning undefined) in test stubs;
        // only an explicit false blocks navigation.
        return inputs.reduce(
            (valid, input) =>
                (typeof input.reportValidity !== 'function' || input.reportValidity() !== false) && valid,
            true
        );
    }

    handleCancel() { this.dispatchEvent(new CustomEvent('close')); }

    handleApply() {
        this.dispatchEvent(
            new CustomEvent('apply', {
                detail: { config: this.buildConfig(), clearedOptions: this.buildClearedOptions() }
            })
        );
    }

    /* ────────────────────── CONFIG ASSEMBLY ────────────────────── */
    // Same materialization as the VS Code wizard: isolated writes only the
    // selected rules; merged writes explicit enabled flags for every rule.
    buildConfig() {
        const config = { ruleMode: this.ruleMode, rules: {} };
        this.eligibleRules.forEach(r => {
            const selected = !!this.selection[r.ruleId];
            if (this.ruleMode === 'isolated') {
                if (selected) {
                    config.rules[r.ruleId] = { severity: r.severity, ...this.cleanOptions(r) };
                }
            } else {
                config.rules[r.ruleId] = selected
                    ? { enabled: true, ...this.cleanOptions(r) }
                    : { enabled: false };
            }
        });
        if (!this.includeBeta && this.ruleMode === 'merged') {
            (this.rules || [])
                .filter(r => r.isBeta)
                .forEach(r => { config.rules[r.ruleId] = { enabled: false }; });
        }
        return config;
    }

    cleanOptions(rule) {
        const values = this.optionValues[rule.ruleId] || {};
        const out = {};
        (rule.configurableOptions || []).forEach(o => {
            const raw = values[o.name];
            if (raw === '' || raw == null) return;
            if (o.type === 'number') {
                const num = Number(raw);
                if (Number.isFinite(num)) out[o.name] = num;
            } else {
                const trimmed = String(raw).trim();
                if (trimmed) out[o.name] = trimmed;
            }
        });
        return out;
    }

    // Options that were seeded with a value but emptied in the wizard: the
    // parent must clear these overrides so the core default applies again.
    buildClearedOptions() {
        const cleared = [];
        Object.entries(this.initialOptionValues).forEach(([ruleId, opts]) => {
            Object.keys(opts).forEach(name => {
                const current = (this.optionValues[ruleId] || {})[name];
                if (current === '' || current == null) {
                    cleared.push({ identifier: ruleId, name });
                }
            });
        });
        return cleared;
    }
}
