import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { router } from 'expo-router';
import { cyfrCall } from './cyfr';
import { getAccessToken } from './supabase';
import { getActiveSitDown } from './realtime-hub';

const SETTINGS_API_REF = 'formula:local.settings-api:0.1.0';

let _currentToken: string | null = null;

export function getCurrentPushToken() {
  return _currentToken;
}

// ---------------------------------------------------------------------------
// Foreground handler — suppress if user is viewing the same sit-down
// ---------------------------------------------------------------------------

Notifications.setNotificationHandler({
  handleNotification: async (notification) => {
    const data = notification.request.content.data as { sitDownId?: string } | undefined;
    if (data?.sitDownId && data.sitDownId === getActiveSitDown()) {
      return { shouldShowAlert: false, shouldPlaySound: false, shouldSetBadge: false, shouldShowBanner: false, shouldShowList: false };
    }
    return { shouldShowAlert: true, shouldPlaySound: true, shouldSetBadge: false, shouldShowBanner: true, shouldShowList: true };
  },
});

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

export async function registerForPushNotifications(): Promise<string | null> {
  if (Platform.OS === 'web') {
    console.log('Push notifications are not supported on web');
    return null;
  }

  if (!Device.isDevice) {
    console.log('Push notifications require a physical device');
    return null;
  }

  const { status: existing } = await Notifications.getPermissionsAsync();
  let finalStatus = existing;

  if (existing !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== 'granted') {
    console.log('Push notification permission denied');
    return null;
  }

  const projectId = Constants.expoConfig?.extra?.eas?.projectId;
  if (!projectId) {
    console.error('Missing EAS projectId in app config');
    return null;
  }

  let token: string;
  try {
    const result = await Notifications.getExpoPushTokenAsync({ projectId });
    token = result.data;
  } catch (err) {
    console.error('Failed to get push token:', err);
    return null;
  }
  _currentToken = token;

  // Register token with backend
  const accessToken = getAccessToken();
  if (accessToken) {
    try {
      await cyfrCall('execution', {
        action: 'run',
        reference: SETTINGS_API_REF,
        input: {
          action: 'register_push_token',
          access_token: accessToken,
          token,
          platform: Platform.OS,
        },
        type: 'formula',
        timeout: 15000,
      });
    } catch (err) {
      console.error('Failed to register push token:', err);
    }
  }

  return token;
}

// ---------------------------------------------------------------------------
// Unregistration
// ---------------------------------------------------------------------------

export async function unregisterPushToken(token?: string | null): Promise<void> {
  const t = token ?? _currentToken;
  if (!t) return;

  const accessToken = getAccessToken();
  if (accessToken) {
    try {
      await cyfrCall('execution', {
        action: 'run',
        reference: SETTINGS_API_REF,
        input: {
          action: 'unregister_push_token',
          access_token: accessToken,
          token: t,
        },
        type: 'formula',
        timeout: 15000,
      });
    } catch (err) {
      console.error('Failed to unregister push token:', err);
    }
  }

  if (t === _currentToken) _currentToken = null;
}

// ---------------------------------------------------------------------------
// Deep-link handler — tap notification → navigate to sit-down
// ---------------------------------------------------------------------------

export function setupNotificationResponseListener() {
  const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
    const data = response.notification.request.content.data as { sitDownId?: string } | undefined;
    if (data?.sitDownId) {
      router.push(`/(app)/(sitdowns)/sitdown/${data.sitDownId}`);
    }
  });
  return () => subscription.remove();
}
