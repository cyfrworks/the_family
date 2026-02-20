-- ============================================
-- fix_role_member.sql
-- Standalone migration: roles → members, sit_down_members → sit_down_participants
--
-- This script renames tables, columns, constraints, indexes, RLS policies,
-- and RPC functions to replace "role/roles" with "member/members" and
-- "sit_down_members" with "sit_down_participants" across the entire schema.
--
-- Prerequisites:
--   The database already has the OLD schema (roles, sit_down_members,
--   role_id, sender_role_id, etc.) as defined in migration.sql.
--
-- Run this in the Supabase SQL Editor against the production database.
-- ============================================

BEGIN;

-- ============================================================
-- 1. DROP DEPENDENT OBJECTS
--    (policies, functions, constraints, indexes)
--    Must happen BEFORE renaming tables/columns.
-- ============================================================

-- ---- Typing Indicators policies & index ----
DROP POLICY IF EXISTS "Members can view typing indicators"    ON public.typing_indicators;
DROP POLICY IF EXISTS "Members can insert typing indicators"  ON public.typing_indicators;
DROP POLICY IF EXISTS "Members can delete typing indicators"  ON public.typing_indicators;
DROP INDEX  IF EXISTS idx_typing_indicators_sit_down;

-- ---- Messages policies, constraints, indexes, FK ----
DROP POLICY IF EXISTS "Members can view messages"          ON public.messages;
DROP POLICY IF EXISTS "Members can insert don messages"    ON public.messages;
ALTER TABLE public.messages DROP CONSTRAINT IF EXISTS sender_check;
ALTER TABLE public.messages DROP CONSTRAINT IF EXISTS messages_sender_type_check;
ALTER TABLE public.messages DROP CONSTRAINT IF EXISTS messages_sender_role_id_fkey;
ALTER TABLE public.messages DROP CONSTRAINT IF EXISTS messages_profile_fk;
DROP INDEX  IF EXISTS idx_messages_sit_down;

-- ---- Sit-Down Members (old table) policies, constraints, indexes, FKs ----
DROP POLICY IF EXISTS "Members can view sit-down members"      ON public.sit_down_members;
DROP POLICY IF EXISTS "Members can add members"                ON public.sit_down_members;
DROP POLICY IF EXISTS "Creator can remove members"             ON public.sit_down_members;
DROP POLICY IF EXISTS "Members can remove themselves"          ON public.sit_down_members;
DROP POLICY IF EXISTS "Commission members can remove roles"    ON public.sit_down_members;
ALTER TABLE public.sit_down_members DROP CONSTRAINT IF EXISTS member_type_check;
ALTER TABLE public.sit_down_members DROP CONSTRAINT IF EXISTS unique_user_member;
ALTER TABLE public.sit_down_members DROP CONSTRAINT IF EXISTS unique_role_member;
ALTER TABLE public.sit_down_members DROP CONSTRAINT IF EXISTS sit_down_members_profile_fk;
DROP INDEX  IF EXISTS idx_sit_down_members_sit_down;
DROP INDEX  IF EXISTS idx_sit_down_members_user;

-- ---- Sit-Downs policies (the one that references is_sit_down_member) ----
DROP POLICY IF EXISTS "Members can view their sit-downs"            ON public.sit_downs;
DROP POLICY IF EXISTS "Authenticated users can create sit-downs"    ON public.sit_downs;
DROP POLICY IF EXISTS "Creator can update sit-down"                 ON public.sit_downs;
DROP POLICY IF EXISTS "Creator can delete sit-down"                 ON public.sit_downs;
DROP POLICY IF EXISTS "Members can delete commission sit-downs"     ON public.sit_downs;

-- ---- Roles (old table) policies ----
DROP POLICY IF EXISTS "Users can view own roles and templates"          ON public.roles;
DROP POLICY IF EXISTS "Users can create own roles"                      ON public.roles;
DROP POLICY IF EXISTS "Users can update own roles"                      ON public.roles;
DROP POLICY IF EXISTS "Users can delete own roles"                      ON public.roles;
DROP POLICY IF EXISTS "Users can view roles in shared sit-downs"        ON public.roles;
DROP POLICY IF EXISTS "Users can view all roles of commission Dons"     ON public.roles;

-- ---- Drop RPC functions ----
DROP FUNCTION IF EXISTS public.is_sit_down_member(uuid);
DROP FUNCTION IF EXISTS public.insert_ai_message(uuid, uuid, text, uuid[], jsonb);
DROP FUNCTION IF EXISTS public.create_sit_down(text, text);
DROP FUNCTION IF EXISTS public.create_commission_sit_down(text, text, uuid[], uuid[]);


-- ============================================================
-- 2. RENAME TABLES
-- ============================================================

ALTER TABLE public.roles RENAME TO members;
ALTER TABLE public.sit_down_members RENAME TO sit_down_participants;


-- ============================================================
-- 3. RENAME COLUMNS
-- ============================================================

-- sit_down_participants: role_id → member_id
ALTER TABLE public.sit_down_participants RENAME COLUMN role_id TO member_id;

-- messages: sender_role_id → sender_member_id
ALTER TABLE public.messages RENAME COLUMN sender_role_id TO sender_member_id;

-- typing_indicators: role_id → member_id, role_name → member_name
ALTER TABLE public.typing_indicators RENAME COLUMN role_id TO member_id;
ALTER TABLE public.typing_indicators RENAME COLUMN role_name TO member_name;


-- ============================================================
-- 4. MIGRATE DATA
-- ============================================================

UPDATE public.messages SET sender_type = 'member' WHERE sender_type = 'role';


-- ============================================================
-- 5. RE-ADD CHECK CONSTRAINTS
-- ============================================================

-- messages_sender_type_check: inline column check 'role' → 'member'
ALTER TABLE public.messages ADD CONSTRAINT messages_sender_type_check
  CHECK (sender_type IN ('don', 'member'));

-- sender_check: 'role' → 'member', sender_role_id → sender_member_id
ALTER TABLE public.messages ADD CONSTRAINT sender_check CHECK (
  (sender_type = 'don' AND sender_user_id IS NOT NULL AND sender_member_id IS NULL) OR
  (sender_type = 'member' AND sender_user_id IS NULL)
);

-- member_type_check: role_id → member_id
ALTER TABLE public.sit_down_participants ADD CONSTRAINT member_type_check CHECK (
  (user_id IS NOT NULL AND member_id IS NULL) OR
  (user_id IS NULL AND member_id IS NOT NULL)
);

-- unique constraints with new column names
ALTER TABLE public.sit_down_participants
  ADD CONSTRAINT unique_user_participant UNIQUE (sit_down_id, user_id);

ALTER TABLE public.sit_down_participants
  ADD CONSTRAINT unique_member_participant UNIQUE (sit_down_id, member_id);


-- ============================================================
-- 6. RE-CREATE FOREIGN KEY CONSTRAINTS
-- ============================================================

-- sit_down_participants → profiles (PostgREST join)
ALTER TABLE public.sit_down_participants
  ADD CONSTRAINT sit_down_participants_profile_fk
  FOREIGN KEY (user_id) REFERENCES public.profiles(id);

-- messages → profiles (PostgREST join)
ALTER TABLE public.messages
  ADD CONSTRAINT messages_profile_fk
  FOREIGN KEY (sender_user_id) REFERENCES public.profiles(id);

-- messages.sender_member_id → members(id) ON DELETE SET NULL
ALTER TABLE public.messages
  ADD CONSTRAINT messages_sender_member_id_fkey
  FOREIGN KEY (sender_member_id) REFERENCES public.members(id) ON DELETE SET NULL;

-- typing_indicators.member_id → members(id) ON DELETE CASCADE
-- (The old FK was auto-renamed when the table was renamed, but the
--  constraint name still references the old column. Drop-and-recreate
--  to keep naming consistent.)
ALTER TABLE public.typing_indicators DROP CONSTRAINT IF EXISTS typing_indicators_role_id_fkey;
ALTER TABLE public.typing_indicators
  ADD CONSTRAINT typing_indicators_member_id_fkey
  FOREIGN KEY (member_id) REFERENCES public.members(id) ON DELETE CASCADE;


-- ============================================================
-- 7. RE-CREATE INDEXES
-- ============================================================

CREATE INDEX idx_messages_sit_down
  ON public.messages(sit_down_id, created_at);

CREATE INDEX idx_sit_down_participants_sit_down
  ON public.sit_down_participants(sit_down_id);

CREATE INDEX idx_sit_down_participants_user
  ON public.sit_down_participants(user_id);

CREATE INDEX idx_typing_indicators_sit_down
  ON public.typing_indicators(sit_down_id);


-- ============================================================
-- 8. RE-CREATE HELPER FUNCTION: is_sit_down_participant
-- ============================================================

CREATE OR REPLACE FUNCTION public.is_sit_down_participant(p_sit_down_id uuid)
RETURNS boolean AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.sit_down_participants
    WHERE sit_down_id = p_sit_down_id
      AND user_id = (SELECT auth.uid())
  );
$$ LANGUAGE sql SECURITY DEFINER SET search_path = '';


-- ============================================================
-- 9. RE-CREATE RLS POLICIES — members (was roles)
-- ============================================================

CREATE POLICY "Users can view own members and templates"
  ON public.members FOR SELECT
  USING (owner_id = (SELECT auth.uid()) OR is_template = true);

CREATE POLICY "Users can create own members"
  ON public.members FOR INSERT
  WITH CHECK (owner_id = (SELECT auth.uid()));

CREATE POLICY "Users can update own members"
  ON public.members FOR UPDATE
  USING (owner_id = (SELECT auth.uid()) AND is_template = false);

CREATE POLICY "Users can delete own members"
  ON public.members FOR DELETE
  USING (owner_id = (SELECT auth.uid()) AND is_template = false);

CREATE POLICY "Users can view members in shared sit-downs"
  ON public.members FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.sit_down_participants sp1
      JOIN public.sit_down_participants sp2 ON sp1.sit_down_id = sp2.sit_down_id
      JOIN public.sit_downs sd ON sd.id = sp1.sit_down_id
      WHERE sp1.user_id = (SELECT auth.uid())
        AND sp2.member_id = members.id
        AND sd.is_commission = true
    )
  );

CREATE POLICY "Users can view all members of commission Dons"
  ON public.members FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.sit_down_participants sp1
      JOIN public.sit_down_participants sp2 ON sp1.sit_down_id = sp2.sit_down_id
      JOIN public.sit_downs sd ON sd.id = sp1.sit_down_id
      WHERE sp1.user_id = (SELECT auth.uid())
        AND sp2.user_id = members.owner_id
        AND sd.is_commission = true
    )
  );


-- ============================================================
-- 10. RE-CREATE RLS POLICIES — sit_downs
-- ============================================================

CREATE POLICY "Authenticated users can create sit-downs"
  ON public.sit_downs FOR INSERT
  WITH CHECK (created_by = (SELECT auth.uid()));

CREATE POLICY "Creator can update sit-down"
  ON public.sit_downs FOR UPDATE
  USING (created_by = (SELECT auth.uid()));

CREATE POLICY "Creator can delete sit-down"
  ON public.sit_downs FOR DELETE
  USING (created_by = (SELECT auth.uid()));

CREATE POLICY "Members can delete commission sit-downs"
  ON public.sit_downs FOR DELETE
  USING (is_commission = true AND public.is_sit_down_participant(id));

CREATE POLICY "Participants can view their sit-downs"
  ON public.sit_downs FOR SELECT
  USING (public.is_sit_down_participant(id));


-- ============================================================
-- 11. RE-CREATE RLS POLICIES — sit_down_participants
-- ============================================================

CREATE POLICY "Participants can view sit-down participants"
  ON public.sit_down_participants FOR SELECT
  USING (public.is_sit_down_participant(sit_down_id));

CREATE POLICY "Participants can add participants"
  ON public.sit_down_participants FOR INSERT
  WITH CHECK (
    added_by = (SELECT auth.uid())
    AND public.is_sit_down_participant(sit_down_id)
  );

CREATE POLICY "Creator can remove participants"
  ON public.sit_down_participants FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.sit_downs s
      WHERE s.id = sit_down_id AND s.created_by = (SELECT auth.uid())
    )
  );

CREATE POLICY "Participants can remove themselves"
  ON public.sit_down_participants FOR DELETE
  USING (user_id = (SELECT auth.uid()));

CREATE POLICY "Commission participants can remove members"
  ON public.sit_down_participants FOR DELETE
  USING (
    member_id IS NOT NULL
    AND public.is_sit_down_participant(sit_down_id)
    AND EXISTS (
      SELECT 1 FROM public.sit_downs s
      WHERE s.id = sit_down_id AND s.is_commission = true
    )
  );


-- ============================================================
-- 12. RE-CREATE RLS POLICIES — messages
-- ============================================================

CREATE POLICY "Participants can view messages"
  ON public.messages FOR SELECT
  USING (public.is_sit_down_participant(sit_down_id));

CREATE POLICY "Participants can insert don messages"
  ON public.messages FOR INSERT
  WITH CHECK (
    sender_type = 'don'
    AND sender_user_id = (SELECT auth.uid())
    AND public.is_sit_down_participant(sit_down_id)
  );


-- ============================================================
-- 13. RE-CREATE RLS POLICIES — typing_indicators
-- ============================================================

CREATE POLICY "Participants can view typing indicators"
  ON public.typing_indicators FOR SELECT
  USING (public.is_sit_down_participant(sit_down_id));

CREATE POLICY "Participants can insert typing indicators"
  ON public.typing_indicators FOR INSERT
  WITH CHECK (
    started_by = (SELECT auth.uid())
    AND public.is_sit_down_participant(sit_down_id)
  );

CREATE POLICY "Participants can delete typing indicators"
  ON public.typing_indicators FOR DELETE
  USING (public.is_sit_down_participant(sit_down_id));


-- ============================================================
-- 14. RE-CREATE RPC: insert_ai_message
-- ============================================================

CREATE OR REPLACE FUNCTION public.insert_ai_message(
  p_sit_down_id uuid,
  p_sender_member_id uuid,
  p_content text,
  p_mentions uuid[] DEFAULT '{}',
  p_metadata jsonb DEFAULT '{}'
) RETURNS public.messages AS $$
DECLARE
  v_message public.messages;
BEGIN
  -- Verify caller is a participant of this sit-down
  IF NOT EXISTS (
    SELECT 1 FROM public.sit_down_participants
    WHERE sit_down_id = p_sit_down_id AND user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Not a participant of this sit-down';
  END IF;

  -- Verify member is a participant of this sit-down
  IF NOT EXISTS (
    SELECT 1 FROM public.sit_down_participants
    WHERE sit_down_id = p_sit_down_id AND member_id = p_sender_member_id
  ) THEN
    RAISE EXCEPTION 'Member is not a participant of this sit-down';
  END IF;

  INSERT INTO public.messages (sit_down_id, sender_type, sender_member_id, content, mentions, metadata)
  VALUES (p_sit_down_id, 'member', p_sender_member_id, p_content, p_mentions, p_metadata)
  RETURNING * INTO v_message;

  RETURN v_message;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';


-- ============================================================
-- 15. RE-CREATE RPC: create_sit_down
-- ============================================================

CREATE OR REPLACE FUNCTION public.create_sit_down(
  p_name text,
  p_description text DEFAULT NULL
) RETURNS public.sit_downs AS $$
DECLARE
  v_sit_down public.sit_downs;
BEGIN
  INSERT INTO public.sit_downs (name, description, created_by)
  VALUES (p_name, p_description, auth.uid())
  RETURNING * INTO v_sit_down;

  INSERT INTO public.sit_down_participants (sit_down_id, user_id, added_by)
  VALUES (v_sit_down.id, auth.uid(), auth.uid());

  RETURN v_sit_down;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';


-- ============================================================
-- 16. RE-CREATE RPC: create_commission_sit_down
-- ============================================================

CREATE OR REPLACE FUNCTION public.create_commission_sit_down(
  p_name text,
  p_description text DEFAULT NULL,
  p_member_ids uuid[] DEFAULT '{}',
  p_contact_ids uuid[] DEFAULT '{}'
) RETURNS public.sit_downs AS $$
DECLARE
  v_sit_down public.sit_downs;
  v_member_id uuid;
  v_contact_user_id uuid;
BEGIN
  -- Create the sit-down
  INSERT INTO public.sit_downs (name, description, created_by, is_commission)
  VALUES (p_name, p_description, auth.uid(), true)
  RETURNING * INTO v_sit_down;

  -- Add creator as user participant
  INSERT INTO public.sit_down_participants (sit_down_id, user_id, added_by)
  VALUES (v_sit_down.id, auth.uid(), auth.uid());

  -- Add creator's members (AI personas)
  FOREACH v_member_id IN ARRAY p_member_ids LOOP
    INSERT INTO public.sit_down_participants (sit_down_id, member_id, added_by)
    VALUES (v_sit_down.id, v_member_id, auth.uid());
  END LOOP;

  -- Add commission contacts as user participants
  FOREACH v_contact_user_id IN ARRAY p_contact_ids LOOP
    -- Verify they are an accepted contact
    IF EXISTS (
      SELECT 1 FROM public.commission_contacts
      WHERE user_id = auth.uid()
        AND contact_user_id = v_contact_user_id
        AND status = 'accepted'
    ) THEN
      INSERT INTO public.sit_down_participants (sit_down_id, user_id, added_by)
      VALUES (v_sit_down.id, v_contact_user_id, auth.uid());
    END IF;
  END LOOP;

  RETURN v_sit_down;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';


-- ============================================================
-- 17. UPDATE REALTIME PUBLICATION
--     (messages is already in the publication and the table was
--      not renamed, so no change is needed for messages.
--      If sit_down_participants needs Realtime, add it here.)
-- ============================================================

-- No change needed — public.messages was not renamed and remains
-- in supabase_realtime. The renamed tables (members, sit_down_participants)
-- were never in the publication.


COMMIT;
