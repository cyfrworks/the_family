-- Informants: external data pipeline members
-- member_type distinguishes AI members from informant members
-- Informants authenticate via hashed tokens instead of Supabase JWTs

ALTER TABLE public.members ADD COLUMN member_type text NOT NULL DEFAULT 'ai';
ALTER TABLE public.members ADD COLUMN token_hash text;
ALTER TABLE public.members ADD COLUMN token_prefix text;
ALTER TABLE public.members ADD COLUMN last_used_at timestamptz;

CREATE INDEX idx_members_token_hash ON public.members(token_hash) WHERE token_hash IS NOT NULL;

-- Validate informant token and return identity info
CREATE OR REPLACE FUNCTION public.validate_informant(p_token_hash text)
RETURNS jsonb AS $$
DECLARE
  v_member record;
BEGIN
  SELECT m.id AS member_id, m.owner_id AS user_id, m.name
  INTO v_member
  FROM public.members m
  WHERE m.token_hash = p_token_hash
    AND m.member_type = 'informant';

  IF NOT FOUND THEN
    RETURN jsonb_build_object('valid', false);
  END IF;

  UPDATE public.members SET last_used_at = now() WHERE id = v_member.member_id;

  RETURN jsonb_build_object(
    'valid', true,
    'user_id', v_member.user_id,
    'member_id', v_member.member_id,
    'name', v_member.name
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create a family sit-down with the informant auto-added as participant
CREATE OR REPLACE FUNCTION public.informant_create_sit_down(
  p_user_id uuid,
  p_member_id uuid,
  p_name text,
  p_description text DEFAULT NULL
)
RETURNS jsonb AS $$
DECLARE
  v_sit_down record;
BEGIN
  INSERT INTO public.sit_downs (name, description, created_by, is_commission)
  VALUES (p_name, p_description, p_user_id, false)
  RETURNING * INTO v_sit_down;

  -- Add the owner as a user participant (admin)
  INSERT INTO public.sit_down_participants (sit_down_id, user_id, added_by, is_admin)
  VALUES (v_sit_down.id, p_user_id, p_user_id, true);

  -- Add the informant as a member participant
  INSERT INTO public.sit_down_participants (sit_down_id, member_id, added_by)
  VALUES (v_sit_down.id, p_member_id, p_user_id);

  RETURN jsonb_build_object(
    'id', v_sit_down.id,
    'name', v_sit_down.name,
    'description', v_sit_down.description,
    'created_by', v_sit_down.created_by,
    'is_commission', v_sit_down.is_commission,
    'created_at', v_sit_down.created_at
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Send a message as an informant (data-only, no AI responses triggered)
CREATE OR REPLACE FUNCTION public.informant_send_message(
  p_member_id uuid,
  p_sit_down_id uuid,
  p_content text,
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb AS $$
DECLARE
  v_is_participant boolean;
  v_message record;
BEGIN
  -- Verify informant is a participant in this sit-down
  SELECT EXISTS(
    SELECT 1 FROM public.sit_down_participants
    WHERE sit_down_id = p_sit_down_id AND member_id = p_member_id
  ) INTO v_is_participant;

  IF NOT v_is_participant THEN
    RETURN jsonb_build_object('error', 'Informant is not a participant in this sit-down');
  END IF;

  INSERT INTO public.messages (sit_down_id, sender_type, sender_member_id, content, metadata, mentions)
  VALUES (p_sit_down_id, 'member', p_member_id, p_content, p_metadata, ARRAY[]::uuid[])
  RETURNING * INTO v_message;

  RETURN jsonb_build_object(
    'id', v_message.id,
    'sit_down_id', v_message.sit_down_id,
    'sender_type', v_message.sender_type,
    'sender_member_id', v_message.sender_member_id,
    'content', v_message.content,
    'metadata', v_message.metadata,
    'created_at', v_message.created_at
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
