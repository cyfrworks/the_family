-- 014-member-roles.sql
-- Expand the family hierarchy: consul (renamed from 'ai'), caporegime, soldier, bookkeeper
-- Plus operations tracking and bookkeeper knowledge store

-- 1. Migrate existing 'ai' members to 'consul'
UPDATE public.members SET member_type = 'consul' WHERE member_type = 'ai';

-- 2. Add member_type constraint
ALTER TABLE public.members ADD CONSTRAINT member_type_check
  CHECK (member_type IN ('consul','informant','caporegime','soldier','bookkeeper'));

-- 3. Soldier → Caporegime relationship
ALTER TABLE public.members ADD COLUMN caporegime_id uuid
  REFERENCES public.members(id) ON DELETE CASCADE;

-- 4. Operations table — tracks Caporegime agentic runs
CREATE TABLE public.operations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id uuid NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  sit_down_id uuid REFERENCES public.sit_downs(id) ON DELETE SET NULL,
  trigger_message_id uuid REFERENCES public.messages(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'running'
    CHECK (status IN ('running','completed','failed')),
  task_summary text,
  result_content text,
  turns_used int DEFAULT 0,
  tool_calls jsonb DEFAULT '[]',
  usage jsonb DEFAULT '{}',
  cron_job_id text,
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

-- RLS for operations
ALTER TABLE public.operations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own operations"
  ON public.operations FOR SELECT
  USING (owner_id = auth.uid());

CREATE POLICY "Users can insert own operations"
  ON public.operations FOR INSERT
  WITH CHECK (owner_id = auth.uid());

CREATE POLICY "Users can update own operations"
  ON public.operations FOR UPDATE
  USING (owner_id = auth.uid());

-- Service role can do everything (for cron-triggered operations)
CREATE POLICY "Service role full access on operations"
  ON public.operations FOR ALL
  USING (auth.role() = 'service_role');

CREATE INDEX idx_operations_owner_started ON public.operations (owner_id, started_at DESC);
CREATE INDEX idx_operations_member ON public.operations (member_id);
CREATE INDEX idx_operations_status ON public.operations (status) WHERE status = 'running';

-- Add to realtime publication
ALTER PUBLICATION supabase_realtime ADD TABLE public.operations;

-- 5. Bookkeeper entries table — per-bookkeeper knowledge store
CREATE TABLE public.bookkeeper_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bookkeeper_id uuid NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title text NOT NULL,
  content text NOT NULL,
  tags text[] DEFAULT '{}',
  source_member_id uuid REFERENCES public.members(id) ON DELETE SET NULL,
  source_operation_id uuid REFERENCES public.operations(id) ON DELETE SET NULL,
  metadata jsonb DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- RLS for bookkeeper_entries
ALTER TABLE public.bookkeeper_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own bookkeeper entries"
  ON public.bookkeeper_entries FOR SELECT
  USING (owner_id = auth.uid());

CREATE POLICY "Users can insert own bookkeeper entries"
  ON public.bookkeeper_entries FOR INSERT
  WITH CHECK (owner_id = auth.uid());

CREATE POLICY "Users can update own bookkeeper entries"
  ON public.bookkeeper_entries FOR UPDATE
  USING (owner_id = auth.uid());

CREATE POLICY "Users can delete own bookkeeper entries"
  ON public.bookkeeper_entries FOR DELETE
  USING (owner_id = auth.uid());

CREATE POLICY "Service role full access on bookkeeper_entries"
  ON public.bookkeeper_entries FOR ALL
  USING (auth.role() = 'service_role');

-- GIN index on tags for array containment queries
CREATE INDEX idx_bookkeeper_entries_tags ON public.bookkeeper_entries USING GIN (tags);

-- Full-text search index
CREATE INDEX idx_bookkeeper_entries_fts ON public.bookkeeper_entries
  USING GIN (to_tsvector('english', title || ' ' || content));

CREATE INDEX idx_bookkeeper_entries_bookkeeper ON public.bookkeeper_entries (bookkeeper_id, created_at DESC);

ALTER PUBLICATION supabase_realtime ADD TABLE public.bookkeeper_entries;

-- 6. Auto-update updated_at on bookkeeper_entries
CREATE OR REPLACE FUNCTION public.update_bookkeeper_entry_timestamp()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER bookkeeper_entries_updated_at
  BEFORE UPDATE ON public.bookkeeper_entries
  FOR EACH ROW
  EXECUTE FUNCTION public.update_bookkeeper_entry_timestamp();

-- 7. Full-text search RPC for bookkeeper entries
CREATE OR REPLACE FUNCTION public.search_bookkeeper_entries(
  p_bookkeeper_id uuid,
  p_owner_id uuid,
  p_query text
)
RETURNS SETOF public.bookkeeper_entries
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT *
  FROM public.bookkeeper_entries
  WHERE bookkeeper_id = p_bookkeeper_id
    AND owner_id = p_owner_id
    AND (
      to_tsvector('english', title || ' ' || content) @@ plainto_tsquery('english', p_query)
      OR title ILIKE '%' || p_query || '%'
      OR content ILIKE '%' || p_query || '%'
    )
  ORDER BY
    ts_rank(to_tsvector('english', title || ' ' || content), plainto_tsquery('english', p_query)) DESC,
    created_at DESC
  LIMIT 50;
$$;
