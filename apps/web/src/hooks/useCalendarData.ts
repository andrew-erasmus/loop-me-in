import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  CalendarEvent,
  Category,
  CategoryInput,
  CategoryPatch,
  EventInput,
  EventPatch,
} from '@date-calendar/core';
import { api } from '../lib/api.js';
import { queryKeys } from './queryKeys.js';

/**
 * Server state for the calendar.
 *
 * Events are keyed by the visible range, so moving between months fetches only
 * what is on screen. Mutations invalidate every event query rather than trying
 * to patch each cached range by hand — an edit can move an event out of the
 * current window entirely, and a refetch of one range is cheap.
 */

export { queryKeys };

export function useCategories() {
  return useQuery({
    queryKey: queryKeys.categories,
    queryFn: () => api.listCategories(),
  });
}

export function useCategoryCounts() {
  return useQuery({
    queryKey: queryKeys.categoryCounts,
    queryFn: () => api.categoryEventCounts(),
  });
}

export function useEvents(range: { from: Date; to: Date }) {
  return useQuery({
    queryKey: queryKeys.events(range.from, range.to),
    queryFn: () => api.listEvents(range),
    // Keeps the previous month's events on screen while the next month loads,
    // so navigation doesn't flash an empty grid.
    placeholderData: (previous) => previous,
  });
}

function useInvalidateEvents() {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.allEvents });
    void queryClient.invalidateQueries({ queryKey: queryKeys.categoryCounts });
    // A list item displays the date of the event it is scheduled as, so moving
    // an event — by dragging it, or from its dialog — changes what the lists
    // screen should show. The server derives that date by joining to the event,
    // so it is already correct; without this the client just never asks again.
    void queryClient.invalidateQueries({ queryKey: queryKeys.items });
  };
}

export function useCreateEvent() {
  const invalidate = useInvalidateEvents();
  return useMutation({
    mutationFn: (input: EventInput) => api.createEvent(input),
    onSuccess: invalidate,
  });
}

export function useUpdateEvent() {
  const queryClient = useQueryClient();
  const invalidate = useInvalidateEvents();

  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: EventPatch }) =>
      api.updateEvent(id, patch),

    // Optimistically apply the edit to every cached range so the event moves
    // the instant you hit save.
    onMutate: async ({ id, patch }) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.allEvents });
      const snapshot = queryClient.getQueriesData<CalendarEvent[]>({
        queryKey: queryKeys.allEvents,
      });

      queryClient.setQueriesData<CalendarEvent[]>(
        { queryKey: queryKeys.allEvents },
        (events) =>
          events?.map((event) =>
            event.id === id
              ? {
                  ...event,
                  ...patch,
                  notes: patch.notes === undefined ? event.notes : (patch.notes ?? null),
                  categoryId:
                    patch.categoryId === undefined
                      ? event.categoryId
                      : (patch.categoryId ?? null),
                }
              : event,
          ),
      );

      return { snapshot };
    },

    onError: (_error, _variables, context) => {
      // Put the caches back exactly as they were before the optimistic write.
      for (const [key, data] of context?.snapshot ?? []) {
        queryClient.setQueryData(key, data);
      }
    },

    onSettled: invalidate,
  });
}

export function useDeleteEvent() {
  const queryClient = useQueryClient();
  const invalidate = useInvalidateEvents();

  return useMutation({
    mutationFn: (id: string) => api.deleteEvent(id),

    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.allEvents });
      const snapshot = queryClient.getQueriesData<CalendarEvent[]>({
        queryKey: queryKeys.allEvents,
      });
      queryClient.setQueriesData<CalendarEvent[]>(
        { queryKey: queryKeys.allEvents },
        (events) => events?.filter((event) => event.id !== id),
      );
      return { snapshot };
    },

    onError: (_error, _variables, context) => {
      for (const [key, data] of context?.snapshot ?? []) {
        queryClient.setQueryData(key, data);
      }
    },

    onSettled: invalidate,
  });
}

function useInvalidateCategories() {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.categories });
    void queryClient.invalidateQueries({ queryKey: queryKeys.categoryCounts });
  };
}

export function useCreateCategory() {
  const invalidate = useInvalidateCategories();
  return useMutation({
    mutationFn: (input: CategoryInput) => api.createCategory(input),
    onSuccess: invalidate,
  });
}

export function useUpdateCategory() {
  const queryClient = useQueryClient();
  const invalidate = useInvalidateCategories();

  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: CategoryPatch }) =>
      api.updateCategory(id, patch),

    // Recolouring should repaint every event on screen immediately.
    onMutate: async ({ id, patch }) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.categories });
      const previous = queryClient.getQueryData<Category[]>(queryKeys.categories);
      queryClient.setQueryData<Category[]>(queryKeys.categories, (categories) =>
        categories?.map((category) =>
          category.id === id ? { ...category, ...patch } : category,
        ),
      );
      return { previous };
    },

    onError: (_error, _variables, context) => {
      if (context?.previous) {
        queryClient.setQueryData(queryKeys.categories, context.previous);
      }
    },

    onSettled: invalidate,
  });
}

export function useDeleteCategory() {
  const queryClient = useQueryClient();
  const invalidate = useInvalidateCategories();

  return useMutation({
    mutationFn: (id: string) => api.deleteCategory(id),
    onSuccess: () => {
      invalidate();
      // Events survive the deletion but their categoryId is now null, so the
      // event caches are stale too.
      void queryClient.invalidateQueries({ queryKey: queryKeys.allEvents });
    },
  });
}
