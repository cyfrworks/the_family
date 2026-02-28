-- The Family — Supabase Schema Migration
-- Run this in the Supabase SQL editor

-- ============================================
-- PROFILES (auto-created on signup)
-- ============================================
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null,
  avatar_url text,
  tier text not null default 'associate' check (tier in ('godfather', 'boss', 'associate')),
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "Users can view all profiles"
  on public.profiles for select using (true);

create policy "Users can update own profile"
  on public.profiles for update using ((select auth.uid()) = id);

create policy "Godfathers can update any profile"
  on public.profiles for update
  using (exists (select 1 from public.profiles where id = (select auth.uid()) and tier = 'godfather'));

-- Trigger to auto-create profile on signup
create or replace function public.handle_new_user() returns trigger as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1))
  );
  return new;
end;
$$ language plpgsql security definer set search_path = '';

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ============================================
-- MODEL CATALOG (admin-managed alias system)
-- ============================================
create table public.model_catalog (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  alias text not null,
  model text not null,
  min_tier text not null default 'associate' check (min_tier in ('boss', 'associate')),
  is_active boolean not null default true,
  sort_order int not null default 0,
  added_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  unique (provider, alias)
);

alter table public.model_catalog enable row level security;

create policy "Users can view catalog for their tier"
  on public.model_catalog for select
  using (
    is_active = true and (
      min_tier = 'associate'
      or (min_tier = 'boss' and exists (
        select 1 from public.profiles where id = (select auth.uid()) and tier in ('godfather', 'boss')
      ))
    )
  );

create policy "Godfathers can view all catalog entries"
  on public.model_catalog for select
  using (exists (select 1 from public.profiles where id = (select auth.uid()) and tier = 'godfather'));

create policy "Godfathers can insert catalog entries"
  on public.model_catalog for insert
  with check (
    added_by = (select auth.uid())
    and exists (select 1 from public.profiles where id = (select auth.uid()) and tier = 'godfather')
  );

create policy "Godfathers can update catalog entries"
  on public.model_catalog for update
  using (exists (select 1 from public.profiles where id = (select auth.uid()) and tier = 'godfather'));

create policy "Godfathers can delete catalog entries"
  on public.model_catalog for delete
  using (exists (select 1 from public.profiles where id = (select auth.uid()) and tier = 'godfather'));

-- ============================================
-- MEMBERS (AI persona definitions)
-- ============================================
create table public.members (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  catalog_model_id uuid not null references public.model_catalog(id),
  system_prompt text not null,
  avatar_url text,
  created_at timestamptz not null default now()
);

alter table public.members enable row level security;

create policy "Users can view own members"
  on public.members for select
  using (owner_id = (select auth.uid()));

create policy "Users can create own members"
  on public.members for insert
  with check (owner_id = (select auth.uid()));

create policy "Users can update own members"
  on public.members for update
  using (owner_id = (select auth.uid()));

create policy "Users can delete own members"
  on public.members for delete
  using (owner_id = (select auth.uid()));

-- ============================================
-- SIT-DOWNS (conversations)
-- ============================================
create table public.sit_downs (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  created_by uuid not null references auth.users(id) on delete cascade,
  is_commission boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.sit_downs enable row level security;

create policy "Authenticated users can create sit-downs"
  on public.sit_downs for insert
  with check (created_by = (select auth.uid()));

create policy "Creator can update sit-down"
  on public.sit_downs for update
  using (created_by = (select auth.uid()));

create policy "Creator can delete sit-down"
  on public.sit_downs for delete
  using (created_by = (select auth.uid()));

-- ============================================
-- SIT-DOWN PARTICIPANTS (Dons and Members)
-- ============================================
create table public.sit_down_participants (
  id uuid primary key default gen_random_uuid(),
  sit_down_id uuid not null references public.sit_downs(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  member_id uuid references public.members(id) on delete cascade,
  added_by uuid not null references auth.users(id),
  added_at timestamptz not null default now(),
  constraint participant_type_check check (
    (user_id is not null and member_id is null) or
    (user_id is null and member_id is not null)
  ),
  constraint unique_user_participant unique (sit_down_id, user_id),
  constraint unique_member_participant unique (sit_down_id, member_id)
);

alter table public.sit_down_participants enable row level security;

-- Helper function: check sit-down participation without triggering RLS
-- (avoids infinite recursion when policies on sit_down_participants reference themselves)
create or replace function public.is_sit_down_participant(p_sit_down_id uuid)
returns boolean as $$
  select exists (
    select 1 from public.sit_down_participants
    where sit_down_id = p_sit_down_id
      and user_id = (select auth.uid())
  );
$$ language sql security definer set search_path = '';

create policy "Participants can view sit-down participants"
  on public.sit_down_participants for select
  using (public.is_sit_down_participant(sit_down_id));

create policy "Participants can add participants"
  on public.sit_down_participants for insert
  with check (
    added_by = (select auth.uid())
    and public.is_sit_down_participant(sit_down_id)
  );

create policy "Creator can remove participants"
  on public.sit_down_participants for delete
  using (
    exists (
      select 1 from public.sit_downs s
      where s.id = sit_down_id and s.created_by = (select auth.uid())
    )
  );

create policy "Participants can remove themselves"
  on public.sit_down_participants for delete
  using (user_id = (select auth.uid()));

create policy "Commission participants can remove members"
  on public.sit_down_participants for delete
  using (
    member_id is not null
    and public.is_sit_down_participant(sit_down_id)
    and exists (
      select 1 from public.sit_downs s
      where s.id = sit_down_id and s.is_commission = true
    )
  );

create policy "Participants can view their sit-downs"
  on public.sit_downs for select
  using (public.is_sit_down_participant(id));

create policy "Participants can delete commission sit-downs"
  on public.sit_downs for delete
  using (is_commission = true and public.is_sit_down_participant(id));

-- ============================================
-- MESSAGES
-- ============================================
create table public.messages (
  id uuid primary key default gen_random_uuid(),
  sit_down_id uuid not null references public.sit_downs(id) on delete cascade,
  sender_type text not null check (sender_type in ('don', 'member')),
  sender_user_id uuid references auth.users(id),
  sender_member_id uuid references public.members(id),
  content text not null,
  mentions uuid[] default '{}',
  metadata jsonb default '{}',
  created_at timestamptz not null default now(),
  constraint sender_check check (
    (sender_type = 'don' and sender_user_id is not null and sender_member_id is null) or
    (sender_type = 'member' and sender_member_id is not null and sender_user_id is null)
  )
);

alter table public.messages enable row level security;

create policy "Participants can view messages"
  on public.messages for select
  using (public.is_sit_down_participant(sit_down_id));

create policy "Participants can insert don messages"
  on public.messages for insert
  with check (
    sender_type = 'don'
    and sender_user_id = (select auth.uid())
    and public.is_sit_down_participant(sit_down_id)
  );

-- Direct FKs to profiles (public→public) so PostgREST can resolve joins
-- (the default FK path goes through auth.users which is not in the exposed schema)
alter table public.sit_down_participants
  add constraint sit_down_participants_profile_fk
  foreign key (user_id) references public.profiles(id);

alter table public.messages
  add constraint messages_profile_fk
  foreign key (sender_user_id) references public.profiles(id);

-- Enable Realtime
alter publication supabase_realtime add table public.messages;

-- Index for message queries
create index idx_messages_sit_down on public.messages(sit_down_id, created_at);
create index idx_sit_down_participants_sit_down on public.sit_down_participants(sit_down_id);
create index idx_sit_down_participants_user on public.sit_down_participants(user_id);

-- ============================================
-- RPC: Insert AI message (bypasses RLS safely)
-- ============================================
create or replace function public.insert_ai_message(
  p_sit_down_id uuid,
  p_sender_member_id uuid,
  p_content text,
  p_mentions uuid[] default '{}',
  p_metadata jsonb default '{}'
) returns public.messages as $$
declare
  v_message public.messages;
begin
  -- Verify caller is a participant of this sit-down
  if not exists (
    select 1 from public.sit_down_participants
    where sit_down_id = p_sit_down_id and user_id = auth.uid()
  ) then
    raise exception 'Not a participant of this sit-down';
  end if;

  -- Verify member is a participant of this sit-down
  if not exists (
    select 1 from public.sit_down_participants
    where sit_down_id = p_sit_down_id and member_id = p_sender_member_id
  ) then
    raise exception 'Member is not a participant of this sit-down';
  end if;

  -- Clean up typing indicator for this member (avoids a separate API call)
  delete from public.typing_indicators
  where sit_down_id = p_sit_down_id and member_id = p_sender_member_id;

  insert into public.messages (sit_down_id, sender_type, sender_member_id, content, mentions, metadata)
  values (p_sit_down_id, 'member', p_sender_member_id, p_content, p_mentions, p_metadata)
  returning * into v_message;

  return v_message;
end;
$$ language plpgsql security definer set search_path = '';

-- ============================================
-- RPC: Create sit-down and add creator as participant
-- ============================================
create or replace function public.create_sit_down(
  p_name text,
  p_description text default null
) returns public.sit_downs as $$
declare
  v_sit_down public.sit_downs;
begin
  insert into public.sit_downs (name, description, created_by)
  values (p_name, p_description, auth.uid())
  returning * into v_sit_down;

  insert into public.sit_down_participants (sit_down_id, user_id, added_by)
  values (v_sit_down.id, auth.uid(), auth.uid());

  return v_sit_down;
end;
$$ language plpgsql security definer set search_path = '';

-- ============================================
-- THE COMMISSION — Inter-Family Sit-downs
-- ============================================

-- Commission contacts (Don-to-Don network)
create table public.commission_contacts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  contact_user_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined')),
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  unique(user_id, contact_user_id),
  check(user_id != contact_user_id)
);

-- FK to profiles for PostgREST joins
alter table public.commission_contacts
  add constraint commission_contacts_user_profile_fk
  foreign key (user_id) references public.profiles(id);

alter table public.commission_contacts
  add constraint commission_contacts_contact_profile_fk
  foreign key (contact_user_id) references public.profiles(id);

alter table public.commission_contacts enable row level security;

create policy "Users can view own contacts"
  on public.commission_contacts for select
  using (user_id = (select auth.uid()) or contact_user_id = (select auth.uid()));

create policy "Users can insert contacts"
  on public.commission_contacts for insert
  with check (user_id = (select auth.uid()));

create policy "Users can update contacts they received"
  on public.commission_contacts for update
  using (contact_user_id = (select auth.uid()));

create policy "Users can delete own contacts"
  on public.commission_contacts for delete
  using (user_id = (select auth.uid()) or contact_user_id = (select auth.uid()));

create index idx_commission_contacts_user on public.commission_contacts(user_id);
create index idx_commission_contacts_contact on public.commission_contacts(contact_user_id);

-- ============================================
-- RPC: Invite to Commission (by email)
-- ============================================
create or replace function public.invite_to_commission(p_email text)
returns public.commission_contacts as $$
declare
  v_target_user_id uuid;
  v_existing public.commission_contacts;
  v_contact public.commission_contacts;
begin
  -- Look up target user by email
  select id into v_target_user_id
  from auth.users
  where email = lower(trim(p_email));

  if v_target_user_id is null then
    raise exception 'USER_NOT_FOUND';
  end if;

  if v_target_user_id = auth.uid() then
    raise exception 'CANNOT_INVITE_SELF';
  end if;

  -- Check for existing contact in either direction
  select * into v_existing
  from public.commission_contacts
  where (user_id = auth.uid() and contact_user_id = v_target_user_id)
     or (user_id = v_target_user_id and contact_user_id = auth.uid());

  if v_existing is not null then
    if v_existing.status = 'accepted' then
      raise exception 'ALREADY_CONNECTED';
    end if;
    if v_existing.status = 'pending' then
      raise exception 'ALREADY_PENDING';
    end if;
    -- If declined, re-invite by updating the existing row
    if v_existing.status = 'declined' and v_existing.user_id = auth.uid() then
      update public.commission_contacts
      set status = 'pending', responded_at = null, created_at = now()
      where id = v_existing.id
      returning * into v_contact;
      return v_contact;
    end if;
    -- If the other person previously invited us and was declined, create fresh invite
    if v_existing.status = 'declined' and v_existing.contact_user_id = auth.uid() then
      delete from public.commission_contacts where id = v_existing.id;
    end if;
  end if;

  insert into public.commission_contacts (user_id, contact_user_id, status)
  values (auth.uid(), v_target_user_id, 'pending')
  returning * into v_contact;

  return v_contact;
end;
$$ language plpgsql security definer set search_path = '';

-- ============================================
-- RPC: Accept Commission invite
-- ============================================
create or replace function public.accept_commission_invite(p_contact_id uuid)
returns public.commission_contacts as $$
declare
  v_invite public.commission_contacts;
  v_contact public.commission_contacts;
begin
  select * into v_invite
  from public.commission_contacts
  where id = p_contact_id
    and contact_user_id = auth.uid()
    and status = 'pending';

  if v_invite is null then
    raise exception 'INVITE_NOT_FOUND';
  end if;

  -- Accept the invite
  update public.commission_contacts
  set status = 'accepted', responded_at = now()
  where id = p_contact_id
  returning * into v_contact;

  -- Create the mirror row so both users see each other
  insert into public.commission_contacts (user_id, contact_user_id, status, responded_at)
  values (auth.uid(), v_invite.user_id, 'accepted', now())
  on conflict (user_id, contact_user_id) do update
  set status = 'accepted', responded_at = now();

  return v_contact;
end;
$$ language plpgsql security definer set search_path = '';

-- ============================================
-- RPC: Decline Commission invite
-- ============================================
create or replace function public.decline_commission_invite(p_contact_id uuid)
returns public.commission_contacts as $$
declare
  v_contact public.commission_contacts;
begin
  update public.commission_contacts
  set status = 'declined', responded_at = now()
  where id = p_contact_id
    and contact_user_id = auth.uid()
    and status = 'pending'
  returning * into v_contact;

  if v_contact is null then
    raise exception 'INVITE_NOT_FOUND';
  end if;

  return v_contact;
end;
$$ language plpgsql security definer set search_path = '';

-- ============================================
-- RPC: Create Commission sit-down
-- ============================================
create or replace function public.create_commission_sit_down(
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
  -- Create the sit-down
  insert into public.sit_downs (name, description, created_by, is_commission)
  values (p_name, p_description, auth.uid(), true)
  returning * into v_sit_down;

  -- Add creator as user participant
  insert into public.sit_down_participants (sit_down_id, user_id, added_by)
  values (v_sit_down.id, auth.uid(), auth.uid());

  -- Add creator's members
  foreach v_member_id in array p_member_ids loop
    insert into public.sit_down_participants (sit_down_id, member_id, added_by)
    values (v_sit_down.id, v_member_id, auth.uid());
  end loop;

  -- Add commission contacts as user participants
  foreach v_contact_user_id in array p_contact_ids loop
    -- Verify they are an accepted contact
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

-- ============================================
-- RLS: Allow viewing members in shared commission sit-downs
-- ============================================
-- Members already added to a commission sit-down
create policy "Users can view members in shared sit-downs"
  on public.members for select
  using (
    exists (
      select 1 from public.sit_down_participants sp1
      join public.sit_down_participants sp2 on sp1.sit_down_id = sp2.sit_down_id
      join public.sit_downs sd on sd.id = sp1.sit_down_id
      where sp1.user_id = (select auth.uid())
        and sp2.member_id = members.id
        and sd.is_commission = true
    )
  );

-- All members owned by any Don in a shared commission sit-down
-- (needed so Dons can see each other's families and add members)
create policy "Users can view all members of commission Dons"
  on public.members for select
  using (
    exists (
      select 1 from public.sit_down_participants sp1
      join public.sit_down_participants sp2 on sp1.sit_down_id = sp2.sit_down_id
      join public.sit_downs sd on sd.id = sp1.sit_down_id
      where sp1.user_id = (select auth.uid())
        and sp2.user_id = members.owner_id
        and sd.is_commission = true
    )
  );

-- ============================================
-- TYPING INDICATORS (shared "thinking" state)
-- ============================================
create table public.typing_indicators (
  sit_down_id uuid not null references public.sit_downs(id) on delete cascade,
  member_id uuid not null references public.members(id) on delete cascade,
  member_name text not null,
  started_by uuid not null references auth.users(id) on delete cascade,
  started_at timestamptz not null default now(),
  primary key (sit_down_id, member_id)
);

alter table public.typing_indicators enable row level security;

create policy "Participants can view typing indicators"
  on public.typing_indicators for select
  using (public.is_sit_down_participant(sit_down_id));

create policy "Participants can insert typing indicators"
  on public.typing_indicators for insert
  with check (
    started_by = (select auth.uid())
    and public.is_sit_down_participant(sit_down_id)
  );

create policy "Participants can delete typing indicators"
  on public.typing_indicators for delete
  using (public.is_sit_down_participant(sit_down_id));

create index idx_typing_indicators_sit_down on public.typing_indicators(sit_down_id);

-- ============================================
-- FIX: Allow member deletion when messages exist
-- ============================================
-- Change FK from RESTRICT (default) to SET NULL so deleting a member
-- nulls out sender_member_id on its messages instead of blocking.
ALTER TABLE public.messages DROP CONSTRAINT messages_sender_member_id_fkey;
ALTER TABLE public.messages ADD CONSTRAINT messages_sender_member_id_fkey
  FOREIGN KEY (sender_member_id) REFERENCES public.members(id) ON DELETE SET NULL;

-- Relax check constraint: allow sender_member_id to be null for deleted members
ALTER TABLE public.messages DROP CONSTRAINT sender_check;
ALTER TABLE public.messages ADD CONSTRAINT sender_check CHECK (
  (sender_type = 'don' AND sender_user_id IS NOT NULL AND sender_member_id IS NULL) OR
  (sender_type = 'member' AND sender_user_id IS NULL)
);

-- ============================================
-- REALTIME: Enable for typing indicators & participants
-- ============================================
alter publication supabase_realtime add table public.typing_indicators;
alter publication supabase_realtime add table public.sit_down_participants;
alter publication supabase_realtime add table public.commission_contacts;

