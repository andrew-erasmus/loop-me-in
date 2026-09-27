import { useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {
  faCalendarDays,
  faChevronDown,
  faClockRotateLeft,
  faTowerBroadcast,
  faWandMagicSparkles,
  type IconDefinition,
} from '@fortawesome/free-solid-svg-icons';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import Icon from './src/components/Icon';
import SpaceSheet from './src/components/SpaceSheet';
import CalendarScreen from './src/screens/CalendarScreen';
import ListsScreen from './src/screens/ListsScreen';
import MemoriesScreen from './src/screens/MemoriesScreen';
import { useAppFonts } from './src/lib/useFonts';
import { DataProvider, useStore } from './src/lib/store';
import { colors, radius, space, type } from './src/theme';

/**
 * Three tabs, held in local state rather than a router.
 *
 * expo-router would mean restructuring into an `app/` directory and taking on
 * file-based routing for a handful of screens with no deep links and no back
 * stack — detail views are modals. When a shareable URL turns up, that is the
 * moment to adopt it, not before.
 */

type Tab = 'calendar' | 'lists' | 'memories';

export default function App() {
  const fontsLoaded = useAppFonts();

  // Nothing renders until the display face has loaded — the alternative is
  // drawing every heading in the platform default and reflowing the whole list
  // when Bricolage arrives, which on a list of dates is very visible.
  if (!fontsLoaded) {
    return (
      <GestureHandlerRootView style={styles.screen}>
        <SafeAreaProvider>
          <View style={[styles.screen, styles.centred]}>
            <ActivityIndicator color={colors.muted} />
          </View>
        </SafeAreaProvider>
      </GestureHandlerRootView>
    );
  }

  return (
    <GestureHandlerRootView style={styles.screen}>
      <SafeAreaProvider>
        <DataProvider>
          <Shell />
        </DataProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

function Shell() {
  const [tab, setTab] = useState<Tab>('calendar');
  const [showSpace, setShowSpace] = useState(false);
  const { data, error, refresh } = useStore();

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'left', 'right']}>
      <StatusBar barStyle="dark-content" />

      <View style={styles.header}>
        <Text style={styles.title}>{data?.me.space.name ?? 'Loop Me In'}</Text>
        {data && (
          // The avatars are the control: who is in this calendar is the same
          // question as which calendar this is, so tapping the people opens
          // the place where you switch space, invite and remove.
          <Pressable
            onPress={() => setShowSpace(true)}
            hitSlop={8}
            accessibilityLabel="Your calendars and who is in them"
            style={styles.spaceButton}
          >
            <View style={styles.people}>
              {data.me.members.map((member) => (
                <View
                  key={member.id}
                  style={[styles.avatar, { backgroundColor: member.color }]}
                >
                  <Text style={styles.avatarText}>
                    {(member.name.trim()[0] ?? '?').toUpperCase()}
                  </Text>
                </View>
              ))}
            </View>
            <Icon icon={faChevronDown} size="xs" color={colors.muted} />
          </Pressable>
        )}
      </View>

      {showSpace && data && (
        <SpaceSheet
          me={data.me}
          onClose={() => setShowSpace(false)}
          onChanged={() => void refresh()}
        />
      )}

      {error ? (
        <View style={styles.centred}>
          <Icon icon={faTowerBroadcast} size="lg" color={colors.border} />
          <Text style={styles.emptyTitle}>Can’t reach the calendar</Text>
          <Text style={styles.emptyBody}>{error}</Text>
          <Text style={styles.hint}>
            Check the API is running, and that this device is on the same wifi.
          </Text>
          <Pressable onPress={() => void refresh()} style={styles.retry}>
            <Text style={styles.retryText}>Try again</Text>
          </Pressable>
        </View>
      ) : !data ? (
        <View style={styles.centred}>
          <ActivityIndicator color={colors.muted} />
        </View>
      ) : tab === 'calendar' ? (
        <CalendarScreen />
      ) : tab === 'lists' ? (
        <ListsScreen />
      ) : (
        <MemoriesScreen />
      )}

      <View style={styles.tabs}>
        <Tab
          label="Calendar"
          icon={faCalendarDays}
          active={tab === 'calendar'}
          onPress={() => setTab('calendar')}
        />
        <Tab
          label="Lists"
          icon={faWandMagicSparkles}
          active={tab === 'lists'}
          onPress={() => setTab('lists')}
        />
        <Tab
          label="Memories"
          icon={faClockRotateLeft}
          active={tab === 'memories'}
          onPress={() => setTab('memories')}
        />
      </View>
    </SafeAreaView>
  );
}

function Tab({
  label,
  icon,
  active,
  onPress,
}: {
  label: string;
  icon: IconDefinition;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={styles.tab}>
      <Icon icon={icon} size="lg" color={active ? colors.primary : colors.muted} />
      <Text style={[styles.tabLabel, active ? styles.tabActive : styles.tabInactive]}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.sunken },
  centred: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: space.xl,
    gap: space.sm,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: space.lg,
    paddingTop: space.md,
    paddingBottom: space.sm,
  },
  title: { ...type.title, color: colors.ink, flexShrink: 1 },
  spaceButton: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  people: { flexDirection: 'row', gap: -6 },
  avatar: {
    width: 30,
    height: 30,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: colors.sunken,
  },
  avatarText: { color: colors.onInk, fontSize: 12, fontWeight: '800' },

  emptyTitle: { ...type.heading, color: colors.ink },
  emptyBody: { ...type.small, color: colors.muted, textAlign: 'center' },
  hint: { ...type.small, color: colors.muted, textAlign: 'center', lineHeight: 18 },
  retry: {
    marginTop: space.md,
    backgroundColor: colors.primary,
    paddingHorizontal: space.xl,
    paddingVertical: space.md,
    borderRadius: radius.sm,
  },
  retryText: { ...type.body, color: colors.onInk },

  tabs: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.surface,
    paddingBottom: space.lg,
    paddingTop: space.sm,
  },
  tab: { flex: 1, alignItems: 'center', gap: 2 },
  tabLabel: { fontSize: 11, fontWeight: '700' },
  tabActive: { color: colors.primary },
  tabInactive: { opacity: 0.45, color: colors.muted },
});
