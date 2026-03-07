-- Add sit_downs table to realtime publication so INSERT/DELETE events propagate
alter publication supabase_realtime add table public.sit_downs;
