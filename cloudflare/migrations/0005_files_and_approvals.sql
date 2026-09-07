-- Phase 7: private shared files, deliverable version history, and auditable approvals.
create table if not exists project_files (
  id text primary key,
  project_id text not null references projects(id) on delete cascade,
  deliverable_id text references deliverables(id) on delete set null,
  storage_path text not null unique,
  file_name text not null,
  mime_type text not null,
  size_bytes integer not null check (size_bytes between 1 and 26214400),
  version integer not null default 1,
  uploaded_by text not null references users(id),
  created_at text not null default current_timestamp
);

create table if not exists deliverable_approvals (
  id text primary key,
  project_id text not null references projects(id) on delete cascade,
  deliverable_id text not null references deliverables(id) on delete cascade,
  decision text not null check (decision in ('approved', 'changes_requested')),
  note text,
  typed_signature text,
  decided_by text not null references users(id),
  created_at text not null default current_timestamp
);

create index if not exists project_files_project_idx on project_files(project_id, created_at desc);
create index if not exists project_files_deliverable_idx on project_files(deliverable_id, version desc);
create index if not exists approvals_deliverable_idx on deliverable_approvals(deliverable_id, created_at desc);
