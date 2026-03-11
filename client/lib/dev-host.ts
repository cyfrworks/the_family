import Constants from 'expo-constants';

export function getDevHost(): string | null {
  if (!__DEV__) return null;
  const host = Constants.expoConfig?.hostUri ?? Constants.debuggerHost;
  if (!host) return null;
  return host.split(':')[0];
}
