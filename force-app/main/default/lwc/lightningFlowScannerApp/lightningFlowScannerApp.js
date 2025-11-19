import { LightningElement, track } from 'lwc';
import { loadScript } from 'lightning/platformResourceLoader';
import LFS_Core from '@salesforce/resourceUrl/LFS_Core';

import getFlowDefinitions from '@salesforce/apex/LightningFlowScannerController.getFlowDefinitions';
import getFlowMetadata    from '@salesforce/apex/LightningFlowScannerController.getFlowMetadata';
import getMDTRules        from '@salesforce/apex/LightningFlowScannerController.getMDTRules';

export default class LightningFlowScannerApp extends LightningElement {
    @track activeTab = 1;
    @track records = [];
    @track err;
    @track selectedFlowRecord = null;
    @track flowMetadata = null;
    @track flowName;
    @track scanResult;
    @track allScanResults = [];
    @track numberOfRules = 0;
    @track rules = [];
    @track rulesConfig = { rules: {} };
    @track isLoading = false;
    @track currentFlowIndex = 0;
    @track isScanningAll = false;
    @track searchKey = '';

    scriptLoaded = false;

    /* ────────────────────── GETTERS ────────────────────── */
    get isTab1Active() { return this.activeTab === 1; }
    get isTab2Active() { return this.activeTab === 2; }
    get isTab3Active() { return this.activeTab === 3; }
    get FlowsClass()   { return this.activeTab === 1 ? 'slds-active' : ''; }
    get AnalysisClass(){ return this.activeTab === 2 ? 'slds-active' : ''; }
    get ConfigClass()  { return this.activeTab === 3 ? 'slds-active' : ''; }

    /* ────────────────────── LIFECYCLE ────────────────────── */
    async connectedCallback() {
        try {
            await this.loadScannerCore();
            await this.loadDefaultRules();
            await this.loadMDTOverrides();
            await this.loadFlows();
        } catch (e) {
            this.err = e.message || e.body?.message;
            console.error(e);
        }
    }

    /* ────────────────────── STATIC RESOURCES ────────────────────── */
    async loadScannerCore() {
        await loadScript(this, LFS_Core);
        this.scriptLoaded = true;
        if (!window.lightningflowscanner) {
            throw new Error('lightningflowscanner not loaded');
        }
    }

    /* ────────────────────── DEFAULT RULES FROM SCANNER ────────────────────── */
    loadDefaultRules() {
        this.rules = window.lightningflowscanner.getRules().map((r, i) => ({
            id: `rule-${i}`,
            name: r.name,
            description: r.description,
            severity: r.severity,
            category: r.category,
            isActive: true
        }));
        this.buildRulesConfig();
    }

    /* ────────────────────── MDT OVERRIDES (IMPERATIVE) ────────────────────── */
    async loadMDTOverrides() {
        try {
            const mdtRows = await getMDTRules();
            mdtRows.forEach(m => {
                const ruleName = m.ruleName;
                const ui = this.rules.find(r => r.name === ruleName);
                if (ui) {
                    if (m.severity)   ui.severity  = m.severity.toLowerCase();
                    if (m.disabled != null) ui.isActive = !m.disabled;
                }
                if (!this.rulesConfig.rules[ruleName]) this.rulesConfig.rules[ruleName] = {};
                if (m.severity)   this.rulesConfig.rules[ruleName].severity   = m.severity.toLowerCase();
                if (m.expression) this.rulesConfig.rules[ruleName].expression = m.expression;
                if (m.disabled != null) this.rulesConfig.rules[ruleName].disabled = m.disabled;
            });
            this.rules = [...this.rules];           // force UI refresh
            this.buildRulesConfig();
        } catch (e) {
            console.error('MDT load error:', e);
            this.err = 'Failed to load MDT rules: ' + (e.body?.message || e.message);
        }
    }

    buildRulesConfig() {
        const cfg = { rules: {} };
        this.rules.forEach(r => {
            cfg.rules[r.name] = r.isActive
                ? { severity: r.severity }
                : { severity: r.severity, disabled: true };
        });
        this.rulesConfig = cfg;
    }

    /* ────────────────────── FLOWS ────────────────────── */
    async loadFlows() {
        this.isLoading = true;
        try {
            const data = await getFlowDefinitions({ searchTerm: this.searchKey });
            this.records = data.map(r => ({
                id: r.id,
                developerName: r.developerName,
                developerNameUrl: `/${r.id}`,
                masterLabel: r.masterLabel,
                isActive: r.isActive,
                processType: r.processType,
                versionId: r.versionId,
                lastModifiedDate: r.lastModifiedDate
            }));
        } catch (e) {
            this.err = e.body?.message || e.message;
        } finally {
            this.isLoading = false;
        }
    }

    handleSearch(event) {
        this.searchKey = event.detail.searchTerm;
        this.loadFlows();
    }

    /* ────────────────────── SINGLE FLOW ────────────────────── */
    async loadFlowMetadata(record) {
        this.isLoading = true;
        try {
            const flow = await getFlowMetadata({ versionId: record.versionId });
            this.flowName = flow.fullName;
            this.flowMetadata = flow.metadata;
            await this.scanCurrentFlow();
        } catch (e) {
            this.err = e.body?.message || e.message;
        } finally {
            this.isLoading = false;
        }
    }

    async scanCurrentFlow() {
        if (!this.flowMetadata) return;
        this.isLoading = true;
        try {
            const opts = this.prepareScanOptions();
            this.numberOfRules = Object.keys(opts.rules).length;

            const flow = new window.lightningflowscanner.Flow(this.flowName, this.flowMetadata);
            const uri = `/services/data/v62.0/tooling/sobjects/Flow/${this.selectedFlowRecord.versionId}`;
            const scan = window.lightningflowscanner.scan([{ uri, flow }], opts);

            this.scanResult = this.postProcessScanResult(scan[0], opts);
        } catch (e) {
            this.err = e.message;
        } finally {
            this.isLoading = false;
        }
    }

    prepareScanOptions() {
        const raw = JSON.parse(JSON.stringify(this.rulesConfig));
        return {
            rules: Object.fromEntries(
                Object.entries(raw.rules).filter(([,c]) => !c.disabled)
            )
        };
    }

    postProcessScanResult(res, opts) {
        if (!res?.ruleResults) return res;
        const activeNames = Object.keys(opts.rules);
        return {
            ...res,
            ruleResults: res.ruleResults
                .filter(r => r.ruleName && activeNames.includes(r.ruleName))
                .map((r, i) => {
                    const ov = opts.rules[r.ruleName];
                    return {
                        ...r,
                        severity: ov?.severity ?? r.severity,
                        id: `res-${i}`,
                        details: r.details.map((d, di) => ({ ...d, id: `res-${i}-${di}` }))
                    };
                })
        };
    }

    /* ────────────────────── SCAN ALL ────────────────────── */
    async scanAllFlows() {
        if (!this.records.length) {
            this.err = "No flows to scan";
            return;
        }
        this.isScanningAll = true;
        this.isLoading = true;
        this.allScanResults = [];
        try {
            const opts = this.prepareScanOptions();
            this.numberOfRules = Object.keys(opts.rules).length;

            const promises = this.records.map(async (rec, i) => {
                try {
                    const meta = await getFlowMetadata({ versionId: rec.versionId });
                    const flow = new window.lightningflowscanner.Flow(meta.fullName, meta.metadata);
                    const uri = `/services/data/v62.0/tooling/sobjects/Flow/${rec.versionId}`;
                    const scan = window.lightningflowscanner.scan([{ uri, flow }], opts);
                    return {
                        flowName: rec.masterLabel || rec.developerName,
                        flowId: rec.id,
                        scanResult: this.postProcessScanResult(scan[0], opts)
                    };
                } catch {
                    return null;
                }
            });
            this.allScanResults = (await Promise.all(promises)).filter(r => r);
        } catch (e) {
            this.err = e.message;
        } finally {
            this.isLoading = false;
            this.isScanningAll = false;
        }
    }

    /* ────────────────────── EVENT HANDLERS ────────────────────── */
    handleScanFlow(event) {
        const rec = this.records.find(r => r.id === event.detail.flowId);
        if (!rec) return;
        this.selectedFlowRecord = rec;
        this.allScanResults = [];
        this.currentFlowIndex = this.records.indexOf(rec);
        this.loadFlowMetadata(rec).then(() => this.activeTab = 2);
    }

    handleTabClick(event) {
        const tab = Number(event.currentTarget.dataset.tab);
        if (tab === 1) {
            this.selectedFlowRecord = null;
            this.scanResult = null;
            this.allScanResults = [];
            this.currentFlowIndex = 0;
        }
        if (tab === 2 && !this.selectedFlowRecord && !this.allScanResults.length) {
            this.scanAllFlows();
        }
        this.activeTab = tab;
    }

    async handleRuleChange(event) {
        this.rules = event.detail.rules;
        this.buildRulesConfig();
        if (this.allScanResults.length) await this.scanAllFlows();
        else if (this.selectedFlowRecord) await this.scanCurrentFlow();
    }

    handleNavigateFlow(event) {
        const dir = event.detail.direction;
        let idx = this.currentFlowIndex;
        if (dir === 'previous' && idx > 0) idx--;
        else if (dir === 'next' && idx < this.records.length - 1) idx++;
        if (idx !== this.currentFlowIndex) {
            this.currentFlowIndex = idx;
            this.selectedFlowRecord = this.records[idx];
            this.allScanResults = [];
            this.loadFlowMetadata(this.selectedFlowRecord).then(() => this.activeTab = 2);
        }
    }
}