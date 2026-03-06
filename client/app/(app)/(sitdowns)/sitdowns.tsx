import { View, ScrollView } from 'react-native';
import { SitDownList } from '../../../components/sitdowns/SitDownList';
import { BackgroundWatermark } from '../../../components/BackgroundWatermark';

export default function SitDownsScreen() {
  return (
    <View className="flex-1 bg-stone-950">
      <BackgroundWatermark />
      <ScrollView contentContainerStyle={{ flexGrow: 1 }}>
        <SitDownList variant="tab" />
      </ScrollView>
    </View>
  );
}
