import { useState } from 'react';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import { cyfrCall } from '../lib/cyfr';
import { getAccessToken } from '../lib/supabase';
import { toast } from '../lib/toast';

const SETTINGS_API_REF = 'formula:local.settings-api:0.1.0';
const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';

export function useAvatarUpload() {
  const [uploading, setUploading] = useState(false);

  async function pickAndUpload(): Promise<string | null> {
    try {
      const permResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permResult.granted) {
        toast.error('Photo library access is required.');
        return null;
      }

      const pickerResult = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });

      if (pickerResult.canceled || !pickerResult.assets[0]) return null;

      setUploading(true);

      const asset = pickerResult.assets[0];

      // Resize to 256x256 and compress as JPEG, output as base64
      const manipulated = await ImageManipulator.manipulateAsync(
        asset.uri,
        [{ resize: { width: 256, height: 256 } }],
        { compress: 0.8, format: ImageManipulator.SaveFormat.JPEG, base64: true },
      );

      if (!manipulated.base64) {
        throw new Error('Failed to convert image to base64');
      }

      const accessToken = getAccessToken();
      if (!accessToken) throw new Error('Not authenticated');

      const result = await cyfrCall('execution', {
        action: 'run',
        reference: SETTINGS_API_REF,
        input: {
          action: 'upload_avatar',
          access_token: accessToken,
          image_base64: manipulated.base64,
          supabase_url: SUPABASE_URL,
        },
        type: 'formula',
        timeout: 60000,
      });

      const res = result as Record<string, unknown> | null;
      if (res?.error) {
        const err = res.error as Record<string, string>;
        throw new Error(err.message ?? 'Upload failed');
      }

      const avatarUrl = res?.avatar_url as string;
      // Append cache-busting timestamp
      return `${avatarUrl}?t=${Date.now()}`;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Avatar upload failed.');
      return null;
    } finally {
      setUploading(false);
    }
  }

  return { pickAndUpload, uploading };
}
