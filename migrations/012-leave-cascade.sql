-- Add don_count to commission sit-downs RPC so the UI knows if user is the last Don
DROP FUNCTION IF EXISTS public.list_commission_sit_downs_with_unread();
CREATE OR REPLACE FUNCTION public.list_commission_sit_downs_with_unread()
RETURNS TABLE (
  id uuid,
  name text,
  description text,
  created_by uuid,
  is_commission boolean,
  created_at timestamptz,
  unread_count bigint,
  don_count bigint
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
    COUNT(m.id) AS unread_count,
    (SELECT COUNT(*) FROM public.sit_down_participants dp
     WHERE dp.sit_down_id = s.id AND dp.user_id IS NOT NULL) AS don_count
  FROM public.sit_downs s
  INNER JOIN public.sit_down_participants p
    ON p.sit_down_id = s.id AND p.user_id = auth.uid()
  LEFT JOIN public.sit_down_read_receipts rr
    ON rr.sit_down_id = s.id AND rr.user_id = auth.uid()
  LEFT JOIN public.messages m
    ON m.sit_down_id = s.id
    AND m.created_at > COALESCE(rr.last_read_at, '1970-01-01'::timestamptz)
    AND m.sender_user_id IS DISTINCT FROM auth.uid()
  WHERE s.is_commission = true
  GROUP BY s.id
  ORDER BY s.created_at DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- When a Don (user_id IS NOT NULL) is removed from a sit-down,
-- auto-delete their owned member participants from the same sit-down.
CREATE OR REPLACE FUNCTION cascade_owned_members() RETURNS trigger AS $$
BEGIN
  DELETE FROM public.sit_down_participants
  WHERE sit_down_id = OLD.sit_down_id
    AND member_id IS NOT NULL
    AND member_id IN (
      SELECT id FROM public.members WHERE owner_id = OLD.user_id
    );
  RETURN OLD;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_cascade_owned_members ON public.sit_down_participants;
CREATE TRIGGER trg_cascade_owned_members
  AFTER DELETE ON public.sit_down_participants
  FOR EACH ROW
  WHEN (OLD.user_id IS NOT NULL)
  EXECUTE FUNCTION cascade_owned_members();

-- When an admin Don leaves and other Dons exist, promote the earliest other Don.
CREATE OR REPLACE FUNCTION transfer_admin_on_leave() RETURNS trigger AS $$
BEGIN
  IF OLD.is_admin = true THEN
    UPDATE public.sit_down_participants
    SET is_admin = true
    WHERE id = (
      SELECT id FROM public.sit_down_participants
      WHERE sit_down_id = OLD.sit_down_id
        AND user_id IS NOT NULL
        AND id != OLD.id
      ORDER BY added_at ASC
      LIMIT 1
    );
  END IF;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_transfer_admin ON public.sit_down_participants;
CREATE TRIGGER trg_transfer_admin
  AFTER DELETE ON public.sit_down_participants
  FOR EACH ROW
  WHEN (OLD.user_id IS NOT NULL AND OLD.is_admin = true)
  EXECUTE FUNCTION transfer_admin_on_leave();
