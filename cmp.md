# Lightning Flow Scanner Component

## Overview

The Lightning Flow Scanner Component integrates with Salesforce to scan flow metadata and display the results. Built using Lightning Web Components (LWC), this component leverages a core JavaScript module as a Static Resource to perform the scanning operations.

## Features

Displays scan results of a flow, including rule name, rule description, severity, violation details, data types, coordinates, and other relevant Flow Metadata information.

## Usage

After installing the package, you can add the LightningFlowScanner component to your Salesforce pages using the Lightning App Builder. Follow these steps:

1) Add the Component to a Page:

- Navigate to the Lightning App Builder in Salesforce.
- Drag and drop the LightningFlowScanner component onto your desired page.

2) Configure the Component:

- Set the required name and metadata attributes in the component's properties panel.

### Required Attributes

- name: The name of the flow to be scanned.
- metadata: The metadata of the flow in JSON format.

### Example Usage

```html
<lightning-flow-scanner name="{!v.flowName}" metadata="{!v.flowMetadata}"></lightning-flow-scanner>
```

## Installation

```sh
sfdx force:package:install --package 04tDn0000011NpvIAE --wait 10 -u <YourOrg>
```

## Development

### Development Flow

1) Authorize Your Salesforce Org:
   Authorize your Salesforce org to set up a connection between your local development environment and the Salesforce org:

```sh
sfdx force:auth:web:login -d -a <YourOrgAlias>
```

2) Push Source to Your Org:
   Push the latest source to your og:

```sh
sfdx force:source:push
```

3) Pull Source from Your Org:

```sh
sfdx force:source:pull
```

### Generating the static resource

To create a new or modified version of the static resource you need:

- Salesforce CLI
- Node.js
- Rollup to compile the core module

 Now you can generate the UMD JavaScript module:

```sh
   git clone https://github.com/Lightning-Flow-Scanner/lightning-flow-scanner-core.git
   cd lightning-flow-scanner-core
   npx rollup -c rollup.config.js
```
