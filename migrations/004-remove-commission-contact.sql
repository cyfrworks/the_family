-- Add RPC function for removing a commission contact (both directions)
create or replace function public.remove_commission_contact(p_contact_user_id uuid)
returns void as $$
begin
  delete from public.commission_contacts
  where (user_id = auth.uid() and contact_user_id = p_contact_user_id)
     or (user_id = p_contact_user_id and contact_user_id = auth.uid());
end;
$$ language plpgsql security definer;
