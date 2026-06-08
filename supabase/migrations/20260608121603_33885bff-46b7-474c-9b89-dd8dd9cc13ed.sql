create table if not exists public.friend_favorites (
  user_id uuid not null references auth.users(id) on delete cascade,
  favorite_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, favorite_id)
);

grant select, insert, update, delete on public.friend_favorites to authenticated;
grant all on public.friend_favorites to service_role;

alter table public.friend_favorites enable row level security;

drop policy if exists "friend_favorites self" on public.friend_favorites;
create policy "friend_favorites self" on public.friend_favorites
  for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);