import { View, Text, Pressable } from 'react-native';
import { router } from 'expo-router';

export default function NotFoundScreen() {
  return (
    <View className="flex-1 items-center justify-center bg-stone-950 p-6">
      <Text className="font-serif text-2xl font-bold text-stone-300">Page Not Found</Text>
      <Pressable onPress={() => router.replace('/')} className="mt-4 rounded-lg bg-gold-600 px-4 py-2">
        <Text className="font-semibold text-stone-950">Go Home</Text>
      </Pressable>
    </View>
  );
}
