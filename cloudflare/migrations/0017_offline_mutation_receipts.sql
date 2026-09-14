create table if not exists offline_mutation_receipts (
  id text not null,
  user_id text not null references users(id) on delete cascade,
  method text not null check(method in ('POST','PATCH')),
  path text not null,
  state text not null default 'pending' check(state in ('pending','complete')),
  response_status integer,
  response_body text,
  created_at text not null default current_timestamp,
  completed_at text,
  primary key(user_id,id)
);

create index if not exists idx_offline_mutation_receipts_created
  on offline_mutation_receipts(created_at);
