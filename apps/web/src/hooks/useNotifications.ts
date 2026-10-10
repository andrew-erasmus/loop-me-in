import { useCallback, useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { NotificationPreferencesPatch, NotificationSettings } from '@date-calendar/core';
import { api } from '../lib/api.js';
import {
  disablePush,
  enablePush,
  PermissionDeniedError,
  pushSupport,
  savedToken,
  type PushSupport,
} from '../lib/push.js';
import { queryKeys } from './queryKeys.js';

/** Which kinds of notification this account wants. */
export function useNotificationSettings() {
  return useQuery({
    queryKey: queryKeys.notificationSettings,
    queryFn: () => api.notificationSettings(),
  });
}

/**
 * Flip switches. Optimistic, because a switch that waits for the server
 * before moving feels broken; it snaps back if the save fails.
 */
export function useUpdateNotificationPreferences() {
  const queryClient = useQueryClient();
  const key = queryKeys.notificationSettings;

  return useMutation({
    mutationFn: (patch: NotificationPreferencesPatch) => api.updateNotificationPreferences(patch),
    onMutate: async (patch) => {
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<NotificationSettings>(key);
      if (previous) {
        queryClient.setQueryData<NotificationSettings>(key, {
          ...previous,
          preferences: { ...previous.preferences, ...patch },
        });
      }
      return { previous };
    },
    onError: (_error, _patch, context) => {
      if (context?.previous) queryClient.setQueryData(key, context.previous);
    },
    onSuccess: (settings) => queryClient.setQueryData(key, settings),
  });
}

export function useSendTestNotification() {
  return useMutation({ mutationFn: () => api.sendTestNotification() });
}

/**
 * - `checking`: still finding out what this browser can do.
 * - `blocked`: the browser has been told no. Only its own settings can undo
 *   that — a site can't ask again.
 * - `off` / `on`: whether this browser is registered for this account.
 */
export type DeviceState = PushSupport | 'checking' | 'blocked' | 'off' | 'on';

/** Whether this browser gets notifications, and the switch for it. */
export function usePushDevice(userId: string) {
  const [state, setState] = useState<DeviceState>('checking');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const recheck = useCallback(async () => {
    const support = await pushSupport();
    if (support !== 'supported') setState(support);
    else if (Notification.permission === 'denied') setState('blocked');
    else if (Notification.permission === 'granted' && savedToken(userId)) setState('on');
    else setState('off');
  }, [userId]);

  useEffect(() => {
    void recheck();
  }, [recheck]);

  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (caught) {
      if (!(caught instanceof PermissionDeniedError)) {
        setError(caught instanceof Error ? caught.message : String(caught));
      }
    } finally {
      setBusy(false);
      await recheck();
    }
  };

  return {
    state,
    busy,
    error,
    // Not wrapped in anything that awaits first — see `enablePush`.
    enable: () => run(() => enablePush(userId)),
    disable: () => run(() => disablePush(userId)),
  };
}
