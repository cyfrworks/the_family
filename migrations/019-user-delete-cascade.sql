-- Fix foreign keys that block deletion of auth.users rows.
-- Strategy: CASCADE everything. When a Don is deleted, all their data goes with them.
--
-- Three categories of fixes:
-- 1. auth.users FKs with RESTRICT → CASCADE or SET NULL
-- 2. PostgREST join-helper FKs to profiles with RESTRICT → CASCADE
-- 3. Check constraints that conflict with SET NULL cascades → drop/relax

-- ── 1. Drop sender_check (conflicts with cascade SET NULL on profiles FK) ────
ALTER TABLE public.messages DROP CONSTRAINT IF EXISTS sender_check;

-- ── 2. Make added_by nullable (model_catalog keeps entries after user deleted) ──
ALTER TABLE public.model_catalog ALTER COLUMN added_by DROP NOT NULL;

-- ── 3. Fix auth.users FKs ───────────────────────────────────────────────────

-- model_catalog.added_by → SET NULL (shared resource, keep the entries)
ALTER TABLE public.model_catalog
  DROP CONSTRAINT model_catalog_added_by_fkey,
  ADD CONSTRAINT model_catalog_added_by_fkey
    FOREIGN KEY (added_by) REFERENCES auth.users(id) ON DELETE SET NULL;

-- sit_down_participants.added_by → CASCADE (remove participants the user added)
ALTER TABLE public.sit_down_participants
  DROP CONSTRAINT sit_down_members_added_by_fkey,
  ADD CONSTRAINT sit_down_members_added_by_fkey
    FOREIGN KEY (added_by) REFERENCES auth.users(id) ON DELETE CASCADE;

-- messages.sender_user_id → CASCADE (delete the Don's messages)
ALTER TABLE public.messages
  DROP CONSTRAINT messages_sender_user_id_fkey,
  ADD CONSTRAINT messages_sender_user_id_fkey
    FOREIGN KEY (sender_user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

-- ── 4. Fix PostgREST join-helper FKs to profiles ────────────────────────────
--    profiles cascade-deletes from auth.users; these FKs must not block that.

-- sit_down_participants.user_id → profiles
ALTER TABLE public.sit_down_participants
  DROP CONSTRAINT sit_down_participants_profile_fk,
  ADD CONSTRAINT sit_down_participants_profile_fk
    FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

-- messages.sender_user_id → profiles
ALTER TABLE public.messages
  DROP CONSTRAINT messages_profile_fk,
  ADD CONSTRAINT messages_profile_fk
    FOREIGN KEY (sender_user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

-- commission_contacts.user_id → profiles
ALTER TABLE public.commission_contacts
  DROP CONSTRAINT commission_contacts_user_profile_fk,
  ADD CONSTRAINT commission_contacts_user_profile_fk
    FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

-- commission_contacts.contact_user_id → profiles
ALTER TABLE public.commission_contacts
  DROP CONSTRAINT commission_contacts_contact_profile_fk,
  ADD CONSTRAINT commission_contacts_contact_profile_fk
    FOREIGN KEY (contact_user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
