import { View, Text, Pressable, ScrollView } from 'react-native';
import { PROVIDER_COLORS } from '../../config/constants';
import type { Member } from '../../lib/types';

interface MentionPopoverProps {
  candidates: Member[];
  selectedIndex: number;
  onSelect: (index: number) => void;
  memberOwnerMap?: Map<string, string>;
}

export function MentionPopover({
  candidates,
  selectedIndex,
  onSelect,
  memberOwnerMap,
}: MentionPopoverProps) {
  return (
    <View className="mb-1">
      <ScrollView
        className="max-h-48 rounded-lg border border-stone-700 bg-stone-800"
        keyboardShouldPersistTaps="always"
      >
        <View className="py-1">
          {candidates.map((member, i) => {
            const ownerName = memberOwnerMap?.get(member.id);
            const isSelected = i === selectedIndex;

            return (
              <Pressable
                key={member.id}
                onPress={() => onSelect(i)}
                className={`flex-row items-center gap-2 px-3 py-2 ${
                  isSelected ? 'bg-stone-700' : ''
                }`}
              >
                {member.id === 'all' ? (
                  <>
                    <View className="h-6 w-6 items-center justify-center rounded bg-yellow-600">
                      <Text className="text-[10px] font-bold text-stone-950">@</Text>
                    </View>
                    <Text
                      className={`font-medium ${isSelected ? 'text-yellow-500' : 'text-stone-300'}`}
                    >
                      @all
                    </Text>
                    <Text className="ml-auto text-xs text-stone-500">All Members</Text>
                  </>
                ) : (
                  <>
                    <View
                      className={`h-6 w-6 items-center justify-center rounded ${member.catalog_model ? PROVIDER_COLORS[member.catalog_model.provider] : 'bg-stone-600'}`}
                    >
                      <Text className="text-[10px] font-bold text-white">
                        {member.catalog_model?.provider[0].toUpperCase() ?? '?'}
                      </Text>
                    </View>
                    <Text
                      className={`flex-1 ${isSelected ? 'text-yellow-500' : 'text-stone-300'}`}
                      numberOfLines={1}
                    >
                      {member.name}
                    </Text>
                    {ownerName && (
                      <Text className="ml-auto shrink-0 text-[10px] text-stone-500">
                        Don {ownerName}&apos;s
                      </Text>
                    )}
                  </>
                )}
              </Pressable>
            );
          })}
        </View>
      </ScrollView>
    </View>
  );
}
