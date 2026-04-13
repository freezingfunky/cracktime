/** @type {import('tailwindcss').Config} */
export default {
  content: ["./src/**/*.{js,ts,jsx,tsx,html}"],
  theme: {
    extend: {
      colors: {
        surface: { DEFAULT: "#0f0f17", raised: "#181824", overlay: "#1f1f30" },
        danger: "#ff3b3b",
        warning: "#ffaa2b",
        safe: "#2bff88",
        accent: "#6c63ff",
      },
      fontFamily: {
        mono: ['"JetBrains Mono"', "monospace"],
        sans: ['"Inter"', "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
};
