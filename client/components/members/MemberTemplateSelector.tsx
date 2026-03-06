import { Modal, View, Text, Pressable, FlatList } from 'react-native';
import { X } from 'lucide-react-native';
import { MEMBER_TEMPLATES } from '../../config/constants';
import { useResponsive } from '../../hooks/useResponsive';
import type { MemberTemplate } from '../../lib/types';

interface MemberTemplateSelectorProps {
  visible: boolean;
  onSelect: (template: MemberTemplate) => void;
  onClose: () => void;
}

export function MemberTemplateSelector({ visible, onSelect, onClose }: MemberTemplateSelectorProps) {
  const { isPhone } = useResponsive();
  const numColumns = isPhone ? 1 : 2;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <Pressable
        className="flex-1 items-center justify-center bg-black/60 p-4"
        onPress={onClose}
      >
        <Pressable
          className="w-full max-w-2xl rounded-xl border border-stone-800 bg-stone-900"
          onPress={() => {}}
        >
          {/* Header */}
          <View className="flex-row items-center justify-between border-b border-stone-800 px-5 py-4">
            <View>
              <Text className="font-serif text-lg font-bold text-stone-100">The Outfit</Text>
              <Text className="mt-0.5 text-xs text-stone-500">
                Pick a personality, then choose a model.
              </Text>
            </View>
            <Pressable onPress={onClose} className="p-1">
              <X size={20} color="#a8a29e" />
            </Pressable>
          </View>

          {/* Template Grid */}
          <FlatList
            key={numColumns}
            data={MEMBER_TEMPLATES}
            keyExtractor={(item) => item.slug}
            numColumns={numColumns}
            contentContainerClassName="p-5"
            columnWrapperClassName={numColumns > 1 ? 'gap-3' : undefined}
            ItemSeparatorComponent={() => <View className="h-3" />}
            style={{ maxHeight: 400 }}
            renderItem={({ item: template }) => (
              <Pressable
                onPress={() => onSelect(template)}
                className="flex-1 rounded-xl border border-stone-800 bg-stone-800/50 p-4"
              >
                <View className="flex-row items-center gap-3">
                  <Text className="text-2xl">{template.avatar_emoji}</Text>
                  <Text className="font-medium text-stone-100">{template.name}</Text>
                </View>
                <Text className="mt-2 text-xs text-stone-400">{template.description}</Text>
              </Pressable>
            )}
          />
        </Pressable>
      </Pressable>
    </Modal>
  );
}
