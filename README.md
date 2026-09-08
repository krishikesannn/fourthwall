# The Fourth Wall

The Fourth Wall is an editorial branding and digital studio platform: a public site, client portal, studio workspace, and Android app.

## Current foundation

Phase 0 and Phase 1 establish repository hygiene and the Supabase schema. The current static site and prototype PWA remain runnable while the production app is rebuilt in later phases.

## Local preview

Run `npm start`, then open `http://localhost:3000`. The prototype PWA lives at `/pwa/index.html`.

## Configuration

Copy `.env.example` to `.env` and fill only the keys required by the phase you are running. Never commit `.env` files or service-role keys.

Production integrations use Razorpay Payment Links, Dropbox Sign signature requests, and Google Calendar events. Configure their values as encrypted Cloudflare Worker secrets. Point the Razorpay `payment_link.paid` webhook at `/api/webhooks/razorpay`, share the target Google Calendar with the service-account email, and leave `DROPBOX_SIGN_TEST_MODE=true` until legally binding Dropbox Sign API access is active.

## Database

Supabase migrations are in `supabase/migrations/`. Apply them through the Supabase CLI or dashboard after a Supabase project is created.
