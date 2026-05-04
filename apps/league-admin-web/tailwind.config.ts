import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: ["./src/**/*.{ts,tsx}"],
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
      }
    }
  },
  plugins: []
};

export default config;
