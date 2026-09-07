alter table project_updates add column attachment_file_id text references project_files(id) on delete set null;
alter table project_updates add column scheduled_at text;
alter table deliverables add column approver_id text references users(id) on delete set null;
create index if not exists updates_schedule_idx on project_updates(project_id,scheduled_at);
