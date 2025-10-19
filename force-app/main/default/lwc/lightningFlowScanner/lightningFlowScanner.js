import { LightningElement, api } from "lwc";

export default class LightningFlowScanner extends LightningElement {
  @api name;
  @api metadata;
  @api scanResult;
  @api allScanResults;
  @api numberOfRules;
  @api error;
  @api records;
  @api selectedFlowRecord;

  flowNameFilter = "";
  otherFieldsFilter = "";

  get isAllMode() {
    const result = !!this.allScanResults && this.allScanResults.length > 0;
    console.log("isAllMode:", result, "allScanResults:", this.allScanResults);
    return result;
  }

  get hasScanResults() {
    return (
      !this.isAllMode &&
      this.scanResult &&
      this.scanResult.ruleResults &&
      this.scanResult.ruleResults.length > 0
    );
  }

  get flattenedViolations() {
    let violations = [];
    // ALL-FLOWS mode: flatten allScanResults (existing behavior)
    if (this.isAllMode) {
      console.log(
        "Flattening violations from allScanResults:",
        this.allScanResults
      );
      this.allScanResults.forEach((item, itemIndex) => {
        const flowName = item.flowName;
        if (item.scanResult && item.scanResult.ruleResults) {
          item.scanResult.ruleResults.forEach((rule, ruleIndex) => {
            if (rule.details) {
              rule.details.forEach((detail, detailIndex) => {
                violations.push({
                  id:
                    detail.id ||
                    `flow-${itemIndex}-rule-${ruleIndex}-detail-${detailIndex}`,
                  flowName: flowName,
                  ruleName: rule.ruleName,
                  severity: rule.severity,
                  name: detail.name,
                  type: detail.type,
                  metaType: detail.metaType,
                  dataType: detail.details ? detail.details.dataType : "",
                  locationX: detail.details ? detail.details.locationX : "",
                  locationY: detail.details ? detail.details.locationY : "",
                  connectsTo: detail.connectsTo || "",
                  expression: detail.details ? detail.details.expression : ""
                });
              });
            }
          });
        }
      });
      console.log("Total violations flattened (all):", violations.length);
      return violations;
    }
    // SINGLE-FLOW mode: flatten scanResult for the selected flow
    if (this.scanResult && this.scanResult.ruleResults) {
      const flowName =
        this.flowName ||
        this.name ||
        (this.selectedFlowRecord &&
          (this.selectedFlowRecord.masterLabel ||
            this.selectedFlowRecord.developerName)) ||
        "";
      console.log(
        "Flattening violations from single scanResult for flow:",
        flowName
      );
      this.scanResult.ruleResults.forEach((rule, ruleIndex) => {
        if (rule.details) {
          rule.details.forEach((detail, detailIndex) => {
            violations.push({
              id: detail.id || `rule-${ruleIndex}-detail-${detailIndex}`,
              flowName: flowName,
              ruleName: rule.ruleName,
              severity: rule.severity,
              name: detail.name,
              type: detail.type,
              metaType: detail.metaType,
              dataType: detail.details ? detail.details.dataType : "",
              locationX: detail.details ? detail.details.locationX : "",
              locationY: detail.details ? detail.details.locationY : "",
              connectsTo: detail.connectsTo || "",
              expression: detail.details ? detail.details.expression : ""
            });
          });
        }
      });
      console.log("Total violations flattened (single):", violations.length);
    }
    return violations;
  }

  get filteredViolations() {
    let filtered = this.flattenedViolations;

    // Filter by flow name
    if (this.flowNameFilter) {
      const flowFilter = this.flowNameFilter.toLowerCase();
      filtered = filtered.filter((v) =>
        (v.flowName || "").toLowerCase().includes(flowFilter)
      );
    }

    // Filter by other fields (rule name, severity, violation name, type, etc.)
    if (this.otherFieldsFilter) {
      const otherFilter = this.otherFieldsFilter.toLowerCase();
      filtered = filtered.filter(
        (v) =>
          (v.ruleName || "").toLowerCase().includes(otherFilter) ||
          (v.severity || "").toLowerCase().includes(otherFilter) ||
          (v.name || "").toLowerCase().includes(otherFilter) ||
          (v.type || "").toLowerCase().includes(otherFilter) ||
          (v.metaType || "").toLowerCase().includes(otherFilter) ||
          (v.dataType || "").toLowerCase().includes(otherFilter) ||
          (v.connectsTo || "").toLowerCase().includes(otherFilter) ||
          (v.expression || "").toLowerCase().includes(otherFilter)
      );
    }

    return filtered;
  }

  get hasFlattenedViolations() {
    return this.filteredViolations.length > 0;
  }

  get totalViolationsCount() {
    return this.flattenedViolations.length;
  }

  get displayedViolationsCount() {
    return this.filteredViolations.length;
  }

  get flowName() {
    // Only return flowName if we're NOT in all mode and name exists
    if (this.isAllMode) return null;
    return this.name || null;
  }

  get hasFlowName() {
    return !this.isAllMode && !!this.name;
  }

  get isFirstFlow() {
    if (!this.records || !this.selectedFlowRecord) return true;
    return (
      this.records.findIndex((rec) => rec.id === this.selectedFlowRecord.id) ===
      0
    );
  }

  get isLastFlow() {
    if (!this.records || !this.selectedFlowRecord) return true;
    return (
      this.records.findIndex((rec) => rec.id === this.selectedFlowRecord.id) ===
      this.records.length - 1
    );
  }

  handleFlowNameFilter(event) {
    this.flowNameFilter = event.target.value;
  }

  handleOtherFieldsFilter(event) {
    this.otherFieldsFilter = event.target.value;
  }

  handlePreviousFlow() {
    this.dispatchEvent(
      new CustomEvent("navigateflow", {
        detail: { direction: "previous" }
      })
    );
  }

  handleNextFlow() {
    this.dispatchEvent(
      new CustomEvent("navigateflow", {
        detail: { direction: "next" }
      })
    );
  }

  handleDownload() {
    if (!this.hasFlattenedViolations) {
      console.warn("No violations to download");
      return;
    }

    // build csv
    const headers = [
      "Flow Name",
      "Rule Name",
      "Severity",
      "Detail Name",
      "Type",
      "Meta Type",
      "Data Type",
      "Location X",
      "Location Y",
      "Connects To",
      "Expression"
    ];
    const rows = this.filteredViolations.map(
      (v) =>
        [
          v.flowName,
          v.ruleName,
          v.severity,
          v.name,
          v.type,
          v.metaType,
          v.dataType,
          v.locationX,
          v.locationY,
          v.connectsTo,
          v.expression
        ].map((field) => `"${String(field || "").replace(/"/g, '""')}"`) // escape quotes
    );
    const csv = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");

    // Encode and download
    const encoded = encodeURIComponent(csv);

    const now = new Date();
    const timestamp = now.toISOString().replace(/[:.]/g, "-"); // Replace colons/dots for filename safety
    const filename = `FlowScanner_${timestamp}.csv`;

    const link = document.createElement("a");
    link.setAttribute("href", `data:text/csv;charset=utf-8,${encoded}`);
    link.setAttribute("download", filename);

    link.click();
  }
}
