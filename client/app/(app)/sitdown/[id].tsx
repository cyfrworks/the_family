import { useCallback, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  Pressable,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { router } from 'expo-router';
import { ChevronLeft, Users } from 'lucide-react-native';
import BottomSheet, { BottomSheetScrollView } from '@gorhom/bottom-sheet';
import { useSitDownData } from '../../../hooks/useSitDownData';
import { useAuth } from '../../../contexts/AuthContext';
import { useMembers } from '../../../hooks/useMembers';
import { useCommission } from '../../../hooks/useCommission';
import { useResponsive } from '../../../hooks/useResponsive';
import { buildMemberOwnerMap } from '../../../lib/mention-parser';
import { ChatView } from '../../../components/chat/ChatView';
import { MemberList } from '../../../components/sitdown/MemberList';
import { toast } from '../../../lib/toast';
import { BackgroundWatermark } from '../../../components/BackgroundWatermark';

export default function SitdownScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { isPhone } = useResponsive();
  const { user } = useAuth();
  const { members: myMembers } = useMembers();
  const { contacts } = useCommission();

  const {
    sitDown,
    participants,
    participantMembers,
    commissionMembers,
    membersByOwner,
    messages,
    typingIndicators,
    lastReadAt,
    enteredAt,
    loading,
    sitDownError,
    messagesError,
    clearMessagesError,
    refetchAll,
    refetchMessages,
    addMember,
    addDon,
    removeParticipant,
    toggleAdmin,
  } = useSitDownData(id);

  const [showMembers, setShowMembers] = useState(false);
  const bottomSheetRef = useRef<BottomSheet>(null);
  const snapPoints = useMemo(() => ['50%', '85%'], []);

  // Build disambiguation map for members with duplicate names (for mention autocomplete)
  const memberOwnerMap = useMemo(() => {
    const dons = participants
      .filter((p) => p.user_id != null && p.profile)
      .map((p) => ({ userId: p.user_id!, displayName: p.profile!.display_name }));
    return buildMemberOwnerMap(participantMembers, dons);
  }, [participants, participantMembers]);

  const handleToggleMembers = useCallback(() => {
    if (isPhone) {
      if (showMembers) {
        bottomSheetRef.current?.close();
      } else {
        bottomSheetRef.current?.snapToIndex(0);
      }
      setShowMembers((s) => !s);
    } else {
      setShowMembers((s) => !s);
    }
  }, [isPhone, showMembers]);

  const handleBottomSheetChange = useCallback((index: number) => {
    setShowMembers(index >= 0);
  }, []);

  if (loading) {
    return (
      <View className="flex-1 items-center justify-center bg-stone-950">
        <ActivityIndicator size="large" color="#78716c" />
        <Text className="mt-2 text-stone-500">Loading...</Text>
      </View>
    );
  }

  if (sitDownError) {
    return (
      <View className="flex-1 items-center justify-center bg-stone-950 px-6">
        <Text className="font-serif text-lg text-red-400 text-center">
          {sitDownError.message}
        </Text>
        <View className="mt-3 flex-row items-center gap-3">
          {sitDownError.retryable && (
            <Pressable onPress={refetchAll}>
              <Text className="text-sm text-yellow-500">Try again</Text>
            </Pressable>
          )}
          <Pressable onPress={() => router.back()}>
            <Text className="text-sm text-stone-400">Go back</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  if (!sitDown) {
    return (
      <View className="flex-1 items-center justify-center bg-stone-950">
        <Text className="font-serif text-lg text-stone-400">Sit-down not found</Text>
        <Pressable onPress={() => router.back()} className="mt-2">
          <Text className="text-sm text-yellow-500">Go back</Text>
        </Pressable>
      </View>
    );
  }

  // For commission sit-downs, use all participant Dons' members as available
  const availableMembers = sitDown.is_commission ? commissionMembers : myMembers;

  // For commission sit-downs, find contacts not yet in the sit-down
  const participantUserIds = new Set(
    participants.filter((p) => p.user_id).map((p) => p.user_id),
  );
  const addableContacts = sitDown.is_commission
    ? contacts.filter((c) => !participantUserIds.has(c.contact_user_id))
    : [];

  // Shared MemberList props
  const memberListProps = {
    participants,
    availableMembers,
    isCommission: sitDown.is_commission,
    membersByOwner: sitDown.is_commission ? membersByOwner : undefined,
    addableContacts,
    onAddMember: async (memberId: string) => {
      try {
        await addMember(memberId);
        toast.success('A new face at the table.');
      } catch {
        toast.error("Couldn't bring them in.");
      }
    },
    onAddUser: sitDown.is_commission
      ? async (userId: string) => {
          try {
            await addDon(userId);
            toast.success('A new Don at the table.');
          } catch {
            toast.error("Couldn't bring them in.");
          }
        }
      : undefined,
    onRemoveParticipant: async (participantId: string) => {
      try {
        await removeParticipant(participantId);
        toast.success("They've been excused.");
      } catch {
        toast.error("They won't leave.");
      }
    },
    onToggleAdmin: sitDown.is_commission
      ? async (userId: string) => {
          try {
            await toggleAdmin(userId);
            toast.success('Admin status updated.');
          } catch (e) {
            toast.error(e instanceof Error ? e.message : "Couldn't change admin status.");
          }
        }
      : undefined,
    onLeave: async () => {
      const myParticipant = participants.find((p) => p.user_id === user?.id);
      if (!myParticipant) return;
      try {
        await removeParticipant(myParticipant.id);
        router.back();
        toast.success("You've left the table.");
      } catch {
        toast.error("Couldn't leave.");
      }
    },
  };

  const content = (
    <View className="flex-1 flex-row bg-stone-950">
      <BackgroundWatermark />
      {/* Main chat column */}
      <View className="flex-1 flex-col">
        {/* Header */}
        <View className="flex-row items-center justify-between border-b border-stone-800 px-4 py-3">
          <View className="flex-row items-center gap-2 min-w-0 flex-1">
            <Pressable
              onPress={() => router.back()}
              className="rounded-md p-1"
              hitSlop={8}
            >
              <ChevronLeft size={20} color="#a8a29e" />
            </Pressable>
            <View className="min-w-0 flex-1">
              <Text
                className="font-serif text-lg font-bold text-stone-100"
                numberOfLines={1}
              >
                {sitDown.name}
              </Text>
              {sitDown.description && (
                <Text className="text-xs text-stone-500" numberOfLines={1}>
                  {sitDown.description}
                </Text>
              )}
            </View>
          </View>

          {/* Desktop members toggle */}
          {!isPhone && (
            <Pressable
              onPress={handleToggleMembers}
              className={`h-8 w-8 items-center justify-center rounded-lg ${
                showMembers ? 'bg-stone-700' : ''
              }`}
            >
              <Users size={18} color={showMembers ? '#eab308' : '#78716c'} />
            </Pressable>
          )}
        </View>

        {/* Chat */}
        <ChatView
          sitDownId={sitDown.id}
          userId={user?.id}
          members={participantMembers}
          memberOwnerMap={memberOwnerMap}
          messages={messages}
          typingIndicators={typingIndicators}
          lastReadAt={lastReadAt}
          enteredAt={enteredAt}
          messagesError={messagesError}
          onClearMessagesError={clearMessagesError}
          onRetryMessages={refetchMessages}
          refetchMessages={refetchMessages}
        />
      </View>

      {/* Desktop side panel with dismiss backdrop */}
      {!isPhone && showMembers && (
        <>
          <Pressable
            onPress={() => setShowMembers(false)}
            style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 1 }}
          />
          <View className="w-72 border-l border-stone-800 bg-stone-900" style={{ zIndex: 2 }}>
            <MemberList {...memberListProps} />
          </View>
        </>
      )}
    </View>
  );

  return (
    <>
      <KeyboardAvoidingView
        className="flex-1 bg-stone-950"
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
      >
        {content}
      </KeyboardAvoidingView>

      {/* Phone: bottom sheet for members */}
      {isPhone && (
        <BottomSheet
          ref={bottomSheetRef}
          index={-1}
          snapPoints={snapPoints}
          onChange={handleBottomSheetChange}
          enablePanDownToClose
          backgroundStyle={{ backgroundColor: '#1c1917' }}
          handleIndicatorStyle={{ backgroundColor: '#57534e' }}
        >
          <BottomSheetScrollView
            style={{ flex: 1 }}
            contentContainerStyle={{ padding: 12 }}
          >
            <MemberList {...memberListProps} />
          </BottomSheetScrollView>
        </BottomSheet>
      )}
    </>
  );
}
