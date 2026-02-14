const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const PROJECT_FILE = path.join(ROOT, "sfdx-project.json");
const PACKAGING_FILE = path.join(ROOT, "docs", "sfdx-project.packaging.json");
const BACKUP_FILE = path.join(ROOT, "sfdx-project.base.json");

function deepMerge(target, source) {
  const result = { ...target };
  for (const key of Object.keys(source)) {
    if (
      Array.isArray(result[key]) &&
      Array.isArray(source[key])
    ) {
      // Merge arrays by index (packaging items merged into base items)
      const merged = [...result[key]];
      for (let i = 0; i < source[key].length; i++) {
        if (i < merged.length && isPlainObject(merged[i]) && isPlainObject(source[key][i])) {
          merged[i] = deepMerge(merged[i], source[key][i]);
        } else {
          merged[i] = source[key][i];
        }
      }
      result[key] = merged;
    } else if (isPlainObject(result[key]) && isPlainObject(source[key])) {
      result[key] = deepMerge(result[key], source[key]);
    } else {
      result[key] = source[key];
    }
  }
  return result;
}

function isPlainObject(val) {
  return val !== null && typeof val === "object" && !Array.isArray(val);
}

function prepare() {
  if (!fs.existsSync(PACKAGING_FILE)) {
    console.error("Error: docs/sfdx-project.packaging.json not found.");
    process.exit(1);
  }

  if (fs.existsSync(BACKUP_FILE)) {
    console.error(
      "Error: sfdx-project.base.json already exists. Run 'restore' first or delete it manually."
    );
    process.exit(1);
  }

  const base = JSON.parse(fs.readFileSync(PROJECT_FILE, "utf8"));
  const packaging = JSON.parse(fs.readFileSync(PACKAGING_FILE, "utf8"));

  // Back up the original
  fs.writeFileSync(BACKUP_FILE, JSON.stringify(base, null, 2) + "\n");

  // Merge and write
  const merged = deepMerge(base, packaging);
  fs.writeFileSync(PROJECT_FILE, JSON.stringify(merged, null, 2) + "\n");

  console.log("sfdx-project.json prepared for packaging (backup saved to sfdx-project.base.json).");
}

function restore() {
  if (!fs.existsSync(BACKUP_FILE)) {
    console.error("Error: sfdx-project.base.json not found. Nothing to restore.");
    process.exit(1);
  }

  fs.copyFileSync(BACKUP_FILE, PROJECT_FILE);
  fs.unlinkSync(BACKUP_FILE);

  console.log("sfdx-project.json restored from backup.");
}

const command = process.argv[2];
if (command === "prepare") {
  prepare();
} else if (command === "restore") {
  restore();
} else {
  console.error("Usage: node scripts/packaging.js <prepare|restore>");
  process.exit(1);
}
