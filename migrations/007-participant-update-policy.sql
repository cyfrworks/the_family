-- Allow admin participants to update other participants in the same sit-down
-- (needed for toggle_admin to set is_admin via RLS)
CREATE POLICY "Admins can update participants"
  ON public.sit_down_participants FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.sit_down_participants caller
      WHERE caller.sit_down_id = sit_down_participants.sit_down_id
        AND caller.user_id = auth.uid()
        AND caller.is_admin = true
    )
  );

-- Enable full replica identity so realtime DELETE/UPDATE events include all columns
-- (needed for sit_down_id filter to work on DELETE events)
ALTER TABLE public.sit_down_participants REPLICA IDENTITY FULL;
