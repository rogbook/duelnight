
-- 1. roles
CREATE TYPE public.app_role AS ENUM ('admin', 'moderator', 'user');

CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  role app_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "roles select own" ON public.user_roles
  FOR SELECT USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role
  )
$$;

-- 2. tier lists
CREATE TABLE public.tier_lists (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  game tcg_game NOT NULL DEFAULT 'optcg',
  title text NOT NULL,
  is_public boolean NOT NULL DEFAULT true,
  placements jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.tier_lists ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tier_lists select public or own" ON public.tier_lists
  FOR SELECT USING (is_public OR auth.uid() = user_id);
CREATE POLICY "tier_lists insert own" ON public.tier_lists
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "tier_lists update own" ON public.tier_lists
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "tier_lists delete own" ON public.tier_lists
  FOR DELETE USING (auth.uid() = user_id);

CREATE TRIGGER trg_tier_lists_touch
BEFORE UPDATE ON public.tier_lists
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- 3. announcements
CREATE TABLE public.announcements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  author_id uuid NOT NULL,
  title text NOT NULL,
  body text NOT NULL,
  pinned boolean NOT NULL DEFAULT false,
  view_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.announcements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ann readable by all" ON public.announcements
  FOR SELECT USING (true);
CREATE POLICY "ann insert admin" ON public.announcements
  FOR INSERT WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "ann update admin" ON public.announcements
  FOR UPDATE USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "ann delete admin" ON public.announcements
  FOR DELETE USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER trg_ann_touch
BEFORE UPDATE ON public.announcements
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE OR REPLACE FUNCTION public.increment_announcement_views(_id uuid)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE public.announcements SET view_count = view_count + 1 WHERE id = _id;
$$;
