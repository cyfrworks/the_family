import { View, Text } from 'react-native';
import { Image } from 'expo-image';
import type { Profile } from '../../lib/types';

interface UserAvatarProps {
  profile: Pick<Profile, 'display_name' | 'avatar_url'> | null | undefined;
  size: number;
}

export function UserAvatar({ profile, size }: UserAvatarProps) {
  const avatarUrl = profile?.avatar_url;

  if (avatarUrl) {
    return (
      <Image
        source={{ uri: avatarUrl }}
        style={{
          width: size,
          height: size,
          borderRadius: size / 2,
        }}
        contentFit="cover"
        transition={200}
      />
    );
  }

  // Fallback: gold circle with first letter of display_name
  const initial = profile?.display_name?.[0]?.toUpperCase() ?? 'D';
  const fontSize = size * 0.45;

  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: '#ca8a04', // gold-600
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Text
        style={{
          fontSize,
          fontWeight: 'bold',
          color: '#0c0a09', // stone-950
        }}
      >
        {initial}
      </Text>
    </View>
  );
}
