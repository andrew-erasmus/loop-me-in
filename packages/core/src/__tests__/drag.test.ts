import { describe, expect, it } from 'vitest';
import {
  isUnchanged,
  moveEvent,
  moveEventToDay,
  pixelsToMinutes,
  resizeEventEnd,
  snapToStep,
} from '../drag.js';
import { MIN_EVENT_MINUTES } from '../layout.js';
import type { CalendarEvent } from '../types.js';

function makeEvent(
  startHour: number,
  startMin: number,
  endHour: number,
  endMin: number,
  day = 21,
): CalendarEvent {
  const start = new Date(2026, 8, day, startHour, startMin);
  const end = new Date(2026, 8, day, endHour, endMin);
  return {
    id: 'e1',
    title: 'Test',
    notes: null,
    startsAt: start.toISOString(),
    endsAt: end.toISOString(),
    allDay: false,
    visibility: 'shared',
    categoryId: null,
    createdBy: null,
    createdAt: start.toISOString(),
    updatedAt: start.toISOString(),
  };
}

/** Local `HH:mm` of an ISO instant, for readable assertions. */
const at = (iso: string) => {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};
const on = (iso: string) => new Date(iso).getDate();
const durationMinutes = (times: { startsAt: string; endsAt: string }) =>
  (Date.parse(times.endsAt) - Date.parse(times.startsAt)) / 60_000;

describe('snapToStep', () => {
  it('rounds to the nearest boundary', () => {
    expect(snapToStep(0)).toBe(0);
    expect(snapToStep(7)).toBe(0);
    expect(snapToStep(8)).toBe(15);
    expect(snapToStep(22)).toBe(15);
    expect(snapToStep(23)).toBe(30);
  });

  it('honours a custom step', () => {
    expect(snapToStep(17, 30)).toBe(30);
    expect(snapToStep(14, 30)).toBe(0);
  });
});

describe('moveEvent', () => {
  it('shifts the time and preserves the duration', () => {
    const event = makeEvent(9, 0, 10, 30);
    const moved = moveEvent(event, { minuteDelta: 60 });
    expect(at(moved.startsAt)).toBe('10:00');
    expect(at(moved.endsAt)).toBe('11:30');
    expect(durationMinutes(moved)).toBe(90);
  });

  it('snaps the resulting start onto the grid', () => {
    const event = makeEvent(9, 0, 10, 0);
    // 23 minutes of travel lands nearest the 09:30 line.
    expect(at(moveEvent(event, { minuteDelta: 23 }).startsAt)).toBe('09:30');
    // A 7-minute nudge is not enough to leave 09:00.
    expect(at(moveEvent(event, { minuteDelta: 7 }).startsAt)).toBe('09:00');
  });

  it('pulls an off-grid event onto the grid', () => {
    const event = makeEvent(9, 7, 9, 37);
    expect(at(moveEvent(event, { minuteDelta: 60 }).startsAt)).toBe('10:00');
  });

  it('moves across days without changing the time of day', () => {
    const event = makeEvent(14, 0, 15, 0);
    const moved = moveEvent(event, { dayDelta: 2 });
    expect(on(moved.startsAt)).toBe(23);
    expect(at(moved.startsAt)).toBe('14:00');
    expect(durationMinutes(moved)).toBe(60);
  });

  it('moves backwards across days', () => {
    const moved = moveEvent(makeEvent(14, 0, 15, 0), { dayDelta: -3 });
    expect(on(moved.startsAt)).toBe(18);
    expect(at(moved.startsAt)).toBe('14:00');
  });

  it('combines a day and a time change', () => {
    const moved = moveEvent(makeEvent(9, 0, 10, 0), { dayDelta: 1, minuteDelta: 120 });
    expect(on(moved.startsAt)).toBe(22);
    expect(at(moved.startsAt)).toBe('11:00');
  });

  it('clamps the start inside the day when dragged past midnight', () => {
    const moved = moveEvent(makeEvent(23, 0, 23, 30), { minuteDelta: 600 });
    expect(on(moved.startsAt)).toBe(21);
    expect(at(moved.startsAt)).toBe('23:45');
  });

  it('clamps at the top of the day', () => {
    const moved = moveEvent(makeEvent(1, 0, 2, 0), { minuteDelta: -600 });
    expect(at(moved.startsAt)).toBe('00:00');
    expect(durationMinutes(moved)).toBe(60);
  });

  it('lets a long event run past midnight after a move', () => {
    const moved = moveEvent(makeEvent(20, 0, 23, 0), { minuteDelta: 180 });
    expect(at(moved.startsAt)).toBe('23:00');
    expect(on(moved.endsAt)).toBe(22);
    expect(durationMinutes(moved)).toBe(180);
  });

  it('is a no-op for a zero delta', () => {
    const event = makeEvent(9, 0, 10, 0);
    expect(isUnchanged(event, moveEvent(event, {}))).toBe(true);
  });

  it('preserves a zero-length event', () => {
    const event = makeEvent(9, 0, 9, 0);
    expect(durationMinutes(moveEvent(event, { minuteDelta: 60 }))).toBe(0);
  });
});

describe('resizeEventEnd', () => {
  it('extends the end and leaves the start alone', () => {
    const event = makeEvent(9, 0, 10, 0);
    const resized = resizeEventEnd(event, { minuteDelta: 60 });
    expect(resized.startsAt).toBe(event.startsAt);
    expect(at(resized.endsAt)).toBe('11:00');
  });

  it('shortens the end', () => {
    const resized = resizeEventEnd(makeEvent(9, 0, 11, 0), { minuteDelta: -60 });
    expect(at(resized.endsAt)).toBe('10:00');
  });

  it('snaps the end onto the grid', () => {
    const resized = resizeEventEnd(makeEvent(9, 0, 10, 0), { minuteDelta: 23 });
    expect(at(resized.endsAt)).toBe('10:30');
  });

  it('refuses to shrink below the minimum duration', () => {
    const resized = resizeEventEnd(makeEvent(9, 0, 10, 0), { minuteDelta: -600 });
    expect(durationMinutes(resized)).toBe(MIN_EVENT_MINUTES);
    // And never inverts the event.
    expect(Date.parse(resized.endsAt)).toBeGreaterThan(Date.parse(resized.startsAt));
  });

  it('can extend an event past midnight', () => {
    const resized = resizeEventEnd(makeEvent(22, 0, 23, 0), { minuteDelta: 180 });
    expect(on(resized.endsAt)).toBe(22);
    expect(at(resized.endsAt)).toBe('02:00');
  });
});

describe('moveEventToDay', () => {
  it('re-dates while keeping the time of day and duration', () => {
    const event = makeEvent(14, 30, 16, 0);
    const moved = moveEventToDay(event, new Date(2026, 8, 28));
    expect(on(moved.startsAt)).toBe(28);
    expect(at(moved.startsAt)).toBe('14:30');
    expect(durationMinutes(moved)).toBe(90);
  });

  it('ignores the time component of the target day', () => {
    const moved = moveEventToDay(makeEvent(9, 0, 10, 0), new Date(2026, 8, 28, 17, 45));
    expect(at(moved.startsAt)).toBe('09:00');
  });

  it('carries a multi-day event across whole', () => {
    const event: CalendarEvent = {
      ...makeEvent(9, 0, 10, 0),
      startsAt: new Date(2026, 8, 21, 9, 0).toISOString(),
      endsAt: new Date(2026, 8, 23, 17, 0).toISOString(),
    };
    const moved = moveEventToDay(event, new Date(2026, 8, 28));
    expect(on(moved.startsAt)).toBe(28);
    expect(on(moved.endsAt)).toBe(30);
  });

  it('is a no-op when dropped on its own day', () => {
    const event = makeEvent(9, 0, 10, 0);
    expect(isUnchanged(event, moveEventToDay(event, new Date(2026, 8, 21)))).toBe(true);
  });
});

describe('pixelsToMinutes', () => {
  it('maps a full column height to a full day', () => {
    expect(pixelsToMinutes(1152, 1152)).toBe(1440);
    expect(pixelsToMinutes(576, 1152)).toBe(720);
    expect(pixelsToMinutes(-48, 1152)).toBe(-60);
  });

  it('guards against a zero-height column', () => {
    expect(pixelsToMinutes(100, 0)).toBe(0);
  });
});

/**
 * These guard the *composition* of the drag functions over a whole gesture,
 * rather than any one call. A real bug shipped here: the mobile Day view fed
 * each frame's result back in as the next frame's starting event, while the
 * gesture's translation kept measuring from the original touch point. Every
 * function below was correct in isolation; the drag still ran away.
 */
describe('a gesture applied frame by frame', () => {
  const DAY_HEIGHT_PX = 56 * 24;

  /** Pixel offsets from the touch origin, as a real drag would report them. */
  const frames = [4, 9, 15, 22, 30, 39, 49, 60];

  it('depends only on total travel, not on how many frames it arrived in', () => {
    const event = makeEvent(17, 0, 20, 0);

    const perFrame = frames.map((px) =>
      moveEvent(event, { minuteDelta: pixelsToMinutes(px, DAY_HEIGHT_PX) }),
    );
    const inOneGo = moveEvent(event, {
      minuteDelta: pixelsToMinutes(frames.at(-1)!, DAY_HEIGHT_PX),
    });

    // The last frame of a gesture and a single jump to the same place must
    // agree — that is what makes the function safe to call on every frame.
    expect(perFrame.at(-1)).toEqual(inOneGo);
  });

  it('does not compound when each frame is re-based on the previous result', () => {
    const event = makeEvent(17, 0, 20, 0);

    // The bug, reproduced: feed the previous frame's output back in as the
    // base while the translation still counts from the origin.
    let compounding = event;
    for (const px of frames) {
      compounding = {
        ...compounding,
        ...moveEvent(compounding, { minuteDelta: pixelsToMinutes(px, DAY_HEIGHT_PX) }),
      };
    }

    const correct = moveEvent(event, {
      minuteDelta: pixelsToMinutes(frames.at(-1)!, DAY_HEIGHT_PX),
    });

    // 60px of travel is about an hour; compounding turns it into far more.
    expect(Date.parse(compounding.startsAt)).toBeGreaterThan(
      Date.parse(correct.startsAt),
    );
  });

  it('resizes by total travel too, however many frames it took', () => {
    const event = makeEvent(17, 0, 18, 0);

    const perFrame = frames.map((px) =>
      resizeEventEnd(event, { minuteDelta: pixelsToMinutes(px, DAY_HEIGHT_PX) }),
    );
    const inOneGo = resizeEventEnd(event, {
      minuteDelta: pixelsToMinutes(frames.at(-1)!, DAY_HEIGHT_PX),
    });

    expect(perFrame.at(-1)).toEqual(inOneGo);
    // The start never moves when only the end is dragged.
    expect(perFrame.every((times) => times.startsAt === event.startsAt)).toBe(true);
  });

  it('returns to where it started when the finger does', () => {
    const event = makeEvent(9, 30, 10, 30);

    const wandered = moveEvent(event, {
      minuteDelta: pixelsToMinutes(140, DAY_HEIGHT_PX),
    });
    const returned = moveEvent(event, { minuteDelta: pixelsToMinutes(0, DAY_HEIGHT_PX) });

    expect(isUnchanged(event, wandered)).toBe(false);
    // Dragging out and back is a no-op, so the commit can be skipped entirely.
    expect(isUnchanged(event, returned)).toBe(true);
  });
});
