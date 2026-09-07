-- Phase 7 system foundations: auditability, expanded roles, and offline idempotency.
create table if not exists audit_events (
  id text primary key,
  actor_id text references users(id) on delete set null,
  project_id text references projects(id) on delete cascade,
  action text not null,
  entity_type text not null,
  entity_id text,
  details text,
  created_at text not null default current_timestamp
);

create table if not exists mutation_receipts (
  id text primary key,
  user_id text not null references users(id) on delete cascade,
  response_json text not null,
  created_at text not null default current_timestamp
);

create index if not exists audit_project_idx on audit_events(project_id,created_at desc);
create index if not exists audit_actor_idx on audit_events(actor_id,created_at desc);
create index if not exists mutation_receipts_created_idx on mutation_receipts(created_at);
