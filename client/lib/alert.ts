import { Alert, Platform } from 'react-native';

/**
 * Cross-platform confirm dialog. Uses window.confirm on web, Alert.alert on native.
 * Returns a promise that resolves true (confirmed) or false (cancelled).
 */
export function confirmAlert(title: string, message: string): Promise<boolean> {
  if (Platform.OS === 'web') {
    return Promise.resolve(window.confirm(message));
  }
  return new Promise((resolve) => {
    Alert.alert(title, message, [
      { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
      { text: 'Confirm', style: 'destructive', onPress: () => resolve(true) },
    ]);
  });
}
