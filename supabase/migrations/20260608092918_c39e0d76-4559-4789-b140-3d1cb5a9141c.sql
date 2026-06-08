create table if not exists public.ai_unlimited (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  note       text,
  granted_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

grant select on public.ai_unlimited to authenticated;
grant all on public.ai_unlimited to service_role;

alter table public.ai_unlimited enable row level security;

drop policy if exists "ai_unlimited self read" on public.ai_unlimited;
create policy "ai_unlimited self read"
  on public.ai_unlimited
  for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "ai_unlimited admin all" on public.ai_unlimited;
create policy "ai_unlimited admin all"
  on public.ai_unlimited
  for all
  to authenticated
  using (public.has_role(auth.uid(), 'admin'::public.app_role))
  with check (public.has_role(auth.uid(), 'admin'::public.app_role));