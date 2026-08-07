import { LightningElement, api, track } from 'lwc';
import { parseConfigText } from 'c/configParser';

export default class scanConfigurator extends LightningElement {
    _rules;
    @track localRules;
    // Core's severity set is error | warning | note — there is no "info".
    severityOptions = [
        { label: 'Error', value: 'error' },
        { label: 'Warning', value: 'warning' },
        { label: 'Note', value: 'note' }
    ];

    @track searchTerm = '';
    @track showBeta = true;
    @track sortedBy = null;
    @track sortedDirection = 'asc';
    @track sortIndicators = {};
    @track importMessage = '';
    @track importError = false;

    @api
    get rules() {
        return this._rules;
    }
    set rules(value) {
        this._rules = value;
        // Keep the table in sync when the parent applies MDT overrides or a
        // JSON import. Local edits still flow up via rulechange events.
        this.localRules = value ? JSON.parse(JSON.stringify(value)) : [];
    }

    get displayedRules() {
        let rules = this.localRules || [];

        if (!this.showBeta) {
            rules = rules.filter(rule => !rule.isBeta);
        }

        if (this.searchTerm) {
            const term = this.searchTerm.toLowerCase();
            rules = rules.filter(
                rule =>
                    (rule.name || '').toLowerCase().includes(term) ||
                    (rule.ruleId || '').toLowerCase().includes(term) ||
                    (rule.description || '').toLowerCase().includes(term)
            );
        }

        if (this.sortedBy) {
            const dir = this.sortedDirection === 'asc' ? 1 : -1;
            const field = this.sortedBy;
            rules = [...rules].sort((a, b) => {
                if (field === 'isActive') {
                    return (Boolean(a.isActive) === Boolean(b.isActive) ? 0 : a.isActive ? 1 : -1) * dir;
                }
                const valA = String(a[field] ?? '');
                const valB = String(b[field] ?? '');
                return valA.localeCompare(valB, 'en', { sensitivity: 'base' }) * dir;
            });
        }

        return rules;
    }

    handleSearchKeyUp(event) {
        this.searchTerm = event.target.value || '';
    }

    handleBetaToggle(event) {
        this.showBeta = event.target.checked;
    }

    handleHeaderSort(event) {
        const field = event.currentTarget.dataset.field;
        if (!field) return;

        if (this.sortedBy === field) {
            this.sortedDirection = this.sortedDirection === 'asc' ? 'desc' : 'asc';
        } else {
            this.sortedBy = field;
            this.sortedDirection = 'asc';
        }

        this.sortIndicators = { [field]: this.sortedDirection === 'asc' ? '▲' : '▼' };
    }

    get allRulesDisabled() {
        return (this.localRules || []).every(rule => !rule.isActive);
    }

    get allRulesEnabled() {
        return (this.localRules || []).every(rule => rule.isActive);
    }

    get toggleAllLabel() {
        return this.allRulesDisabled ? 'Enable All Rules' : 'Disable All Rules';
    }

    get importMessageClass() {
        return this.importError
            ? 'import-msg import-msg_error'
            : 'import-msg import-msg_success';
    }

    handleToggleAllRules(event) {
        const isChecked = event.target.checked;
        this.localRules = this.localRules.map(rule => ({
            ...rule,
            isActive: isChecked
        }));

        this.dispatchEvent(
            new CustomEvent('rulechange', {
                detail: { rules: this.localRules }
            })
        );
    }

    handleRuleToggle(event) {
        const ruleId = event.target.dataset.ruleId;
        this.localRules = this.localRules.map(rule => {
            if (rule.id === ruleId) {
                return { ...rule, isActive: event.target.checked };
            }
            return rule;
        });

        this.dispatchEvent(
            new CustomEvent('rulechange', {
                detail: { rules: this.localRules }
            })
        );
    }

    handleConfigFile(event) {
        const file = event.target.files && event.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => {
            this.applyImportedText(reader.result, file.name);
            // Reset so the same file can be re-selected after an edit.
            event.target.value = null;
        };
        reader.onerror = () => this.setImportMessage(`Could not read ${file.name}`, true);
        reader.readAsText(file);
    }

    // Parse a JSON or YAML config string and, if valid, emit it for the app to
    // apply. @api so unit tests can exercise parse/dispatch without a FileReader.
    // Accepts the same document shapes the CLI / VS Code extension read
    // (.flow-scanner.json / .flow-scanner.yml), or a bare
    // `{ "<ruleId>": { ... } }` rules map.
    @api
    applyImportedText(text, sourceName) {
        let config;
        try {
            config = parseConfigText(text, sourceName);
        } catch (e) {
            this.setImportMessage(
                `Could not parse ${sourceName || 'configuration'}: ${e.message}`,
                true
            );
            return false;
        }
        if (!config || typeof config !== 'object' || Array.isArray(config)) {
            this.setImportMessage(
                `${sourceName || 'Configuration'} must be a JSON or YAML object`,
                true
            );
            return false;
        }
        this.setImportMessage(
            `Loaded configuration${sourceName ? ` from ${sourceName}` : ''}`,
            false
        );
        this.dispatchEvent(new CustomEvent('configimport', { detail: { config } }));
        return true;
    }

    setImportMessage(message, isError) {
        this.importMessage = message;
        this.importError = isError;
    }

    handleOpenWizard() { this.dispatchEvent(new CustomEvent('openwizard')); }
    handleSave()       { this.dispatchEvent(new CustomEvent('configsave')); }
    handleExport()     { this.dispatchEvent(new CustomEvent('configexport')); }
    handleReset()      { this.dispatchEvent(new CustomEvent('configreset')); }

    // Commit an option edit on blur (Enter triggers blur below). Only
    // dispatches when the value actually changed, so tabbing through the
    // table doesn't fire rescans.
    handleOptionBlur(event) {
        const rowId = event.target.dataset.ruleId;
        const name = event.target.dataset.option;
        const type = event.target.dataset.optionType;
        const value = event.target.value ?? '';
        const rule = (this.localRules || []).find(r => r.id === rowId);
        const option = rule && (rule.options || []).find(o => o.name === name);
        if (!option || String(option.value ?? '') === String(value)) return;

        this.localRules = this.localRules.map(r => {
            if (r.id !== rowId) return r;
            return {
                ...r,
                options: r.options.map(o => (o.name === name ? { ...o, value } : o))
            };
        });
        this.dispatchEvent(
            new CustomEvent('optionchange', {
                detail: { identifier: rule.ruleId || rule.name, name, value, type }
            })
        );
    }

    handleOptionKeyDown(event) {
        if (event.key === 'Enter') event.target.blur();
    }

    handleSeverityChange(event) {
        const ruleId = event.target.dataset.ruleId;
        const newSeverity = event.target.value;
        this.localRules = this.localRules.map(rule => {
            if (rule.id === ruleId) {
                return { ...rule, severity: newSeverity };
            }
            return rule;
        });

        this.dispatchEvent(
            new CustomEvent('rulechange', {
                detail: { rules: this.localRules }
            })
        );
    }
}
