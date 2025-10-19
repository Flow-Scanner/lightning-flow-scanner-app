import { LightningElement, api, track } from "lwc";
import { NavigationMixin } from "lightning/navigation";
import { loadStyle } from "lightning/platformResourceLoader";
import datatableHeaderStyles from "@salesforce/resourceUrl/LFS_CSS";

export default class FlowOverview extends NavigationMixin(LightningElement) {
  _records = [];

  @api get records() {
    return this._records;
  }
  @api hasMoreRecords;
  @track activeOnly = false;
  @track columns = [
    { label: "Label", fieldName: "masterLabel", type: "text", sortable: true },
    {
      label: "API Name",
      fieldName: "developerNameUrl",
      type: "url",
      sortable: true,
      typeAttributes: {
        label: { fieldName: "developerName" },
        target: "_blank"
      }
    },
    {
      label: "Process Type",
      fieldName: "processType",
      type: "text",
      sortable: true
    },
    {
      label: "Last Modified Date",
      fieldName: "lastModifiedDate",
      type: "date",
      typeAttributes: {
        year: "numeric",
        month: "short",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        hour12: true
      },
      sortable: true,
      cellAttributes: { alignment: "center" }
    },
    {
      label: "Is Active",
      fieldName: "isActive",
      type: "boolean",
      cellAttributes: { alignment: "center" }
    },
    {
      label: "Results",
      type: "button",
      typeAttributes: {
        label: "Details",
        name: "scan",
        variant: "base",
        title: "Click to see scan results"
      }
    }
  ];
  @track displayedRecords = [];
  @track err;
  @track nameSearchTerm = "";
  @track sortedBy = "lastModifiedDate";
  @track sortedDirection = "desc";
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
      return { ...r, isActive: normalizedIsActive };
    });
    this.applyFilters();
  }
  
  connectedCallback() {
    loadStyle(this, datatableHeaderStyles)
      .catch((error) => {
        console.error("Error loading datatable header styles:", error);
        this.err = "Failed to load custom styles for datatable headers.";
      });
  }

  handleRowAction(event) {
    const actionName = event.detail.action.name;
    const row = event.detail.row;
    if (actionName === "scan") {
      this.dispatchEvent(
        new CustomEvent("scanflow", { detail: { flowId: row.id } })
      );
    }
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

  handleSort(event) {
    const { fieldName: sortedBy, sortDirection } = event.detail;
    this.sortedBy = sortedBy;
    this.sortedDirection = sortDirection;
    const clone = [...this.displayedRecords];
    this._sortArray(clone, sortedBy, sortDirection);
    this.displayedRecords = clone;
  }

  _sortArray(arr, sortedBy, sortDirection) {
    const column = this.columns.find((col) => col.fieldName === sortedBy);
    const type = column ? column.type : "text";
    arr.sort((a, b) => {
      let valA = a[sortedBy];
      let valB = b[sortedBy];
      if (sortedBy === "developerNameUrl") {
        valA = a.developerName;
        valB = b.developerName;
      }
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