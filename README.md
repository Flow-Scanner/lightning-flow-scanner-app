<p align="center">
 <a href="https://github.com/Flow-Scanner">
 <img src="media/banner.png" style="width: 41%;" />
 </a>
</p>
<p align="center"><em>Detect unsafe contexts, queries in loops, hardcoded IDs, and more to optimize Salesforce Flows.</em></p>

<p align="center">
 <img src="media/lfs-app.gif" alt="Lightning Flow Scanner Demo" />
</p>

---

## Table of contents

- **[Features](#features)**
- **[Usage](#usage)**
- **[Configuration](#configuration)**
- **[Installation](#installation)**
- **[Development](#development)**

---

## Features

### Flow Overview

<p align="center">
 <img src="media/flowoverview.jpg" alt="Flow Overview" width="68%" />
</p>

### Violation Details

<p align="center">
  <img src="media/allresults.jpg" alt="All Results View" width="68%" />
</p>

### Rule Configuration:

<p align="center">
 <img src="media/config.jpg" alt="Rule Configuration" width="68%" />
</p>

## Usage

**Lightning Flow Scanner App** integrates the Lightning Flow Scanner as a UMD module within Salesforce, enabling scanning of flow metadata for 20+ issues such as hardcoded IDs, unsafe contexts, inefficient SOQL/DML operations, recursion risks, and missing fault handling.

- Click on the App Launcher icon in the top-left corner of your Salesforce interface.
- Search for "Flow Scanner" in the App Launcher.
- Click on the "Flow Scanner" app to open the Scan Flows Overview.
- (Optional) Configure rules in the Configuration tab.
- View results of a Flow by clicking "details".

For details about all available rules, their default severities, and configuration options, visit the [Flow Scanner Documentation](https://flow-scanner.github.io/lightning-flow-scanner/).

**Privacy:** Zero user data collected. All processing is client-side. → See Data Handling in our [Security Policy](https://github.com/Flow-Scanner/lightning-flow-scanner-app?tab=security-ov-file).

---

## Configuration

While no configuration is required, you can configure rules in several ways: inline in the Configuration tab, through the guided **Configure Rules** wizard, by importing a config file, or via Custom Metadata org defaults. Use **Save to Org** to persist the current configuration org-wide (admins only) — it loads automatically for everyone who opens the app; unsaved changes apply to the current browser session only. For full config reference, see the [documentation](https://flow-scanner.github.io/lightning-flow-scanner/#configurations).

### Org defaults (Custom Metadata)

Admins can define **default severities**, **expressions**, or **disabled states** for scan rules using the `ScanRuleConfiguration__mdt` custom metadata type. These overrides apply globally for all users in the org; individual users can still adjust severities or disable rules locally in the browser.

1. Go to **Setup → Custom Metadata Types → ScanRuleConfiguration → Manage Records**
2. Click **New** and set the following fields:

- **Rule Name** — legacy name (e.g. `FlowName`) or canonical rule id (e.g. `invalid-naming-convention`)
- **Severity** — `Error`, `Warning`, or `Note` (other values are ignored)
- **Expression** *(optional)* — e.g., `[A-Za-z]+_[0-9]+`
- **Disabled** — check to turn off the rule globally

3. Once saved, the **Flow Scanner App** automatically applies these overrides at load time.

<p align="center">
 <img src="media/overrides.jpg" alt="Rule Override" width="68%" />
</p>

### Import a config file (same format as CLI / VS Code)

On the **Configuration** tab, use **Load config** to import a `.flow-scanner.json` or `.flow-scanner.yml` file — the same files the CLI reads and the VS Code extension writes. Supported:

- Per-rule `severity` (`error` / `warning` / `note`; anything else is ignored), `enabled` / `disabled`, `expression`, `threshold`, `message`, `messageUrl`
- Rule keys as **rule ids** (`excessive-cyclomatic-complexity`) or **legacy names** (`CyclomaticComplexity`)
- Top-level `threshold`, `categories`, `exceptions`, `ignoreFlows`, and related scan options
- `ruleMode: "isolated"` — only the rules named in the config run; all others are deactivated

Example:

```json
{
  "rules": {
    "excessive-cyclomatic-complexity": { "threshold": 30, "severity": "warning" },
    "cognitive-complexity": { "threshold": 15 },
    "invalid-api-version": { "expression": ">=58" },
    "invalid-naming-convention": { "expression": "[A-Za-z0-9_]+" },
    "hardcoded-id": { "enabled": false }
  },
  "threshold": "warning",
  "categories": ["problem", "suggestion"]
}
```

Imported values feed the in-browser scan immediately (and re-scan if results are already open).

### Configure Rules wizard, export, and org-wide saving

The **Configuration** tab toolbar also offers:

- **Configure Rules** — a guided wizard (like the VS Code extension's *Configure Scanner*): choose merged or isolated rule mode, opt into beta rules, select rules, and set thresholds/expressions with validation, then review and apply.
- **Save to Org** — stores the current configuration in the `Flow_Scanner_Saved_Config__mdt` custom metadata type (deployed via the Metadata API, takes 10–30 seconds; requires Customize Application). Saved configuration loads automatically for everyone who opens Flow Scanner, layered on top of `ScanRuleConfiguration__mdt` defaults.
- **Export** — downloads the current configuration as `.flow-scanner.json`, directly usable by the CLI and the VS Code extension.
- **Reset** — discards session changes and returns to core defaults plus Custom Metadata overrides.

### Edit rule options in the app

Rules with configurable options (e.g. the naming `expression` or complexity `threshold`) show an inline editor in the **Options** column of the Configuration tab. An empty field uses the core default (shown as placeholder); press Enter or click away to apply a value and re-scan. Editors are generated from the scanner core's rule metadata, so newly added configurable rules appear automatically.

---

## Installation

| Deployment Type | Installation |
|-----------------|----------------|
| [**AppExchange(managed)**](https://appexchange.salesforce.com/appxListingDetail?listingId=80d6caf3-d4a8-41ec-b48e-da1fe3457e98) | <a href="https://login.salesforce.com/packaging/installPackage.apexp?p0=04tgK000000E7ODQA0"><img alt="Install Managed Package" src="https://raw.githubusercontent.com/afawcett/githubsfdeploy/master/deploy.png"></a> |
| **Unmanaged** | <a href="https://githubsfdeploy.herokuapp.com?owner=Flow-Scanner&repo=lightning-flow-scanner-app&ref=main"><img alt="Install Unmanaged Package" src="https://raw.githubusercontent.com/afawcett/githubsfdeploy/master/deploy.png"></a> |
| **Or via CLI** | `sf package install --package 04tgK000000E7ODQA0 --wait 10` |

> After installation, complete the [Post-Installation Setup](docs/installation.md) to configure the External Client App and assign permissions.

---

## Development

1) Clone this repository:

```sh
git clone https://github.com/Flow-Scanner/lightning-flow-scanner-app.git
```

2) Create a Scratch Org

```sh
sf org:create:scratch --definition-file config/project-scratch-def.json --alias FlowScanner --duration-days 7 --set-default --json
```

3) Push Source to Your Org:

```sh
sf project:deploy:start
```

4) Assign Permission Set

```sh
sf org assign permset --name Flow_Scanner
```

<p><strong>Want to help improve Lightning Flow Scanner? See our <a href="https://github.com/Flow-Scanner/lightning-flow-scanner?tab=contributing-ov-file">Contributing Guidelines</a></strong></p>
