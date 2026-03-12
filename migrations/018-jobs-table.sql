-- 018-jobs-table.sql
-- Persisted workflow definitions for caporegime mechanical execution

CREATE TABLE public.jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  caporegime_id uuid NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  steps jsonb NOT NULL,
  schedule text,              -- cron expression (null = manual only)
  schedule_id text,           -- CYFR schedule ID for pause/resume/delete
  sit_down_id uuid REFERENCES public.sit_downs(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active','paused','archived')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- RLS
ALTER TABLE public.jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own jobs"
  ON public.jobs FOR SELECT
  USING (owner_id = auth.uid());

CREATE POLICY "Users can insert own jobs"
  ON public.jobs FOR INSERT
  WITH CHECK (owner_id = auth.uid());

CREATE POLICY "Users can update own jobs"
  ON public.jobs FOR UPDATE
  USING (owner_id = auth.uid());

CREATE POLICY "Users can delete own jobs"
  ON public.jobs FOR DELETE
  USING (owner_id = auth.uid());

CREATE POLICY "Service role full access on jobs"
  ON public.jobs FOR ALL
  USING (auth.role() = 'service_role');

CREATE INDEX idx_jobs_caporegime ON public.jobs (caporegime_id, status);
CREATE INDEX idx_jobs_owner ON public.jobs (owner_id);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION public.update_job_timestamp()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER jobs_updated_at
  BEFORE UPDATE ON public.jobs
  FOR EACH ROW
  EXECUTE FUNCTION public.update_job_timestamp();
