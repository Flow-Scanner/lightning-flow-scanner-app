# Security Policy for Lightning Flow Scanner

## Security Practices

- Code is open-source and peer-reviewed by the community.
- Vulnerabilities can be reported privately via GitHub security features.
- Changes to the repository are scanned and reviewed before merging.

## Reporting a Vulnerability

If you discover a security vulnerability, please report it using [GitHub vulnerability reporting](https://github.com/Flow-Scanner/lightning-flow-scanner-app/security).

## Data Handling

This project collects zero user data. No credentials, PII, payment info, or health data is ever stored, transmitted, or shared. All analysis runs 100% client-side with no network calls to any external services.

## Dependencies

We actively track and maintain an up-to-date inventory of all third-party dependencies to ensure security and compatibility. Our dependencies include:

- `lightning-flow-scanner-core` ([MIT license](https://github.com/Flow-Scanner/lightning-flow-scanner-core/blob/main/LICENSE.md)) – static analysis engine
- `jsforce` ([MIT license](https://github.com/jsforce/jsforce/blob/main/LICENSE)) – Salesforce API connector

These dependencies are packaged as static resources.
