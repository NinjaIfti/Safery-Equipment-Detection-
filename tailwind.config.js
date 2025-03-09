module.exports = {
  content: ["./src/**/*.{js,jsx,ts,tsx}"], // Ensure it scans your JSX/TSX files
  theme: {
    extend: {
      backgroundImage: {
        "custom-bg": "url('/images/bg.jpg')", // ✅ Correct for public folder
      },
    },
  },
  plugins: [],
};
