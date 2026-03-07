-- Generate a cryptographically random informant token server-side.
-- Returns: { token, token_prefix, token_hash }
-- Uses pgcrypto's gen_random_bytes for proper entropy.
CREATE OR REPLACE FUNCTION public.generate_informant_token()
RETURNS jsonb AS $$
DECLARE
  v_raw_bytes bytea;
  v_hex text;
  v_token text;
  v_prefix text;
  v_hash text;
BEGIN
  -- 24 random bytes = 48 hex characters
  v_raw_bytes := gen_random_bytes(24);
  v_hex := encode(v_raw_bytes, 'hex');
  v_token := 'inf_' || v_hex;
  v_prefix := substring(v_token from 1 for 12);
  -- SHA-256 hash for storage
  v_hash := encode(digest(v_token::bytea, 'sha256'), 'hex');

  RETURN jsonb_build_object(
    'token', v_token,
    'token_prefix', v_prefix,
    'token_hash', v_hash
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
