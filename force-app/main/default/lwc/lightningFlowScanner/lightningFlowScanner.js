import { LightningElement, api } from 'lwc';

export default class LightningFlowScanner extends LightningElement {
    @api name;
    @api metadata;
    @api scanResult;
    @api allScanResults;
    @api numberOfRules;
    @api error;
    @api records;
    @api selectedFlowRecord;

    get isAllMode() {
        return !!this.allScanResults && this.allScanResults.length > 0;
    }

    get hasScanResults() {
        return this.scanResult && this.scanResult.ruleResults && this.scanResult.ruleResults.length > 0;
    }

    get flattenedViolations() {
        if (!this.isAllMode) return [];

        let violations = [];
        this.allScanResults.forEach(item => {
            const flowName = item.flowName;
            if (item.scanResult && item.scanResult.ruleResults) {
                item.scanResult.ruleResults.forEach(rule => {
                    if (rule.details) {
                        rule.details.forEach(detail => {
                            violations.push({
                                id: detail.id,
                                flowName: flowName,
                                ruleName: rule.ruleName,
                                severity: rule.severity,
                                name: detail.name,
                                type: detail.type,
                                metaType: detail.metaType,
                                dataType: detail.details ? detail.details.dataType : '',
                                locationX: detail.details ? detail.details.locationX : '',
                                locationY: detail.details ? detail.details.locationY : '',
                                connectsTo: detail.connectsTo || '',
                                expression: detail.details ? detail.details.expression : ''
                            });
                        });
                    }
                });
            }
        });
        return violations;
    }

    get hasFlattenedViolations() {
        return this.flattenedViolations.length > 0;
    }

    get flowName() {
        return this.name || '';
    }

    get isFirstFlow() {
        if (!this.records || !this.selectedFlowRecord) return true;
        return this.records.findIndex(rec => rec.id === this.selectedFlowRecord.id) === 0;
    }

    get isLastFlow() {
        if (!this.records || !this.selectedFlowRecord) return true;
        return this.records.findIndex(rec => rec.id === this.selectedFlowRecord.id) === this.records.length - 1;
    }

    handlePreviousFlow() {
        this.dispatchEvent(new CustomEvent('navigateflow', {
            detail: { direction: 'previous' }
        }));
    }

    handleNextFlow() {
        this.dispatchEvent(new CustomEvent('navigateflow', {
            detail: { direction: 'next' }
        }));
    }
}