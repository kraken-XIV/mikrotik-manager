# Security hardening after Phase 2

This review addresses the known dependency alerts and CodeQL findings; it is not a claim that software has no unknown vulnerabilities.

## Fixed behavior

- Alert email escapes message, device name, details and labels before embedding them in HTML. SMTP certificate validation is mandatory; configure an appropriate trust store (for example `NODE_EXTRA_CA_CERTS`) for a private CA rather than disabling validation.
- HTTP error logs use a fixed format string and control-character-safe arguments.
- Secret generation uses unbiased `crypto.randomInt`; invalid or excessive lengths are rejected.
- Helmet's CSP defaults are enabled. CORS requires an exact HTTP(S) origin allowlist; wildcards and origins containing credentials or paths are rejected. Production still requires `CORS_ORIGIN`. Development/test defaults allow only named local origins.
- API-SSL refuses to send a login when no identity verifier is registered, and refuses a changed certificate before sending credentials. Normal application startup installs the persistent certificate/managed-CA verifier.
- The WebFig HTTPS conversion probe checks the SHA-256 certificate fingerprint read over the authenticated device connection before disabling plain HTTP. If a router does not expose a valid SHA-256 fingerprint, conversion fails safely and explains that HTTP was left on. This prevents an unrelated HTTPS responder from satisfying the probe.
- Legacy RouterOS challenge-response login is supported only inside identity-verified API-SSL; it no longer requires upgrading solely to meet a 6.43 version cutoff. The legacy MD5 digest is a wire-protocol requirement, not a stored password hash or an approved general-purpose authentication mechanism. A credential-free probe handles both legacy challenge forms; plaintext legacy login is refused before sending credentials. Modern RouterOS login remains supported. Keep routers on supported firmware where possible.
- Anonymous and unknown-role users are not offered write controls. Server-side authorization remains authoritative.
- Certificate upload requires bounded string inputs, a parseable certificate and a matching private key. Upload paths are fixed server constants, never request-selected.

## Dependency remediation

Patch/minor dependency updates and tested transitive overrides remove the known vulnerable versions, including Handlebars, Vitest/mocker, YAML parsing, selectors and the docs theme. The YAML override eliminates the legacy `sprintf-js` chain instead of pretending an unavailable patched sprintf release exists. The selectors override avoids an unnecessary Tailwind major migration; CSS checks and the actual frontend build validate compatibility.

### Temporary braces mitigation — upstream advisory remains applicable by version

As of 2026-10-19, GHSA-vfj7-8cjw-p6xm has **no patched upstream release**: braces 3.0.3 is still latest. It is a transitive development dependency, not a production server dependency.

`backend/scripts/harden-braces.cjs` is a deterministic, fail-closed install-time mitigation. Both package postinstall scripts run it, including in container builds. It verifies the expected package version/source shape, adds 128-level bounds to the parser and recursive compile/expand/stringify walkers, and tests ordinary expansion plus deeply nested strings and caller-built ASTs. A parser-shape/version change requires human review, not silent continuation. Production installs omit this dev-only package and skip absent dev entries.

The lockfile deliberately retains the honest upstream package name/version/integrity. **npm audit may therefore continue to report the unpatched upstream development advisory and its parent chains.** The local mitigation is not an upstream release, not an audit allowlist, and not a reason to claim a clean dependency audit. Remove the mitigation only when a maintained patched release is available and the same regression tests pass.

## CodeQL triage boundaries

Real findings above are fixed in code. Remaining scanner findings must be reviewed against these concrete controls, not dismissed just because they existed upstream:

- RouterOS API TLS uses mandatory identity pinning/managed-CA verification _before credentials_, because devices can legitimately use private/self-signed certificates. Disabling public-CA validation alone is not the trust decision; regression tests prove a missing/refusing verifier sends no login.
- The WebFig health probe sends no credentials and accepts only the authenticated device's SHA-256 pin. Wrong/missing fingerprints are rejected by a real local HTTPS-server test.
- Certificate upload is deliberately an authenticated administrator's validated certificate/key write to fixed mounted certificate paths. Request-selected filesystem paths are not accepted.
- The OIDC provider-error branch rejects login and returns without issuing a session; attacker control of an error indicator cannot grant authentication.
- Wireless passphrase/authentication parameters select configuration operations, not permission to invoke them. API authentication/write authorization precedes the collector; shared profiles are not changed when a key is absent.

Any false-positive disposition must identify the exact rule/location, these controls and their test evidence. Keep actual risks and upstream-version advisories visible; do not add broad CodeQL query exclusions or weaken required checks to obtain a green status.
