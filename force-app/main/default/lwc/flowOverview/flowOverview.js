import { LightningElement, api, track } from "lwc";
import { loadStyle } from "lightning/platformResourceLoader";
import toolbarStyles from "@salesforce/resourceUrl/LFS_CSS";

const FIELD_TYPES = {
  lastModifiedDate: "date",
  isActive: "boolean"
};

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
        lastModifiedFormatted: this._formatDate(r.lastModifiedDate)
      };
    });
    this.applyFilters();
  }

  connectedCallback() {
    loadStyle(this, toolbarStyles).catch((error) => {
      console.error("Error loading toolbar styles:", error);
      this.err = "Failed to load custom styles.";
    });
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
