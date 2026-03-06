-- Read receipts for sit-down unread message counts
CREATE TABLE public.sit_down_read_receipts (
  sit_down_id uuid NOT NULL REFERENCES public.sit_downs(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  last_read_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (sit_down_id, user_id)
);

ALTER TABLE public.sit_down_read_receipts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own receipts"
  ON public.sit_down_read_receipts FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Users can upsert own receipts"
  ON public.sit_down_read_receipts FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own receipts"
  ON public.sit_down_read_receipts FOR UPDATE
  USING (user_id = auth.uid());

-- List personal sit-downs with unread_count
CREATE OR REPLACE FUNCTION public.list_sit_downs_with_unread()
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
  WHERE s.is_commission = false
  GROUP BY s.id
  ORDER BY s.created_at DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

-- List commission sit-downs with unread_count
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
  WHERE s.is_commission = true
  GROUP BY s.id
  ORDER BY s.created_at DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

-- Upsert read receipt (mark sit-down as read)
CREATE OR REPLACE FUNCTION public.mark_sit_down_read(p_sit_down_id uuid)
RETURNS void AS $$
BEGIN
  INSERT INTO public.sit_down_read_receipts (sit_down_id, user_id, last_read_at)
  VALUES (p_sit_down_id, auth.uid(), now())
  ON CONFLICT (sit_down_id, user_id)
  DO UPDATE SET last_read_at = now();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';
