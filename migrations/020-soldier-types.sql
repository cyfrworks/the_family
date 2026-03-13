-- Add soldier_type and soldier_config columns to members table
ALTER TABLE public.members ADD COLUMN soldier_type text NOT NULL DEFAULT 'default'
  CHECK (soldier_type IN ('default', 'external'));
ALTER TABLE public.members ADD COLUMN soldier_config jsonb DEFAULT '{}';
