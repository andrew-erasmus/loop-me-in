import { faGift, faLock, type IconDefinition } from '@fortawesome/free-solid-svg-icons';
import {
  canEditEvent,
  isHiddenSurprise,
  scheduledItemsByEventId,
  type CalendarEvent,
  type List,
  type ListItem,
  type User,
} from '@date-calendar/core';

/**
 * The extra marks an event chip carries beyond its category colour: whose it
 * is, whether it is private, and which list it came from.
 *
 * Built once per render of the whole calendar rather than resolved per chip —
 * a month grid draws a few hundred of them, and each would otherwise repeat
 * the same three lookups.
 */
export interface EventDecoration {
  /** The creator's colour, drawn as a thin accent down the chip's leading edge. */
  personColor?: string | undefined;
  /** Whose it is, for the chip's tooltip. */
  personName?: string | undefined;
  isPrivate: boolean;
  /** Someone else's surprise: visible as a busy slot, redacted by the server. */
  isSurprise: boolean;
  /** False for a surprise that isn't yours — it must not be dragged or edited. */
  canEdit: boolean;
  /** The emoji of the list this event was scheduled from, if any. */
  listEmoji?: string | undefined;
  listName?: string | undefined;
}

export function buildDecorations(
  events: CalendarEvent[],
  members: Map<string, User>,
  items: ListItem[],
  lists: List[],
  viewerId: string | null,
): Map<string, EventDecoration> {
  const itemsByEvent = scheduledItemsByEventId(items);
  const listsById = new Map(lists.map((list) => [list.id, list]));
  const decorations = new Map<string, EventDecoration>();

  for (const event of events) {
    const person = event.createdBy ? members.get(event.createdBy) : undefined;
    const item = itemsByEvent.get(event.id);
    const list = item ? listsById.get(item.listId) : undefined;

    decorations.set(event.id, {
      personColor: person?.color,
      personName: person?.name,
      isPrivate: event.visibility === 'private',
      isSurprise: isHiddenSurprise(event, viewerId),
      canEdit: canEditEvent(event, viewerId),
      listEmoji: list?.emoji ?? undefined,
      listName: list?.name,
    });
  }

  return decorations;
}

/** The leading-edge accent marking who an event belongs to. */
export function personAccent(decoration: EventDecoration | undefined) {
  if (!decoration?.personColor) return undefined;
  // An inset shadow rather than a border: it does not affect layout, so the
  // chip's padding and truncation stay exactly as they were.
  return { boxShadow: `inset 2px 0 0 0 ${decoration.personColor}` };
}

/**
 * The status icon prefixed to a chip's title, if any — a gift for a surprise,
 * a lock for private. Split from the list's own emoji: that one is the user's
 * content (whatever mascot they picked for the list), this one is the app's,
 * which is the distinction that decides whether something here is a FontAwesome
 * icon or a plain emoji character throughout the app.
 */
export function chipStatusIcon(decoration: EventDecoration | undefined): IconDefinition | null {
  if (!decoration) return null;
  if (decoration.isSurprise) return faGift;
  if (decoration.isPrivate) return faLock;
  return null;
}

/**
 * The list's own emoji, if this chip came from one — absent for a surprise,
 * where the list name itself would be a clue to what it is.
 */
export function chipListEmoji(decoration: EventDecoration | undefined): string | undefined {
  if (!decoration || decoration.isSurprise) return undefined;
  return decoration.listEmoji;
}

/** Extra tooltip lines: who owns it, and where it came from. */
export function chipTooltip(decoration: EventDecoration | undefined): string {
  if (!decoration) return '';

  // Say who, and nothing else — the list name would be a clue too.
  if (decoration.isSurprise) {
    return decoration.personName
      ? ` — ${decoration.personName} has planned something`
      : ' — someone has planned something';
  }

  const parts: string[] = [];
  if (decoration.personName) parts.push(decoration.personName);
  if (decoration.listName) parts.push(`from ${decoration.listName}`);
  if (decoration.isPrivate) parts.push('only visible to you');
  return parts.length > 0 ? ` — ${parts.join(', ')}` : '';
}
