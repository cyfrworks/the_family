-- The Family — Tiers & Model Catalog Migration
-- Run this in the Supabase SQL editor to upgrade an existing deployment.

BEGIN;

-- ============================================
-- 1. Add tier to profiles
-- ============================================
ALTER TABLE public.profiles ADD COLUMN tier text NOT NULL DEFAULT 'associate'
  CHECK (tier IN ('godfather', 'boss', 'associate'));

-- Godfather can update any profile (for tier management)
CREATE POLICY "Godfathers can update any profile"
  ON public.profiles FOR UPDATE
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = (SELECT auth.uid()) AND tier = 'godfather'));

-- ============================================
-- 2. Create model_catalog table
-- ============================================
CREATE TABLE public.model_catalog (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL,
  alias text NOT NULL,
  model text NOT NULL,
  min_tier text NOT NULL DEFAULT 'associate' CHECK (min_tier IN ('boss', 'associate')),
  is_active boolean NOT NULL DEFAULT true,
  sort_order int NOT NULL DEFAULT 0,
  added_by uuid NOT NULL REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider, alias)
);

ALTER TABLE public.model_catalog ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view catalog for their tier"
  ON public.model_catalog FOR SELECT
  USING (
    is_active = true AND (
      min_tier = 'associate'
      OR (min_tier = 'boss' AND EXISTS (
        SELECT 1 FROM public.profiles WHERE id = (SELECT auth.uid()) AND tier IN ('godfather', 'boss')
      ))
    )
  );

CREATE POLICY "Godfathers can view all catalog entries"
  ON public.model_catalog FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = (SELECT auth.uid()) AND tier = 'godfather'));

CREATE POLICY "Godfathers can insert catalog entries"
  ON public.model_catalog FOR INSERT
  WITH CHECK (
    added_by = (SELECT auth.uid())
    AND EXISTS (SELECT 1 FROM public.profiles WHERE id = (SELECT auth.uid()) AND tier = 'godfather')
  );

CREATE POLICY "Godfathers can update catalog entries"
  ON public.model_catalog FOR UPDATE
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = (SELECT auth.uid()) AND tier = 'godfather'));

CREATE POLICY "Godfathers can delete catalog entries"
  ON public.model_catalog FOR DELETE
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = (SELECT auth.uid()) AND tier = 'godfather'));

-- ============================================
-- 3. Drop RLS policies that reference columns we're about to remove
-- ============================================
DROP POLICY IF EXISTS "Users can view own members and templates" ON public.members;
DROP POLICY IF EXISTS "Users can update own members" ON public.members;
DROP POLICY IF EXISTS "Users can delete own members" ON public.members;

-- ============================================
-- 4. Delete all existing members (templates + custom)
-- ============================================
DELETE FROM public.members;

-- ============================================
-- 5. Drop old columns, add catalog FK
-- ============================================
ALTER TABLE public.members DROP COLUMN provider;
ALTER TABLE public.members DROP COLUMN model;
ALTER TABLE public.members DROP COLUMN is_template;
ALTER TABLE public.members DROP COLUMN template_slug;
ALTER TABLE public.members ADD COLUMN catalog_model_id uuid NOT NULL REFERENCES public.model_catalog(id);

-- ============================================
-- 6. Recreate member RLS policies (without is_template)
-- ============================================
CREATE POLICY "Users can view own members"
  ON public.members FOR SELECT
  USING (owner_id = (SELECT auth.uid()));

CREATE POLICY "Users can update own members"
  ON public.members FOR UPDATE
  USING (owner_id = (SELECT auth.uid()));

CREATE POLICY "Users can delete own members"
  ON public.members FOR DELETE
  USING (owner_id = (SELECT auth.uid()));

COMMIT;
