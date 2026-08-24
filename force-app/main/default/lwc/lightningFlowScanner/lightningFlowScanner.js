import { LightningElement, api } from "lwc";

const MIN_COLUMN_WIDTH = 60;

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

    // Widths are kept per table (single-flow vs all-flows mode) since the two
    // tables have different columns.
    _colWidths = { single: {}, all: {} };
    _tableFixed = { single: false, all: false };
    _resizing = null;
    _suppressNextSort = false;

    renderedCallback() {
        // Re-renders (sorting, filtering, mode switches) rebuild the table DOM,
        // so any user-chosen column widths must be reapplied afterwards.
        this._applyColWidths();
    }

    disconnectedCallback() {
        this._teardownResizeListeners();
    }

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
        if (this._suppressNextSort) {
            this._suppressNextSort = false;
            return;
        }
        const field = event.currentTarget.dataset.field;
        if (!field) return;

        if (this.sortField === field) {
            this.sortDirection = this.sortDirection === "asc" ? "desc" : "asc";
        } else {
            this.sortField = field;
            this.sortDirection = "asc";
        }

        this.sortIndicators = { [field]: this.sortDirection === "asc" ? "▲" : "▼" };
    }

    // ----- COLUMN RESIZING -----
    handleResizerClick(event) {
        event.stopPropagation();
    }

    handleResizeStart(event) {
        event.preventDefault();
        event.stopPropagation();
        const th = event.currentTarget.closest("th");
        const table = th && th.closest("table");
        if (!table) return;
        const key = table.dataset.tableKey;
        const headers = Array.from(table.querySelectorAll("thead th"));
        const widths = this._colWidths[key];

        // Freeze the current layout widths so untouched columns keep their
        // size while one column is dragged.
        headers.forEach((el, i) => {
            if (widths[i] === undefined) {
                widths[i] = el.getBoundingClientRect().width;
            }
        });
        this._tableFixed[key] = true;

        const index = headers.indexOf(th);
        this._resizing = {
            key,
            index,
            startX: event.clientX,
            startWidth: widths[index]
        };
        this._applyColWidths();

        this._onResizeMove = (e) => this._handleResizeMove(e);
        this._onResizeEnd = () => this._handleResizeEnd();
        window.addEventListener("mousemove", this._onResizeMove);
        window.addEventListener("mouseup", this._onResizeEnd);
    }

    _handleResizeMove(event) {
        if (!this._resizing) return;
        const delta = event.clientX - this._resizing.startX;
        this._colWidths[this._resizing.key][this._resizing.index] = Math.max(
            MIN_COLUMN_WIDTH,
            this._resizing.startWidth + delta
        );
        this._applyColWidths();
    }

    _handleResizeEnd() {
        this._resizing = null;
        // A click fires on the header right after mouseup — don't let it sort.
        this._suppressNextSort = true;
        // eslint-disable-next-line @lwc/lwc/no-async-operation
        setTimeout(() => {
            this._suppressNextSort = false;
        }, 0);
        this._teardownResizeListeners();
    }

    _teardownResizeListeners() {
        if (this._onResizeMove) {
            window.removeEventListener("mousemove", this._onResizeMove);
            this._onResizeMove = null;
        }
        if (this._onResizeEnd) {
            window.removeEventListener("mouseup", this._onResizeEnd);
            this._onResizeEnd = null;
        }
    }

    _applyColWidths() {
        const table = this.template.querySelector("table[data-table-key]");
        if (!table) return;
        const key = table.dataset.tableKey;
        const widths = this._colWidths[key];
        if (this._tableFixed[key]) {
            table.style.tableLayout = "fixed";
        }
        Array.from(table.querySelectorAll("thead th")).forEach((el, i) => {
            if (widths[i] !== undefined) {
                el.style.width = `${widths[i]}px`;
            }
        });
    }

    // ----- FLATTENED VIOLATIONS -----
    get flattenedViolations() {
        let violations = [];

        // flowKey keeps row keys unique across flows in all-mode — detail.id values
        // (e.g. "res-0-0") repeat per flow, and duplicate for:each keys break LWC's
        // list diffing when a sort reorders the rows.
        const processRuleDetails = (rule, ruleIndex, flowName, flowKey) => {
            if (!rule.details) return;
            rule.details.forEach((detail, detailIndex) => {
                violations.push({
                    id: `flow-${flowKey}-rule-${ruleIndex}-detail-${detailIndex}`,
                    flowName: flowName,
                    ruleName: rule.ruleName,
                    severity: rule.severity,
                    name: detail.name,
                    type: detail.type,
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
                    processRuleDetails(rule, ruleIndex, flowName, itemIndex)
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
                processRuleDetails(rule, ruleIndex, flowName, "single")
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
            "Flow Name", "Rule Name", "Severity", "Detail Name", "Type",
            "Data Type", "Location X", "Location Y", "Connects To", "Expression"
        ];

        const rows = this.filteredViolations.map(v =>
            [
                v.flowName, v.ruleName, v.severity, v.name, v.type,
                v.dataType, v.locationX, v.locationY, v.connectsTo, v.expression
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