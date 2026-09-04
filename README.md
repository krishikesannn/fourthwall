# The Fourth Wall

The Fourth Wall is an editorial branding and digital studio platform: a public site, client portal, studio workspace, and Android app.

## Current foundation

Phase 0 and Phase 1 establish repository hygiene and the Supabase schema. The current static site and prototype PWA remain runnable while the production app is rebuilt in later phases.

## Local preview

Run `npm start`, then open `http://localhost:3000`. The prototype PWA lives at `/pwa/index.html`.

## Configuration

Copy `.env.example` to `.env` and fill only the keys required by the phase you are running. Never commit `.env` files or service-role keys.

## Database

Supabase migrations are in `supabase/migrations/`. Apply them through the Supabase CLI or dashboard after a Supabase project is created.
