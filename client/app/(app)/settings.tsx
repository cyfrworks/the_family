import { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { useAuth } from '../../contexts/AuthContext';
import { cyfrCall } from '../../lib/cyfr';
import { getAccessToken, getRefreshToken, setAccessToken, setRefreshToken } from '../../lib/supabase';
import { supabase } from '../../lib/realtime';
import { toast } from '../../lib/toast';
import { BackgroundWatermark } from '../../components/BackgroundWatermark';

const SETTINGS_API_REF = 'formula:local.settings-api:0.1.0';

export default function SettingsScreen() {
  const { profile, user } = useAuth();
  const [displayName, setDisplayName] = useState(profile?.display_name ?? '');
  const [saving, setSaving] = useState(false);

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [changingPassword, setChangingPassword] = useState(false);

  async function handleSave() {
    if (!profile) return;
    setSaving(true);
    try {
      const accessToken = getAccessToken();
      if (!accessToken) throw new Error('Not authenticated');

      const result = await cyfrCall('execution', {
        action: 'run',
        reference: SETTINGS_API_REF,
        input: { action: 'update_profile', access_token: accessToken, display_name: displayName },
        type: 'formula',
        timeout: 30000,
      });

      const res = result as Record<string, unknown> | null;
      if (res?.error) throw new Error((res.error as Record<string, string>).message);

      toast.success('Your identity has been updated.');
    } catch {
      toast.error("Couldn't change your papers.");
    }
    setSaving(false);
  }

  async function handleChangePassword() {
    if (!user?.email) return;

    if (newPassword.length < 8) {
      toast.error('New password must be at least 8 characters.');
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error('New passwords do not match.');
      return;
    }

    setChangingPassword(true);
    try {
      const accessToken = getAccessToken();
      const refreshToken = getRefreshToken();
      if (!accessToken) throw new Error('Not authenticated');

      // Verify current password
      const { error: verifyError } = await supabase.auth.signInWithPassword({
        email: user.email,
        password: currentPassword,
      });
      if (verifyError) throw new Error('Current password is incorrect.');

      // Set session and update password
      await supabase.auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken || '',
      });
      const { error: updateError } = await supabase.auth.updateUser({ password: newPassword });
      if (updateError) throw new Error(updateError.message);

      // Re-sign-in for fresh tokens
      const { data: freshSession, error: signInError } = await supabase.auth.signInWithPassword({
        email: user.email,
        password: newPassword,
      });
      if (signInError) throw new Error(signInError.message);

      if (freshSession.session) {
        setAccessToken(freshSession.session.access_token);
        setRefreshToken(freshSession.session.refresh_token);
      }

      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      toast.success('Your password has been changed.');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Password change failed.');
    }
    setChangingPassword(false);
  }

  return (
    <View className="flex-1 bg-stone-950">
      <BackgroundWatermark />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        className="flex-1"
      >
        <ScrollView
          contentContainerClassName="p-6"
          keyboardShouldPersistTaps="handled"
        >
          <View className="mx-auto w-full max-w-lg">
            <Text className="mb-6 font-serif text-3xl font-bold text-stone-100">Settings</Text>

            {/* Profile form */}
            <View className="rounded-xl border border-stone-800 bg-stone-900 p-6 gap-4">
              <View>
                <Text className="mb-1 text-sm font-medium text-stone-300">Display Name</Text>
                <TextInput
                  value={displayName}
                  onChangeText={setDisplayName}
                  placeholder="Your name"
                  placeholderTextColor="#57534e"
                  className="w-full rounded-lg border border-stone-700 bg-stone-800 px-3 py-2.5 text-stone-100"
                />
              </View>

              <View>
                <Text className="mb-1 text-sm font-medium text-stone-300">Email</Text>
                <Text className="text-sm text-stone-500">
                  {profile?.id ? 'Managed by Supabase Auth' : 'Not available'}
                </Text>
              </View>

              <Pressable
                onPress={handleSave}
                disabled={saving}
                className={`self-start rounded-lg bg-gold-600 px-4 py-2.5 ${saving ? 'opacity-50' : ''}`}
              >
                {saving ? (
                  <ActivityIndicator size="small" color="#0c0a09" />
                ) : (
                  <Text className="text-sm font-semibold text-stone-950">Save Changes</Text>
                )}
              </Pressable>
            </View>

            {/* Password form */}
            <View className="mt-6 rounded-xl border border-stone-800 bg-stone-900 p-6 gap-4">
              <Text className="font-serif text-xl font-semibold text-stone-100">Change Password</Text>

              <View>
                <Text className="mb-1 text-sm font-medium text-stone-300">Current Password</Text>
                <TextInput
                  value={currentPassword}
                  onChangeText={setCurrentPassword}
                  secureTextEntry
                  placeholder="Enter current password"
                  placeholderTextColor="#57534e"
                  className="w-full rounded-lg border border-stone-700 bg-stone-800 px-3 py-2.5 text-stone-100"
                />
              </View>

              <View>
                <Text className="mb-1 text-sm font-medium text-stone-300">New Password</Text>
                <TextInput
                  value={newPassword}
                  onChangeText={setNewPassword}
                  secureTextEntry
                  placeholder="At least 8 characters"
                  placeholderTextColor="#57534e"
                  className="w-full rounded-lg border border-stone-700 bg-stone-800 px-3 py-2.5 text-stone-100"
                />
              </View>

              <View>
                <Text className="mb-1 text-sm font-medium text-stone-300">Confirm New Password</Text>
                <TextInput
                  value={confirmPassword}
                  onChangeText={setConfirmPassword}
                  secureTextEntry
                  placeholder="Re-enter new password"
                  placeholderTextColor="#57534e"
                  className="w-full rounded-lg border border-stone-700 bg-stone-800 px-3 py-2.5 text-stone-100"
                />
              </View>

              <Pressable
                onPress={handleChangePassword}
                disabled={changingPassword}
                className={`self-start rounded-lg bg-gold-600 px-4 py-2.5 ${changingPassword ? 'opacity-50' : ''}`}
              >
                {changingPassword ? (
                  <ActivityIndicator size="small" color="#0c0a09" />
                ) : (
                  <Text className="text-sm font-semibold text-stone-950">Change Password</Text>
                )}
              </Pressable>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}
