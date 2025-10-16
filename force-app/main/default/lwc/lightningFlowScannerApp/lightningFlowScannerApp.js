import { LightningElement, api, track } from "lwc";
import { loadScript } from "lightning/platformResourceLoader";
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
  @track currentFlowIndex = 0;
  @track nextRecordsUrl;
  @track hasMoreRecords = false;
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
    return this.activeTab === 1 ? "active" : "";
  }

  get AnalysisClass() {
    return this.activeTab === 2 ? "active" : "";
  }

  get ConfigClass() {
    return this.activeTab === 3 ? "active" : "";
  }

  async connectedCallback() {
    try {
      await Promise.all([
        loadScript(this, LFSStaticRessource + "/jsforce.js"),
        loadScript(this, LFSStaticRessource + "/LFS.js")
      ]);

      this.scriptLoaded = true;

      if (!window.lightningflowscanner) {
        console.error("lightningflowscanner not loaded correctly");
        return;
      }

      this.rules = window.lightningflowscanner
        .getRules()
        .map((rule, index) => ({
          id: `rule-${index}`,
          name: rule.name,
          description: rule.description,
          severity: rule.severity,
          category: rule.category,
          isActive: true
        }));

      this.rulesConfig = {
        rules: this.rules.reduce((acc, rule) => {
          acc[rule.name] = { severity: rule.severity };
          return acc;
        }, {})
      };

      if (!window.jsforce) {
        console.error("jsforce not loaded correctly");
        return;
      }

      const SF_API_VERSION = "60.0";
      this.conn = new window.jsforce.Connection({
        accessToken: this.accessToken,
        version: SF_API_VERSION,
        maxRequest: "10000"
      });

      await this.fetchMDTConfig();
      await this.fetchFlows();
    } catch (error) {
      this.err = error.message;
      console.error("Error in connectedCallback:", error);
    }
  }

  async fetchFlows(searchTerm = "") {
    try {
      this.isLoading = true;
      let query = `
  SELECT Id, CreatedDate, DeveloperName, ActiveVersionId, LatestVersionId,
    ActiveVersion.Status, ActiveVersion.MasterLabel, ActiveVersion.ProcessType, ActiveVersion.LastModifiedDate,
    LatestVersion.Status, LatestVersion.MasterLabel, LatestVersion.ProcessType, LatestVersion.LastModifiedDate,
    LastModifiedDate, LastModifiedBy.Name
  FROM FlowDefinition
`;

      if (searchTerm) {
        const escapedSearchTerm = searchTerm.replace(/'/g, "\\'");
        query += ` WHERE DeveloperName LIKE '%${escapedSearchTerm}%' OR MasterLabel LIKE '%${escapedSearchTerm}%'`;
      }
      query += " LIMIT 50";

      const res = await this.conn.tooling.query(query);
      if (res && res.records) {
        const newRecords = this._processFlowRecords(res.records);

        this.records = searchTerm
          ? newRecords
          : [...this.records, ...newRecords];
        this.nextRecordsUrl = res.nextRecordsUrl;
        this.hasMoreRecords = !!res.nextRecordsUrl;

        if (this.records.length > 0 && !searchTerm) {
          this.selectedFlowRecord = this.records[0];
          this.currentFlowIndex = 0;
          await this.loadFlowMetadata(this.selectedFlowRecord);
        }
      }
    } catch (error) {
      this.err = error.message;
      console.error("Error in fetchFlows:", error);
    } finally {
      this.isLoading = false;
    }
  }

  async loadMoreFlows() {
    if (!this.nextRecordsUrl || !this.hasMoreRecords) return;
    try {
      this.isLoading = true;
      const res = await this.conn.tooling.queryMore(this.nextRecordsUrl);
      if (res && res.records) {
        const newRecords = this._processFlowRecords(res.records);
        this.records = [...this.records, ...newRecords];
        this.nextRecordsUrl = res.nextRecordsUrl;
        this.hasMoreRecords = !!res.nextRecordsUrl;
      }
    } catch (error) {
      this.err = error.message;
      console.error("Error in loadMoreFlows:", error);
    } finally {
      this.isLoading = false;
    }
  }

  _processFlowRecords(records) {
    return records.map((record) => {
      const version = record.ActiveVersionId
        ? record.ActiveVersion
        : record.LatestVersion;

      const rawDate =
        version?.LastModifiedDate ||
        record.LastModifiedDate ||
        record.CreatedDate;
      const dateValue = rawDate ? new Date(rawDate) : null;
      const normalizedIsActive = !!record.ActiveVersionId;
      const versionId =
        record.ActiveVersionId || record.LatestVersionId || null;

      return {
        id: record.Id,
        developerName: record.DeveloperName,
        developerNameUrl: `/${record.Id}`,
        isActive: normalizedIsActive,
        masterLabel: version?.MasterLabel || "",
        processType: version?.ProcessType || "",
        lastModifiedDate: dateValue,
        versionId
      };
    });
  }

  async handleSearch(event) {
    const searchTerm = event.detail.searchTerm;
    this.records = [];
    this.nextRecordsUrl = null;
    this.hasMoreRecords = false;
    await this.fetchFlows(searchTerm);
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
        await this.scanFlow(this.rulesConfig);
      }
    } catch (error) {
      this.err = error.message;
      console.error("Error in loadFlowMetadata:", error);
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

    if (!window.lightningflowscanner) {
      console.error("lightningflowscanner is not loaded");
      return;
    }

    // Make a plain deep copy of ruleOptions to avoid LWC/Aura Proxy objects
    const rawRuleOptions = JSON.parse(JSON.stringify(ruleOptions || this.rulesConfig || { rules: {} }));

    // Remove rules that are explicitly disabled so scanner won't run them
    const activeRuleEntries = Object.fromEntries(
      Object.entries(rawRuleOptions.rules || {}).filter(([name, cfg]) => !cfg.disabled)
    );
    const optionsForScan = { rules: activeRuleEntries };
    this.numberOfRules = Object.keys(optionsForScan.rules).length;

    const flow = new window.lightningflowscanner.Flow(
      this.flowName,
      this.flowMetadata
    );

    const uri =
      "/services/data/v60.0/tooling/sobjects/Flow/" +
      this.selectedFlowRecord.versionId;
    const parsedFlow = { uri, flow };

    try {
      // Call the scanner with a plain object (no proxies)
      const scanResults = window.lightningflowscanner.scan([parsedFlow], optionsForScan);
      this.scanResult = scanResults[0];
      const activeRuleNames = Object.keys(optionsForScan.rules || {});

      if (
        this.scanResult &&
        this.scanResult.ruleResults &&
        activeRuleNames.length > 0
      ) {
        this.scanResult.ruleResults = this.scanResult.ruleResults.filter(
          (ruleResult) => {
            if (!ruleResult.ruleName) {
              return false;
            }
            return activeRuleNames.includes(ruleResult.ruleName);
          }
        );
      }

      // IMPORTANT: override severity on each ruleResult with the value from optionsForScan
      if (this.scanResult && this.scanResult.ruleResults) {
        this.scanResult.ruleResults = this.scanResult.ruleResults.map((ruleResult, ruleIndex) => {
          const override = optionsForScan.rules && optionsForScan.rules[ruleResult.ruleName];
          const overriddenSeverity = override && override.severity ? override.severity : ruleResult.severity;
          return {
            ...ruleResult,
            severity: overriddenSeverity,
            id: `rule-${ruleIndex}`,
            details: ruleResult.details.map((detail, detailIndex) => ({
              ...detail,
              id: `rule-${ruleIndex}-detail-${detailIndex}`
            }))
          };
        });
      }
    } catch (e) {
      this.err = e.message;
    }
  } catch (error) {
    this.err = error.message;
  } finally {
    this.isLoading = false;
  }
  }

  handleTabClick(event) {
    this.activeTab = parseInt(event.currentTarget.dataset.tab, 10);
  }

  async handleScanFlow(event) {
    const flowId = event.detail.flowId;
    const record = this.records.find((rec) => rec.id === flowId);
    if (record) {
      this.isLoading = true;
      this.selectedFlowRecord = record;
      this.currentFlowIndex = this.records.findIndex(
        (rec) => rec.id === flowId
      );
      try {
        await this.loadFlowMetadata(record);
        this.activeTab = 2;
      } catch (error) {
        this.err = error.message;
      }
    }
  }

  async handleRuleChange(event) {
    const updatedRules = event.detail.rules;
    // Update UI rules array (this is the source of truth for UI changes)
    this.rules = updatedRules;

    // Build merged rulesConfig: user changes override severity/isActive;
    // preserve existing expression (from MDT) unless user provides one via UI (not currently supported).
    const mergedRulesConfig = { rules: {} };

    updatedRules.forEach((rule) => {
      // create the base entry using the user's severity
      // include disabled based on the user's isActive toggle (explicit user action)
      if (rule.isActive) {
        mergedRulesConfig.rules[rule.name] = { severity: rule.severity };
      } else {
        // If user disabled the rule in the UI, include the rule entry with disabled = true
        mergedRulesConfig.rules[rule.name] = {
          severity: rule.severity,
          disabled: true
        };
      }

      // Preserve expression from existing rulesConfig if present (usually from MDT)
      const existing =
        this.rulesConfig &&
        this.rulesConfig.rules &&
        this.rulesConfig.rules[rule.name];
      if (existing && existing.expression) {
        mergedRulesConfig.rules[rule.name].expression = existing.expression;
      }

      // If there was an existing disabled flag in rulesConfig and the user did NOT explicitly toggle
      // (we consider the UI's isActive authoritative here), we already set disabled from isActive.
    });

    // Replace rulesConfig with the merged result
    this.rulesConfig = mergedRulesConfig;

    // Immediately re-scan if we have a loaded flow
    if (this.flowName && this.flowMetadata && this.selectedFlowRecord) {
      await this.scanFlow(this.rulesConfig);
    }
  }

  async handleNavigateFlow(event) {
    const direction = event.detail.direction;
    if (!this.records || this.records.length === 0) return;

    let newIndex = this.currentFlowIndex;
    if (direction === "previous" && newIndex > 0) {
      newIndex--;
    } else if (direction === "next" && newIndex < this.records.length - 1) {
      newIndex++;
    }

    if (newIndex !== this.currentFlowIndex) {
      this.isLoading = true;
      this.currentFlowIndex = newIndex;
      this.selectedFlowRecord = this.records[newIndex];
      try {
        await this.loadFlowMetadata(this.selectedFlowRecord);
        this.activeTab = 2;
      } catch (error) {
        this.err = error.message;
      }
    }
  }

  async fetchMDTConfig() {
    if (!this.conn) {
      this.err = "Connection not ready for MDT fetch.";
      return;
    }
    try {
      const query = `
      SELECT RuleName__c, Severity__c, Expression__c, Disabled__c
      FROM ScanRuleConfiguration__mdt
    `;
      const res = await this.conn.query(query);

      if (res && res.records) {
        res.records.forEach((rec) => {
          const ruleName = rec.RuleName__c;
          // Only act when rule exists in our rulesConfig
          if (
            this.rulesConfig &&
            this.rulesConfig.rules &&
            this.rulesConfig.rules[ruleName]
          ) {
            if (rec.Severity__c) {
              this.rulesConfig.rules[ruleName].severity =
                rec.Severity__c.toLowerCase();
              console.log('MDT Overrides Applied:', JSON.stringify(this.rulesConfig, null, 2));
            }
            if (rec.Expression__c) {
              this.rulesConfig.rules[ruleName].expression = rec.Expression__c;
            }
            if (
              rec.Disabled__c !== null &&
              typeof rec.Disabled__c !== "undefined"
            ) {
              this.rulesConfig.rules[ruleName].disabled = !!rec.Disabled__c;
            }

            const uiRule = this.rules.find((r) => r.name === ruleName);
            if (uiRule) {
              if (rec.Severity__c)
                uiRule.severity = rec.Severity__c.toLowerCase();
              // Disabled in MDT means rule should be inactive in the UI
              if (
                rec.Disabled__c !== null &&
                typeof rec.Disabled__c !== "undefined"
              ) {
                uiRule.isActive = !rec.Disabled__c;
              }
            }
          }
        });

        // Force reactive update of the rules array shown in UI
        this.rules = [...this.rules];
        this.rulesConfig = { rules: { ...this.rulesConfig.rules } }
      }
      console.log("MDT Overrides Applied:", this.rulesConfig);
    } catch (error) {
      console.error("MDT Fetch Error:", error);
      this.err = "Failed to load rule overrides: " + error.message;
    }
  }
}
