import { useFamilySitDownContext } from '../contexts/FamilySitDownContext';
export { getActiveSitDown, setActiveSitDown } from '../lib/realtime-hub';

export function useSitDowns() {
  const { sitDowns, loading, createSitDown, leaveSitDown, markSitDownAsRead, refetch } = useFamilySitDownContext();
  return { sitDowns, loading, createSitDown, leaveSitDown, markAsRead: markSitDownAsRead, refetch };
}
