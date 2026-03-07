import { Redirect } from 'expo-router';
import { Drawer } from 'expo-router/drawer';
import { Tabs } from 'expo-router/tabs';
import { useWindowDimensions } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../../contexts/AuthContext';
import { CommissionProvider } from '../../contexts/CommissionContext';
import { FamilySitDownProvider } from '../../contexts/FamilySitDownContext';
import { RealtimeProvider } from '../../providers/RealtimeProvider';
import { Sidebar } from '../../components/layout/Sidebar';
import { MobileTabBar } from '../../components/layout/MobileTabBar';
import { View, Text, ActivityIndicator } from 'react-native';

export default function AppLayout() {
  const { user, loading } = useAuth();
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
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

  if (isDesktop) {
    return (
      <GestureHandlerRootView style={{ flex: 1 }}>
        <RealtimeProvider>
          <FamilySitDownProvider>
            <CommissionProvider>
              <Drawer
                drawerContent={(props) => <Sidebar {...props} />}
                screenOptions={{
                  drawerType: 'permanent',
                  drawerStyle: {
                    width: 288,
                    backgroundColor: '#1c1917',
                    borderRightWidth: 0,
                  },
                  headerShown: false,
                  swipeEnabled: false,
                  sceneStyle: { backgroundColor: '#0c0a09' },
                }}
              >
                <Drawer.Screen name="index" options={{ title: 'Home' }} />
                <Drawer.Screen name="(sitdowns)" options={{ title: 'Sit-downs', drawerItemStyle: { display: 'none' } }} />
                <Drawer.Screen name="members" options={{ title: 'Members', drawerItemStyle: { display: 'none' } }} />
                <Drawer.Screen name="settings" options={{ title: 'Settings', drawerItemStyle: { display: 'none' } }} />
                <Drawer.Screen name="admin" options={{ title: 'Admin', drawerItemStyle: { display: 'none' } }} />
                <Drawer.Screen name="commission" options={{ title: 'Commission', drawerItemStyle: { display: 'none' } }} />
              </Drawer>
            </CommissionProvider>
          </FamilySitDownProvider>
        </RealtimeProvider>
      </GestureHandlerRootView>
    );
  }

  // Mobile: bottom tabs
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <RealtimeProvider>
        <FamilySitDownProvider>
          <CommissionProvider>
            <Tabs
              tabBar={(props) => <MobileTabBar {...props} />}
              screenOptions={{
                headerShown: false,
                sceneStyle: { backgroundColor: '#0c0a09', paddingTop: insets.top },
              }}
            >
              <Tabs.Screen
                name="(sitdowns)"
                options={{ title: 'Sit-downs' }}
              />
              <Tabs.Screen
                name="commission"
                options={{ title: 'Commission' }}
              />
              <Tabs.Screen
                name="members"
                options={{ title: 'Members' }}
              />
              <Tabs.Screen
                name="admin"
                options={{ title: 'Admin' }}
              />
              <Tabs.Screen
                name="settings"
                options={{ title: 'Settings' }}
              />
              <Tabs.Screen
                name="index"
                options={{ title: 'Home', href: null }}
              />
            </Tabs>
          </CommissionProvider>
        </FamilySitDownProvider>
      </RealtimeProvider>
    </GestureHandlerRootView>
  );
}
