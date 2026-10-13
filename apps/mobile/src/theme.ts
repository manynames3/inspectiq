import { supremeBrand, supremeField } from "@inspectiq/shared";

export const colors = {
  ink: supremeField.ink,
  muted: supremeField.muted,
  line: supremeField.line,
  canvas: supremeField.canvas,
  surface: supremeField.surface,
  navy: supremeBrand.canvas,
  blue: supremeField.primary,
  blueSoft: supremeField.soft,
  teal: supremeField.accent,
  tealSoft: supremeField.soft,
  green: supremeField.accent,
  greenSoft: supremeField.soft,
  mint: supremeBrand.mint,
  amber: "#A75A08",
  amberSoft: "#FFF3DF",
  red: "#C92B32",
  redSoft: "#FDEBED",
  graySoft: "#EAF0EC"
} as const;

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;
