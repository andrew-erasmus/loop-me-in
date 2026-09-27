import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError, type Me } from '@date-calendar/core';
import { api } from '../lib/api.js';
import { queryKeys } from './queryKeys.js';

/**
 * Session state.
 *
 * `useMe` is the root of the app's data: a 401 from it is not an error to
 * report but the signal to show the sign-in screen, so it must never retry and
 * never be thrown away on a refetch.
 */

export { queryKeys };

export function useMe() {
  return useQuery<Me, ApiError>({
    queryKey: queryKeys.me,
    queryFn: () => api.me(),
    // A 401 is an answer, not a failure. Retrying it just delays the sign-in
    // screen; retrying anything else is still worth one attempt.
    retry: (failureCount, error) =>
      !(error instanceof ApiError && error.status === 401) && failureCount < 1,
    staleTime: 5 * 60_000,
  });
}

/**
 * Throw away every cached query on a session change.
 *
 * Signing out or switching space changes which space the answers belong to, so
 * keeping any of it would briefly show one space's events under another's name.
 */
function useResetOnSessionChange() {
  const queryClient = useQueryClient();
  return (me?: Me) => {
    queryClient.clear();
    if (me) queryClient.setQueryData(queryKeys.me, me);
  };
}

export function useLogout() {
  const reset = useResetOnSessionChange();
  return useMutation({
    mutationFn: () => api.logout(),
    onSuccess: () => reset(),
  });
}

export function useSwitchSpace() {
  const reset = useResetOnSessionChange();
  return useMutation({
    mutationFn: (spaceId: string) => api.switchSpace(spaceId),
    onSuccess: (me) => reset(me),
  });
}

/**
 * Renaming doesn't change which events/lists/items are cached — only the
 * label on top of them — so this updates the `me` query directly rather than
 * clearing the cache the way switching space or removing someone does.
 */
export function useRenameSpace() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ spaceId, name }: { spaceId: string; name: string }) =>
      api.renameSpace(spaceId, name),
    onSuccess: (me) => queryClient.setQueryData(queryKeys.me, me),
  });
}

export function useCreateInvite() {
  return useMutation({ mutationFn: () => api.createInvite() });
}

export function useJoinSpace() {
  const reset = useResetOnSessionChange();
  return useMutation({
    mutationFn: (code: string) => api.joinSpace(code),
    onSuccess: (me) => reset(me),
  });
}

/**
 * Take someone out of the current space.
 *
 * Clears the cache like the other session changes do: their private and
 * surprise events go with them server-side, so anything already fetched is
 * showing entries that no longer exist.
 */
export function useRemoveMember() {
  const reset = useResetOnSessionChange();
  return useMutation({
    mutationFn: (userId: string) => api.removeMember(userId),
    onSuccess: (me) => reset(me),
  });
}

/** Index the space's members by id, for colour and name lookups while rendering. */
export function membersById(me: Me | undefined): Map<string, Me['members'][number]> {
  return new Map((me?.members ?? []).map((member) => [member.id, member]));
}
