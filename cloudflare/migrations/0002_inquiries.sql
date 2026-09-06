create table if not exists inquiries (
  id text primary key,
  name text not null,
  email text not null,
  phone text,
  company text,
  service text,
  details text not null,
  source text not null default 'website',
  status text not null default 'new' check (status in ('new', 'contacted', 'qualified', 'closed')),
  created_at text not null default current_timestamp
);

create index if not exists inquiries_status_created_idx on inquiries(status, created_at desc);
