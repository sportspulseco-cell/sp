export function Logo({ size = 18 }: { size?: number }) {
  // Pulse-mark: a heart-rate spike inside a soft chamfered square.
  return (
    <span className="inline-flex items-center gap-2.5">
      <span
        aria-hidden
        className="inline-flex shrink-0 items-center justify-center rounded-md bg-fg text-bg"
        style={{ width: size + 6, height: size + 6 }}
      >
        <svg
          viewBox="0 0 24 24"
          width={size - 4}
          height={size - 4}
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M3 12h4l2-5 4 10 2-5h6" />
        </svg>
      </span>
      <span className="font-mono text-[13px] font-semibold tracking-widest text-fg">
        SPORTSPULSE
      </span>
    </span>
  );
}
