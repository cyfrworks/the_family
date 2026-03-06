import { useState } from 'react';
import { View, Text, TextInput, Pressable, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { getSupabase } from '../../lib/realtime';

export default function ResetPasswordScreen() {
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  // Note: On native, deep linking would provide the token via route params.
  // For now, this screen is primarily for web where the hash fragment is available.

  async function handleSubmit() {
    if (newPassword.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setError('');
    setLoading(true);
    try {
      // On web, parse recovery token from URL hash
      let recoveryToken = '';
      let refreshToken = '';
      if (typeof window !== 'undefined' && window.location) {
        const hash = window.location.hash.substring(1);
        const params = new URLSearchParams(hash);
        recoveryToken = params.get('access_token') || '';
        refreshToken = params.get('refresh_token') || '';
      }

      if (!recoveryToken) {
        setError('No recovery token found. Please use the link from your email.');
        setLoading(false);
        return;
      }

      await getSupabase().auth.setSession({
        access_token: recoveryToken,
        refresh_token: refreshToken,
      });

      const { error: updateError } = await getSupabase().auth.updateUser({ password: newPassword });
      if (updateError) throw new Error(updateError.message);

      setSuccess(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to reset password.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <SafeAreaView className="flex-1 bg-stone-950">
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} className="flex-1">
        <ScrollView contentContainerClassName="flex-1 justify-center px-4">
          <View className="mx-auto w-full max-w-sm">
            <View className="mb-8 items-center">
              <Text className="font-serif text-4xl font-bold text-gold-500">The Family</Text>
              <Text className="mt-2 text-stone-400">Set a new password.</Text>
            </View>
            <View className="rounded-xl border border-stone-800 bg-stone-900 p-6">
              {success ? (
                <View className="gap-4">
                  <View className="rounded-lg border border-green-800 bg-green-900/30 p-3">
                    <Text className="text-sm text-green-300">Your password has been reset. You may now sign in.</Text>
                  </View>
                  <Pressable
                    onPress={() => router.replace('/(auth)/login')}
                    className="w-full items-center rounded-lg bg-gold-600 px-4 py-2.5"
                  >
                    <Text className="font-semibold text-stone-950">Back to Sign In</Text>
                  </Pressable>
                </View>
              ) : (
                <View className="gap-4">
                  {error ? (
                    <View className="rounded-lg border border-red-800 bg-red-900/30 p-3">
                      <Text className="text-sm text-red-300">{error}</Text>
                    </View>
                  ) : null}
                  <View>
                    <Text className="mb-1 text-sm font-medium text-stone-300">New Password</Text>
                    <TextInput
                      value={newPassword}
                      onChangeText={setNewPassword}
                      secureTextEntry
                      placeholder="At least 8 characters"
                      placeholderTextColor="#78716c"
                      className="w-full rounded-lg border border-stone-700 bg-stone-800 px-3 py-2 text-stone-100"
                    />
                  </View>
                  <View>
                    <Text className="mb-1 text-sm font-medium text-stone-300">Confirm Password</Text>
                    <TextInput
                      value={confirmPassword}
                      onChangeText={setConfirmPassword}
                      secureTextEntry
                      placeholder="Re-enter new password"
                      placeholderTextColor="#78716c"
                      className="w-full rounded-lg border border-stone-700 bg-stone-800 px-3 py-2 text-stone-100"
                    />
                  </View>
                  <Pressable
                    onPress={handleSubmit}
                    disabled={loading}
                    className="w-full items-center rounded-lg bg-gold-600 px-4 py-2.5 disabled:opacity-50"
                  >
                    <Text className="font-semibold text-stone-950">{loading ? 'Resetting...' : 'Reset Password'}</Text>
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
