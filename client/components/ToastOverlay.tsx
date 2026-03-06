import { useEffect, useRef, useState } from 'react';
import { Animated, Text, View } from 'react-native';
import { toastEmitter, type ToastType } from '../lib/toast';

interface ToastItem {
  id: number;
  type: ToastType;
  message: string;
  opacity: Animated.Value;
}

let nextId = 0;

export function ToastOverlay() {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const timersRef = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());

  useEffect(() => {
    const handler = (type: ToastType, message: string) => {
      const id = nextId++;
      const opacity = new Animated.Value(0);

      setToasts((prev) => [...prev, { id, type, message, opacity }]);

      Animated.timing(opacity, { toValue: 1, duration: 150, useNativeDriver: true }).start();

      const timer = setTimeout(() => {
        Animated.timing(opacity, { toValue: 0, duration: 300, useNativeDriver: true }).start(() => {
          setToasts((prev) => prev.filter((t) => t.id !== id));
        });
        timersRef.current.delete(id);
      }, type === 'error' ? 4000 : 3000);

      timersRef.current.set(id, timer);
    };

    toastEmitter.on(handler);
    return () => {
      toastEmitter.off(handler);
      timersRef.current.forEach(clearTimeout);
    };
  }, []);

  if (toasts.length === 0) return null;

  const borderColor = (type: ToastType) => (type === 'error' ? '#7f1d1d' : '#44403c');
  const textColor = (type: ToastType) => (type === 'error' ? '#fca5a5' : '#e7e5e4');

  return (
    <View style={{ position: 'absolute', top: '10%', left: 0, right: 0, alignItems: 'center', pointerEvents: 'none', zIndex: 9999 }}>
      {toasts.map((t) => (
        <Animated.View
          key={t.id}
          style={{
            opacity: t.opacity,
            backgroundColor: '#1c1917',
            borderWidth: 1,
            borderColor: borderColor(t.type),
            borderRadius: 8,
            paddingHorizontal: 16,
            paddingVertical: 10,
            maxWidth: 360,
            marginBottom: 8,
          }}
        >
          <Text style={{ color: textColor(t.type), fontSize: 13, fontFamily: 'Inter' }}>{t.message}</Text>
        </Animated.View>
      ))}
    </View>
  );
}
