module.exports = {
  content: [
    "./src/renderer/index.html",
    "./src/renderer/src/**/*.{js,jsx,ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#eef7ff",
          100: "#d9ecff",
          500: "#3b82f6",
          600: "#2563eb",
        },
        primary: "#003498",
        line: "#f1f1f1",
        selected: "#E8EBF1",
        empty: "#e9e9e9",
        normal: "#202020",
        danger: {
          DEFAULT: "#FF332E",
          dark: "BE0700",
          light: "#FEE9EC",
        },
        info: {
          DEFAULT: "#bebebe",
          dark: "#8D8D8D",
          light: "#D8D8D8",
        },
        success: {
          DEFAULT: "#30C813",
          light: "#D8F6E4",
        },
      },
    },
  },
  plugins: [],
};
