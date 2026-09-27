import { useCallback, useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  categoryMap,
  dayKey,
  filterByCategories,
  filterByPeople,
  getViewRange,
  getWeekDays,
  isDatedView,
  isDone,
  isHiddenSurprise,
  navigate as navigatePeriod,
  scheduledItemsByEventId,
  startOfDay,
  type CalendarEvent,
  type CalendarView,
  type EventTimes,
  type List,
  type ListItem,
} from '@date-calendar/core';
import AgendaView from './components/calendar/AgendaView.js';
import CalendarHeader from './components/calendar/CalendarHeader.js';
import CategoryFilterBar from './components/calendar/CategoryFilterBar.js';
import CategoryManager from './components/calendar/CategoryManager.js';
import EventModal, { type EventDraft } from './components/calendar/EventModal.js';
import SpaceModal from './components/auth/SpaceModal.js';
import ListItemModal, { type ItemDraft } from './components/lists/ListItemModal.js';
import ListModal from './components/lists/ListModal.js';
import ListsView from './components/lists/ListsView.js';
import MemoriesView from './components/memories/MemoriesView.js';
import MonthView from './components/calendar/MonthView.js';
import SurpriseModal from './components/calendar/SurpriseModal.js';
import TimeGridView from './components/calendar/TimeGridView.js';
import MobileHeader from './components/layout/MobileHeader.js';
import MobileCalendarBar, {
  type MobileCalendarView,
} from './components/layout/MobileCalendarBar.js';
import NewEventFab from './components/layout/NewEventFab.js';
import MobileTabBar, { type MobileTab } from './components/layout/MobileTabBar.js';
import { membersById, useLogout, useMe } from './hooks/useAuth.js';
import { useIsMobile } from './hooks/useIsMobile.js';
import {
  useCategories,
  useCreateEvent,
  useDeleteEvent,
  useEvents,
  useUpdateEvent,
} from './hooks/useCalendarData.js';
import {
  useCreateItem,
  useCreateList,
  useDeleteItem,
  useDeleteList,
  useListItems,
  useLists,
  useScheduleItem,
  useSetVote,
  useSuggestItemSlots,
  useUnscheduleItem,
  useUpdateItem,
  useUpdateList,
} from './hooks/useLists.js';
import { buildDecorations } from './lib/decorations.js';
import { roundToNextSlot } from './lib/datetime.js';

export default function App() {
  // Tapping a day cell means two different things by width: desktop opens a
  // new event there (RN has no equivalent — a mouse can aim at empty space
  // precisely); mobile jumps to Day view for that date, same as RN's
  // `MonthScreen` — a phone's day cells are too small a target to aim a new
  // event at reliably.
  const isMobile = useIsMobile();

  const [view, setView] = useState<CalendarView>('month');
  const [anchorDate, setAnchorDate] = useState(() => new Date());
  const [hiddenCategoryIds, setHiddenCategoryIds] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const [hiddenUserIds, setHiddenUserIds] = useState<ReadonlySet<string>>(() => new Set());
  const [draft, setDraft] = useState<EventDraft | null>(null);
  /** A surprise someone else planned — shown read-only, never in the editor. */
  const [surprise, setSurprise] = useState<CalendarEvent | null>(null);
  const [showCategories, setShowCategories] = useState(false);
  const [showSpace, setShowSpace] = useState(false);

  const [selectedListId, setSelectedListId] = useState<string | null>(null);
  const [itemDraft, setItemDraft] = useState<ItemDraft | null>(null);
  const [listDraft, setListDraft] = useState<{ list?: List } | null>(null);

  // Which of the phone's three bottom tabs is showing. Derived from `view`
  // rather than tracked separately — Lists and Memories are already views,
  // and every other view is "the calendar tab, showing that sub-view".
  const mobileTab: MobileTab =
    view === 'lists' ? 'lists' : view === 'memories' ? 'memories' : 'calendar';

  // Which Month/Day/Agenda sub-view to return to when tapping back onto the
  // Calendar tab from Lists or Memories — mirrors RN's own `useState` default
  // of 'agenda' for the same reason: it's the most useful "what's next" view.
  const [lastCalendarView, setLastCalendarView] = useState<MobileCalendarView>('agenda');
  useEffect(() => {
    if (view === 'month' || view === 'day' || view === 'agenda') {
      setLastCalendarView(view);
    }
  }, [view]);

  // A ticking "now" so the current-time indicator and the today highlight stay
  // honest without re-rendering constantly.
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(timer);
  }, []);

  const { data: me } = useMe();

  // The lists screen has no period of its own, so it borrows the month range
  // rather than making the events query conditional — the cached events are
  // wanted the moment you switch back anyway.
  const range = useMemo(
    () => getViewRange(anchorDate, isDatedView(view) ? view : 'month'),
    [anchorDate, view],
  );

  const { data: categories = [] } = useCategories();
  const { data: events = [], isFetching, isLoading, error } = useEvents(range);
  const { data: lists = [] } = useLists();
  const { data: items = [] } = useListItems();

  const createEvent = useCreateEvent();
  const updateEvent = useUpdateEvent();
  const deleteEvent = useDeleteEvent();

  const createList = useCreateList();
  const updateList = useUpdateList();
  const deleteList = useDeleteList();
  const createItem = useCreateItem();
  const updateItem = useUpdateItem();
  const deleteItem = useDeleteItem();
  const setVote = useSetVote();
  const scheduleItem = useScheduleItem();
  const unscheduleItem = useUnscheduleItem();
  const suggestItemSlots = useSuggestItemSlots();

  const logout = useLogout();

  // Manual pull-to-refresh: `staleTime` and a disabled focus-refetch (see
  // main.tsx) mean nothing re-fetches on its own most of the time, which is
  // right for a quiet calendar but means "did she just add something" has to
  // be answerable on demand.
  const queryClient = useQueryClient();
  const refreshAll = useCallback(() => {
    void queryClient.invalidateQueries();
  }, [queryClient]);

  const categoriesById = useMemo(() => categoryMap(categories), [categories]);
  const members = useMemo(() => membersById(me), [me]);

  // Categories and people are independent filters over the same events.
  const visibleEvents = useMemo(
    () => filterByPeople(filterByCategories(events, hiddenCategoryIds), hiddenUserIds),
    [events, hiddenCategoryIds, hiddenUserIds],
  );

  const decorations = useMemo(
    () => buildDecorations(visibleEvents, members, items, lists, me?.user.id ?? null),
    [visibleEvents, members, items, lists, me],
  );

  /** The item an event was scheduled from, for the provenance line in its modal. */
  const itemsByEventId = useMemo(() => scheduledItemsByEventId(items), [items]);

  const toggleCategory = useCallback((categoryId: string) => {
    setHiddenCategoryIds((hidden) => {
      const next = new Set(hidden);
      if (next.has(categoryId)) next.delete(categoryId);
      else next.add(categoryId);
      return next;
    });
  }, []);

  const togglePerson = useCallback((userId: string) => {
    setHiddenUserIds((hidden) => {
      const next = new Set(hidden);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });
  }, []);

  /** Open the modal for a new event at a specific instant. */
  const openNewEventAt = useCallback((start: Date) => {
    const end = new Date(start.getTime() + 60 * 60 * 1000);
    setDraft({ startsAt: start.toISOString(), endsAt: end.toISOString() });
  }, []);

  /** Clicking a month cell defaults to the next half-hour slot on that day. */
  const openNewEventOnDay = useCallback(
    (day: Date) => {
      const start = startOfDay(day);
      const preferred = roundToNextSlot(new Date());
      start.setHours(preferred.getHours(), preferred.getMinutes(), 0, 0);
      openNewEventAt(start);
    },
    [openNewEventAt],
  );

  const openEvent = useCallback(
    (event: CalendarEvent) => {
      // Someone else's surprise has already been stripped by the server, so
      // there is nothing to edit and nothing to show but the time.
      if (isHiddenSurprise(event, me?.user.id ?? null)) {
        setSurprise(event);
        return;
      }
      setDraft({ event, startsAt: event.startsAt, endsAt: event.endsAt });
    },
    [me],
  );

  /**
   * Commit a drag. The mutation already applies an optimistic update across
   * every cached range and rolls back on failure, so the event stays where it
   * was dropped while the PATCH is in flight and snaps back if it fails.
   */
  const handleMoveEvent = useCallback(
    (eventId: string, times: EventTimes) => {
      // The views already withhold the drag handle here, and the server returns
      // a 403 regardless. This is the belt to those braces: without it an
      // optimistic update would visibly move the event and then snap it back.
      if (decorations.get(eventId)?.canEdit === false) return;
      updateEvent.mutate({ id: eventId, patch: times });
    },
    [updateEvent, decorations],
  );

  const showDay = useCallback((day: Date) => {
    setAnchorDate(day);
    setView('day');
  }, []);

  /** Jump from an event to the list it came from. */
  const showItemsList = useCallback((item: ListItem) => {
    setSelectedListId(item.listId);
    setView('lists');
    setDraft(null);
  }, []);

  const toggleDone = useCallback(
    (item: ListItem) => {
      updateItem.mutate({
        id: item.id,
        patch: { doneAt: isDone(item) ? null : new Date().toISOString() },
      });
    },
    [updateItem],
  );

  const currentUserId = me?.user.id;
  const toggleVote = useCallback(
    (item: ListItem) => {
      if (!currentUserId) return;
      setVote.mutate({
        id: item.id,
        keen: !item.votes.includes(currentUserId),
        userId: currentUserId,
      });
    },
    [currentUserId, setVote],
  );

  // Keyboard shortcuts. Suppressed while a modal is open or while typing, so
  // pressing "d" in the title field doesn't switch views.
  useEffect(() => {
    const onKeyDown = (keyEvent: KeyboardEvent) => {
      if (draft || showCategories || itemDraft || listDraft || showSpace || surprise)
        return;
      if (keyEvent.metaKey || keyEvent.ctrlKey || keyEvent.altKey) return;

      const target = keyEvent.target as HTMLElement | null;
      if (
        target &&
        (target.isContentEditable ||
          ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))
      ) {
        return;
      }

      const shortcuts: Record<string, () => void> = {
        m: () => setView('month'),
        w: () => setView('week'),
        d: () => setView('day'),
        a: () => setView('agenda'),
        l: () => setView('lists'),
        y: () => setView('memories'),
      };

      // The date controls only mean something on a dated view.
      if (isDatedView(view)) {
        Object.assign(shortcuts, {
          t: () => setAnchorDate(new Date()),
          n: () => openNewEventAt(roundToNextSlot(new Date())),
          arrowleft: () => setAnchorDate((date) => navigatePeriod(date, view, -1)),
          arrowright: () => setAnchorDate((date) => navigatePeriod(date, view, 1)),
        });
      }

      const action = shortcuts[keyEvent.key.toLowerCase()];
      if (action) {
        keyEvent.preventDefault();
        action();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [
    draft,
    showCategories,
    itemDraft,
    listDraft,
    showSpace,
    surprise,
    view,
    openNewEventAt,
  ]);

  const weekDays = useMemo(() => getWeekDays(anchorDate, now), [anchorDate, now]);
  // Day view is the same grid with a single column — pick the anchor's own day
  // out of its week rather than building a CalendarDay by hand.
  const singleDay = useMemo(
    () => weekDays.filter((day) => day.key === dayKey(anchorDate)),
    [weekDays, anchorDate],
  );

  // AuthGate only renders this once there is a session, so `me` is present in
  // practice; this keeps TypeScript honest without an assertion.
  if (!me) return null;

  const sourceItem = draft?.event ? itemsByEventId.get(draft.event.id) : undefined;

  const navigateAnchor = (direction: 1 | -1) =>
    setAnchorDate((date) => (isDatedView(view) ? navigatePeriod(date, view, direction) : date));

  return (
    <div className="flex h-full flex-col">
      <MobileHeader
        me={me}
        onManageSpace={() => setShowSpace(true)}
        onRefresh={refreshAll}
        isFetching={isFetching}
      />

      <CalendarHeader
        anchorDate={anchorDate}
        view={view}
        me={me}
        onViewChange={setView}
        onNavigate={navigateAnchor}
        onToday={() => setAnchorDate(new Date())}
        onNewEvent={() => openNewEventAt(roundToNextSlot(new Date()))}
        onManageCategories={() => setShowCategories(true)}
        onManageSpace={() => setShowSpace(true)}
        onSignOut={() => logout.mutate()}
        onRefresh={refreshAll}
        isFetching={isFetching}
      />

      {mobileTab === 'calendar' && isDatedView(view) && (
        <MobileCalendarBar
          anchorDate={anchorDate}
          view={view}
          onNavigate={navigateAnchor}
          onToday={() => setAnchorDate(new Date())}
          onViewChange={setView}
        />
      )}

      {isDatedView(view) && (
        <CategoryFilterBar
          categories={categories}
          hiddenCategoryIds={hiddenCategoryIds}
          onToggle={toggleCategory}
          members={me.members}
          hiddenUserIds={hiddenUserIds}
          onTogglePerson={togglePerson}
        />
      )}

      <main className="min-h-0 flex-1">
        {view === 'lists' ? (
          <ListsView
            lists={lists}
            items={items}
            members={members}
            currentUserId={me.user.id}
            selectedListId={selectedListId}
            onSelectList={setSelectedListId}
            onNewList={() => setListDraft({})}
            onEditList={(list) => setListDraft({ list })}
            onNewItem={(list) => setItemDraft({ list })}
            onSelectItem={(item, list) => setItemDraft({ item, list })}
            onToggleDone={toggleDone}
            onToggleVote={toggleVote}
            onShowDay={showDay}
          />
        ) : view === 'memories' ? (
          <MemoriesView
            items={items}
            lists={lists}
            onSelectItem={(item, list) => setItemDraft({ item, list })}
          />
        ) : error ? (
          <ErrorState message={(error as Error).message} />
        ) : isLoading ? (
          <LoadingState />
        ) : view === 'month' ? (
          <MonthView
            anchorDate={anchorDate}
            today={now}
            events={visibleEvents}
            categories={categoriesById}
            decorations={decorations}
            onSelectEvent={openEvent}
            onSelectDay={isMobile ? showDay : openNewEventOnDay}
            onShowDay={showDay}
            onMoveEvent={handleMoveEvent}
          />
        ) : view === 'agenda' ? (
          <AgendaView
            anchorDate={anchorDate}
            today={now}
            events={visibleEvents}
            categories={categoriesById}
            decorations={decorations}
            onSelectEvent={openEvent}
          />
        ) : (
          <TimeGridView
            // Remount when switching between week and day so the grid re-scrolls.
            key={view}
            days={view === 'week' ? weekDays : singleDay}
            today={now}
            events={visibleEvents}
            categories={categoriesById}
            decorations={decorations}
            onSelectEvent={openEvent}
            onSelectSlot={openNewEventAt}
            onMoveEvent={handleMoveEvent}
          />
        )}
      </main>

      {mobileTab === 'calendar' && (
        <NewEventFab onPress={() => openNewEventAt(roundToNextSlot(new Date()))} />
      )}

      <MobileTabBar
        active={mobileTab}
        onSelect={(tab) => {
          if (tab === 'calendar') setView(lastCalendarView);
          else setView(tab);
        }}
      />

      {draft && (
        <EventModal
          draft={draft}
          categories={categories}
          members={members}
          currentUserId={me.user.id}
          sourceItem={
            sourceItem
              ? { item: sourceItem, list: lists.find((l) => l.id === sourceItem.listId) }
              : undefined
          }
          onClose={() => setDraft(null)}
          isSaving={createEvent.isPending || updateEvent.isPending}
          onSave={(values) =>
            draft.event
              ? updateEvent.mutateAsync({ id: draft.event.id, patch: values })
              : createEvent.mutateAsync(values)
          }
          onDelete={
            draft.event ? () => deleteEvent.mutateAsync(draft.event!.id) : undefined
          }
          onShowSource={sourceItem ? () => showItemsList(sourceItem) : undefined}
        />
      )}

      {itemDraft && (
        <ListItemModal
          draft={itemDraft}
          members={members}
          onClose={() => setItemDraft(null)}
          isSaving={createItem.isPending || updateItem.isPending}
          onSave={(values) =>
            itemDraft.item
              ? updateItem.mutateAsync({ id: itemDraft.item.id, patch: values })
              : createItem.mutateAsync({ listId: itemDraft.list.id, input: values })
          }
          onDelete={
            itemDraft.item
              ? () => deleteItem.mutateAsync(itemDraft.item!.id)
              : undefined
          }
          onSchedule={
            itemDraft.item
              ? async (times) => {
                  const result = await scheduleItem.mutateAsync({
                    id: itemDraft.item!.id,
                    input: { ...times, allDay: false, categoryId: null },
                  });
                  // Keep the open dialog in step with what was just saved, so
                  // it reads "on the calendar for…" without being reopened.
                  setItemDraft((current) =>
                    current ? { ...current, item: result.item } : current,
                  );
                }
              : undefined
          }
          onUnschedule={
            itemDraft.item?.scheduledEventId
              ? async () => {
                  const item = await unscheduleItem.mutateAsync(itemDraft.item!.id);
                  setItemDraft((current) => (current ? { ...current, item } : current));
                }
              : undefined
          }
          onSuggestSlots={
            itemDraft.item
              ? (durationMinutes) =>
                  suggestItemSlots.mutateAsync({ id: itemDraft.item!.id, durationMinutes })
              : undefined
          }
        />
      )}

      {listDraft && (
        <ListModal
          list={listDraft.list}
          itemCount={
            listDraft.list
              ? items.filter((item) => item.listId === listDraft.list!.id).length
              : 0
          }
          onClose={() => setListDraft(null)}
          isSaving={createList.isPending || updateList.isPending}
          onSave={async (values) => {
            if (listDraft.list) {
              await updateList.mutateAsync({ id: listDraft.list.id, patch: values });
            } else {
              const created = await createList.mutateAsync(values);
              setSelectedListId(created.id);
            }
          }}
          onDelete={
            listDraft.list
              ? async () => {
                  await deleteList.mutateAsync(listDraft.list!.id);
                  setSelectedListId(null);
                }
              : undefined
          }
        />
      )}

      {surprise && (
        <SurpriseModal
          event={surprise}
          planner={surprise.createdBy ? members.get(surprise.createdBy) : undefined}
          onClose={() => setSurprise(null)}
        />
      )}

      {showCategories && (
        <CategoryManager categories={categories} onClose={() => setShowCategories(false)} />
      )}

      {showSpace && (
        <SpaceModal
          me={me}
          onClose={() => setShowSpace(false)}
          onManageCategories={() => setShowCategories(true)}
          onSignOut={() => logout.mutate()}
        />
      )}
    </div>
  );
}

function LoadingState() {
  return (
    <div className="flex h-full items-center justify-center">
      <p className="text-sm font-medium text-moss-400">Loading your calendar…</p>
    </div>
  );
}

function ErrorState({ message }: { message: string }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center">
      <p className="display text-xl text-moss-950">Couldn’t load your events</p>
      <p className="max-w-md text-sm text-moss-500">{message}</p>
      <p className="mt-1 text-xs text-moss-400">
        Check that the API is running — <code>npm run dev</code> starts both.
      </p>
    </div>
  );
}
