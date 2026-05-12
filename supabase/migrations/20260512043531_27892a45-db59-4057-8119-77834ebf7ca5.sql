CREATE TYPE public.match_result AS ENUM ('win','loss','draw');
CREATE TYPE public.match_event AS ENUM ('friendly','shop','official');
CREATE TYPE public.tcg_game AS ENUM ('optcg','ptcg','dtcg');

CREATE TABLE public.matches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  played_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  game public.tcg_game NOT NULL,
  event public.match_event NOT NULL DEFAULT 'friendly',
  my_deck TEXT NOT NULL,
  opp_deck TEXT,
  opp_leader TEXT,
  went_first BOOLEAN NOT NULL DEFAULT true,
  result public.match_result NOT NULL,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX matches_user_played_idx ON public.matches (user_id, played_at DESC);

ALTER TABLE public.matches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own select" ON public.matches FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "own insert" ON public.matches FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own update" ON public.matches FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "own delete" ON public.matches FOR DELETE USING (auth.uid() = user_id);