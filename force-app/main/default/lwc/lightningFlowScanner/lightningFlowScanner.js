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
    sortField = null;
    sortDirection = "asc";
    sortIndicators = {};

    // ----- MODE GETTERS -----
    get isAllMode() {
        return !!this.allScanResults && this.allScanResults.length > 0;
    }

    get hasScanResults() {
        return (
            !this.isAllMode &&
            this.scanResult &&
            this.scanResult.ruleResults &&
            this.scanResult.ruleResults.length > 0
        );
    }

    get flowName() {
        if (this.isAllMode) return null;
        return this.name || null;
    }

    get hasFlowName() {
        return !this.isAllMode && !!this.name;
    }

    get isFirstFlow() {
        if (!this.records || !this.selectedFlowRecord) return true;
        return (
            this.records.findIndex((rec) => rec.id === this.selectedFlowRecord.id) === 0
        );
    }

    get isLastFlow() {
        if (!this.records || !this.selectedFlowRecord) return true;
        return (
            this.records.findIndex((rec) => rec.id === this.selectedFlowRecord.id) ===
            this.records.length - 1
        );
    }

    // ----- FILTERS -----
    handleFlowNameFilter(event) {
        this.flowNameFilter = event.target.value;
    }

    handleOtherFieldsFilter(event) {
        this.otherFieldsFilter = event.target.value;
    }

    // ----- NAVIGATION -----
    handlePreviousFlow() {
        this.dispatchEvent(
            new CustomEvent("navigateflow", { detail: { direction: "previous" } })
        );
    }

    handleNextFlow() {
        this.dispatchEvent(
            new CustomEvent("navigateflow", { detail: { direction: "next" } })
        );
    }

    // ----- SORTING -----
    handleSort(event) {
        const field = event.target.dataset.field;
        if (!field) return;

        if (this.sortField === field) {
            this.sortDirection = this.sortDirection === "asc" ? "desc" : "asc";
        } else {
            this.sortField = field;
            this.sortDirection = "asc";
        }

        // Update indicators
        this.sortIndicators = {};
        this.sortIndicators[field] = this.sortDirection === "asc" ? "▲" : "▼";
    }

    // ----- FLATTENED VIOLATIONS -----
    get flattenedViolations() {
        let violations = [];

        const processRuleDetails = (rule, ruleIndex, flowName) => {
            if (!rule.details) return;
            rule.details.forEach((detail, detailIndex) => {
                violations.push({
                    id: detail.id || `flow-${flowName}-rule-${ruleIndex}-detail-${detailIndex}`,
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
        };

        if (this.isAllMode) {
            this.allScanResults.forEach((item, itemIndex) => {
                const flowName = item.flowName;
                item.scanResult?.ruleResults?.forEach((rule, ruleIndex) =>
                    processRuleDetails(rule, ruleIndex, flowName)
                );
            });
        } else {
            const flowName =
                this.flowName ||
                (this.selectedFlowRecord &&
                    (this.selectedFlowRecord.masterLabel ||
                        this.selectedFlowRecord.developerName)) ||
                "";
            this.scanResult?.ruleResults?.forEach((rule, ruleIndex) =>
                processRuleDetails(rule, ruleIndex, flowName)
            );
        }

        return violations;
    }

    // ----- FILTERED & SORTED VIOLATIONS -----
    get filteredViolations() {
        let filtered = [...this.flattenedViolations];

        // Flow name filter
        if (this.flowNameFilter) {
            const f = this.flowNameFilter.toLowerCase();
            filtered = filtered.filter((v) =>
                (v.flowName || "").toLowerCase().includes(f)
            );
        }

        // Other fields filter
        if (this.otherFieldsFilter) {
            const f = this.otherFieldsFilter.toLowerCase();
            filtered = filtered.filter(
                (v) =>
                    (v.ruleName || "").toLowerCase().includes(f) ||
                    (v.severity || "").toLowerCase().includes(f) ||
                    (v.name || "").toLowerCase().includes(f) ||
                    (v.type || "").toLowerCase().includes(f) ||
                    (v.metaType || "").toLowerCase().includes(f) ||
                    (v.dataType || "").toLowerCase().includes(f) ||
                    (v.connectsTo || "").toLowerCase().includes(f) ||
                    (v.expression || "").toLowerCase().includes(f)
            );
        }

        // Apply sorting
        if (this.sortField) {
            const dir = this.sortDirection === "asc" ? 1 : -1;
            filtered.sort((a, b) => {
                const aVal = a[this.sortField] ?? "";
                const bVal = b[this.sortField] ?? "";
                return aVal < bVal ? -1 * dir : aVal > bVal ? 1 * dir : 0;
            });
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

    // ----- CSV DOWNLOAD -----
    handleDownload() {
        if (!this.hasFlattenedViolations) return;

        const headers = [
            "Flow Name", "Rule Name", "Severity", "Detail Name", "Type", "Meta Type",
            "Data Type", "Location X", "Location Y", "Connects To", "Expression"
        ];

        const rows = this.filteredViolations.map(v =>
            [
                v.flowName, v.ruleName, v.severity, v.name, v.type,
                v.metaType, v.dataType, v.locationX, v.locationY, v.connectsTo, v.expression
            ].map(f => `"${String(f || "").replace(/"/g, '""')}"`)
        );

        const csv = [headers.join(","), ...rows.map(r => r.join(","))].join("\n");
        const encoded = encodeURIComponent(csv);
        const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
        const filename = `FlowScanner_${timestamp}.csv`;

        const link = document.createElement("a");
        link.setAttribute("href", `data:text/csv;charset=utf-8,${encoded}`);
        link.setAttribute("download", filename);
        link.click();
    }
}