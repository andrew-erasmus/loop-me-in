/**
 * Every React Query key in one place.
 *
 * They live here rather than beside the hooks that own them because
 * invalidation crosses those boundaries: changing an event has to refresh the
 * lists too, since a list item shows the date of the event it is scheduled as.
 * Keeping the keys in the feature modules meant `useCalendarData` importing
 * from `useLists` and back again.
 */

export const queryKeys = {
  me: ['me'] as const,

  categories: ['categories'] as const,
  categoryCounts: ['categories', 'counts'] as const,

  events: (from: Date, to: Date) =>
    ['events', from.toISOString(), to.toISOString()] as const,
  allEvents: ['events'] as const,

  lists: ['lists'] as const,
  items: ['items'] as const,
};
