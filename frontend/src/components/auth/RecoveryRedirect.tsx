import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

/**
 * Detects Supabase recovery hash fragments (e.g. #access_token=...&type=recovery)
 * on any page and redirects to /reset-password where the token is handled.
 */
export function RecoveryRedirect() {
  const navigate = useNavigate();

  useEffect(() => {
    const hash = window.location.hash.substring(1);
    if (!hash) return;

    const params = new URLSearchParams(hash);
    if (params.get('type') === 'recovery' && params.get('access_token')) {
      // Navigate to reset-password, preserving the hash so the page can parse it
      navigate('/reset-password' + window.location.hash, { replace: true });
    }
  }, [navigate]);

  return null;
}
