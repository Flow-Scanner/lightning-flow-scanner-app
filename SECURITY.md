# Security Policy for Lightning Flow Scanner

## Security Practices

- Code is open-source and peer-reviewed by the community.
- Vulnerabilities can be reported privately via GitHub security features.
- Changes to the repository are scanned and reviewed before merging.

## Reporting a Vulnerability

If you discover a security vulnerability, please report it using [GitHub vulnerability reporting](https://github.com/Flow-Scanner/lightning-flow-scanner-app/security).

## Data Handling

Lightning Flow Scanner does **not** collect or store any user credentials, personal data, payment information, or health data. All analysis is done client-side and no customer data is shared with third parties.

## Dependencies

We maintain an inventory of third-party libraries included in the managed package:

- `lightning-flow-scanner-core` (MIT license) – static analysis engine
- `jsforce` (MIT license) – Salesforce API connector

These dependencies are packaged as static resources.