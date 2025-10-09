import { LightningElement, api, track } from 'lwc';

export default class scanConfigurator extends LightningElement {
    @api rules;
    @track localRules;

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
}