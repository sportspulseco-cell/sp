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
        "bg-elev": "var(--bg-elev)",
        fg: "var(--fg)",
        "fg-muted": "var(--fg-muted)",
        "fg-subtle": "var(--fg-subtle)",
        border: "var(--border)",
        "border-strong": "var(--border-strong)",
        "surface-1": "var(--surface-1)",
        "surface-2": "var(--surface-2)",
        accent: "var(--accent)",
        "accent-fg": "var(--accent-fg)",
        "accent-soft": "var(--accent-soft)",
        success: "var(--success)",
        warning: "var(--warning)",
        error: "var(--error)",
        cyan: {
          DEFAULT: "var(--cyan)",
          glow: "var(--cyan-glow)"
        },
        navy: {
          DEFAULT: "var(--navy)",
          deep: "var(--navy-deep)"
        },
        electric: {
          DEFAULT: "var(--electric)",
          glow: "var(--electric-glow)"
        }
      },
      borderRadius: {
        sm: "6px",
        DEFAULT: "8px",
        md: "8px",
        lg: "12px",
        xl: "16px",
        "2xl": "20px"
      },
      letterSpacing: {
        tight: "-0.025em",
        tighter: "-0.04em",
        wide: "0.06em",
        widest: "0.18em"
      },
      transitionTimingFunction: {
        ease: "cubic-bezier(0.4, 0, 0.2, 1)",
        spring: "cubic-bezier(0.34, 1.56, 0.64, 1)"
      },
      maxWidth: {
        container: "1240px"
      },
      keyframes: {
        "ticker": {
          "0%": { transform: "translateX(0)" },
          "100%": { transform: "translateX(-50%)" }
        },
        "scan": {
          "0%, 100%": { transform: "translateX(-100%)", opacity: "0" },
          "20%": { opacity: "1" },
          "80%": { opacity: "1" },
          "100%": { transform: "translateX(100%)", opacity: "0" }
        },
        "pulse-slow": {
          "0%, 100%": { opacity: "0.4" },
          "50%": { opacity: "1" }
        },
        "pulse-dot": {
          "0%, 100%": { boxShadow: "0 0 0 0 rgba(34, 211, 238, 0.6)" },
          "50%": { boxShadow: "0 0 0 8px rgba(34, 211, 238, 0)" }
        }
      },
      animation: {
        ticker: "ticker 40s linear infinite",
        scan: "scan 3.2s ease-in-out infinite",
        "pulse-slow": "pulse-slow 2.4s ease-in-out infinite",
        "pulse-dot": "pulse-dot 1.6s ease-out infinite"
      }
    }
  },
  plugins: []
};

export default config;
