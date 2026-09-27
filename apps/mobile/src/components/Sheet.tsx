import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import {
  Animated,
  Easing,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  View,
} from 'react-native';
import { colors, radius, space } from '../theme';

/**
 * A bottom sheet with the backdrop and the panel animated separately.
 *
 * `Modal animationType="slide"` slides the *whole* modal, backdrop included, so
 * the dimmed layer appears to slide up from the bottom along with the panel —
 * which reads as one grey slab moving rather than a sheet rising over the page.
 *
 * Here the backdrop only fades and the panel only slides, which is what the
 * gesture is supposed to look like. It also means the close animation can run
 * to completion before the modal unmounts: `onRequestClose` asks *us* to
 * dismiss, we play the exit, and only then tell the parent.
 */

const DURATION = 220;

export default function Sheet({
  onClose,
  children,
}: {
  onClose: () => void;
  children: ReactNode;
}) {
  // Measured rather than assumed: a form sheet is much taller than a detail
  // sheet, and sliding by a guessed distance leaves a visible gap or overshoot.
  const [height, setHeight] = useState(0);

  const progress = useRef(new Animated.Value(0)).current;
  const [closing, setClosing] = useState(false);

  useEffect(() => {
    if (height === 0) return;
    Animated.timing(progress, {
      toValue: 1,
      duration: DURATION,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [height, progress]);

  const dismiss = useCallback(() => {
    if (closing) return;
    setClosing(true);
    Animated.timing(progress, {
      toValue: 0,
      duration: DURATION * 0.8,
      easing: Easing.in(Easing.cubic),
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished) onClose();
    });
  }, [closing, onClose, progress]);

  const translateY = progress.interpolate({
    inputRange: [0, 1],
    // Before the panel has been measured, park it off-screen rather than
    // letting it flash at its final position for one frame.
    outputRange: [height || 600, 0],
  });

  return (
    <Modal visible transparent animationType="none" onRequestClose={dismiss}>
      <View style={styles.root}>
        <Animated.View style={[styles.backdrop, { opacity: progress }]}>
          <Pressable style={StyleSheet.absoluteFill} onPress={dismiss} />
        </Animated.View>

        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.lift}
          pointerEvents="box-none"
        >
          <Animated.View
            onLayout={(event) => setHeight(event.nativeEvent.layout.height)}
            style={[styles.panel, { transform: [{ translateY }] }]}
          >
            <View style={styles.grabber} />
            {children}
          </Animated.View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: 'flex-end' },
  backdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    // moss-950 at 35%, matching the web dialog's backdrop.
    backgroundColor: 'rgba(15,19,14,0.35)',
  },
  lift: { justifyContent: 'flex-end' },
  panel: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    paddingHorizontal: space.xl,
    paddingTop: space.md,
    paddingBottom: space.xxl,
    gap: space.md,
  },
  grabber: {
    alignSelf: 'center',
    width: 36,
    height: 4,
    borderRadius: radius.pill,
    backgroundColor: colors.border,
    marginBottom: space.sm,
  },
});
