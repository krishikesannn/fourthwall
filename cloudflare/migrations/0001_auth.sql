-- Cloudflare D1 Phase 2: identity and server-side sessions.
create table if not exists users (
  id text primary key,
  email text not null unique collate nocase,
  display_name text not null,
  role text not null check (role in ('admin', 'studio_member', 'client')),
  password_salt text not null,
  password_hash text not null,
  created_at text not null default current_timestamp
);

create table if not exists sessions (
  id text primary key,
  user_id text not null references users(id) on delete cascade,
  token_hash text not null unique,
  expires_at text not null,
  created_at text not null default current_timestamp
);

create index if not exists sessions_user_id_idx on sessions(user_id);
create index if not exists sessions_expires_at_idx on sessions(expires_at);
