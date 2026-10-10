import { useCallback, useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { NotificationPreferencesPatch, NotificationSettings } from '@date-calendar/core';
import { api } from '../lib/api.js';
import {
  askPermission,
  disablePush,
  pushSupport,
  registerPush,
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

  /** Resolves to whether this browser ended up turned on. */
  const run = async (action: () => Promise<void>): Promise<boolean> => {
    setBusy(true);
    setError(null);
    let succeeded = false;
    try {
      await action();
      succeeded = true;
    } catch (caught) {
      setError(describeFailure(caught));
    } finally {
      setBusy(false);
      await recheck();
    }
    return succeeded;
  };

  /**
   * Nothing on screen changes until the permission prompt has been answered.
   * iOS freezes the page's rendering while its system alert is up, so a
   * button that starts dimming or relabelling as the alert opens is caught
   * half-drawn underneath it for as long as the alert stays.
   */
  const enable = async (): Promise<boolean> => {
    setError(null);
    // First, before any await — see `askPermission`.
    if (!(await askPermission())) {
      await recheck();
      return false;
    }
    return run(() => registerPush(userId));
  };

  return {
    state,
    busy,
    error,
    enable,
    disable: () => run(() => disablePush(userId)).then(() => undefined),
  };
}

/** Firebase's errors are written for developers; say what it means instead. */
function describeFailure(caught: unknown): string {
  const message = caught instanceof Error ? caught.message : String(caught);
  if (/permission/i.test(message)) {
    return 'This browser didn’t let Loop Me In send notifications. Check its notification settings for this site and try again.';
  }
  if (/network|fetch|offline/i.test(message)) {
    return 'Couldn’t reach the notification service. Check your connection and try again.';
  }
  return message;
}
