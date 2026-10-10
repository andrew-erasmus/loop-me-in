/**
 * An on/off switch. A real `role="switch"` button rather than a styled
 * checkbox, so a screen reader announces "on"/"off" instead of "checked", and
 * the whole row it sits in can be its label.
 */
export default function Switch({
  checked,
  onChange,
  disabled,
  labelledBy,
  describedBy,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  labelledBy: string;
  describedBy?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-labelledby={labelledBy}
      aria-describedby={describedBy}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 disabled:opacity-50 ${
        checked ? 'bg-primary' : 'bg-moss-200'
      }`}
    >
      <span
        aria-hidden
        className={`inline-block h-5 w-5 rounded-full bg-white shadow-sm ring-1 ring-moss-950/5 transition-transform ${
          checked ? 'translate-x-[22px]' : 'translate-x-0.5'
        }`}
      />
    </button>
  );
}
