import { LightningElement, api, track } from 'lwc';

export default class scanConfigurator extends LightningElement {
    @api rules;
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

    connectedCallback() {
        this.localRules = this.rules ? JSON.parse(JSON.stringify(this.rules)) : [];
    }

    get displayedRules() {
        let rules = this.localRules;

        if (!this.showBeta) {
            rules = rules.filter(rule => !rule.isBeta);
        }

        if (this.searchTerm) {
            const term = this.searchTerm.toLowerCase();
            rules = rules.filter(
                rule =>
                    (rule.name || '').toLowerCase().includes(term) ||
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
        return this.localRules.every(rule => !rule.isActive);
    }

    get allRulesEnabled() {
        return this.localRules.every(rule => rule.isActive);
    }

    get toggleAllLabel() {
        return this.allRulesDisabled ? 'Enable All Rules' : 'Disable All Rules';
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