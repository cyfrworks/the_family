import { View, Text } from 'react-native';
import { BackgroundWatermark } from '../../components/BackgroundWatermark';

export default function DashboardScreen() {
  return (
    <View className="flex-1 items-center justify-center p-6">
      <BackgroundWatermark />
      <View className="items-center z-10">
        <Text className="font-serif text-2xl font-bold text-stone-300">
          Welcome to The Family
        </Text>
        <Text className="mt-2 max-w-sm text-center text-sm text-stone-500">
          Select a sit-down from the sidebar to continue a conversation, or start a new one.
        </Text>
      </View>
    </View>
  );
}
