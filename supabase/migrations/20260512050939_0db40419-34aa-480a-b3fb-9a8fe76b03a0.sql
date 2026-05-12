create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text unique,
  display_name text,
  avatar_url text,
  bio text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "Profiles are viewable by everyone"
  on public.profiles for select using (true);
create policy "Users can insert own profile"
  on public.profiles for insert with check (auth.uid() = id);
create policy "Users can update own profile"
  on public.profiles for update using (auth.uid() = id);

create trigger profiles_touch_updated_at
  before update on public.profiles
  for each row execute function public.touch_updated_at();

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    coalesce(
      new.raw_user_meta_data->>'name',
      new.raw_user_meta_data->>'full_name',
      split_part(coalesce(new.email, ''), '@', 1)
    )
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

insert into public.profiles (id, display_name)
select u.id,
       coalesce(
         u.raw_user_meta_data->>'name',
         u.raw_user_meta_data->>'full_name',
         split_part(coalesce(u.email, ''), '@', 1)
       )
from auth.users u
on conflict (id) do nothing;

create table public.decks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  game tcg_game not null,
  name text not null,
  leader text,
  archetype text,
  notes text,
  is_public boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.decks enable row level security;

create policy "Public decks visible to all, own to owner"
  on public.decks for select using (is_public or auth.uid() = user_id);
create policy "Users can insert own decks"
  on public.decks for insert with check (auth.uid() = user_id);
create policy "Users can update own decks"
  on public.decks for update using (auth.uid() = user_id);
create policy "Users can delete own decks"
  on public.decks for delete using (auth.uid() = user_id);

create trigger decks_touch_updated_at
  before update on public.decks
  for each row execute function public.touch_updated_at();

create index decks_user_idx on public.decks(user_id);
create index decks_user_game_idx on public.decks(user_id, game);

alter table public.matches
  add column deck_id uuid references public.decks(id) on delete set null;

create index matches_deck_id_idx on public.matches(deck_id);
