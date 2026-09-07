# Phase 2: Cloudflare authentication foundation

The free deployment path uses Cloudflare Pages for the PWA and Worker, D1 for relational data, and server-side opaque sessions. Credentials are PBKDF2-hashed with a unique salt at 50,000 iterations, which stays within Cloudflare Workers Free request CPU limits; browser clients receive only an HTTP-only, secure, same-site session cookie.

## One-time setup

1. Create a D1 database named `the-fourth-wall` and put its ID in `cloudflare/wrangler.toml` locally (do not commit a production ID if the repository is public).
2. Set `BOOTSTRAP_SECRET` using `wrangler secret put BOOTSTRAP_SECRET`.
3. Apply `cloudflare/migrations/0001_auth.sql` with `wrangler d1 migrations apply the-fourth-wall --remote`.
4. Call `POST /api/auth/bootstrap` exactly once, with the bootstrap secret, to create the studio owner.

The bootstrap route is unavailable after the first user exists. Never put the bootstrap secret in the PWA or Android client.

## Inquiry email notifications

The Worker saves every valid inquiry to D1 first, then sends a best-effort notification through Resend. To activate it, verify a sending domain in Resend and add these Cloudflare Worker secrets:

1. `RESEND_API_KEY` — a Resend API key with sending permission.
2. `INQUIRY_NOTIFICATION_TO` — `thefourthwall04.co@gmail.com`.
3. `INQUIRY_FROM_EMAIL` — for example `The Fourth Wall <inquiries@your-verified-domain.com>`.

The sender domain must be verified by Resend. The email's Reply-To address is automatically set to the person who submitted the inquiry.
