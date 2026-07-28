ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS target_country TEXT;

UPDATE public.profiles
SET target_country = NULLIF(COALESCE(target_countries[1], ''), '')
WHERE target_country IS NULL;

ALTER TABLE public.profiles ALTER COLUMN target_tier TYPE TEXT USING target_tier::text;