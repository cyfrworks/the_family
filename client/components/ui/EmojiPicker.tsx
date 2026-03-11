import { useState } from 'react';
import { View, Text, Pressable } from 'react-native';
import { ChevronDown, X } from 'lucide-react-native';
import { Dropdown } from './Dropdown';

// Comprehensive emoji set organized by category
const EMOJI_SECTIONS: { label: string; emojis: string[] }[] = [
  {
    label: 'Smileys',
    emojis: [
      '\u{1F600}', '\u{1F603}', '\u{1F604}', '\u{1F601}', '\u{1F606}', '\u{1F605}',
      '\u{1F602}', '\u{1F923}', '\u{1F60A}', '\u{1F607}', '\u{1F642}', '\u{1F643}',
      '\u{1F609}', '\u{1F60C}', '\u{1F60D}', '\u{1F970}', '\u{1F618}', '\u{1F617}',
      '\u{1F619}', '\u{1F61A}', '\u{1F60B}', '\u{1F61B}', '\u{1F61C}', '\u{1F92A}',
      '\u{1F61D}', '\u{1F911}', '\u{1F917}', '\u{1F92D}', '\u{1F92B}', '\u{1F914}',
      '\u{1F910}', '\u{1F928}', '\u{1F610}', '\u{1F611}', '\u{1F636}', '\u{1F60F}',
      '\u{1F612}', '\u{1F644}', '\u{1F62C}', '\u{1F925}', '\u{1F60E}', '\u{1F913}',
      '\u{1F9D0}', '\u{1F615}', '\u{1F61F}', '\u{1F641}', '\u{2639}', '\u{1F62E}',
      '\u{1F62F}', '\u{1F632}', '\u{1F633}', '\u{1F97A}', '\u{1F626}', '\u{1F627}',
      '\u{1F628}', '\u{1F630}', '\u{1F625}', '\u{1F622}', '\u{1F62D}', '\u{1F631}',
      '\u{1F616}', '\u{1F623}', '\u{1F61E}', '\u{1F613}', '\u{1F629}', '\u{1F624}',
      '\u{1F620}', '\u{1F621}', '\u{1F92C}', '\u{1F608}', '\u{1F47F}', '\u{1F480}',
      '\u{2620}', '\u{1F4A9}', '\u{1F921}', '\u{1F479}', '\u{1F47A}', '\u{1F47B}',
      '\u{1F47D}', '\u{1F47E}', '\u{1F916}', '\u{1F63A}', '\u{1F638}', '\u{1F639}',
      '\u{1F63B}', '\u{1F63C}', '\u{1F63D}', '\u{1F640}', '\u{1F63F}', '\u{1F63E}',
    ],
  },
  {
    label: 'People',
    emojis: [
      '\u{1F476}', '\u{1F9D2}', '\u{1F466}', '\u{1F467}', '\u{1F468}', '\u{1F469}',
      '\u{1F9D3}', '\u{1F474}', '\u{1F475}', '\u{1F9D4}', '\u{1F471}', '\u{1F64D}',
      '\u{1F64E}', '\u{1F645}', '\u{1F646}', '\u{1F481}', '\u{1F64B}', '\u{1F647}',
      '\u{1F926}', '\u{1F937}', '\u{1F46E}', '\u{1F575}', '\u{1F482}', '\u{1F477}',
      '\u{1F934}', '\u{1F478}', '\u{1F9D5}', '\u{1F935}', '\u{1F470}', '\u{1F930}',
      '\u{1F47C}', '\u{1F385}', '\u{1F936}', '\u{1F9B8}', '\u{1F9B9}', '\u{1F9D9}',
      '\u{1F9DA}', '\u{1F9DB}', '\u{1F9DC}', '\u{1F9DD}', '\u{1F9DE}', '\u{1F9DF}',
      '\u{1F977}', '\u{1F9D1}', '\u{1F464}', '\u{1F465}', '\u{1F46A}', '\u{1F46B}',
      '\u{1F46C}', '\u{1F46D}', '\u{1F3AD}',
    ],
  },
  {
    label: 'Hands',
    emojis: [
      '\u{1F44B}', '\u{1F91A}', '\u{1F590}', '\u{270B}', '\u{1F596}', '\u{1F44C}',
      '\u{1F90F}', '\u{270C}', '\u{1F91E}', '\u{1F91F}', '\u{1F918}', '\u{1F919}',
      '\u{1F448}', '\u{1F449}', '\u{1F446}', '\u{1F447}', '\u{261D}', '\u{1F44D}',
      '\u{1F44E}', '\u{270A}', '\u{1F44A}', '\u{1F91B}', '\u{1F91C}', '\u{1F44F}',
      '\u{1F64C}', '\u{1F450}', '\u{1F932}', '\u{1F91D}', '\u{1F64F}', '\u{270D}',
      '\u{1F485}', '\u{1F933}', '\u{1F4AA}',
    ],
  },
  {
    label: 'Animals',
    emojis: [
      '\u{1F435}', '\u{1F412}', '\u{1F98D}', '\u{1F436}', '\u{1F415}', '\u{1F429}',
      '\u{1F43A}', '\u{1F98A}', '\u{1F99D}', '\u{1F431}', '\u{1F408}', '\u{1F981}',
      '\u{1F42F}', '\u{1F405}', '\u{1F406}', '\u{1F434}', '\u{1F40E}', '\u{1F984}',
      '\u{1F993}', '\u{1F98C}', '\u{1F42E}', '\u{1F402}', '\u{1F403}', '\u{1F404}',
      '\u{1F437}', '\u{1F416}', '\u{1F417}', '\u{1F43D}', '\u{1F40F}', '\u{1F411}',
      '\u{1F410}', '\u{1F42A}', '\u{1F42B}', '\u{1F999}', '\u{1F992}', '\u{1F418}',
      '\u{1F98F}', '\u{1F99B}', '\u{1F42D}', '\u{1F401}', '\u{1F400}', '\u{1F439}',
      '\u{1F430}', '\u{1F407}', '\u{1F43F}', '\u{1F994}', '\u{1F987}', '\u{1F43B}',
      '\u{1F428}', '\u{1F43C}', '\u{1F9A5}', '\u{1F9A6}', '\u{1F998}', '\u{1F9A8}',
      '\u{1F425}', '\u{1F426}', '\u{1F985}', '\u{1F986}', '\u{1F9A2}', '\u{1F989}',
      '\u{1F9A9}', '\u{1F99A}', '\u{1F99C}', '\u{1F438}', '\u{1F40A}', '\u{1F422}',
      '\u{1F98E}', '\u{1F40D}', '\u{1F432}', '\u{1F409}', '\u{1F995}', '\u{1F996}',
      '\u{1F433}', '\u{1F40B}', '\u{1F42C}', '\u{1F9AD}', '\u{1F41F}', '\u{1F420}',
      '\u{1F421}', '\u{1F988}', '\u{1F419}', '\u{1F41A}', '\u{1F40C}', '\u{1F98B}',
      '\u{1F41B}', '\u{1F41C}', '\u{1F41D}', '\u{1F41E}', '\u{1F997}', '\u{1F577}',
      '\u{1F578}', '\u{1F982}', '\u{1F99F}',
    ],
  },
  {
    label: 'Nature',
    emojis: [
      '\u{1F490}', '\u{1F338}', '\u{1F4AE}', '\u{1F3F5}', '\u{1F339}', '\u{1F940}',
      '\u{1F33A}', '\u{1F33B}', '\u{1F33C}', '\u{1F337}', '\u{1F331}', '\u{1F332}',
      '\u{1F333}', '\u{1F334}', '\u{1F335}', '\u{1F33E}', '\u{1F33F}', '\u{2618}',
      '\u{1F340}', '\u{1F341}', '\u{1F342}', '\u{1F343}', '\u{1F344}', '\u{1F30D}',
      '\u{1F30E}', '\u{1F30F}', '\u{1F310}', '\u{1F315}', '\u{1F319}', '\u{1F31F}',
      '\u{2B50}', '\u{1F31E}', '\u{2600}', '\u{26C5}', '\u{2601}', '\u{1F324}',
      '\u{1F325}', '\u{1F326}', '\u{1F308}', '\u{2602}', '\u{26C8}', '\u{26A1}',
      '\u{2744}', '\u{2603}', '\u{1F525}', '\u{1F4A7}', '\u{1F30A}', '\u{1F300}',
    ],
  },
  {
    label: 'Food & Drink',
    emojis: [
      '\u{1F347}', '\u{1F348}', '\u{1F349}', '\u{1F34A}', '\u{1F34B}', '\u{1F34C}',
      '\u{1F34D}', '\u{1F96D}', '\u{1F34E}', '\u{1F34F}', '\u{1F350}', '\u{1F351}',
      '\u{1F352}', '\u{1F353}', '\u{1F95D}', '\u{1F345}', '\u{1F965}', '\u{1F951}',
      '\u{1F346}', '\u{1F954}', '\u{1F955}', '\u{1F33D}', '\u{1F336}', '\u{1F952}',
      '\u{1F96C}', '\u{1F966}', '\u{1F9C4}', '\u{1F9C5}', '\u{1F95C}', '\u{1F950}',
      '\u{1F35E}', '\u{1F956}', '\u{1F968}', '\u{1F96F}', '\u{1F9C0}', '\u{1F356}',
      '\u{1F357}', '\u{1F969}', '\u{1F953}', '\u{1F354}', '\u{1F35F}', '\u{1F355}',
      '\u{1F32D}', '\u{1F96A}', '\u{1F32E}', '\u{1F32F}', '\u{1F959}', '\u{1F9C6}',
      '\u{1F95A}', '\u{1F373}', '\u{1F958}', '\u{1F372}', '\u{1F963}', '\u{1F957}',
      '\u{1F35D}', '\u{1F35C}', '\u{1F35B}', '\u{1F35A}', '\u{1F359}', '\u{1F358}',
      '\u{1F365}', '\u{1F960}', '\u{1F96B}', '\u{1F961}', '\u{1F362}', '\u{1F363}',
      '\u{1F364}', '\u{1F371}', '\u{1F35E}', '\u{1F367}', '\u{1F368}', '\u{1F369}',
      '\u{1F36A}', '\u{1F382}', '\u{1F370}', '\u{1F9C1}', '\u{1F36B}', '\u{1F36C}',
      '\u{1F36D}', '\u{1F36E}', '\u{1F36F}', '\u{1F37C}', '\u{1F95B}', '\u{2615}',
      '\u{1F375}', '\u{1F376}', '\u{1F37E}', '\u{1F377}', '\u{1F378}', '\u{1F379}',
      '\u{1F37A}', '\u{1F37B}', '\u{1F942}', '\u{1F943}', '\u{1F964}', '\u{1F9C3}',
    ],
  },
  {
    label: 'Activities',
    emojis: [
      '\u{26BD}', '\u{1F3C0}', '\u{1F3C8}', '\u{26BE}', '\u{1F94E}', '\u{1F3BE}',
      '\u{1F3D0}', '\u{1F3C9}', '\u{1F94F}', '\u{1F3B1}', '\u{1F3D3}', '\u{1F3F8}',
      '\u{1F94D}', '\u{1F3D2}', '\u{1F3D1}', '\u{1F94B}', '\u{1F945}', '\u{26F3}',
      '\u{1F3CB}', '\u{1F3C4}', '\u{1F3CA}', '\u{1F6B4}', '\u{1F3C7}', '\u{1F3AF}',
      '\u{1F3B3}', '\u{1F3AE}', '\u{1F3B2}', '\u{1F9E9}', '\u{265F}', '\u{1F3B0}',
      '\u{1F0CF}', '\u{1F3AD}', '\u{1F3A8}', '\u{1F3B5}', '\u{1F3B6}', '\u{1F3A4}',
      '\u{1F3B8}', '\u{1F3B9}', '\u{1F3BA}', '\u{1F3BB}', '\u{1F941}', '\u{1F3AC}',
    ],
  },
  {
    label: 'Travel',
    emojis: [
      '\u{1F697}', '\u{1F695}', '\u{1F699}', '\u{1F68C}', '\u{1F3CE}', '\u{1F3CD}',
      '\u{1F6F5}', '\u{1F6B2}', '\u{1F6A8}', '\u{1F691}', '\u{1F692}', '\u{1F693}',
      '\u{1F681}', '\u{1F680}', '\u{1F6F8}', '\u{1F6F6}', '\u{26F5}', '\u{1F6A2}',
      '\u{2708}', '\u{1F6E9}', '\u{1F6EB}', '\u{1F6EC}', '\u{1F681}', '\u{1F683}',
      '\u{1F684}', '\u{1F685}', '\u{1F686}', '\u{1F3E0}', '\u{1F3E1}', '\u{1F3D8}',
      '\u{1F3E2}', '\u{1F3E3}', '\u{1F3E5}', '\u{1F3E6}', '\u{1F3E8}', '\u{1F3EA}',
      '\u{1F3EB}', '\u{1F3EC}', '\u{1F3ED}', '\u{1F3EF}', '\u{1F3F0}', '\u{1F5FC}',
      '\u{1F5FD}', '\u{1F5FE}', '\u{26EA}', '\u{1F54C}', '\u{1F54D}', '\u{26E9}',
      '\u{1F54B}', '\u{26F2}', '\u{26FA}', '\u{1F3D4}', '\u{1F3D6}', '\u{1F3DC}',
      '\u{1F3DD}', '\u{1F3DE}', '\u{1F3DF}', '\u{1F3DB}',
    ],
  },
  {
    label: 'Objects',
    emojis: [
      '\u{231A}', '\u{1F4F1}', '\u{1F4BB}', '\u{1F5A5}', '\u{1F5A8}', '\u{2328}',
      '\u{1F4F7}', '\u{1F4F9}', '\u{1F3A5}', '\u{1F4FD}', '\u{1F4FA}', '\u{1F4FB}',
      '\u{1F4E1}', '\u{1F50B}', '\u{1F50C}', '\u{1F4A1}', '\u{1F526}', '\u{1F56F}',
      '\u{1F4D5}', '\u{1F4D6}', '\u{1F4D7}', '\u{1F4D8}', '\u{1F4D9}', '\u{1F4DA}',
      '\u{1F4D3}', '\u{1F4D2}', '\u{1F4C3}', '\u{1F4DC}', '\u{1F4C4}', '\u{1F4F0}',
      '\u{1F4B0}', '\u{1F4B3}', '\u{1F4B5}', '\u{1F4B8}', '\u{1F4B9}', '\u{1F4BC}',
      '\u{1F4E7}', '\u{1F4E8}', '\u{1F4E9}', '\u{1F4EE}', '\u{1F4E6}', '\u{1F4C8}',
      '\u{1F4C9}', '\u{1F4CA}', '\u{1F5C2}', '\u{1F5C3}', '\u{1F5C4}', '\u{1F4CB}',
      '\u{1F4CC}', '\u{1F4CD}', '\u{1F4CE}', '\u{1F587}', '\u{1F4CF}', '\u{1F4D0}',
      '\u{2702}', '\u{1F5D1}', '\u{1F50F}', '\u{1F510}', '\u{1F511}', '\u{1F5DD}',
      '\u{1F528}', '\u{1FA93}', '\u{26CF}', '\u{2692}', '\u{1F6E0}', '\u{1F5E1}',
      '\u{2694}', '\u{1F52B}', '\u{1F6E1}', '\u{1F527}', '\u{1F529}', '\u{2699}',
      '\u{1F5DC}', '\u{2696}', '\u{1F517}', '\u{26D3}', '\u{1FA9D}', '\u{1F9F0}',
      '\u{1F9F2}', '\u{1F52C}', '\u{1F52D}', '\u{1F4E1}', '\u{1F489}', '\u{1FA78}',
      '\u{1F48A}', '\u{1FA79}', '\u{1F6AA}', '\u{1F6CF}', '\u{1F6CB}', '\u{1FA91}',
      '\u{1F6BD}', '\u{1F6BF}', '\u{1F6C1}', '\u{1FA92}', '\u{1F9F4}', '\u{1F9F7}',
      '\u{1F9F9}', '\u{1F9FA}', '\u{1F9FB}', '\u{1F9FC}', '\u{1F9FD}', '\u{1F9FE}',
    ],
  },
  {
    label: 'Symbols',
    emojis: [
      '\u{2764}', '\u{1F49B}', '\u{1F49A}', '\u{1F499}', '\u{1F49C}', '\u{1F5A4}',
      '\u{1F90D}', '\u{1F90E}', '\u{1F494}', '\u{2763}', '\u{1F495}', '\u{1F49E}',
      '\u{1F493}', '\u{1F497}', '\u{1F496}', '\u{1F498}', '\u{1F49D}', '\u{1F49F}',
      '\u{262E}', '\u{271D}', '\u{262A}', '\u{1F549}', '\u{2638}', '\u{2721}',
      '\u{262F}', '\u{2626}', '\u{269B}', '\u{267E}', '\u{2622}', '\u{2623}',
      '\u{26A0}', '\u{267B}', '\u{2666}', '\u{2660}', '\u{2663}', '\u{2665}',
      '\u{1F4AF}', '\u{1F4A2}', '\u{1F4A5}', '\u{1F4AB}', '\u{1F4A6}', '\u{1F4A8}',
      '\u{1F4AC}', '\u{1F4AD}', '\u{1F441}', '\u{1F453}', '\u{1F576}', '\u{1F48E}',
      '\u{1F514}', '\u{1F3F4}', '\u{1F6A9}', '\u{1F3C1}', '\u{2620}',
      '\u{2697}', '\u{1F52E}', '\u{1F3C5}', '\u{1F396}', '\u{1F3C6}', '\u{1F451}',
      '\u{1F48D}', '\u{1F4A3}', '\u{1F3F9}', '\u{1FA84}', '\u{1FA96}', '\u{1F9FF}',
    ],
  },
];

interface EmojiPickerProps {
  value: string;
  onChange: (emoji: string) => void;
  label?: string;
}

export function EmojiPicker({ value, onChange, label = 'Avatar emoji (optional)' }: EmojiPickerProps) {
  const [open, setOpen] = useState(false);

  return (
    <View>
      <Text className="mb-1 text-sm font-medium text-stone-300">{label}</Text>
      <View className="flex-row items-center gap-2">
        <Dropdown
          open={open}
          onClose={() => setOpen(false)}
          maxHeight={320}
          trigger={
            <Pressable
              onPress={() => setOpen((o) => !o)}
              className="flex-row items-center justify-between rounded-lg border border-stone-700 bg-stone-800 px-3 py-2.5 flex-1"
            >
              <Text className={`text-sm ${value ? 'text-stone-100' : 'text-stone-500'}`}>
                {value || 'Pick an emoji...'}
              </Text>
              <ChevronDown size={16} color="#a8a29e" />
            </Pressable>
          }
        >
          <View style={{ width: 288 }}>
            {EMOJI_SECTIONS.map((section) => (
              <View key={section.label} className="px-2 pb-1">
                <Text className="text-[10px] font-semibold uppercase tracking-wider text-stone-500 py-1.5 px-0.5">
                  {section.label}
                </Text>
                <View className="flex-row flex-wrap">
                  {section.emojis.map((emoji, i) => (
                    <Pressable
                      key={`${section.label}-${i}`}
                      onPress={() => {
                        onChange(emoji);
                        setOpen(false);
                      }}
                      className={`items-center justify-center rounded-md ${emoji === value ? 'bg-stone-600' : ''}`}
                      style={{ width: 36, height: 36 }}
                    >
                      <Text style={{ fontSize: 20 }}>{emoji}</Text>
                    </Pressable>
                  ))}
                </View>
              </View>
            ))}
          </View>
        </Dropdown>

        {value ? (
          <Pressable
            onPress={() => onChange('')}
            className="rounded-lg border border-stone-700 bg-stone-800 p-2.5"
          >
            <X size={16} color="#a8a29e" />
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}
