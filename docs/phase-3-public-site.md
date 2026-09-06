# Phase 3: public website and inquiry capture

The public contact form now submits to `POST /api/inquiries`, which is implemented by the Cloudflare Worker and stored in D1. The same relative endpoint keeps the local Node preview working without changes.

The form includes a non-visible honeypot field to reject basic automated submissions. Before launch, configure a Cloudflare Pages route or Worker custom-domain route so `/api/*` reaches `the-fourth-wall-api` on the public site domain.
