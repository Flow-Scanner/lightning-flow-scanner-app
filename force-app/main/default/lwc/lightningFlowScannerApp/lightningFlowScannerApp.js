import { LightningElement, api, track } from 'lwc';
import { loadScript } from 'lightning/platformResourceLoader';
import LFSStaticRessource from "@salesforce/resourceUrl/LFS_SR";

export default class lightningFlowScannerApp extends LightningElement {
    @api accessToken;
    @api userId;
    @track activeTab = 1;
    @track records = [];
    @track err;
    @track selectedFlowRecord = null;
    @track flowMetadata = null;
    @track flowName;
    @track scanResult;
    @track numberOfRules;
    @track rules = [];
    @track rulesConfig = null;
    @track isLoading = false;
    conn;
    scriptLoaded = false;

    get isTab1Active() {
        return this.activeTab === 1;
    }

    get isTab2Active() {
        return this.activeTab === 2;
    }

    get isTab3Active() {
        return this.activeTab === 3;
    }

    get FlowsClass() {
        return this.activeTab === 1 ? 'active' : '';
    }

    get AnalysisClass() {
        return this.activeTab === 2 ? 'active' : '';
    }

    get ConfigClass() {
        return this.activeTab === 3 ? 'active' : '';
    }

    async connectedCallback() {
        try {
            await Promise.all([
                loadScript(this, LFSStaticRessource + '/jsforce.js'),
                loadScript(this, LFSStaticRessource + '/LFS.js')
            ]);
            this.scriptLoaded = true;

            // Fetch rules for Configuration tab, default all to active
            this.rules = lightningflowscanner.getRules().map((rule, index) => ({
                id: `rule-${index}`,
                name: rule.name,
                description: rule.description,
                severity: rule.severity,
                category: rule.category,
                isActive: true // Default all rules to active
            }));

            // Initialize rulesConfig with all rules (correct format: { rules: { [name]: { severity } } })
            this.rulesConfig = {
                rules: this.rules.reduce((acc, rule) => {
                    acc[rule.name] = { severity: rule.severity }; // Include default severity
                    return acc;
                }, {})
            };
            console.log('Initial rulesConfig:', JSON.stringify(this.rulesConfig));

            let SF_API_VERSION = '60.0';
            this.conn = new jsforce.Connection({
                accessToken: this.accessToken,
                version: SF_API_VERSION,
                maxRequest: '10000'
            });

            const res = await this.conn.tooling.query(`SELECT Id, DeveloperName, ActiveVersionId, LatestVersionId, ActiveVersion.Status, ActiveVersion.MasterLabel, ActiveVersion.ProcessType, LatestVersion.Status, LatestVersion.MasterLabel, LatestVersion.ProcessType FROM FlowDefinition`);
            if (res && res.records) {
                this.records = res.records.map(record => ({
                    id: record.Id,
                    developerName: record.DeveloperName,
                    developerNameUrl: `/${record.Id}`,
                    isActive: !!record.ActiveVersionId,
                    masterLabel: record.ActiveVersionId ? record.ActiveVersion.MasterLabel : record.LatestVersion.MasterLabel,
                    processType: record.ActiveVersionId ? record.ActiveVersion.ProcessType : record.LatestVersion.ProcessType,
                    versionId: record.ActiveVersionId ? record.ActiveVersionId : record.LatestVersionId // Fixed typo
                }));

                if (this.records.length > 0) {
                    this.selectedFlowRecord = this.records[0];
                    await this.loadFlowMetadata(this.selectedFlowRecord);
                }
            }
        } catch (error) {
            this.err = error.message;
            console.error('Error in connectedCallback:', error);
        }
    }

    async loadFlowMetadata(record) {
        try {
            this.isLoading = true;
            const id = record.versionId;
            const metadataRes = await this.conn.tooling.query(
                `SELECT Id, FullName, Metadata FROM Flow WHERE Id = '${id}' LIMIT 1`
            );

            if (metadataRes && metadataRes.records.length) {
                const flow = metadataRes.records[0];
                this.flowName = flow.FullName;
                this.flowMetadata = flow.Metadata;
                await this.scanFlow(this.rulesConfig); // Pass rulesConfig to scan
            }
        } catch (error) {
            this.err = error.message;
            console.error('Error in loadFlowMetadata:', error);
        } finally {
            this.isLoading = false;
        }
    }

    async scanFlow(ruleOptions) {
        if (!this.scriptLoaded || !this.flowName || !this.flowMetadata) {
            return;
        }
        try {
            this.isLoading = true;
            // Log ruleOptions for debugging
            console.log('Scanning with ruleOptions:', JSON.stringify(ruleOptions));
            // Use only active rules for numberOfRules
            this.numberOfRules = ruleOptions && ruleOptions.rules ? Object.keys(ruleOptions.rules).length : lightningflowscanner.getRules().length;
            const flow = new lightningflowscanner.Flow(this.flowName, this.flowMetadata);

            let uri = '/services/data/v60.0/tooling/sobjects/Flow/' + this.selectedFlowRecord.versionId;
            let parsedFlow = { uri, flow };

            try {
                let scanResults = lightningflowscanner.scan([parsedFlow], ruleOptions);
                this.scanResult = scanResults[0];
                console.log('Raw scan results ruleResults count:', this.scanResult.ruleResults.length);
                console.log('Sample raw ruleResult structure:', JSON.stringify(this.scanResult.ruleResults[0] || {}));

                // Fallback: Filter scan results to include only active rules
                const activeRuleNames = ruleOptions && ruleOptions.rules ? Object.keys(ruleOptions.rules) : [];
                if (this.scanResult && this.scanResult.ruleResults && activeRuleNames.length > 0) {
                    this.scanResult.ruleResults = this.scanResult.ruleResults.filter(ruleResult => {
                        if (!ruleResult.ruleName) {
                            console.warn('Skipping ruleResult due to missing ruleName:', JSON.stringify(ruleResult));
                            return false;
                        }
                        return activeRuleNames.includes(ruleResult.ruleName);
                    });
                    console.log('Filtered scan results ruleResults count:', this.scanResult.ruleResults.length);
                }

                // Add unique keys to each rule result and its details
                this.scanResult.ruleResults = this.scanResult.ruleResults.map((ruleResult, ruleIndex) => {
                    return {
                        ...ruleResult,
                        id: `rule-${ruleIndex}`,
                        details: ruleResult.details.map((detail, detailIndex) => {
                            return { ...detail, id: `rule-${ruleIndex}-detail-${detailIndex}` };
                        })
                    };
                });
            } catch (e) {
                this.err = e.message;
                console.error('Error scanning flow:', e);
            }
        } catch (error) {
            this.err = error.message;
            console.error('Error parsing flow:', error);
        } finally {
            this.isLoading = false;
        }
    }

    handleTabClick(event) {
        this.activeTab = parseInt(event.currentTarget.dataset.tab, 10);
    }

    async handleScanFlow(event) {
        const flowId = event.detail.flowId;
        const record = this.records.find(rec => rec.id === flowId);
    
        if (record) {
            this.isLoading = true;
            this.selectedFlowRecord = record;
            try {
                await this.loadFlowMetadata(record);
                this.activeTab = 2;
            } catch (error) {
                this.err = error.message;
                console.error('Error in handleScanFlow:', error);
            }
        }
    }

    async handleRuleChange(event) {
        const updatedRules = event.detail.rules;
        this.rules = updatedRules;
        this.rulesConfig = {
            rules: updatedRules.filter(rule => rule.isActive).reduce((acc, rule) => {
                acc[rule.name] = { severity: rule.severity }; // Include user-selected severity
                return acc;
            }, {})
        };
        console.log('Updated rulesConfig:', JSON.stringify(this.rulesConfig));

        // Re-run scan if a flow is already selected
        if (this.flowName && this.flowMetadata && this.selectedFlowRecord) {
            await this.scanFlow(this.rulesConfig);
        }
    }
}