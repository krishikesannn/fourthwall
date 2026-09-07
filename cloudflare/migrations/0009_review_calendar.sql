create table if not exists design_comments (
 id text primary key, project_id text not null references projects(id) on delete cascade,
 file_id text not null references project_files(id) on delete cascade, parent_id text references design_comments(id) on delete cascade,
 page_number integer not null default 1, pin_x real, pin_y real, body text not null,
 resolved_at text, resolved_by text references users(id), created_by text not null references users(id), created_at text not null default current_timestamp
);
create table if not exists content_posts (
 id text primary key, project_id text not null references projects(id) on delete cascade,
 title text not null, channel text not null, publish_at text not null, caption text,
 status text not null default 'draft' check(status in('draft','in_review','approved','scheduled','published','changes_requested')),
 created_by text not null references users(id), created_at text not null default current_timestamp, updated_at text not null default current_timestamp
);
create table if not exists content_feedback (
 id text primary key, post_id text not null references content_posts(id) on delete cascade,
 decision text check(decision in('approved','changes_requested')), comment text,
 created_by text not null references users(id), created_at text not null default current_timestamp
);
create index if not exists design_comments_file_idx on design_comments(file_id,page_number,created_at);
create index if not exists content_posts_project_date_idx on content_posts(project_id,publish_at);
create index if not exists content_feedback_post_idx on content_feedback(post_id,created_at desc);
