import { useState } from 'react';
import { Platform, View, Text, Pressable } from 'react-native';
import { ChevronDown, ChevronUp, Copy, Check } from 'lucide-react-native';
import * as Clipboard from 'expo-clipboard';
import { getDevHost } from '../../lib/dev-host';

function getInformUrl(): string {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    return `${window.location.origin}/inform`;
  }
  const envUrl = process.env.EXPO_PUBLIC_CYFR_URL;
  if (envUrl && envUrl.startsWith('http')) {
    try { return new URL('/inform', new URL(envUrl).origin).href; } catch { /* fall through */ }
  }
  const devHost = getDevHost();
  if (devHost) return `http://${devHost}:4002/inform`;
  return 'http://localhost:4002/inform';
}

const EXAMPLES = [
  {
    label: 'Send a message',
    description: 'Push data into a sit-down the informant has been added to.',
    build: (url: string) =>
      `curl -X POST ${url} \\
  -H "Content-Type: application/json" \\
  -d '{
    "token": "inf_...",
    "action": "send_message",
    "sit_down_id": "<uuid>",
    "content": "AAPL breakout at $195"
  }'`,
  },
  {
    label: 'Create a sit-down',
    description: 'Start a new sit-down with the informant auto-added as a participant.',
    build: (url: string) =>
      `curl -X POST ${url} \\
  -H "Content-Type: application/json" \\
  -d '{
    "token": "inf_...",
    "action": "create_sit_down",
    "name": "Market Alerts"
  }'`,
  },
  {
    label: 'List sit-downs',
    description: 'Get all sit-downs this informant participates in (returns IDs + names).',
    build: (url: string) =>
      `curl -X POST ${url} \\
  -H "Content-Type: application/json" \\
  -d '{
    "token": "inf_...",
    "action": "list_sit_downs"
  }'`,
  },
  {
    label: 'Python',
    description: 'Drop-in snippet for scripts and data pipelines.',
    build: (url: string) =>
      `import requests

requests.post("${url}", json={
    "token": "inf_...",
    "action": "send_message",
    "sit_down_id": "<uuid>",
    "content": "Data from pipeline"
})`,
  },
];

export function InformantUsage() {
  const [expanded, setExpanded] = useState(false);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const url = getInformUrl();

  const handleCopy = async (index: number) => {
    await Clipboard.setStringAsync(EXAMPLES[index].build(url));
    setCopiedIndex(index);
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  return (
    <View className="mt-3 rounded-lg border border-stone-800 bg-stone-900/50">
      <Pressable
        onPress={() => setExpanded(!expanded)}
        className="flex-row items-center justify-between px-4 py-3"
      >
        <Text className="text-xs font-semibold text-stone-400">Feeding Intel</Text>
        {expanded ? (
          <ChevronUp size={14} color="#57534e" />
        ) : (
          <ChevronDown size={14} color="#57534e" />
        )}
      </Pressable>

      {expanded && (
        <View className="border-t border-stone-800 px-4 py-3 gap-3">
          <View className="rounded-lg border border-stone-700/50 bg-stone-800/40 px-3 py-2">
            <Text className="text-[10px] leading-4 text-stone-400">
              <Text className="font-semibold text-stone-300">Tip:</Text>{' '}
              The informant must be added as a participant in the sit-down before it can send messages. To get the sit-down ID, use the <Text className="text-amber-500">&#8942;</Text> menu next to any sit-down and tap <Text className="font-semibold text-stone-300">Copy ID</Text>.
            </Text>
          </View>
          {EXAMPLES.map((example, i) => (
            <View key={i} className="rounded-lg bg-stone-800/60 p-3">
              <View className="mb-2 flex-row items-center justify-between">
                <View>
                  <Text className="text-[11px] font-medium text-stone-300">{example.label}</Text>
                  <Text className="text-[10px] text-stone-500">{example.description}</Text>
                </View>
                <Pressable
                  onPress={() => handleCopy(i)}
                  className="flex-row items-center gap-1 rounded px-2 py-1"
                >
                  {copiedIndex === i ? (
                    <>
                      <Check size={12} color="#22c55e" />
                      <Text className="text-[10px] text-green-500">Copied</Text>
                    </>
                  ) : (
                    <>
                      <Copy size={12} color="#78716c" />
                      <Text className="text-[10px] text-stone-500">Copy</Text>
                    </>
                  )}
                </Pressable>
              </View>
              <Text className="font-mono text-[10px] leading-4 text-stone-400" selectable>
                {example.build(url)}
              </Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}
