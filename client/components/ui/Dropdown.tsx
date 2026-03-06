import { useRef, useState, useEffect } from 'react';
import { Modal, View, Pressable, ScrollView, Dimensions, StyleSheet } from 'react-native';

interface DropdownProps {
  open: boolean;
  onClose: () => void;
  trigger: React.ReactNode;
  children: React.ReactNode;
  align?: 'left' | 'right';
  maxHeight?: number;
}

export function Dropdown({ open, onClose, trigger, children, align = 'left', maxHeight = 200 }: DropdownProps) {
  const triggerRef = useRef<View>(null);
  const [pos, setPos] = useState<{ x: number; y: number; w: number; h: number } | null>(null);

  useEffect(() => {
    if (open && triggerRef.current) {
      triggerRef.current.measureInWindow((x, y, w, h) => {
        setPos({ x, y, w, h });
      });
    } else if (!open) {
      setPos(null);
    }
  }, [open]);

  const windowWidth = Dimensions.get('window').width;

  return (
    <View ref={triggerRef} collapsable={false}>
      {trigger}
      {open && pos && (
        <Modal transparent visible animationType="none" onRequestClose={onClose}>
          <View style={StyleSheet.absoluteFill}>
            {/* Backdrop — sibling so item clicks don't reach it */}
            <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
            {/* Content */}
            <View
              style={{
                position: 'absolute',
                top: pos.y + pos.h + 4,
                ...(align === 'right'
                  ? { right: windowWidth - (pos.x + pos.w) }
                  : { left: pos.x }),
                minWidth: pos.w,
                maxHeight,
                borderRadius: 8,
                borderWidth: 1,
                borderColor: '#44403c',
                backgroundColor: '#292524',
                shadowColor: '#000',
                shadowOffset: { width: 0, height: 4 },
                shadowOpacity: 0.3,
                shadowRadius: 8,
                elevation: 10,
                overflow: 'hidden',
              }}
            >
              <ScrollView nestedScrollEnabled style={{ maxHeight }} bounces={false}>
                {children}
              </ScrollView>
            </View>
          </View>
        </Modal>
      )}
    </View>
  );
}
