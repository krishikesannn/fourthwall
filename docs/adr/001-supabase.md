# ADR 001: Supabase for the shared application backend

**Status:** Accepted

The product needs authentication, client-scoped data access, file storage, realtime updates, and a mobile-friendly API. We will use Supabase: Postgres for relational data, Auth for identity, Storage for files, Realtime where needed, and Row Level Security for per-project authorization.

This replaces the prototype file store and in-memory sessions. Browser and mobile clients will use only the anonymous key; service-role credentials remain server-only. Razorpay, DocuSign, and Google Calendar will be integrated through server-side functions in later phases.
