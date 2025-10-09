import { LightningElement, api, track } from 'lwc';

export default class LightningFlowScanner extends LightningElement {
    @api name;
    @api metadata;
    @api scanResult;
    @api numberOfRules;
    @api error;

    get hasScanResults() {
        return this.scanResult && this.scanResult.ruleResults && this.scanResult.ruleResults.length > 0;
    }

    get flowName() {
        return this.name || '';
    }
}