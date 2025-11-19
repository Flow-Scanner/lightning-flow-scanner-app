# Security Policy for Lightning Flow Scanner

## Security Practices

- Code is open-source and peer-reviewed by the community.
- Vulnerabilities can be reported privately via [GitHub vulnerability reporting](https://github.com/Flow-Scanner/lightning-flow-scanner-app/security).
- Changes to the repository are scanned and reviewed before merging.

## Data Handling

This tool collects zero user data. No credentials, PII, payment info, health data, or user content is ever stored, transmitted, or shared. All analysis runs 100% client-side with no network calls to external services.

We temporarily use metadata (e.g., Flow metadata, timestamps) in-memory only for real-time functionality during your session. This data is never stored, logged, or transmitted and is discarded immediately when the session ends.

**Note:** You may manually save scan results (e.g., reports, CSV, JSON) to your local filesystem. These files are created at your request and remain under your full control. This tool does not access, upload, or retain them.

## Dependencies

We actively track and maintain an up-to-date inventory of all third-party dependencies to ensure security and compatibility. Our dependencies include:

- `lightning-flow-scanner-core` ([MIT license](https://github.com/Flow-Scanner/lightning-flow-scanner-core/blob/main/LICENSE.md)) – static analysis engine

These dependencies are packaged as static resources.
