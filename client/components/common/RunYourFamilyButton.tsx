import { Pressable, Text, Linking, Platform } from 'react-native';
import { Github } from 'lucide-react-native';

const REPO_URL = 'https://github.com/cyfrworks/the_family';

const shimmerStyle = Platform.OS === 'web'
  ? {
      background: 'linear-gradient(110deg, #d97706 0%, #f59e0b 30%, #fde68a 50%, #f59e0b 70%, #d97706 100%)',
      backgroundSize: '200% 100%',
      animation: 'shimmer 3s linear infinite',
    } as Record<string, string>
  : undefined;

interface RunYourFamilyButtonProps {
  compact?: boolean;
}

export function RunYourFamilyButton({ compact }: RunYourFamilyButtonProps) {
  return (
    <Pressable
      onPress={() => Linking.openURL(REPO_URL)}
      className={`flex-row items-center justify-center bg-gold-600 ${
        compact
          ? 'gap-1 rounded px-1.5 py-1'
          : 'gap-2 rounded-lg px-5 py-2.5'
      }`}
      style={shimmerStyle}
    >
      <Github size={compact ? 12 : 14} color="#0c0a09" />
      <Text
        className={`font-serif font-bold text-stone-950 ${
          compact ? 'text-[10px]' : 'text-sm'
        }`}
      >
        {compact ? 'Run Yours' : 'Run Your Family'}
      </Text>
    </Pressable>
  );
}
