ALTER TABLE public.cards ADD COLUMN IF NOT EXISTS traits text[] NOT NULL DEFAULT '{}'::text[];
CREATE INDEX IF NOT EXISTS cards_traits_gin ON public.cards USING GIN (traits);