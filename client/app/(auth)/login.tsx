import { useState } from 'react';
import { View, Text, TextInput, Pressable, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { Link, router } from 'expo-router';
import { useAuth } from '../../contexts/AuthContext';
import { auth } from '../../lib/supabase';
import { RunYourFamilyButton } from '../../components/common/RunYourFamilyButton';

export default function LoginScreen() {
  const { signIn } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const [forgotMode, setForgotMode] = useState(false);
  const [resetSending, setResetSending] = useState(false);
  const [resetSent, setResetSent] = useState(false);
  const [resetError, setResetError] = useState('');

  async function handleSubmit() {
    setError('');
    setLoading(true);
    try {
      await signIn(email, password);
      router.replace('/(app)');
    } catch {
      setError("The family doesn't recognize that name and password. Try again.");
    } finally {
      setLoading(false);
    }
  }

  async function handleResetPassword() {
    setResetError('');
    setResetSending(true);
    try {
      await auth.resetPassword(email);
      setResetSent(true);
    } catch (err) {
      setResetError(err instanceof Error ? err.message : 'Failed to send reset link');
    } finally {
      setResetSending(false);
    }
  }

  if (forgotMode) {
    return (
      <SafeAreaView className="flex-1 bg-stone-950">
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} className="flex-1">
          <ScrollView contentContainerClassName="flex-1 justify-center px-4">
            <View className="mx-auto w-full max-w-sm">
              <View className="mb-8 items-center">
                <Text className="font-serif text-4xl font-bold text-gold-500">The Family</Text>
              </View>
              <View className="rounded-xl border border-stone-800 bg-stone-900 p-6">
                {resetSent ? (
                  <View className="gap-4">
                    <View className="rounded-lg border border-green-800 bg-green-900/30 p-3">
                      <Text className="text-sm text-green-300">If that email is in the family, you'll receive a reset link.</Text>
                    </View>
                    <Pressable onPress={() => { setForgotMode(false); setResetSent(false); }}>
                      <Text className="text-sm text-gold-500">Back to sign in</Text>
                    </Pressable>
                  </View>
                ) : (
                  <View className="gap-4">
                    {resetError ? (
                      <View className="rounded-lg border border-red-800 bg-red-900/30 p-3">
                        <Text className="text-sm text-red-300">{resetError}</Text>
                      </View>
                    ) : null}
                    <Text className="text-sm text-stone-400">Enter your email and we'll send you a link to reset your password.</Text>
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
                    <Pressable
                      onPress={handleResetPassword}
                      disabled={resetSending}
                      className="w-full items-center rounded-lg bg-gold-600 px-4 py-2.5 disabled:opacity-50"
                    >
                      <Text className="font-semibold text-stone-950">{resetSending ? 'Sending...' : 'Send Reset Link'}</Text>
                    </Pressable>
                    <Pressable onPress={() => { setForgotMode(false); setResetError(''); }}>
                      <Text className="text-sm text-gold-500">Back to sign in</Text>
                    </Pressable>
                  </View>
                )}
              </View>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    );
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
              <Text className="mt-2 text-stone-400">Every sit-down starts with trust.</Text>
            </View>
            <View className="rounded-xl border border-stone-800 bg-stone-900 p-6">
              <View className="gap-4">
                {error ? (
                  <View className="rounded-lg border border-red-800 bg-red-900/30 p-3">
                    <Text className="text-sm text-red-300">{error}</Text>
                  </View>
                ) : null}
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
                    placeholder="Enter your password"
                    placeholderTextColor="#78716c"
                    className="w-full rounded-lg border border-stone-700 bg-stone-800 px-3 py-2 text-stone-100"
                  />
                  <Pressable onPress={() => setForgotMode(true)} className="mt-1 self-end">
                    <Text className="text-sm text-gold-500">Forgot password?</Text>
                  </Pressable>
                </View>
                <Pressable
                  onPress={handleSubmit}
                  disabled={loading}
                  className="w-full items-center rounded-lg bg-gold-600 px-4 py-2.5 disabled:opacity-50"
                >
                  <Text className="font-semibold text-stone-950">{loading ? 'Signing in...' : 'Sign In'}</Text>
                </Pressable>
                <View className="items-center">
                  <Text className="text-sm text-stone-400">
                    No account?{' '}
                  </Text>
                  <Link href="/(auth)/signup" asChild>
                    <Pressable>
                      <Text className="text-sm text-gold-500">Join the Family</Text>
                    </Pressable>
                  </Link>
                </View>
              </View>
            </View>

            <View className="mt-6 items-center">
              <RunYourFamilyButton />
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
