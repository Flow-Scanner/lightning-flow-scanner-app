<p align="center">
  <a href="https://github.com/Flow-Scanner">
    <img src="https://raw.githubusercontent.com/Flow-Scanner/lightning-flow-scanner-core/main/media/bannerslim.png" style="width: 55%;" />
  </a>
</p>
<p align="center">Scans for unsafe contexts, hardcoded IDs, and other issues to optimize your Flows.</p>

[![Demo](media/lfsapp.gif)](https://github.com/Lightning-Flow-Scanner)

## Installation



## Using the Lightning Flow Scanner

1) Open the App Launcher:
- Click on the App Launcher icon in the top-left corner of your Salesforce interface.
- Search for "Flow Scanner" in the App Launcher search bar.
- Click on the "Flow Scanner" app to open it.

2) Scan a Flow:
- To scan a flow, click the "Scan" button next to the flow you want to analyze.

## Development

### Development Flow

1) Authorize Your Salesforce Org:
Authorize your Salesforce org to set up a connection between your local development environment and the Salesforce org:

```sh
sfdx force:auth:web:login -d -a <YourOrgAlias>
```

2) Install dependency

Install the Lightning Flow Scanner Component required for core functionality:

```sh
sfdx force:package:install --package 04tDn0000011NpvIAE --wait 10 -u <YourOrgAlias>
```

3) Push Source to Your Org:
Push the latest source to your og:

```sh
sfdx force:source:push
```

3) Pull Source from Your Org:
```sh
sfdx force:source:pull
```

If you'd like to help us enhance Flow Scanner, please consider having a look at the [Contributing Guidelines](https://github.com/Flow-Scanner/lightning-flow-scanner-core/blob/main/CONTRIBUTING.md).