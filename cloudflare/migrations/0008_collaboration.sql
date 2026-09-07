create table if not exists milestones (
 id text primary key, project_id text not null references projects(id) on delete cascade,
 title text not null, due_date text, status text not null default 'upcoming' check(status in ('upcoming','active','complete')),
 waiting_on text check(waiting_on in ('client','studio')), created_by text not null references users(id), created_at text not null default current_timestamp
);
create table if not exists project_tasks (
 id text primary key, project_id text not null references projects(id) on delete cascade,
 title text not null, assignee_id text references users(id), due_date text, status text not null default 'todo' check(status in ('todo','doing','done')),
 waiting_on_client integer not null default 0 check(waiting_on_client in(0,1)), created_by text not null references users(id), created_at text not null default current_timestamp
);
create table if not exists project_messages (
 id text primary key, project_id text not null references projects(id) on delete cascade,
 body text not null, file_id text references project_files(id) on delete set null, sender_id text not null references users(id), created_at text not null default current_timestamp
);
create table if not exists message_reads (
 message_id text not null references project_messages(id) on delete cascade, user_id text not null references users(id) on delete cascade,
 read_at text not null default current_timestamp, primary key(message_id,user_id)
);
create table if not exists moodboards (
 id text primary key, project_id text not null references projects(id) on delete cascade, title text not null,
 file_id text references project_files(id) on delete set null, note text, created_by text not null references users(id), created_at text not null default current_timestamp
);
create table if not exists moodboard_reactions (
 moodboard_id text not null references moodboards(id) on delete cascade, user_id text not null references users(id) on delete cascade,
 reaction text not null check(reaction in ('love','consider','pass')), created_at text not null default current_timestamp, primary key(moodboard_id,user_id)
);
create index if not exists milestones_project_idx on milestones(project_id,due_date);
create index if not exists tasks_project_idx on project_tasks(project_id,status,due_date);
create index if not exists messages_project_idx on project_messages(project_id,created_at desc);
create index if not exists moodboards_project_idx on moodboards(project_id,created_at desc);
