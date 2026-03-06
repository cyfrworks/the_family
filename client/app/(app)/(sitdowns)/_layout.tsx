import { Stack } from 'expo-router';
import { useResponsive } from '../../../hooks/useResponsive';

export default function SitDownsLayout() {
  const { isDesktop } = useResponsive();

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: '#0c0a09' },
        gestureEnabled: !isDesktop,
        animation: isDesktop ? 'none' : 'default',
      }}
    >
      <Stack.Screen name="sitdowns" />
      <Stack.Screen name="sitdown/[id]" />
    </Stack>
  );
}
