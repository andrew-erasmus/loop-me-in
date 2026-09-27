import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  ListInput,
  ListItem,
  ListItemInput,
  ListItemPatch,
  ListPatch,
  ScheduleItemInput,
} from '@date-calendar/core';
import { api } from '../lib/api.js';
import { queryKeys } from './queryKeys.js';

/**
 * Server state for the lists.
 *
 * Items are fetched whole rather than per-list: there are tens of them, not
 * thousands, and the calendar needs the full set anyway to tell which of its
 * events came from one.
 */

export { queryKeys };

export function useLists() {
  return useQuery({ queryKey: queryKeys.lists, queryFn: () => api.listLists() });
}

export function useListItems() {
  return useQuery({ queryKey: queryKeys.items, queryFn: () => api.listItems() });
}

function useInvalidateItems() {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.items });
  };
}

/**
 * Apply a change to the cached item immediately and hand back the snapshot to
 * roll back to. Ticking something off and voting both need to feel instant —
 * they are one click and the whole interaction is the feedback.
 */
function useOptimisticItem() {
  const queryClient = useQueryClient();

  return async (id: string, apply: (item: ListItem) => ListItem) => {
    await queryClient.cancelQueries({ queryKey: queryKeys.items });
    const snapshot = queryClient.getQueryData<ListItem[]>(queryKeys.items);

    queryClient.setQueryData<ListItem[]>(queryKeys.items, (items) =>
      items?.map((item) => (item.id === id ? apply(item) : item)),
    );

    return snapshot;
  };
}

function useRollback() {
  const queryClient = useQueryClient();
  return (snapshot: ListItem[] | undefined) => {
    if (snapshot) queryClient.setQueryData(queryKeys.items, snapshot);
  };
}

/* ------------------------------------------------------------------ lists */

export function useCreateList() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: ListInput) => api.createList(input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.lists }),
  });
}

export function useUpdateList() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: ListPatch }) =>
      api.updateList(id, patch),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.lists }),
  });
}

export function useDeleteList() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.deleteList(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.lists });
      // The list's items went with it.
      void queryClient.invalidateQueries({ queryKey: queryKeys.items });
    },
  });
}

/* ------------------------------------------------------------------ items */

export function useCreateItem() {
  const invalidate = useInvalidateItems();
  return useMutation({
    mutationFn: ({ listId, input }: { listId: string; input: ListItemInput }) =>
      api.createItem(listId, input),
    onSuccess: invalidate,
  });
}

export function useUpdateItem() {
  const optimistic = useOptimisticItem();
  const rollback = useRollback();
  const invalidate = useInvalidateItems();

  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: ListItemPatch }) =>
      api.updateItem(id, patch),

    onMutate: ({ id, patch }) =>
      optimistic(id, (item) => ({
        ...item,
        ...patch,
        notes: patch.notes === undefined ? item.notes : (patch.notes ?? null),
        url: patch.url === undefined ? item.url : (patch.url ?? null),
        doneAt: patch.doneAt === undefined ? item.doneAt : (patch.doneAt ?? null),
        effort: patch.effort === undefined ? item.effort : (patch.effort ?? null),
        cost: patch.cost === undefined ? item.cost : (patch.cost ?? null),
      })).then((snapshot) => ({ snapshot })),

    onError: (_error, _variables, context) => rollback(context?.snapshot),
    onSettled: invalidate,
  });
}

export function useDeleteItem() {
  const queryClient = useQueryClient();
  const invalidate = useInvalidateItems();
  const rollback = useRollback();

  return useMutation({
    mutationFn: (id: string) => api.deleteItem(id),

    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.items });
      const snapshot = queryClient.getQueryData<ListItem[]>(queryKeys.items);
      queryClient.setQueryData<ListItem[]>(queryKeys.items, (items) =>
        items?.filter((item) => item.id !== id),
      );
      return { snapshot };
    },

    onError: (_error, _variables, context) => rollback(context?.snapshot),
    onSettled: invalidate,
  });
}

/** Add or withdraw the signed-in user's vote. */
export function useSetVote() {
  const optimistic = useOptimisticItem();
  const rollback = useRollback();
  const invalidate = useInvalidateItems();

  return useMutation({
    mutationFn: ({ id, keen }: { id: string; keen: boolean; userId: string }) =>
      api.setItemVote(id, keen),

    onMutate: ({ id, keen, userId }) =>
      optimistic(id, (item) => ({
        ...item,
        votes: keen
          ? // Guard the duplicate: a double click would otherwise show two
            // votes from one person until the refetch corrects it.
            item.votes.includes(userId)
            ? item.votes
            : [...item.votes, userId]
          : item.votes.filter((voter) => voter !== userId),
      })).then((snapshot) => ({ snapshot })),

    onError: (_error, _variables, context) => rollback(context?.snapshot),
    onSettled: invalidate,
  });
}

/* ------------------------------------------------------------- scheduling */

/**
 * Both scheduling mutations touch the calendar as well as the list, so they
 * invalidate the event caches too — the new event has to appear on the grid
 * without a reload, and the deleted one has to leave it.
 */
function useInvalidateBoth() {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.items });
    void queryClient.invalidateQueries({ queryKey: queryKeys.allEvents });
    void queryClient.invalidateQueries({ queryKey: queryKeys.categoryCounts });
  };
}

export function useScheduleItem() {
  const invalidate = useInvalidateBoth();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: ScheduleItemInput }) =>
      api.scheduleItem(id, input),
    onSuccess: invalidate,
  });
}

export function useUnscheduleItem() {
  const invalidate = useInvalidateBoth();
  return useMutation({
    mutationFn: (id: string) => api.unscheduleItem(id),
    onSuccess: invalidate,
  });
}

/**
 * Candidate free slots for an item, fetched on demand rather than kept in the
 * query cache — nobody needs this until they press "Suggest a time", and the
 * answer depends on the current moment, so caching it would just go stale.
 */
export function useSuggestItemSlots() {
  return useMutation({
    mutationFn: ({ id, durationMinutes }: { id: string; durationMinutes?: number }) =>
      api.suggestItemSlots(id, { durationMinutes }),
  });
}
