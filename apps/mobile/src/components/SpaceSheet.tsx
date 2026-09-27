import { useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { faCheck, faShareNodes } from '@fortawesome/free-solid-svg-icons';
import { ApiError, type Invite, type Me } from '@date-calendar/core';
import { api } from '../lib/api';
import Icon from './Icon';
import Sheet from './Sheet';
import { colors, radius, space, type } from '../theme';

/**
 * Which calendar you are looking at, and who else is in it — the phone's
 * version of the web's `SpaceModal`. Switch space, invite someone, remove
 * someone.
 *
 * The invite goes out through the OS share sheet rather than the clipboard.
 * On a phone the next step after "copy" is always "open something and paste",
 * and Share collapses the two — with no clipboard dependency to add for it.
 */
export default function SpaceSheet({
  me,
  onClose,
  onChanged,
}: {
  me: Me;
  onClose: () => void;
  /** Session changed — the caller reloads everything for the new scope. */
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [invite, setInvite] = useState<Invite | null>(null);
  const [confirmingRemoval, setConfirmingRemoval] = useState<string | null>(null);

  const run = async (action: () => Promise<unknown>, failure: string) => {
    setError(null);
    setBusy(true);
    try {
      await action();
    } catch (actionError) {
      setError(actionError instanceof ApiError ? actionError.message : failure);
    } finally {
      setBusy(false);
    }
  };

  const switchTo = (spaceId: string) =>
    run(async () => {
      await api.switchSpace(spaceId);
      onChanged();
      onClose();
    }, 'Could not switch calendar.');

  const remove = (userId: string) =>
    run(async () => {
      await api.removeMember(userId);
      setConfirmingRemoval(null);
      onChanged();
    }, 'Could not remove them.');

  const createInvite = () =>
    run(async () => {
      const created = await api.createInvite();
      setInvite(created);
      await Share.share({ message: created.url });
    }, 'Could not create an invite link.');

  return (
    <Sheet onClose={onClose}>
      <ScrollView showsVerticalScrollIndicator={false} style={styles.scroll}>
        <Text style={styles.title}>Your calendars</Text>

        <Text style={styles.label}>Spaces</Text>
        {me.spaces.map((item) => {
          const current = item.id === me.space.id;
          return (
            <Pressable
              key={item.id}
              disabled={busy || current}
              onPress={() => void switchTo(item.id)}
              style={[styles.row, current && styles.rowCurrent]}
            >
              <Text
                style={[styles.rowTitle, current && styles.rowTitleCurrent]}
                numberOfLines={1}
              >
                {item.name}
              </Text>
              {current && <Icon icon={faCheck} size="xs" color={colors.primary} />}
            </Pressable>
          );
        })}

        <Text style={styles.label}>In {me.space.name}</Text>
        {me.members.map((member) => {
          const isYou = member.id === me.user.id;
          const confirming = confirmingRemoval === member.id;

          return (
            <View key={member.id} style={styles.row}>
              <View style={[styles.avatar, { backgroundColor: member.color }]}>
                <Text style={styles.avatarText}>
                  {(member.name.trim()[0] ?? '?').toUpperCase()}
                </Text>
              </View>
              <View style={styles.person}>
                <Text style={styles.rowTitle} numberOfLines={1}>
                  {member.name}
                  {isYou ? <Text style={styles.you}>  you</Text> : null}
                </Text>
                <Text style={styles.email} numberOfLines={1}>
                  {member.email}
                </Text>
              </View>

              {!isYou && (
                <Pressable
                  disabled={busy}
                  onPress={
                    confirming
                      ? () => void remove(member.id)
                      : () => setConfirmingRemoval(member.id)
                  }
                  style={[styles.removeButton, confirming && styles.removeConfirming]}
                >
                  <Text
                    style={[styles.removeText, confirming && styles.removeTextConfirming]}
                  >
                    {confirming ? 'Really remove?' : 'Remove'}
                  </Text>
                </Pressable>
              )}
            </View>
          );
        })}

        <Text style={styles.help}>
          Removing someone keeps everything you planned together. Only what was theirs
          alone goes — anything they marked private, and any surprise they were keeping.
        </Text>

        <Pressable
          disabled={busy}
          onPress={() => void createInvite()}
          style={[styles.invite, busy && styles.inviteBusy]}
        >
          {busy ? (
            <ActivityIndicator color={colors.onInk} />
          ) : (
            <>
              <Icon icon={faShareNodes} size="sm" color={colors.onInk} />
              <Text style={styles.inviteText}>
                {invite ? 'Send another invite' : 'Invite someone'}
              </Text>
            </>
          )}
        </Pressable>

        {invite && (
          <Text style={styles.help} selectable>
            Single use, expires in seven days. Code: {invite.code}
          </Text>
        )}

        {error && <Text style={styles.error}>{error}</Text>}

        <Pressable onPress={onClose} style={styles.done}>
          <Text style={styles.doneText}>Done</Text>
        </Pressable>
      </ScrollView>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  scroll: { maxHeight: '100%' },
  title: { ...type.heading, color: colors.ink, marginBottom: space.sm },
  label: {
    ...type.label,
    color: colors.muted,
    marginTop: space.lg,
    marginBottom: space.xs,
  },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingVertical: space.md,
    paddingHorizontal: space.md,
    borderRadius: radius.sm,
  },
  rowCurrent: { backgroundColor: colors.wash },
  rowTitle: { ...type.body, color: colors.ink, flex: 1 },
  rowTitleCurrent: { color: colors.primary, fontWeight: '700' },
  you: { ...type.small, color: colors.muted, fontWeight: '400' },

  person: { flex: 1, gap: 2 },
  email: { ...type.small, color: colors.muted },
  avatar: {
    width: 34,
    height: 34,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { color: colors.onInk, fontSize: 13, fontWeight: '800' },

  removeButton: {
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    borderRadius: radius.sm,
  },
  removeConfirming: { backgroundColor: '#B91C1C' },
  removeText: { ...type.small, fontWeight: '700', color: '#B91C1C' },
  removeTextConfirming: { color: colors.onInk },

  help: {
    ...type.small,
    color: colors.muted,
    marginTop: space.sm,
    lineHeight: 18,
  },

  invite: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.sm,
    marginTop: space.lg,
    backgroundColor: colors.primary,
    paddingVertical: space.lg,
    borderRadius: radius.sm,
    minHeight: 52,
  },
  inviteBusy: { opacity: 0.7 },
  inviteText: { ...type.body, fontWeight: '700', color: colors.onInk },

  error: { ...type.small, color: '#B91C1C', marginTop: space.sm },

  done: {
    marginTop: space.md,
    paddingVertical: space.lg,
    alignItems: 'center',
  },
  doneText: { ...type.body, fontWeight: '600', color: colors.body },
});
