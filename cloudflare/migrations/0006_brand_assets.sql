-- Phase 7: project-scoped, versioned brand asset catalogue.
create table if not exists brand_assets (
  id text primary key,
  project_id text not null references projects(id) on delete cascade,
  file_id text references project_files(id) on delete set null,
  kind text not null check (kind in ('logo','font','color','template')),
  name text not null,
  token_value text,
  version integer not null default 1,
  is_latest integer not null default 1 check (is_latest in (0,1)),
  archived_at text,
  created_by text not null references users(id),
  created_at text not null default current_timestamp
);

create index if not exists brand_assets_project_idx on brand_assets(project_id,is_latest,kind,created_at desc);
