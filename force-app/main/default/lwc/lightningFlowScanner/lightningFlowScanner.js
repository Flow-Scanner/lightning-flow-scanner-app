import { LightningElement, api } from "lwc";
import { isFixableRule } from "c/lfsFixEngine";

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
    // Fix affordance — only meaningful in single-flow mode, where one flow is in view.
    @api canFix = false;
    @api fixableIssueCount = 0;
    @api flowIsActive = false;

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

    // ----- FIX -----
    // The count sits with the other flow-level facts in the header, and the
    // action sits on the violation it fixes. A notification band between the
    // toolbar and the table would displace the table on every fixable scan.
    get showFixCount() {
        return !this.isAllMode && this.canFix;
    }

    get fixButtonTitle() {
        return this.flowIsActive
            ? "Review the fix. This flow is Active, so it is saved as a new Draft version."
            : "Review the fix. It is saved to this Draft.";
    }

    handleFixClick() {
        this.dispatchEvent(new CustomEvent("fixflow"));
    }

    // ----- FIX (all-flows mode) -----
    // The all-results table lists violations across flows, but a fix is always
    // written per flow. So the row action names its flow and the confirmation
    // step stays the same one the single-flow view uses.
    get fixableViolations() {
        return this.filteredViolations.filter((v) => v.isFixable);
    }

    get fixableViolationCount() {
        return this.fixableViolations.length;
    }

    get fixableFlowCount() {
        return new Set(this.fixableViolations.map((v) => v.flowId)).size;
    }

    get showAllFixCount() {
        return this.isAllMode && this.fixableViolationCount > 0;
    }

    get allFixCountTitle() {
        const count = this.fixableViolationCount;
        const issues = count === 1 ? "issue" : "issues";
        const flows = this.fixableFlowCount;
        const flowWord = flows === 1 ? "flow" : "flows";
        return `${count} ${issues} across ${flows} ${flowWord} can be fixed automatically. Use Fix on a row to review that flow's changes before anything is saved.`;
    }

    handleRowFixClick(event) {
        const { flowId, flowName } = event.currentTarget.dataset;
        if (!flowId) return;
        this.dispatchEvent(
            new CustomEvent("fixflowrow", { detail: { flowId, flowName } })
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
        const processRuleDetails = (rule, ruleIndex, flowCtx, flowKey) => {
            if (!rule.details) return;
            rule.details.forEach((detail, detailIndex) => {
                const d = detail.details || {};
                const connectsTo = Array.isArray(d.connectsTo)
                    ? d.connectsTo.join(", ")
                    : d.connectsTo || "";
                violations.push({
                    id: `flow-${flowKey}-rule-${ruleIndex}-detail-${detailIndex}`,
                    flowName: flowCtx.flowName,
                    flowApiName: flowCtx.flowApiName,
                    flowUrl: flowCtx.flowUrl,
                    // Needed in all-flows mode: the row is the only thing that
                    // knows which flow a "Fix" click should act on.
                    flowId: flowCtx.flowId,
                    ruleName: rule.ruleName,
                    severity: rule.severity,
                    name: detail.name,
                    type: detail.type,
                    dataType: d.dataType ?? "",
                    locationX: d.locationX ?? "",
                    locationY: d.locationY ?? "",
                    connectsTo: connectsTo,
                    expression: d.expression ?? "",
                    details: this.composeDetails(d, connectsTo),
                    // Marks the rows the "Fix" button would act on, so the button's
                    // scope is visible in the table rather than only in the dialog.
                    isFixable: isFixableRule(rule.ruleName)
                });
            });
        };

        if (this.isAllMode) {
            this.allScanResults.forEach((item, itemIndex) => {
                const flowCtx = {
                    flowName: item.flowName,
                    flowApiName: item.flowApiName || item.flowName,
                    flowUrl: item.flowId ? `/${item.flowId}` : "",
                    flowId: item.flowId
                };
                item.scanResult?.ruleResults?.forEach((rule, ruleIndex) =>
                    processRuleDetails(rule, ruleIndex, flowCtx, itemIndex)
                );
            });
        } else {
            const rec = this.selectedFlowRecord;
            const flowCtx = {
                flowName:
                    this.flowName ||
                    (rec && (rec.masterLabel || rec.developerName)) ||
                    "",
                flowApiName: (rec && rec.developerName) || this.flowName || "",
                flowUrl: rec && rec.id ? `/${rec.id}` : "",
                flowId: rec && rec.id
            };
            this.scanResult?.ruleResults?.forEach((rule, ruleIndex) =>
                processRuleDetails(rule, ruleIndex, flowCtx, "single")
            );
        }

        return violations;
    }

    // One display string per row: the core populates exactly one detail group
    // per metaType (variable → dataType, node → location/connectors,
    // attribute → expression, resource → none).
    composeDetails(d, connectsTo) {
        if (d.dataType) return `Data Type: ${d.dataType}`;
        if (d.locationX != null || d.locationY != null) {
            const location = `Location: ${d.locationX ?? ""}, ${d.locationY ?? ""}`;
            return connectsTo
                ? `${location} · Connects to: ${connectsTo}`
                : location;
        }
        if (d.expression) return d.expression;
        return "";
    }

    // ----- FILTERED & SORTED VIOLATIONS -----
    get filteredViolations() {
        let filtered = [...this.flattenedViolations];

        // Flow name filter (label or API name — the column displays the API name)
        if (this.flowNameFilter) {
            const f = this.flowNameFilter.toLowerCase();
            filtered = filtered.filter(
                (v) =>
                    (v.flowName || "").toLowerCase().includes(f) ||
                    (v.flowApiName || "").toLowerCase().includes(f)
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
                    (v.details || "").toLowerCase().includes(f)
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
            "Flow Name", "Flow API Name", "Rule Name", "Severity", "Detail Name", "Type",
            "Data Type", "Location X", "Location Y", "Connects To", "Expression", "Auto-fixable"
        ];

        const rows = this.filteredViolations.map(v =>
            [
                v.flowName, v.flowApiName, v.ruleName, v.severity, v.name, v.type,
                v.dataType, v.locationX, v.locationY, v.connectsTo, v.expression,
                v.isFixable ? "Yes" : "No"
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