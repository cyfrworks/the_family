import { useEffect } from 'react';
import { View, Text } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withSequence,
  withTiming,
  withDelay,
} from 'react-native-reanimated';

interface TypingIndicatorProps {
  memberName: string;
}

function AnimatedDot({ delay }: { delay: number }) {
  const opacity = useSharedValue(0.3);

  useEffect(() => {
    opacity.value = withDelay(
      delay,
      withRepeat(
        withSequence(
          withTiming(1, { duration: 400 }),
          withTiming(0.3, { duration: 400 }),
        ),
        -1,
        false,
      ),
    );
  }, [delay, opacity]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#eab308',
  }));

  return <Animated.View style={animatedStyle} />;
}

export function TypingIndicator({ memberName }: TypingIndicatorProps) {
  return (
    <View className="flex-row items-center gap-2 px-4 py-2">
      <View className="flex-row items-center gap-1">
        <AnimatedDot delay={0} />
        <AnimatedDot delay={150} />
        <AnimatedDot delay={300} />
      </View>
      <Text className="text-xs text-stone-500 italic">
        {memberName} is deliberating...
      </Text>
    </View>
  );
}
