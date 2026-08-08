# Lightning Flow Scanner App — v3.3 Release Notes

## External Client App support (new default setup)

Salesforce is phasing out the creation of new Connected Apps in favor of **External Client Apps**. Starting with v3.3, the [post-installation setup](installation.md) uses an External Client App for the JWT authentication that powers Flow Scanner's Tooling API access. New installs should follow the updated instructions: create a self-signed certificate, create an External Client App with the JWT Bearer Flow enabled, and save its Consumer Key in the app.

**Already using a Connected App? You don't need to change anything.** Flow Scanner only stores a Consumer Key, and Salesforce accepts JWT authentication from Connected Apps and External Client Apps identically. Upgrading the package does not touch your existing Connected App, certificate, or stored key — everything keeps working. If you'd like to migrate anyway, a step-by-step guide (including instant rollback) is in the [installation guide](installation.md#existing-connected-app-setups).

## New in-app Setup tab

Setup no longer requires the Developer Console. The app now includes a **Setup** tab with a live checklist (permission set, certificate, Consumer Key), a field to save the Consumer Key directly, and a **Test Connection** button to verify JWT authentication end to end. On first run, the app lands on this tab automatically if authentication isn't configured yet.

## Beta rules (opt-in)

Beta rules from the scanner core now appear in the **Configuration** tab with a Beta badge. They're disabled by default and can be enabled per rule; a toolbar toggle shows or hides them in the list.

## Custom configurations — same files as the CLI and VS Code extension

The **Configuration** tab now understands the same configuration files the rest of the Flow Scanner family uses. If your team already keeps a `.flow-scanner` config in the repo for the CLI or the VS Code extension, that exact file now works in the app.

### Import a config file

Use **Load config** in the Configuration toolbar to import a `.flow-scanner.json` or `.flow-scanner.yml` file. Both formats the ecosystem produces are accepted — including the YAML files the VS Code extension's *Configure Scanner* command writes. The imported configuration is applied immediately, and open results are re-scanned on the spot.

Supported, with the same semantics as the scanner core:

- **Rule keys either way** — canonical rule ids (`excessive-cyclomatic-complexity`) or legacy names (`CyclomaticComplexity`).
- **Per-rule settings** — `severity`, `enabled` / `disabled`, and rule options such as `expression`, `threshold`, `message`, `messageUrl`.
- **Top-level scan options** — `threshold`, `categories`, `exceptions`, `ignoreFlows`, and related keys.
- **`ruleMode: "isolated"`** — only the rules named in the config run; everything else is deactivated, exactly as in the core engine.

The app validates severities against the scanner's real set (`error` / `warning` / `note`) and ignores anything else — a typo in a config file can no longer silently swallow scan results. Unparseable files are rejected with a clear message instead of being half-applied.

### Edit rule options in the app

Rules that expose options in the scanner core — such as the naming-convention `expression` or the complexity `threshold` — now show an inline editor in a new **Options** column on the Configuration tab. The editors are generated from the core's own rule metadata, so new configurable rules pick this up automatically with no app changes. An empty field means the core default applies (shown as the placeholder); type a value and press Enter (or click away) to apply it and re-scan.

This closes the gap with the VS Code extension's *Configure Scanner* flow: enable/disable, severity, and rule options can all be set directly in the app, or brought in from a shared config file.

Like all in-browser settings, imported configurations and option edits apply to the current session; org-wide defaults still come from the `ScanRuleConfiguration__mdt` Custom Metadata type.

## Other improvements

- Updated bundled scanner core.
- Cleaner UI: unified toolbars, tables, and footers across the Flows, Results, and Configuration tabs; the app now opens without the extra page header.
- Sortable columns everywhere, including a fix for the Results table freezing after sorting.
- Rule search in the Configuration tab.
