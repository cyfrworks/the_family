import { View } from 'react-native';
import { Image } from 'expo-image';

export function BackgroundWatermark() {
  return (
    <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
      <Image
        source={require('../assets/images/logo.png')}
        style={{ width: 500, height: 500, opacity: 0.15 }}
        contentFit="contain"
      />
    </View>
  );
}
