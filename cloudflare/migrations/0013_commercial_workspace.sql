-- Phase 7 commercial workspace: invoices, proposals/e-sign and meeting booking.
create table if not exists invoices (
  id text primary key,
  project_id text not null references projects(id) on delete cascade,
  invoice_number text not null unique,
  currency text not null default 'INR',
  subtotal integer not null default 0,
  tax integer not null default 0,
  total integer not null default 0,
  status text not null default 'draft' check(status in ('draft','sent','paid','overdue','void')),
  source text not null default 'fixed' check(source in ('fixed','tracked_time')),
  payment_provider text,
  payment_link_id text unique,
  checkout_url text,
  due_date text,
  paid_at text,
  created_by text not null references users(id),
  created_at text not null default current_timestamp,
  updated_at text not null default current_timestamp
);
create table if not exists invoice_items (
  id text primary key,
  invoice_id text not null references invoices(id) on delete cascade,
  description text not null,
  quantity integer not null default 1,
  unit_amount integer not null,
  sort_order integer not null default 0
);
create table if not exists proposals (
  id text primary key,
  project_id text not null references projects(id) on delete cascade,
  title text not null,
  introduction text,
  currency text not null default 'INR',
  total integer not null default 0,
  status text not null default 'draft' check(status in ('draft','sent','signed','declined','void')),
  pdf_file_id text references project_files(id) on delete set null,
  signature_request_id text unique,
  signature_name text,
  signature_ip_hash text,
  signed_at text,
  created_by text not null references users(id),
  created_at text not null default current_timestamp,
  updated_at text not null default current_timestamp
);
create table if not exists proposal_blocks (
  id text primary key,
  proposal_id text not null references proposals(id) on delete cascade,
  title text not null,
  description text,
  amount integer not null default 0,
  sort_order integer not null default 0
);
create table if not exists meetings (
  id text primary key,
  project_id text not null references projects(id) on delete cascade,
  title text not null,
  starts_at text not null,
  duration_minutes integer not null default 30,
  status text not null default 'requested' check(status in ('requested','confirmed','cancelled','complete')),
  meeting_provider text,
  join_url text,
  calendar_event_id text,
  reminder_sent_at text,
  booked_by text not null references users(id),
  created_at text not null default current_timestamp,
  updated_at text not null default current_timestamp
);
create index if not exists invoices_project_idx on invoices(project_id,created_at desc);
create index if not exists proposals_project_idx on proposals(project_id,created_at desc);
create index if not exists meetings_project_idx on meetings(project_id,starts_at);
