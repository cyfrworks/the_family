ALTER TABLE public.members ALTER COLUMN catalog_model_id DROP NOT NULL;
ALTER TABLE public.members DROP CONSTRAINT members_catalog_model_id_fkey;
ALTER TABLE public.members ADD CONSTRAINT members_catalog_model_id_fkey
  FOREIGN KEY (catalog_model_id) REFERENCES public.model_catalog(id) ON DELETE SET NULL;
