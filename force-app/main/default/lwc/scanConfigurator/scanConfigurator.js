import { LightningElement, api, track } from 'lwc';

export default class scanConfigurator extends LightningElement {
    _rules;
    @track localRules;
    severityOptions = [
        { label: 'Error', value: 'error' },
        { label: 'Warning', value: 'warning' },
        { label: 'Info', value: 'info' },
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

    // Parse a JSON config string and, if valid, emit it for the app to apply.
    // @api so unit tests can exercise parse/dispatch without a FileReader.
    // Accepts the same document shape as the CLI / VS Code extension
    // (.flow-scanner.json), or a bare `{ "<ruleId>": { ... } }` rules map.
    @api
    applyImportedText(text, sourceName) {
        let config;
        try {
            config = JSON.parse(text);
        } catch (e) {
            this.setImportMessage(
                `Could not parse ${sourceName || 'configuration'}: ${e.message}`,
                true
            );
            return false;
        }
        if (!config || typeof config !== 'object' || Array.isArray(config)) {
            this.setImportMessage(
                `${sourceName || 'Configuration'} must be a JSON object`,
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
