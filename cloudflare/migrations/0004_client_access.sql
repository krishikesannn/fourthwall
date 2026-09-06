-- Client access codes are salted and hashed independently from passwords.
-- Codes are scoped to one project, allowing a single client email to belong to
-- more than one project without broadening access.
create table if not exists project_access_codes (
  project_id text not null references projects(id) on delete cascade,
  user_id text not null references users(id) on delete cascade,
  access_salt text not null,
  access_hash text not null,
  created_at text not null default current_timestamp,
  rotated_at text,
  primary key (project_id, user_id)
);

create index if not exists project_access_codes_user_idx on project_access_codes(user_id, project_id);
