import { useState } from 'react';
import { View, Text, ScrollView, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { useAuth } from '../contexts/AuthContext';

const PROVIDERS = [
  { name: 'Anthropic', model: 'Claude' },
  { name: 'OpenAI', model: 'ChatGPT' },
  { name: 'Google', model: 'Gemini' },
  { name: 'xAI', model: 'Grok' },
  { name: 'OpenRouter', model: 'Multi-model' },
];

export function AiDisclosureScreen() {
  const { acceptAiDisclosure } = useAuth();
  const [loading, setLoading] = useState(false);

  function handleAccept() {
    setLoading(true);
    acceptAiDisclosure();
  }

  return (
    <SafeAreaView className="flex-1 bg-stone-950">
      <ScrollView contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 48, paddingBottom: 24 }}>
        <View className="items-center mb-8">
          <Image
            source={require('../assets/images/logo.png')}
            style={{ width: 100, height: 100 }}
            contentFit="contain"
          />
        </View>

        <Text className="font-serif text-2xl font-bold text-stone-100 text-center mb-4">
          AI Provider Disclosure
        </Text>

        <Text className="text-sm leading-5 text-stone-400 mb-5">
          This app uses third-party AI services to generate responses in your conversations. When you send a message, your conversation data is transmitted to one or more of the following providers for processing:
        </Text>

        <View className="rounded-lg border border-stone-800 bg-stone-900 p-4 mb-5">
          {PROVIDERS.map((p, i) => (
            <View
              key={p.name}
              className={`flex-row justify-between items-center py-2.5 ${i < PROVIDERS.length - 1 ? 'border-b border-stone-800' : ''}`}
            >
              <Text className="text-sm font-semibold text-stone-100">{p.name}</Text>
              <Text className="text-sm text-stone-500">{p.model}</Text>
            </View>
          ))}
        </View>

        <Text className="text-xs leading-4 text-stone-500 mb-6">
          By continuing, you acknowledge that your conversation messages will be processed by these third-party AI services in accordance with their respective privacy policies.
        </Text>

        <Pressable
          onPress={handleAccept}
          disabled={loading}
          className="w-full items-center rounded-lg bg-gold-600 px-4 py-2.5 disabled:opacity-50"
        >
          <Text className="font-semibold text-stone-950">
            {loading ? 'Please wait...' : 'I Understand & Agree'}
          </Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}
