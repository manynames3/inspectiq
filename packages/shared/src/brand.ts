/** Supreme AI Ventures' palette, with task-specific desk and field surfaces. */
export const supremeBrand = {
  canvas: "#0b1416", surface: "#101c1e", raised: "#17272a",
  ink: "#e7eeec", muted: "#a0b4b6", line: "#30474b",
  accent: "#5cc4b8", mint: "#9fe0d6", deep: "#06393e",
  amber: "#f2c078", red: "#f5a3a3", photo: "#0d0e0e"
} as const;

export const supremeField = {
  canvas: "#f2f6f3", surface: "#ffffff", ink: "#13221f",
  muted: "#526963", line: "#cad8d3", primary: supremeBrand.deep,
  accent: "#126b61", soft: "#e4f3ee"
} as const;
