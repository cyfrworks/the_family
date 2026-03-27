-- ============================================
-- Back Room: Private 1-1 Don-to-Don conversations
-- ============================================
-- Adds is_direct flag to sit_downs table for private DM-style conversations
-- between exactly 2 Dons. Under the hood, still a commission sit-down.

-- 1. Add is_direct column + constraint
ALTER TABLE public.sit_downs ADD COLUMN is_direct boolean NOT NULL DEFAULT false;
ALTER TABLE public.sit_downs ADD CONSTRAINT direct_requires_commission
  CHECK (NOT is_direct OR is_commission);

-- 2. Trigger: enforce max 2 Dons in direct sitdowns
CREATE OR REPLACE FUNCTION public.enforce_direct_don_limit() RETURNS trigger AS $$
BEGIN
  IF NEW.user_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.sit_downs WHERE id = NEW.sit_down_id AND is_direct = true
  ) THEN
    IF (
      SELECT COUNT(*) FROM public.sit_down_participants
      WHERE sit_down_id = NEW.sit_down_id AND user_id IS NOT NULL
    ) >= 2 THEN
      RAISE EXCEPTION 'DIRECT_SIT_DOWN_MAX_DONS';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_enforce_direct_don_limit
  BEFORE INSERT ON public.sit_down_participants
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_direct_don_limit();

-- 3. Trigger: cascade-delete Back Room ONLY when contact is removed
CREATE OR REPLACE FUNCTION public.cascade_delete_back_room() RETURNS trigger AS $$
BEGIN
  -- ONLY deletes is_direct=true sitdowns. Commission group sitdowns are untouched.
  DELETE FROM public.sit_downs
  WHERE is_direct = true AND id IN (
    SELECT s.id FROM public.sit_downs s
    WHERE s.is_direct = true
      AND EXISTS (SELECT 1 FROM public.sit_down_participants p1
                  WHERE p1.sit_down_id = s.id AND p1.user_id = OLD.user_id)
      AND EXISTS (SELECT 1 FROM public.sit_down_participants p2
                  WHERE p2.sit_down_id = s.id AND p2.user_id = OLD.contact_user_id)
  );
  RETURN OLD;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_cascade_delete_back_room
  AFTER DELETE ON public.commission_contacts
  FOR EACH ROW EXECUTE FUNCTION public.cascade_delete_back_room();

-- 4. RPC: create_or_get_back_room
CREATE OR REPLACE FUNCTION public.create_or_get_back_room(p_contact_user_id uuid)
RETURNS jsonb AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_sit_down_id uuid;
  v_sit_down public.sit_downs;
  v_lock_key bigint;
BEGIN
  -- Validate: can't DM yourself
  IF v_uid = p_contact_user_id THEN
    RAISE EXCEPTION 'CANNOT_DM_SELF';
  END IF;

  -- Validate: must be accepted commission contacts
  IF NOT EXISTS (
    SELECT 1 FROM public.commission_contacts
    WHERE user_id = v_uid AND contact_user_id = p_contact_user_id AND status = 'accepted'
  ) THEN
    RAISE EXCEPTION 'NOT_A_CONTACT';
  END IF;

  -- Canonical lock key from the two UUIDs (prevents race conditions)
  v_lock_key := hashtext(LEAST(v_uid::text, p_contact_user_id::text) || ':' || GREATEST(v_uid::text, p_contact_user_id::text));
  PERFORM pg_advisory_xact_lock(v_lock_key);

  -- Find existing direct sit-down between these two Dons
  SELECT s.id INTO v_sit_down_id
  FROM public.sit_downs s
  WHERE s.is_commission = true AND s.is_direct = true
    AND EXISTS (
      SELECT 1 FROM public.sit_down_participants p1
      WHERE p1.sit_down_id = s.id AND p1.user_id = v_uid
    )
    AND EXISTS (
      SELECT 1 FROM public.sit_down_participants p2
      WHERE p2.sit_down_id = s.id AND p2.user_id = p_contact_user_id
    );

  IF v_sit_down_id IS NOT NULL THEN
    RETURN jsonb_build_object('sit_down_id', v_sit_down_id, 'created', false);
  END IF;

  -- Create new direct sit-down
  INSERT INTO public.sit_downs (name, created_by, is_commission, is_direct)
  VALUES ('Back Room', v_uid, true, true)
  RETURNING * INTO v_sit_down;

  -- Add both Dons as participants (both are admins)
  INSERT INTO public.sit_down_participants (sit_down_id, user_id, added_by, is_admin)
  VALUES (v_sit_down.id, v_uid, v_uid, true);

  INSERT INTO public.sit_down_participants (sit_down_id, user_id, added_by, is_admin)
  VALUES (v_sit_down.id, p_contact_user_id, v_uid, true);

  RETURN jsonb_build_object('sit_down_id', v_sit_down.id, 'created', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

-- 5. RPC: list_back_room_sit_downs_with_unread
CREATE OR REPLACE FUNCTION public.list_back_room_sit_downs_with_unread()
RETURNS TABLE (
  id uuid,
  name text,
  description text,
  created_by uuid,
  is_commission boolean,
  is_direct boolean,
  created_at timestamptz,
  unread_count bigint,
  other_user_id uuid,
  other_display_name text,
  other_avatar_url text,
  last_message_content text,
  last_message_at timestamptz,
  last_message_sender_type text
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    s.id,
    s.name,
    s.description,
    s.created_by,
    s.is_commission,
    s.is_direct,
    s.created_at,
    COUNT(m.id) AS unread_count,
    other_p.user_id AS other_user_id,
    other_prof.display_name AS other_display_name,
    other_prof.avatar_url AS other_avatar_url,
    last_msg.content AS last_message_content,
    last_msg.created_at AS last_message_at,
    last_msg.sender_type AS last_message_sender_type
  FROM public.sit_downs s
  INNER JOIN public.sit_down_participants my_p
    ON my_p.sit_down_id = s.id AND my_p.user_id = auth.uid()
  INNER JOIN public.sit_down_participants other_p
    ON other_p.sit_down_id = s.id AND other_p.user_id IS NOT NULL AND other_p.user_id != auth.uid()
  INNER JOIN public.profiles other_prof
    ON other_prof.id = other_p.user_id
  LEFT JOIN public.sit_down_read_receipts rr
    ON rr.sit_down_id = s.id AND rr.user_id = auth.uid()
  LEFT JOIN public.messages m
    ON m.sit_down_id = s.id
    AND m.created_at > COALESCE(rr.last_read_at, '1970-01-01'::timestamptz)
    AND m.sender_user_id IS DISTINCT FROM auth.uid()
  LEFT JOIN LATERAL (
    SELECT lm.content, lm.created_at, lm.sender_type
    FROM public.messages lm
    WHERE lm.sit_down_id = s.id
    ORDER BY lm.created_at DESC
    LIMIT 1
  ) last_msg ON true
  WHERE s.is_commission = true AND s.is_direct = true
  GROUP BY s.id, s.name, s.description, s.created_by, s.is_commission, s.is_direct, s.created_at,
           other_p.user_id, other_prof.display_name, other_prof.avatar_url,
           last_msg.content, last_msg.created_at, last_msg.sender_type
  ORDER BY COALESCE(last_msg.created_at, s.created_at) DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

-- 6. Update list_commission_sit_downs_with_unread to EXCLUDE direct sitdowns
DROP FUNCTION IF EXISTS public.list_commission_sit_downs_with_unread();
CREATE OR REPLACE FUNCTION public.list_commission_sit_downs_with_unread()
RETURNS TABLE (
  id uuid,
  name text,
  description text,
  created_by uuid,
  is_commission boolean,
  created_at timestamptz,
  unread_count bigint
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    s.id,
    s.name,
    s.description,
    s.created_by,
    s.is_commission,
    s.created_at,
    COUNT(m.id) AS unread_count
  FROM public.sit_downs s
  INNER JOIN public.sit_down_participants p
    ON p.sit_down_id = s.id AND p.user_id = auth.uid()
  LEFT JOIN public.sit_down_read_receipts rr
    ON rr.sit_down_id = s.id AND rr.user_id = auth.uid()
  LEFT JOIN public.messages m
    ON m.sit_down_id = s.id
    AND m.created_at > COALESCE(rr.last_read_at, '1970-01-01'::timestamptz)
    AND m.sender_user_id IS DISTINCT FROM auth.uid()
  WHERE s.is_commission = true AND (s.is_direct IS NOT TRUE)
  GROUP BY s.id
  ORDER BY s.created_at DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

-- 7. Update enter_sit_down to include is_direct in returned jsonb
DROP FUNCTION IF EXISTS public.enter_sit_down(uuid);
CREATE OR REPLACE FUNCTION public.enter_sit_down(p_sit_down_id uuid)
RETURNS jsonb AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_sit_down jsonb;
  v_participants jsonb;
  v_messages jsonb;
  v_last_read_at timestamptz;
  v_is_commission boolean;
  v_commission_members jsonb := '[]'::jsonb;
  v_don_user_ids uuid[];
BEGIN
  -- 1. Verify caller is a participant
  IF NOT EXISTS (
    SELECT 1 FROM public.sit_down_participants
    WHERE sit_down_id = p_sit_down_id AND user_id = v_uid
  ) THEN
    RAISE EXCEPTION 'Not a participant of this sit-down';
  END IF;

  -- 2. Sit-down metadata
  SELECT to_jsonb(s) INTO v_sit_down
  FROM public.sit_downs s
  WHERE s.id = p_sit_down_id;

  IF v_sit_down IS NULL THEN
    RAISE EXCEPTION 'Sit-down not found';
  END IF;

  v_is_commission := COALESCE(v_sit_down->>'is_commission', 'false')::boolean;

  -- 3. Participants with joined profile + member + catalog_model
  SELECT COALESCE(jsonb_agg(
    to_jsonb(sp) ||
    jsonb_build_object(
      'profile', CASE WHEN pr.id IS NOT NULL THEN to_jsonb(pr) ELSE NULL END,
      'member', CASE WHEN mem.id IS NOT NULL THEN
        to_jsonb(mem) || jsonb_build_object(
          'catalog_model', CASE WHEN mc.id IS NOT NULL THEN to_jsonb(mc) ELSE NULL END
        )
        ELSE NULL END
    )
  ), '[]'::jsonb) INTO v_participants
  FROM public.sit_down_participants sp
  LEFT JOIN public.profiles pr ON pr.id = sp.user_id
  LEFT JOIN public.members mem ON mem.id = sp.member_id
  LEFT JOIN public.model_catalog mc ON mc.id = mem.catalog_model_id
  WHERE sp.sit_down_id = p_sit_down_id;

  -- 4. Messages (latest 50) with joined profile + member
  SELECT COALESCE(jsonb_agg(row_data ORDER BY (row_data->>'created_at') ASC), '[]'::jsonb) INTO v_messages
  FROM (
    SELECT
      to_jsonb(m) ||
      jsonb_build_object(
        'profile', CASE WHEN pr.id IS NOT NULL THEN to_jsonb(pr) ELSE NULL END,
        'member', CASE WHEN mem.id IS NOT NULL THEN
          to_jsonb(mem) || jsonb_build_object(
            'catalog_model', CASE WHEN mc.id IS NOT NULL THEN to_jsonb(mc) ELSE NULL END
          )
          ELSE NULL END
      ) AS row_data
    FROM public.messages m
    LEFT JOIN public.profiles pr ON pr.id = m.sender_user_id
    LEFT JOIN public.members mem ON mem.id = m.sender_member_id
    LEFT JOIN public.model_catalog mc ON mc.id = mem.catalog_model_id
    WHERE m.sit_down_id = p_sit_down_id
    ORDER BY m.created_at DESC
    LIMIT 50
  ) sub;

  -- 5. Read receipt
  SELECT rr.last_read_at INTO v_last_read_at
  FROM public.sit_down_read_receipts rr
  WHERE rr.sit_down_id = p_sit_down_id AND rr.user_id = v_uid;

  -- 6. Commission members (if applicable)
  IF v_is_commission THEN
    SELECT ARRAY_AGG(sp.user_id) INTO v_don_user_ids
    FROM public.sit_down_participants sp
    WHERE sp.sit_down_id = p_sit_down_id AND sp.user_id IS NOT NULL;

    IF v_don_user_ids IS NOT NULL AND array_length(v_don_user_ids, 1) > 0 THEN
      SELECT COALESCE(jsonb_agg(
        to_jsonb(mem) || jsonb_build_object(
          'catalog_model', CASE WHEN mc.id IS NOT NULL THEN to_jsonb(mc) ELSE NULL END
        )
      ), '[]'::jsonb) INTO v_commission_members
      FROM public.members mem
      LEFT JOIN public.model_catalog mc ON mc.id = mem.catalog_model_id
      WHERE mem.owner_id = ANY(v_don_user_ids);
    END IF;
  END IF;

  -- 7. Upsert read receipt (mark as read on enter)
  INSERT INTO public.sit_down_read_receipts (sit_down_id, user_id, last_read_at)
  VALUES (p_sit_down_id, v_uid, now())
  ON CONFLICT (sit_down_id, user_id)
  DO UPDATE SET last_read_at = now();

  -- 8. Return combined result (now includes is_direct via v_sit_down)
  RETURN jsonb_build_object(
    'sit_down', v_sit_down,
    'participants', v_participants,
    'messages', v_messages,
    'last_read_at', v_last_read_at,
    'is_commission', v_is_commission,
    'commission_members', v_commission_members,
    'has_more_messages', (
      SELECT COUNT(*) > 50
      FROM public.messages
      WHERE sit_down_id = p_sit_down_id
    )
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';
