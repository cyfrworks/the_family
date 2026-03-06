-- Combined "enter sit-down" RPC: returns everything needed to render a sit-down
-- page in one DB round-trip. Replaces 3-4 separate queries (get + list_messages +
-- read_receipt + optional commission_members) with a single function call.

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

  -- 8. Return combined result
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
