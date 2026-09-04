-- Phase 1: the production data foundation. Application access is restricted by RLS.
create type public.app_role as enum ('admin', 'studio_member', 'client');
create type public.inquiry_status as enum ('new', 'contacted', 'qualified', 'closed');
create type public.deliverable_status as enum ('draft', 'in_review', 'approved');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  role public.app_role not null default 'client',
  created_at timestamptz not null default now()
);
create table public.clients (
  id uuid primary key default gen_random_uuid(),
  studio_id uuid not null references public.profiles(id),
  name text not null,
  created_at timestamptz not null default now()
);
create table public.projects (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  name text not null, service text not null, status text not null default 'planning',
  progress smallint not null default 0 check (progress between 0 and 100), due_date date,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.project_members (
  project_id uuid references public.projects(id) on delete cascade,
  user_id uuid references public.profiles(id) on delete cascade,
  role public.app_role not null, primary key(project_id, user_id)
);
create table public.deliverables (
  id uuid primary key default gen_random_uuid(), project_id uuid not null references public.projects(id) on delete cascade,
  title text not null, status public.deliverable_status not null default 'draft',
  version integer not null default 1 check (version > 0), created_at timestamptz not null default now()
);
create table public.project_updates (
  id uuid primary key default gen_random_uuid(), project_id uuid not null references public.projects(id) on delete cascade,
  author_id uuid not null references public.profiles(id), title text not null, body text not null,
  client_visible boolean not null default true, created_at timestamptz not null default now()
);
create table public.inquiries (
  id uuid primary key default gen_random_uuid(), name text not null, email text not null, company text,
  service text, details text not null, source text not null default 'website',
  status public.inquiry_status not null default 'new', created_at timestamptz not null default now()
);
create table public.messages (
  id uuid primary key default gen_random_uuid(), project_id uuid not null references public.projects(id) on delete cascade,
  author_id uuid not null references public.profiles(id), body text not null check (char_length(body) between 1 and 4000),
  created_at timestamptz not null default now(), read_at timestamptz
);
create index projects_client_id_idx on public.projects(client_id);
create index project_members_user_id_idx on public.project_members(user_id);
create index deliverables_project_id_idx on public.deliverables(project_id);
create index project_updates_project_id_created_at_idx on public.project_updates(project_id, created_at desc);
create index messages_project_id_created_at_idx on public.messages(project_id, created_at desc);
create index inquiries_status_created_at_idx on public.inquiries(status, created_at desc);

alter table public.profiles enable row level security;
alter table public.clients enable row level security;
alter table public.projects enable row level security;
alter table public.project_members enable row level security;
alter table public.deliverables enable row level security;
alter table public.project_updates enable row level security;
alter table public.inquiries enable row level security;
alter table public.messages enable row level security;

-- Policy helpers are private, fixed-search-path functions. Public execution is revoked.
create schema if not exists private;
create function private.is_studio_user() returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.profiles where id = (select auth.uid()) and role in ('admin', 'studio_member'));
$$;
create function private.can_access_project(target_project_id uuid) returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.project_members where project_id = target_project_id and user_id = (select auth.uid()))
  or exists (select 1 from public.projects project join public.clients client on client.id = project.client_id
             where project.id = target_project_id and client.studio_id = (select auth.uid()));
$$;
create function private.can_manage_project(target_project_id uuid) returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.projects project join public.clients client on client.id = project.client_id
                 where project.id = target_project_id and client.studio_id = (select auth.uid()))
  or exists (select 1 from public.project_members where project_id = target_project_id and user_id = (select auth.uid()) and role in ('admin', 'studio_member'));
$$;
revoke all on schema private from public;
grant usage on schema private to authenticated;
revoke all on function private.is_studio_user() from public;
revoke all on function private.can_access_project(uuid) from public;
revoke all on function private.can_manage_project(uuid) from public;
grant execute on function private.is_studio_user() to authenticated;
grant execute on function private.can_access_project(uuid) to authenticated;
grant execute on function private.can_manage_project(uuid) to authenticated;
grant select on public.profiles, public.clients, public.projects, public.project_members, public.deliverables, public.project_updates, public.inquiries, public.messages to authenticated;
grant insert, update, delete on public.clients, public.projects, public.project_members, public.deliverables, public.project_updates, public.inquiries, public.messages to authenticated;

create policy "users read own profile" on public.profiles for select to authenticated using (id = (select auth.uid()));
create policy "studios manage their clients" on public.clients for all to authenticated using (studio_id = (select auth.uid()) and (select private.is_studio_user())) with check (studio_id = (select auth.uid()) and (select private.is_studio_user()));
create policy "members read their project client" on public.clients for select to authenticated using (exists (select 1 from public.projects project where project.client_id = clients.id and (select private.can_access_project(project.id))));
create policy "members read projects" on public.projects for select to authenticated using ((select private.can_access_project(id)));
create policy "studios create projects" on public.projects for insert to authenticated with check (exists (select 1 from public.clients client where client.id = client_id and client.studio_id = (select auth.uid()) and (select private.is_studio_user())));
create policy "studios manage projects" on public.projects for update to authenticated using ((select private.can_manage_project(id))) with check ((select private.can_manage_project(id)));
create policy "studios delete projects" on public.projects for delete to authenticated using ((select private.can_manage_project(id)));
create policy "members read project membership" on public.project_members for select to authenticated using ((select private.can_access_project(project_id)));
create policy "studios manage project membership" on public.project_members for all to authenticated using ((select private.can_manage_project(project_id))) with check ((select private.can_manage_project(project_id)));
create policy "members read deliverables" on public.deliverables for select to authenticated using ((select private.can_access_project(project_id)));
create policy "studios manage deliverables" on public.deliverables for all to authenticated using ((select private.can_manage_project(project_id))) with check ((select private.can_manage_project(project_id)));
create policy "members read allowed updates" on public.project_updates for select to authenticated using ((select private.can_access_project(project_id)) and (client_visible or (select private.can_manage_project(project_id))));
create policy "studios post updates" on public.project_updates for insert to authenticated with check ((select private.can_manage_project(project_id)) and author_id = (select auth.uid()));
create policy "authors update updates" on public.project_updates for update to authenticated using ((select private.can_manage_project(project_id)) and author_id = (select auth.uid())) with check ((select private.can_manage_project(project_id)) and author_id = (select auth.uid()));
create policy "authors delete updates" on public.project_updates for delete to authenticated using ((select private.can_manage_project(project_id)) and author_id = (select auth.uid()));
create policy "studio manages inquiries" on public.inquiries for all to authenticated using ((select private.is_studio_user())) with check ((select private.is_studio_user()));
create policy "members read messages" on public.messages for select to authenticated using ((select private.can_access_project(project_id)));
create policy "members send messages" on public.messages for insert to authenticated with check (author_id = (select auth.uid()) and (select private.can_access_project(project_id)));
