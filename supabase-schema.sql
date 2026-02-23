-- Run in Supabase SQL Editor

create extension if not exists pgcrypto;

create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null,
  category text not null,
  url text not null,
  description text not null,
  image_url text,
  created_at timestamptz not null default now()
);

create table if not exists public.contact_settings (
  id int primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  email text not null,
  whatsapp text,
  linkedin text,
  instagram text,
  tiktok text,
  updated_at timestamptz not null default now(),
  constraint contact_singleton check (id = 1)
);

alter table public.projects enable row level security;
alter table public.contact_settings enable row level security;

-- Public read for portfolio page
drop policy if exists "Public can read projects" on public.projects;
create policy "Public can read projects"
on public.projects for select
using (true);

drop policy if exists "Public can read contact settings" on public.contact_settings;
create policy "Public can read contact settings"
on public.contact_settings for select
using (true);

-- Admin write permissions (must be authenticated)
drop policy if exists "Owner can insert projects" on public.projects;
create policy "Owner can insert projects"
on public.projects for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists "Owner can update projects" on public.projects;
create policy "Owner can update projects"
on public.projects for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Owner can delete projects" on public.projects;
create policy "Owner can delete projects"
on public.projects for delete
to authenticated
using (auth.uid() = user_id);

drop policy if exists "Owner can insert contact settings" on public.contact_settings;
create policy "Owner can insert contact settings"
on public.contact_settings for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists "Owner can update contact settings" on public.contact_settings;
create policy "Owner can update contact settings"
on public.contact_settings for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

-- Storage bucket for project images
insert into storage.buckets (id, name, public)
values ('project-images', 'project-images', true)
on conflict (id) do nothing;

-- Public read for project images
drop policy if exists "Public can view project images" on storage.objects;
create policy "Public can view project images"
on storage.objects for select
using (bucket_id = 'project-images');

-- Authenticated users can upload/manage their own project images
drop policy if exists "Authenticated can upload project images" on storage.objects;
create policy "Authenticated can upload project images"
on storage.objects for insert
to authenticated
with check (bucket_id = 'project-images' and owner = auth.uid());

drop policy if exists "Authenticated can update project images" on storage.objects;
create policy "Authenticated can update project images"
on storage.objects for update
to authenticated
using (bucket_id = 'project-images' and owner = auth.uid())
with check (bucket_id = 'project-images' and owner = auth.uid());

drop policy if exists "Authenticated can delete project images" on storage.objects;
create policy "Authenticated can delete project images"
on storage.objects for delete
to authenticated
using (bucket_id = 'project-images' and owner = auth.uid());
