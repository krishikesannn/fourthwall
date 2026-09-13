# Phase 7 visual evidence

These captures show the local seeded application, not production provider transactions. They demonstrate layout at phone and desktop sizes; they do not prove authorization, synchronization, payment, signature, email delivery, or calendar integration.

| Screen | Capture |
| --- | --- |
| Login | [Phone](01-login-mobile.png) |
| Studio overview | [Desktop](02-studio-overview-desktop.png) |
| Lead pipeline | [Desktop](03-lead-pipeline-desktop.png) |
| Studio operations | [Desktop](04-studio-operations-desktop.png) |
| Studio branding | [Desktop](04b-studio-branding-desktop.png) |
| Analytics | [Desktop](04c-studio-analytics-desktop.png) |
| Project delivery | [Desktop](05-studio-project-delivery-desktop.png) |
| Review and calendar | [Desktop](06-review-and-calendar-desktop.png) |
| Commercial desk | [Desktop](07-commercial-desk-desktop.png) |
| Client project | [Phone](08-client-space-mobile.png) |
| Brand library | [Phone](08b-client-brand-library-mobile.png) |
| Client collaboration | [Phone](09-client-collaboration-mobile.png) |
| Client review and calendar | [Phone](10-client-review-calendar-mobile.png) |
| Client commercial | [Phone](11-client-commercial-mobile.png) |
| Brand guidelines | [Phone](12-client-guidelines-mobile.png) |
| Notification settings | [Phone](13-client-notifications-mobile.png) |

Capture script: `scripts/capture-phase7-screenshots.mjs`. It expects the static app on port 3000 and an isolated, migrated, seeded local API on port 8787. The local credentials in the script belong only to that fixture. Never apply `cloudflare/demo-seed.sql` to production. The script's local API override is accepted only on localhost/127.0.0.1 and only for a loopback API URL.

Remaining evidence needed includes provider-backed end-to-end transactions, offline replay under reconnect and failure, native biometric verification, and a requirement-by-requirement audit. These screenshots alone must not be used to mark Phase 7 complete.
