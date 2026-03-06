import { Redirect } from 'expo-router';
import { Drawer } from 'expo-router/drawer';
import { useWindowDimensions } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { useAuth } from '../../contexts/AuthContext';
import { CommissionProvider } from '../../contexts/CommissionContext';
import { Sidebar } from '../../components/layout/Sidebar';
import { View, Text, ActivityIndicator } from 'react-native';

export default function AppLayout() {
  const { user, loading } = useAuth();
  const { width } = useWindowDimensions();
  const isDesktop = width >= 1024;

  if (loading) {
    return (
      <View className="flex-1 items-center justify-center bg-stone-950">
        <ActivityIndicator color="#d97706" />
      </View>
    );
  }

  if (!user) {
    return <Redirect href="/(auth)/login" />;
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <CommissionProvider>
        <Drawer
          drawerContent={(props) => <Sidebar {...props} />}
          screenOptions={{
            drawerType: isDesktop ? 'permanent' : 'front',
            drawerStyle: {
              width: 288,
              backgroundColor: '#1c1917',
              borderRightWidth: 0,
            },
            headerShown: !isDesktop,
            headerStyle: { backgroundColor: '#0c0a09' },
            headerTintColor: '#d97706',
            headerTitle: () => <Text className="font-serif text-lg font-bold text-gold-500">The Family</Text>,
            swipeEnabled: !isDesktop,
            sceneStyle: { backgroundColor: '#0c0a09' },
          }}
        >
          <Drawer.Screen name="index" options={{ title: 'Home' }} />
          <Drawer.Screen name="sitdown/[id]" options={{ title: 'Sit-down', drawerItemStyle: { display: 'none' } }} />
          <Drawer.Screen name="members" options={{ title: 'Members', drawerItemStyle: { display: 'none' } }} />
          <Drawer.Screen name="settings" options={{ title: 'Settings', drawerItemStyle: { display: 'none' } }} />
          <Drawer.Screen name="admin" options={{ title: 'Admin', drawerItemStyle: { display: 'none' } }} />
        </Drawer>
      </CommissionProvider>
    </GestureHandlerRootView>
  );
}
