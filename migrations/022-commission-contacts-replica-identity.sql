-- Fix: Supabase realtime DELETE events on commission_contacts don't include
-- user_id/contact_user_id columns by default, so filtered subscriptions
-- (user_id=eq.X) never fire for the other Don when a contact is removed.
-- REPLICA IDENTITY FULL makes DELETE events include all column data.
ALTER TABLE public.commission_contacts REPLICA IDENTITY FULL;
