import { LightningElement, api, track } from "lwc";
import { loadStyle } from "lightning/platformResourceLoader";
import toolbarStyles from "@salesforce/resourceUrl/LFS_CSS";

const FIELD_TYPES = {
  lastModifiedDate: "date",
  isActive: "boolean",
  issueCount: "number"
};

const MIN_COLUMN_WIDTH = 60;

const DATE_FORMATTER = new Intl.DateTimeFormat("en-US", {
  year: "numeric",
  month: "short",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: true
});

export default class FlowOverview extends LightningElement {
  _records = [];
  _colWidths = {};
  _tableFixed = false;
  _resizing = null;
  _suppressNextSort = false;

  @api get records() {
    return this._records;
  }
  @api hasMoreRecords;
  @track activeOnly = false;
  @track displayedRecords = [];
  @track err;
  @track nameSearchTerm = "";
  @track sortedBy = "lastModifiedDate";
  @track sortedDirection = "desc";
  @track sortIndicators = { lastModifiedDate: "▼" };
  @track typeSearchTerm = "";

  set records(value) {
    this._records = Array.isArray(value) ? [...value] : [];
    this._records = this._records.map((r) => {
      let normalizedIsActive = r.isActive;
      if (typeof normalizedIsActive === "string") {
        normalizedIsActive = normalizedIsActive.toLowerCase() === "true";
      } else if (typeof normalizedIsActive === "number") {
        normalizedIsActive = normalizedIsActive !== 0;
      } else {
        normalizedIsActive = Boolean(normalizedIsActive);
      }
      return {
        ...r,
        isActive: normalizedIsActive,
        lastModifiedFormatted: this._formatDate(r.lastModifiedDate),
        issueCountKnown: typeof r.issueCount === "number",
        issueCountFailed: r.issueCount === null
      };
    });
    this.applyFilters();
  }

  get totalIssues() {
    return this._records.reduce(
      (total, r) => (typeof r.issueCount === "number" ? total + r.issueCount : total),
      0
    );
  }

  get countsPending() {
    return this._records.some((r) => r.issueCount === undefined);
  }

  connectedCallback() {
    loadStyle(this, toolbarStyles).catch((error) => {
      console.error("Error loading toolbar styles:", error);
      this.err = "Failed to load custom styles.";
    });
  }

  renderedCallback() {
    // Re-renders (sorting, filtering, count updates) rebuild the table DOM,
    // so any user-chosen column widths must be reapplied afterwards.
    this._applyColWidths();
  }

  disconnectedCallback() {
    this._teardownResizeListeners();
  }

  handleDetailsClick(event) {
    const flowId = event.currentTarget.dataset.flowId;
    this.dispatchEvent(new CustomEvent("scanflow", { detail: { flowId } }));
  }

  handleNameKeyUp(event) {
    this.nameSearchTerm = event.target.value?.trim().toLowerCase();
    this.applyFilters();
  }

  handleTypeKeyUp(event) {
    this.typeSearchTerm = event.target.value?.trim().toLowerCase();
    this.applyFilters();
  }

  handleToggleChange(event) {
    this.activeOnly = event.target.checked;
    this.applyFilters();
  }

  handleLoadMore() {
    this.dispatchEvent(new CustomEvent("loadmore"));
  }

  applyFilters() {
    let filtered = [...this._records];

    if (this.activeOnly) {
      filtered = filtered.filter((r) => r.isActive);
    }

    if (this.nameSearchTerm) {
      const term = this.nameSearchTerm;
      filtered = filtered.filter(
        (r) =>
          (r.masterLabel && r.masterLabel.toLowerCase().includes(term)) ||
          (r.developerName && r.developerName.toLowerCase().includes(term))
      );
    }

    if (this.typeSearchTerm) {
      const term = this.typeSearchTerm;
      filtered = filtered.filter(
        (r) => r.processType && r.processType.toLowerCase().includes(term)
      );
    }

    if (this.sortedBy) {
      this._sortArray(filtered, this.sortedBy, this.sortedDirection);
    }

    this.displayedRecords = filtered;
  }

  handleHeaderSort(event) {
    if (this._suppressNextSort) {
      this._suppressNextSort = false;
      return;
    }
    const field = event.currentTarget.dataset.field;
    if (!field) return;

    if (this.sortedBy === field) {
      this.sortedDirection = this.sortedDirection === "asc" ? "desc" : "asc";
    } else {
      this.sortedBy = field;
      this.sortedDirection = "asc";
    }

    this.sortIndicators = {
      [field]: this.sortedDirection === "asc" ? "▲" : "▼"
    };

    const clone = [...this.displayedRecords];
    this._sortArray(clone, this.sortedBy, this.sortedDirection);
    this.displayedRecords = clone;
  }

  /* ────────────────────── COLUMN RESIZING ────────────────────── */
  handleResizerClick(event) {
    event.stopPropagation();
  }

  handleResizeStart(event) {
    event.preventDefault();
    event.stopPropagation();
    const th = event.currentTarget.closest("th");
    const headers = this._headerCells();
    if (!th || !headers.length) return;

    // Freeze the current auto-layout widths so untouched columns keep their
    // size once the table switches to fixed layout.
    headers.forEach((el, i) => {
      if (this._colWidths[i] === undefined) {
        this._colWidths[i] = el.getBoundingClientRect().width;
      }
    });
    this._tableFixed = true;

    const index = headers.indexOf(th);
    this._resizing = {
      index,
      startX: event.clientX,
      startWidth: this._colWidths[index]
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
    this._colWidths[this._resizing.index] = Math.max(
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

  _headerCells() {
    return Array.from(this.template.querySelectorAll("thead th"));
  }

  _applyColWidths() {
    const table = this.template.querySelector("table");
    if (!table) return;
    if (this._tableFixed) {
      table.style.tableLayout = "fixed";
    }
    this._headerCells().forEach((el, i) => {
      const width = this._colWidths[i];
      if (width !== undefined) {
        el.style.width = `${width}px`;
      }
    });
  }

  _formatDate(value) {
    if (!value) return "";
    const date = new Date(value);
    return isNaN(date.getTime()) ? "" : DATE_FORMATTER.format(date);
  }

  _sortArray(arr, sortedBy, sortDirection) {
    const type = FIELD_TYPES[sortedBy] || "text";
    arr.sort((a, b) => {
      let valA = a[sortedBy];
      let valB = b[sortedBy];
      if (valA === null || valA === undefined) valA = "";
      if (valB === null || valB === undefined) valB = "";
      let cmp = 0;
      switch (type) {
        case "boolean":
          cmp = Boolean(valA) === Boolean(valB) ? 0 : valA ? 1 : -1;
          break;
        case "number":
          cmp = Number(valA) - Number(valB);
          break;
        case "date":
        case "datetime":
          cmp = new Date(valA) - new Date(valB);
          break;
        default:
          cmp = String(valA).localeCompare(String(valB), "en", {
            sensitivity: "base"
          });
      }
      return sortDirection === "asc" ? cmp : -cmp;
    });
  }
}
