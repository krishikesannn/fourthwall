-- Phase 4: project delivery workspace. All project-facing data is scoped through
-- project_members so a client can never enumerate another client's work.
create table if not exists projects (
  id text primary key,
  name text not null,
  service text not null,
  status text not null default 'planning' check (status in ('planning', 'active', 'complete', 'on_hold')),
  due_date text,
  progress integer not null default 0 check (progress between 0 and 100),
  created_by text not null references users(id),
  created_at text not null default current_timestamp,
  updated_at text not null default current_timestamp
);

create table if not exists project_members (
  project_id text not null references projects(id) on delete cascade,
  user_id text not null references users(id) on delete cascade,
  role text not null check (role in ('owner', 'studio_member', 'client')),
  created_at text not null default current_timestamp,
  primary key (project_id, user_id)
);

create table if not exists deliverables (
  id text primary key,
  project_id text not null references projects(id) on delete cascade,
  title text not null,
  status text not null default 'draft' check (status in ('draft', 'in_review', 'approved')),
  sort_order integer not null default 0,
  approved_by text references users(id),
  approved_at text,
  created_at text not null default current_timestamp,
  updated_at text not null default current_timestamp
);

create table if not exists project_updates (
  id text primary key,
  project_id text not null references projects(id) on delete cascade,
  title text not null,
  body text not null,
  visible_to_client integer not null default 1 check (visible_to_client in (0,1)),
  requires_approval integer not null default 0 check (requires_approval in (0,1)),
  created_by text not null references users(id),
  created_at text not null default current_timestamp
);

create index if not exists project_members_user_idx on project_members(user_id, project_id);
create index if not exists deliverables_project_idx on deliverables(project_id, sort_order);
create index if not exists project_updates_project_idx on project_updates(project_id, created_at desc);
