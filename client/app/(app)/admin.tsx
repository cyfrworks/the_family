import { useState } from 'react';
import { View, Text, Pressable, ScrollView } from 'react-native';
import { ShieldAlert } from 'lucide-react-native';
import { BackgroundWatermark } from '../../components/BackgroundWatermark';
import { useAuth } from '../../contexts/AuthContext';
import { ModelCatalogManager } from '../../components/admin/ModelCatalogManager';
import { UserTierManager } from '../../components/admin/UserTierManager';

type Tab = 'catalog' | 'users';

export default function AdminScreen() {
  const { isGodfather } = useAuth();
  const [tab, setTab] = useState<Tab>('catalog');

  if (!isGodfather) {
    return (
      <View className="flex-1 items-center justify-center bg-stone-950 p-6">
        <ShieldAlert size={48} color="#57534e" />
        <Text className="mt-4 font-serif text-2xl font-bold text-stone-100">Access Denied</Text>
        <Text className="mt-2 text-sm text-stone-400">Only the Godfather can access this page.</Text>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-stone-950">
      <BackgroundWatermark />
      <ScrollView contentContainerClassName="p-6">
        <View className="mx-auto w-full max-w-4xl">
          {/* Header */}
          <View className="mb-8">
            <Text className="font-serif text-3xl font-bold text-stone-100">Admin</Text>
            <Text className="mt-1 text-sm text-stone-400">
              Manage the model catalog and user tiers.
            </Text>
          </View>

          {/* Tab Bar */}
          <View className="mb-6 flex-row gap-1 rounded-lg border border-stone-800 bg-stone-900 p-1">
            <Pressable
              onPress={() => setTab('catalog')}
              className={`flex-1 items-center rounded-md px-4 py-2 ${
                tab === 'catalog' ? 'bg-stone-800' : ''
              }`}
            >
              <Text className={`text-sm font-medium ${
                tab === 'catalog' ? 'text-gold-500' : 'text-stone-400'
              }`}>
                Model Catalog
              </Text>
            </Pressable>
            <Pressable
              onPress={() => setTab('users')}
              className={`flex-1 items-center rounded-md px-4 py-2 ${
                tab === 'users' ? 'bg-stone-800' : ''
              }`}
            >
              <Text className={`text-sm font-medium ${
                tab === 'users' ? 'text-gold-500' : 'text-stone-400'
              }`}>
                Users
              </Text>
            </Pressable>
          </View>

          {/* Content */}
          {tab === 'catalog' && <ModelCatalogManager />}
          {tab === 'users' && <UserTierManager />}
        </View>
      </ScrollView>
    </View>
  );
}
