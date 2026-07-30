# Security Policy

OpenDraft is a local-first, serverless application. Because the application runs entirely within the user's browser, the security boundaries differ from traditional client-server web applications.

## Scope

The application does not host user data on centralized servers. Projects, source files, and compiled PDFs remain in the user's local `IndexedDB`.

- **CTAN Fetcher:** The application fetches packages from public CTAN mirrors.
- **Local folder access:** Reading or writing a folder requires an explicit browser permission grant.

## Reporting a Vulnerability

If you discover a vulnerability that compromises the local-first promise (e.g., unintended data exfiltration, XSS that escapes the CodeMirror editor to steal tokens, or unsafe handling of malicious `.tex` files that leads to remote code execution within the WASM sandbox), please DO NOT open a public issue.

Instead, use the repository's private vulnerability-reporting or security-advisory feature. If that feature is unavailable, contact a maintainer privately before disclosing technical details. Do not include project files, access tokens, or other sensitive data in the report.
