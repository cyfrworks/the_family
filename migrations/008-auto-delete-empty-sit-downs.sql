-- Automatically delete a sit-down when its last participant leaves.
-- All related rows (messages, read_receipts, typing_indicators, remaining
-- member participants) are cleaned up via ON DELETE CASCADE.

CREATE OR REPLACE FUNCTION public.delete_empty_sit_down()
RETURNS trigger AS $$
BEGIN
  -- Delete when no Dons (user participants) remain; members can't leave on their own
  IF NOT EXISTS (
    SELECT 1 FROM public.sit_down_participants
    WHERE sit_down_id = OLD.sit_down_id
      AND user_id IS NOT NULL
  ) THEN
    DELETE FROM public.sit_downs WHERE id = OLD.sit_down_id;
  END IF;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_delete_empty_sit_down
  AFTER DELETE ON public.sit_down_participants
  FOR EACH ROW
  EXECUTE FUNCTION public.delete_empty_sit_down();

-- Clean up existing orphaned sit-downs (no Don participants)
DELETE FROM public.sit_downs
WHERE NOT EXISTS (
  SELECT 1 FROM public.sit_down_participants
  WHERE sit_down_id = sit_downs.id
    AND user_id IS NOT NULL
);
