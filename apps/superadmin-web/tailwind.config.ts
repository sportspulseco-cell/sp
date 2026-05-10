import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: [
    "./src/**/*.{ts,tsx}",
    "../../packages/ui/src/**/*.{ts,tsx}",
    "../../packages/registration-funnel/src/**/*.{ts,tsx}"
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ["var(--font-inter)", "ui-sans-serif", "system-ui"],
        mono: ["var(--font-jetbrains-mono)", "ui-monospace", "monospace"]
      },
      colors: {
        bg: "var(--bg)",
        "bg-subtle": "var(--bg-subtle)",
        fg: "var(--fg)",
        "fg-muted": "var(--fg-muted)",
        border: "var(--border)",
        "border-strong": "var(--border-strong)",
        "surface-1": "var(--surface-1)",
        "surface-2": "var(--surface-2)",
        accent: "var(--accent)",
        "accent-fg": "var(--accent-fg)",
        success: "var(--success)",
        warning: "var(--warning)",
        error: "var(--error)",
        // Legacy compat for existing classes referenced before this redesign
        background: "var(--bg)",
        foreground: "var(--fg)",
        card: "var(--surface-1)",
        "card-foreground": "var(--fg)",
        primary: "var(--fg)",
        "primary-foreground": "var(--bg)",
        muted: "var(--surface-2)",
        "muted-foreground": "var(--fg-muted)",
        input: "var(--border)",
        ring: "var(--accent)",
        destructive: "var(--error)",
        "destructive-foreground": "#ffffff"
      },
      borderRadius: {
        sm: "6px",
        DEFAULT: "8px",
        md: "8px",
        lg: "12px",
        xl: "12px"
      },
      boxShadow: {
        sm: "var(--shadow-sm)",
        DEFAULT: "var(--shadow-sm)",
        md: "var(--shadow-md)",
        focus: "var(--shadow-focus)"
      },
      letterSpacing: {
        tight: "var(--tracking-tight)",
        tighter: "var(--tracking-tighter)",
        wide: "var(--tracking-wide)"
      },
      transitionTimingFunction: {
        ease: "cubic-bezier(0.4, 0, 0.2, 1)"
      },
      transitionDuration: {
        fast: "150ms",
        base: "200ms"
      },
      maxWidth: {
        container: "1200px"
      },
      keyframes: {
        // Endless horizontal marquee — duplicate the rail content and
        // translate -50% so the loop is seamless. Port of landing-web.
        ticker: {
          "0%": { transform: "translateX(0)" },
          "100%": { transform: "translateX(-50%)" }
        },
        // Sweeping diagonal sheen across a card. Use behind a content
        // layer with overflow-hidden.
        scan: {
          "0%, 100%": { transform: "translateX(-100%)", opacity: "0" },
          "20%": { opacity: "1" },
          "80%": { opacity: "1" },
          "100%": { transform: "translateX(100%)", opacity: "0" }
        },
        // Slow breathing for accent halos behind hero content.
        "pulse-slow": {
          "0%, 100%": { opacity: "0.45" },
          "50%": { opacity: "1" }
        },
        // Live dot: ringed pulse expanding outward, fades each cycle.
        "pulse-dot": {
          "0%, 100%": { boxShadow: "0 0 0 0 rgba(99, 91, 255, 0.55)" },
          "50%": { boxShadow: "0 0 0 8px rgba(99, 91, 255, 0)" }
        },
        // Vertical EKG-style scroll — tall thin bar drifts up then loops.
        ekg: {
          "0%": { transform: "translateY(0)" },
          "100%": { transform: "translateY(-50%)" }
        }
      },
      animation: {
        ticker: "ticker 40s linear infinite",
        "ticker-fast": "ticker 22s linear infinite",
        scan: "scan 3.2s ease-in-out infinite",
        "pulse-slow": "pulse-slow 2.8s ease-in-out infinite",
        "pulse-dot": "pulse-dot 1.8s ease-out infinite",
        ekg: "ekg 6s linear infinite"
      }
    }
  },
  plugins: []
};

export default config;
