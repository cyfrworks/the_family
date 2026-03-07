-- Helper function: check if user is an admin in a sit-down (bypasses RLS)
CREATE OR REPLACE FUNCTION public.is_sit_down_admin(p_sit_down_id uuid)
RETURNS boolean AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.sit_down_participants
    WHERE sit_down_id = p_sit_down_id
      AND user_id = (SELECT auth.uid())
      AND is_admin = true
  );
$$ LANGUAGE sql SECURITY DEFINER SET search_path = '';

-- Recreate UPDATE policy using the helper to avoid infinite recursion
DROP POLICY IF EXISTS "Admins can update participants" ON public.sit_down_participants;
CREATE POLICY "Admins can update participants"
  ON public.sit_down_participants FOR UPDATE
  USING (public.is_sit_down_admin(sit_down_id));
