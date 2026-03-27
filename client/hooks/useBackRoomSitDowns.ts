import { useMemo } from 'react';
import { cyfrCall } from '../lib/cyfr';
import { getAccessToken } from '../lib/supabase';
import type { BackRoomSitDown } from '../lib/types';
import { useCommissionContext } from '../contexts/CommissionContext';

const SIT_DOWN_REF = 'formula:local.sit-down:0.1.0';

export interface BackRoomContact {
  contactUserId: string;
  displayName: string;
  avatarUrl: string | null;
  sitDown: BackRoomSitDown;
  lastMessageContent: string | null;
  lastMessageAt: string | null;
  unreadCount: number;
}

export function useBackRoomSitDowns() {
  const { backRoomSitDowns, loading, markBackRoomAsRead } = useCommissionContext();

  // Only show contacts with existing back room conversations
  const backRoomContacts = useMemo<BackRoomContact[]>(() => {
    return backRoomSitDowns.map((sd) => ({
      contactUserId: sd.other_user_id,
      displayName: sd.other_display_name,
      avatarUrl: sd.other_avatar_url,
      sitDown: sd,
      lastMessageContent: sd.last_message_content,
      lastMessageAt: sd.last_message_at,
      unreadCount: sd.unread_count ?? 0,
    }));
  }, [backRoomSitDowns]);

  async function openOrCreateBackRoom(contactUserId: string): Promise<string> {
    // Check if we already have a sitdown for this contact
    const existing = backRoomSitDowns.find(
      (sd) => sd.other_user_id === contactUserId,
    );
    if (existing) return existing.id;

    // Create via formula
    const accessToken = getAccessToken();
    if (!accessToken) throw new Error('Not authenticated');

    const result = await cyfrCall('execution', {
      action: 'run',
      reference: SIT_DOWN_REF,
      input: {
        action: 'create_or_get_back_room',
        access_token: accessToken,
        contact_user_id: contactUserId,
      },
      type: 'formula',
      timeout: 30000,
    });

    const res = result as Record<string, unknown> | null;
    if (res?.error) throw new Error((res.error as Record<string, string>).message);

    const backRoom = res?.back_room as { sit_down_id: string; created: boolean } | undefined;
    if (!backRoom?.sit_down_id) throw new Error('Failed to create back room');

    return backRoom.sit_down_id;
  }

  return {
    backRoomContacts,
    backRoomSitDowns,
    loading,
    openOrCreateBackRoom,
    markAsRead: markBackRoomAsRead,
  };
}
