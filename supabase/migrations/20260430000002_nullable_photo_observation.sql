-- Make observation_id nullable on photos.
-- Photos taken during an inspection may not be linked to a specific observation
-- (e.g. general site shots taken before narrating). The mobile app stores these
-- with observation_id = NULL and we need to be able to sync them.
ALTER TABLE public.photos
  ALTER COLUMN observation_id DROP NOT NULL;
