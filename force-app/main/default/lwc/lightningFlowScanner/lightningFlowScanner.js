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

  handlePrintAll() {
    const violations = this.filteredViolations;

    let html = `
      <html>
        <head>
          <title>Flow Scan Results - ${new Date().toLocaleString()}</title>
          <style>
            body { font-family: Arial, sans-serif; margin: 20px; }
            h1 { color: #16325c; }
            .summary { margin: 20px 0; padding: 10px; background-color: #f3f3f3; }
            table { border-collapse: collapse; width: 100%; margin-top: 20px; }
            th, td { border: 1px solid #dddddd; padding: 8px; text-align: left; font-size: 12px; }
            th { background-color: #16325c; color: white; font-weight: bold; }
            tr:nth-child(even) { background-color: #f9f9f9; }
            .expression-cell { max-width: 300px; word-wrap: break-word; }
          </style>
        </head>
        <body>
          <h1>Flow Scan Results</h1>
          <div class="summary">
            <p><strong>Generated:</strong> ${new Date().toLocaleString()}</p>
            <p><strong>Total Violations:</strong> ${violations.length}</p>
            <p><strong>Rules Run:</strong> ${this.numberOfRules || "N/A"}</p>
          </div>
          <table>
            <thead>
              <tr>
                <th>Flow</th>
                <th>Rule Name</th>
                <th>Severity</th>
                <th>Violation Name</th>
                <th>Type</th>
                <th>Meta Type</th>
                <th>Data Type</th>
                <th>Location X</th>
                <th>Location Y</th>
                <th>Connects To</th>
                <th>Expression</th>
              </tr>
            </thead>
            <tbody>
    `;

    violations.forEach((v) => {
      html += `
        <tr>
          <td>${this.escapeHtml(v.flowName)}</td>
          <td>${this.escapeHtml(v.ruleName)}</td>
          <td>${this.escapeHtml(v.severity)}</td>
          <td>${this.escapeHtml(v.name)}</td>
          <td>${this.escapeHtml(v.type)}</td>
          <td>${this.escapeHtml(v.metaType)}</td>
          <td>${this.escapeHtml(v.dataType)}</td>
          <td>${this.escapeHtml(v.locationX)}</td>
          <td>${this.escapeHtml(v.locationY)}</td>
          <td>${this.escapeHtml(v.connectsTo)}</td>
          <td class="expression-cell">${this.escapeHtml(v.expression)}</td>
        </tr>
      `;
    });

    html += `
            </tbody>
          </table>
        </body>
      </html>
    `;

    const printWindow = window.open("", "_blank");
    if (printWindow) {
      printWindow.document.write(html);
      printWindow.document.close();
      printWindow.focus();
      setTimeout(() => {
        printWindow.print();
      }, 250);
    }
  }

  escapeHtml(text) {
    if (!text) return "";
    const div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
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
}
