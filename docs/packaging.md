# Packaging Notes

This project uses a small packaging toggle so the repo can stay developer-friendly in normal use and switch into Salesforce package mode only when needed.

## Files involved

- [`scripts/packaging.js`](../scripts/packaging.js) toggles packaging mode on and off
- [`docs/sfdx-project.packaging.json`](./sfdx-project.packaging.json) contains packaging-only project settings
- [`sfdx-project.json`](../sfdx-project.json) is the active Salesforce project file
- [`scripts/build-flow-scanner.js`](../scripts/build-flow-scanner.js) refreshes the bundled core static resource before packaging, if needed

## Typical flow

1. Optionally refresh the bundled core build:

```sh
node scripts/build-flow-scanner.js
```

To build a specific tagged core version:

```sh
node scripts/build-flow-scanner.js <version>
```

2. Update release metadata in [`docs/sfdx-project.packaging.json`](./sfdx-project.packaging.json):

- `versionName`
- `versionNumber`
- `versionDescription`

3. Prepare the repo for packaging:

```sh
npm run pkg:prepare
```

This does two things:
- backs up the current `sfdx-project.json` to `sfdx-project.base.json`
- writes a packaging-ready `sfdx-project.json`

4. Create the package version with the Salesforce CLI from an authenticated Dev Hub that owns the package:

```sh
sf package version create --package flow-scanner --installation-key-bypass --code-coverage --wait 30 --target-dev-hub <dev-hub-alias>
```

Notes:
- use a real Dev Hub alias in place of `<dev-hub-alias>`
- packaging will fail if the authenticated Dev Hub does not own the package
- the namespace is defined by the packaging org
5. Inspect the created version and record the resulting subscriber package version id as needed:

```sh
sf package version list --packages flow-scanner --target-dev-hub <dev-hub-alias>
```

6. Restore the normal project file after packaging:

```sh
npm run pkg:restore
```

## Safety notes

- Do not commit `sfdx-project.base.json`; it is a temporary local backup created by `pkg:prepare`.
- If packaging fails midway, restore first before trying again:

```sh
npm run pkg:restore
```

## Namespace note

The package namespace in this repo is `lfscanner` as defined in [`docs/sfdx-project.packaging.json`](./sfdx-project.packaging.json).
