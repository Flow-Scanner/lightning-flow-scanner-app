import { LightningElement, api, track } from 'lwc';

export default class scanConfigurator extends LightningElement {
    @api rules;
    @track localRules;
    // Severity options for dropdown
    severityOptions = [
        { label: 'Error', value: 'error' },
        { label: 'Warning', value: 'warning' },
        { label: 'Info', value: 'info' }
    ];

    connectedCallback() {
        // Initialize localRules to ensure reactivity
        this.localRules = this.rules ? JSON.parse(JSON.stringify(this.rules)) : [];
    }

    handleRuleToggle(event) {
        const ruleId = event.target.dataset.ruleId;
        this.localRules = this.localRules.map(rule => {
            if (rule.id === ruleId) {
                return { ...rule, isActive: event.target.checked };
            }
            return rule;
        });

        // Dispatch custom event with updated rules
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

        // Dispatch custom event with updated rules
        this.dispatchEvent(
            new CustomEvent('rulechange', {
                detail: { rules: this.localRules }
            })
        );
    }
}