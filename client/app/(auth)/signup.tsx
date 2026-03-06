import { useState } from 'react';
import { View, Text, TextInput, Pressable, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { Link, router } from 'expo-router';
import { useAuth } from '../../contexts/AuthContext';

export default function SignupScreen() {
  const { signUp } = useAuth();
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit() {
    setError('');
    setLoading(true);
    try {
      await signUp(email, password, displayName);
      router.replace('/(app)');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create account');
    } finally {
      setLoading(false);
    }
  }

  return (
    <SafeAreaView className="flex-1 bg-stone-950">
      {/* Banner image at top */}
      <Image
        source={require('../../assets/images/banner.png')}
        style={{
          position: 'absolute',
          top: 0,
          left: '50%',
          width: 600,
          height: 300,
          opacity: 0.25,
          transform: [{ translateX: -300 }],
        }}
        contentFit="contain"
      />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} className="flex-1">
        <ScrollView contentContainerClassName="flex-1 justify-center px-4">
          <View className="mx-auto w-full max-w-sm">
            <View className="mb-8 items-center">
              <Text className="font-serif text-4xl font-bold text-gold-500">The Family</Text>
              <Text className="mt-2 text-stone-400">Become a made member.</Text>
            </View>
            <View className="rounded-xl border border-stone-800 bg-stone-900 p-6">
              <View className="gap-4">
                {error ? (
                  <View className="rounded-lg border border-red-800 bg-red-900/30 p-3">
                    <Text className="text-sm text-red-300">{error}</Text>
                  </View>
                ) : null}
                <View>
                  <Text className="mb-1 text-sm font-medium text-stone-300">Display Name</Text>
                  <TextInput
                    value={displayName}
                    onChangeText={setDisplayName}
                    placeholder="Your alias"
                    placeholderTextColor="#78716c"
                    className="w-full rounded-lg border border-stone-700 bg-stone-800 px-3 py-2 text-stone-100"
                  />
                </View>
                <View>
                  <Text className="mb-1 text-sm font-medium text-stone-300">Email</Text>
                  <TextInput
                    value={email}
                    onChangeText={setEmail}
                    keyboardType="email-address"
                    autoCapitalize="none"
                    placeholder="don@family.com"
                    placeholderTextColor="#78716c"
                    className="w-full rounded-lg border border-stone-700 bg-stone-800 px-3 py-2 text-stone-100"
                  />
                </View>
                <View>
                  <Text className="mb-1 text-sm font-medium text-stone-300">Password</Text>
                  <TextInput
                    value={password}
                    onChangeText={setPassword}
                    secureTextEntry
                    placeholder="Min 6 characters"
                    placeholderTextColor="#78716c"
                    className="w-full rounded-lg border border-stone-700 bg-stone-800 px-3 py-2 text-stone-100"
                  />
                </View>
                <Pressable
                  onPress={handleSubmit}
                  disabled={loading}
                  className="w-full items-center rounded-lg bg-gold-600 px-4 py-2.5 disabled:opacity-50"
                >
                  <Text className="font-semibold text-stone-950">{loading ? 'Creating account...' : 'Join the Family'}</Text>
                </Pressable>
                <View className="items-center">
                  <Text className="text-sm text-stone-400">
                    Already a member?{' '}
                  </Text>
                  <Link href="/(auth)/login" asChild>
                    <Pressable>
                      <Text className="text-sm text-gold-500">Sign in</Text>
                    </Pressable>
                  </Link>
                </View>
              </View>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
