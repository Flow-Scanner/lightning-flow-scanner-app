import { LightningElement, track } from 'lwc';
import { loadScript } from 'lightning/platformResourceLoader';
import LFS_Core from '@salesforce/resourceUrl/LFS_Core';

import getFlowDefinitions from '@salesforce/apex/LightningFlowScannerController.getFlowDefinitions';
import getFlowMetadata    from '@salesforce/apex/LightningFlowScannerController.getFlowMetadata';
import getMDTRules        from '@salesforce/apex/LightningFlowScannerController.getMDTRules';

// Top-level keys accepted from CLI / VS Code style config files.
const SCAN_META_KEYS = [
    'threshold',
    'categories',
    'exceptions',
    'ignoreFlows',
    'ruleMode',
    'systemRules',
    'detailLevel'
];

// Per-rule keys that control enablement / severity UI rather than rule options.
const RULE_CONTROL_KEYS = new Set(['severity', 'disabled', 'enabled']);

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
    // Per-rule options beyond severity/active (e.g. expression, threshold),
    // sourced from Custom Metadata or an imported JSON config. Keyed by ruleId.
    @track ruleOptions = {};
    // Top-level scan options from imported JSON (threshold, categories, …).
    @track scanMeta = {};
    @track isLoading = false;
    @track currentFlowIndex = 0;
    @track isScanningAll = false;
    @track searchKey = '';
    @track setupNeeded = false;

    scriptLoaded = false;
    autoSwitchedToSetup = false;

    /* ────────────────────── GETTERS ────────────────────── */
    get isTab1Active() { return this.activeTab === 1; }
    get isTab2Active() { return this.activeTab === 2; }
    get isTab3Active() { return this.activeTab === 3; }
    get isTab4Active() { return this.activeTab === 4; }
    get FlowsClass()   { return this.activeTab === 1 ? 'slds-active' : ''; }
    get AnalysisClass(){ return this.activeTab === 2 ? 'slds-active' : ''; }
    get ConfigClass()  { return this.activeTab === 3 ? 'slds-active' : ''; }
    get SetupClass()   { return this.activeTab === 4 ? 'slds-active' : ''; }

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
        const scanner = window.lightningflowscanner;
        let allRules;
        let stableIds;
        try {
            allRules = scanner.getRules(undefined, { betaMode: true });
            stableIds = new Set(scanner.getRules().map(r => r.ruleId || r.name));
        } catch (e) {
            // Older core bundles don't take options — no beta rules available
            allRules = scanner.getRules();
            stableIds = new Set(allRules.map(r => r.ruleId || r.name));
        }
        this.rules = allRules.map((r, i) => {
            const ruleId = r.ruleId || r.name;
            const isBeta = !stableIds.has(ruleId);
            return {
                id: `rule-${i}`,
                // Legacy PascalCase name (MDT / older configs); also used in the table.
                name: r.name || ruleId,
                // Canonical id used by CLI / VS Code JSON configs.
                ruleId,
                description: r.description,
                severity: r.severity,
                category: r.category,
                isBeta,
                // Beta rules are optional: off until explicitly enabled
                isActive: !isBeta
            };
        });
        this.buildRulesConfig();
    }

    /* ────────────────────── MDT OVERRIDES (IMPERATIVE) ────────────────────── */
    async loadMDTOverrides() {
        try {
            const mdtRows = await getMDTRules();
            mdtRows.forEach(m => {
                const rule = this.findRule(m.ruleName);
                if (rule) {
                    if (m.severity) rule.severity = m.severity.toLowerCase();
                    if (m.disabled != null) rule.isActive = !m.disabled;
                }
                // Persist expression into ruleOptions so buildRulesConfig() carries it
                // through to the scan instead of discarding it on rebuild.
                if (m.expression) {
                    this.setRuleOption(m.ruleName, 'expression', m.expression);
                }
            });
            this.rules = [...this.rules];           // force UI refresh
            this.buildRulesConfig();
        } catch (e) {
            console.error('MDT load error:', e);
            this.err = 'Failed to load MDT rules: ' + (e.body?.message || e.message);
        }
    }

    // Match either canonical ruleId (kebab-case) or legacy name (PascalCase).
    findRule(identifier) {
        if (!identifier) return undefined;
        return this.rules.find(
            r => r.ruleId === identifier || r.name === identifier
        );
    }

    // Canonical storage key for per-rule options (prefer ruleId).
    optionKeyFor(identifier) {
        const rule = this.findRule(identifier);
        return rule?.ruleId || identifier;
    }

    buildRulesConfig() {
        const cfg = { rules: {} };
        this.rules.forEach(r => {
            const key = r.ruleId || r.name;
            const opts =
                this.ruleOptions[r.ruleId] ||
                this.ruleOptions[r.name] ||
                {};
            cfg.rules[key] = r.isActive
                ? { severity: r.severity, ...opts }
                : { severity: r.severity, ...opts, disabled: true };
        });
        this.rulesConfig = cfg;
    }

    // Store a single per-rule option immutably so @track picks up the change.
    setRuleOption(identifier, key, value) {
        const storageKey = this.optionKeyFor(identifier);
        this.ruleOptions = {
            ...this.ruleOptions,
            [storageKey]: { ...this.ruleOptions[storageKey], [key]: value }
        };
    }

    /* ────────────────────── JSON CONFIG IMPORT ────────────────────── */
    // Accepts a config in the same shape the CLI / VS Code extension read, e.g.
    // {
    //   "rules": {
    //     "excessive-cyclomatic-complexity": { "threshold": 30 },
    //     "CyclomaticComplexity": { "severity": "error" }   // legacy name also ok
    //   },
    //   "threshold": "error",
    //   "categories": ["problem"],
    //   "exceptions": { ... }
    // }
    // A bare rules map (without the top-level "rules" key) is also tolerated.
    async handleConfigImport(event) {
        const config = event.detail.config;
        if (!config || typeof config !== 'object') return;

        const hasRulesKey =
            Object.prototype.hasOwnProperty.call(config, 'rules') &&
            config.rules !== null &&
            typeof config.rules === 'object' &&
            !Array.isArray(config.rules);

        const rulesMap = hasRulesKey ? config.rules : this.isBareRulesMap(config) ? config : null;

        // Top-level scan options (only when using full document shape).
        if (hasRulesKey || !rulesMap) {
            const meta = { ...this.scanMeta };
            SCAN_META_KEYS.forEach(k => {
                if (config[k] !== undefined) meta[k] = config[k];
            });
            this.scanMeta = meta;
        }

        if (rulesMap) {
            Object.entries(rulesMap).forEach(([identifier, raw]) => {
                const ruleCfg = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
                const ui = this.findRule(identifier);
                if (ui) {
                    if (ruleCfg.severity) {
                        ui.severity = String(ruleCfg.severity).toLowerCase();
                    }
                    if (ruleCfg.disabled === true || ruleCfg.enabled === false) {
                        ui.isActive = false;
                    } else if (ruleCfg.disabled === false || ruleCfg.enabled === true) {
                        ui.isActive = true;
                    }
                }
                // Carry every remaining field (expression, threshold, message, …)
                // into the scan under the canonical ruleId key.
                Object.entries(ruleCfg).forEach(([key, value]) => {
                    if (RULE_CONTROL_KEYS.has(key)) return;
                    this.setRuleOption(identifier, key, value);
                });
            });
        }

        this.rules = [...this.rules]; // force UI refresh
        this.buildRulesConfig();
        if (this.allScanResults.length) await this.scanAllFlows();
        else if (this.selectedFlowRecord) await this.scanCurrentFlow();
    }

    // Heuristic: object whose values look like rule configs (not a full document).
    isBareRulesMap(obj) {
        if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return false;
        // If it only has top-level meta keys, it's not a bare rules map.
        const keys = Object.keys(obj);
        if (keys.length === 0) return false;
        if (keys.every(k => SCAN_META_KEYS.includes(k))) return false;
        // At least one value should be a plain object or boolean-ish disable flag.
        return keys.some(k => {
            const v = obj[k];
            return v && typeof v === 'object' && !Array.isArray(v);
        });
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
            this.handleAuthError(this.err);
        } finally {
            this.isLoading = false;
        }
    }

    // First-run experience: when the Tooling API rejects us because setup is
    // incomplete, land the user on the Setup tab instead of an error.
    handleAuthError(message) {
        const authIssue = /OAuth configuration not found|OAuth authentication failed|Insufficient permissions to access OAuth configuration/i
            .test(message || '');
        if (authIssue) {
            this.setupNeeded = true;
            if (!this.autoSwitchedToSetup) {
                this.autoSwitchedToSetup = true;
                this.activeTab = 4;
            }
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
            this.numberOfRules = Object.keys(opts.rules || {}).length;

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
        const rules = Object.fromEntries(
            Object.entries(raw.rules || {}).filter(([, c]) => !c.disabled)
        );
        // Strip the app-only `disabled` flag; core uses `enabled: false` and we
        // already filter disabled rules out so they never reach the engine.
        Object.values(rules).forEach(c => {
            if (c && typeof c === 'object') delete c.disabled;
        });
        return {
            // Let beta rules participate when enabled; disabled rules are
            // excluded from the config and filtered out of results either way.
            betaMode: true,
            ...this.scanMeta,
            rules
        };
    }

    postProcessScanResult(res, opts) {
        if (!res?.ruleResults) return res;
        const activeNames = new Set(Object.keys(opts.rules || {}));
        // Also accept matches by legacy name / ruleId on the result.
        const isActive = (ruleName) => {
            if (activeNames.has(ruleName)) return true;
            const rule = this.findRule(ruleName);
            if (!rule) return false;
            return activeNames.has(rule.ruleId) || activeNames.has(rule.name);
        };
        return {
            ...res,
            ruleResults: res.ruleResults
                .filter(r => r.ruleName && isActive(r.ruleName))
                .map((r, i) => {
                    const ov =
                        opts.rules[r.ruleName] ||
                        (this.findRule(r.ruleName)
                            ? opts.rules[this.findRule(r.ruleName).ruleId] ||
                              opts.rules[this.findRule(r.ruleName).name]
                            : undefined);
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
            this.numberOfRules = Object.keys(opts.rules || {}).length;

            const promises = this.records.map(async (rec) => {
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
        this.loadFlowMetadata(rec).then(() => { this.activeTab = 2; });
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
            this.loadFlowMetadata(this.selectedFlowRecord).then(() => { this.activeTab = 2; });
        }
    }
}
