-- Add admin flag to participants (only applies to user participants, not members)
ALTER TABLE public.sit_down_participants ADD COLUMN is_admin boolean NOT NULL DEFAULT false;

-- Backfill: mark creators as admins for existing commission sit-downs
UPDATE public.sit_down_participants p
SET is_admin = true
FROM public.sit_downs s
WHERE p.sit_down_id = s.id
  AND p.user_id = s.created_by
  AND s.is_commission = true;

-- Update the create_commission_sit_down RPC to set is_admin on creator
CREATE OR REPLACE FUNCTION public.create_commission_sit_down(
  p_name text,
  p_description text default null,
  p_member_ids uuid[] default '{}',
  p_contact_ids uuid[] default '{}'
) returns public.sit_downs as $$
declare
  v_sit_down public.sit_downs;
  v_member_id uuid;
  v_contact_user_id uuid;
begin
  insert into public.sit_downs (name, description, created_by, is_commission)
  values (p_name, p_description, auth.uid(), true)
  returning * into v_sit_down;

  -- Creator is admin
  insert into public.sit_down_participants (sit_down_id, user_id, added_by, is_admin)
  values (v_sit_down.id, auth.uid(), auth.uid(), true);

  foreach v_member_id in array p_member_ids loop
    insert into public.sit_down_participants (sit_down_id, member_id, added_by)
    values (v_sit_down.id, v_member_id, auth.uid());
  end loop;

  foreach v_contact_user_id in array p_contact_ids loop
    if exists (
      select 1 from public.commission_contacts
      where user_id = auth.uid()
        and contact_user_id = v_contact_user_id
        and status = 'accepted'
    ) then
      insert into public.sit_down_participants (sit_down_id, user_id, added_by)
      values (v_sit_down.id, v_contact_user_id, auth.uid());
    end if;
  end loop;

  return v_sit_down;
end;
$$ language plpgsql security definer set search_path = '';
