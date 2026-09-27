/**
 * The design tokens the web app expresses as Tailwind classes, as plain values.
 *
 * There is no Tailwind in this app on purpose — running a CSS pipeline inside
 * Metro buys class-name syntax at the cost of a build step that breaks on SDK
 * upgrades, and the view components are being rewritten for touch anyway. What
 * actually needs to survive the crossing is the *design*, which is this file.
 *
 * Values mirror `apps/web/src/styles.css` and the moss scale it uses, so a
 * colour changed in one place should be changed in the other.
 *
 * The neutrals are green-tinted rather than true grey: a green button on a grey
 * app reads as an accent bolted on, while a tint running through every surface,
 * hairline and label is what makes it the app's own colour. Saturation stays
 * low so the two people's avatar colours are still the loudest hues on screen.
 */

export const colors = {
  /** Page background. moss-50. */
  sunken: '#F6F8F4',
  /** Cards, sheets, the grid itself. */
  surface: '#FFFFFF',
  /** Primary text. moss-950. */
  ink: '#0F130E',
  /** Secondary text. moss-600. */
  body: '#52604D',
  /** Labels and hints. moss-400. */
  muted: '#94A38D',
  /** Hairlines. moss-200. */
  border: '#DCE3D8',
  /** Washed rows and weekend columns. moss-100. */
  wash: '#EDF1EA',
  /** Inverted text on ink and on primary. */
  onInk: '#FFFFFF',
  /** Primary actions — buttons, the FAB, active chips, tabs and switches. */
  primary: '#33502E',
  primaryPressed: '#25391F',
  /** Unanimous-vote green, matching the web's emerald. */
  keen: '#047857',
  keenWash: '#D1FAE5',
  /** Events whose category was deleted — must match ORPHAN_EVENT_COLOR. */
  orphan: '#A1A1AA',
} as const;

export const space = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  pill: 999,
} as const;

/**
 * Two families: Bricolage Grotesque carries anything that should feel
 * deliberate, Inter-equivalent (the platform UI face) carries reading text.
 *
 * `display` is only available once `useFonts` has resolved — until then the
 * platform default stands in, which is why every screen waits on that hook
 * rather than flashing a fallback and reflowing.
 */
export const fonts = {
  display: 'BricolageGrotesque_800ExtraBold',
  displayMedium: 'BricolageGrotesque_600SemiBold',
} as const;

export const type = {
  /** Screen titles — the loudest thing on screen. */
  title: { fontFamily: fonts.display, fontSize: 30, letterSpacing: -0.6 },
  /** Section headings. */
  heading: { fontFamily: fonts.display, fontSize: 20, letterSpacing: -0.3 },
  /** Row titles. */
  body: { fontSize: 15, fontWeight: '500' as const },
  /** Supporting text. */
  small: { fontSize: 13 },
  /** Uppercase labels — the CATEGORIES / WHO treatment. */
  label: {
    fontSize: 10,
    fontWeight: '700' as const,
    letterSpacing: 1.2,
    textTransform: 'uppercase' as const,
  },
} as const;
