-- 015: Push notification infrastructure
-- Requires pg_net extension to be enabled in Supabase Dashboard first

-- ==========================================================================
-- 1. Push tokens table
-- ==========================================================================

CREATE TABLE IF NOT EXISTS push_tokens (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  token      text NOT NULL UNIQUE,
  platform   text NOT NULL CHECK (platform IN ('ios', 'android')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_push_tokens_user_id ON push_tokens(user_id);

ALTER TABLE push_tokens ENABLE ROW LEVEL SECURITY;

-- Users can read/insert/delete their own tokens
CREATE POLICY "Users manage own push tokens"
  ON push_tokens
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Auto-update updated_at on push_tokens
CREATE OR REPLACE FUNCTION update_push_token_timestamp()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_push_tokens_updated_at
  BEFORE UPDATE ON push_tokens
  FOR EACH ROW
  EXECUTE FUNCTION update_push_token_timestamp();

-- ==========================================================================
-- 2. Trigger function: send push notification on new message
-- ==========================================================================

CREATE OR REPLACE FUNCTION notify_new_message()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  tokens     text[];
  sender_name text;
  sd_name    text;
  body_text  text;
  payload    text;
  chunk      text[];
  i          int;
  chunk_size int := 100; -- Expo recommends batches of 100
BEGIN
  -- Skip system messages (no sender)
  IF NEW.sender_user_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Get sender display name
  SELECT display_name INTO sender_name
  FROM profiles
  WHERE id = NEW.sender_user_id;

  IF sender_name IS NULL THEN
    sender_name := 'Someone';
  END IF;

  -- Get sit-down name
  SELECT name INTO sd_name
  FROM sit_downs
  WHERE id = NEW.sit_down_id;

  IF sd_name IS NULL THEN
    sd_name := 'a sit-down';
  END IF;

  -- Truncate message body for preview
  body_text := LEFT(COALESCE(NEW.content, ''), 100);
  IF LENGTH(COALESCE(NEW.content, '')) > 100 THEN
    body_text := body_text || '...';
  END IF;

  -- Collect push tokens for all participants except sender
  SELECT array_agg(pt.token)
  INTO tokens
  FROM sit_down_participants sp
  JOIN push_tokens pt ON pt.user_id = sp.user_id
  WHERE sp.sit_down_id = NEW.sit_down_id
    AND sp.user_id != NEW.sender_user_id;

  -- No tokens → nothing to do
  IF tokens IS NULL OR array_length(tokens, 1) IS NULL THEN
    RETURN NEW;
  END IF;

  -- Build batch payload and send in chunks of 100
  FOR i IN 0..((array_length(tokens, 1) - 1) / chunk_size)
  LOOP
    chunk := tokens[(i * chunk_size + 1):((i + 1) * chunk_size)];

    payload := (
      SELECT json_agg(
        json_build_object(
          'to', t,
          'sound', 'default',
          'title', sender_name || ' in ' || sd_name,
          'body', body_text,
          'data', json_build_object('sitDownId', NEW.sit_down_id)
        )
      )::text
      FROM unnest(chunk) AS t
    );

    -- Fire-and-forget via pg_net
    PERFORM net.http_post(
      url     := 'https://exp.host/--/api/v2/push/send',
      headers := jsonb_build_object(
        'Accept',       'application/json',
        'Content-Type', 'application/json'
      ),
      body    := payload::jsonb
    );
  END LOOP;

  RETURN NEW;
END;
$$;

-- ==========================================================================
-- 3. Attach trigger to messages table
-- ==========================================================================

DROP TRIGGER IF EXISTS trg_notify_new_message ON messages;
CREATE TRIGGER trg_notify_new_message
  AFTER INSERT ON messages
  FOR EACH ROW
  EXECUTE FUNCTION notify_new_message();
