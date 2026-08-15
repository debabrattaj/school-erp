import { Platform } from "react-native";

export const colors = {
  primary: "#4F46E5",
  primaryDark: "#4338CA",
  primaryTint: "#EEF2FF",
  primaryBorder: "#C7D2FE",

  background: "#F8FAFC",
  surface: "#FFFFFF",
  surfaceAlt: "#F1F5F9",

  border: "#E2E8F0",
  borderStrong: "#CBD5E1",

  text: "#0F172A",
  textMuted: "#64748B",
  textFaint: "#94A3B8",
  onPrimary: "#FFFFFF",

  success: "#16A34A",
  successTint: "#DCFCE7",
  warning: "#D97706",
  warningTint: "#FEF3C7",
  danger: "#DC2626",
  dangerTint: "#FEE2E2",
};

export const spacing = (n: number) => n * 4;

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  pill: 999,
};

/** Type scale. Each size carries its line height so text blocks stay on rhythm. */
export const type = {
  display: { fontSize: 30, lineHeight: 36, fontWeight: "800" as const, letterSpacing: -0.6 },
  title: { fontSize: 22, lineHeight: 28, fontWeight: "700" as const, letterSpacing: -0.4 },
  heading: { fontSize: 17, lineHeight: 23, fontWeight: "700" as const, letterSpacing: -0.2 },
  body: { fontSize: 15, lineHeight: 22, fontWeight: "500" as const },
  label: { fontSize: 13, lineHeight: 18, fontWeight: "600" as const },
  caption: { fontSize: 12, lineHeight: 16, fontWeight: "600" as const, letterSpacing: 0.2 },
  overline: { fontSize: 11, lineHeight: 14, fontWeight: "700" as const, letterSpacing: 0.8 },
};

/**
 * Elevation. iOS takes a soft spread shadow, Android only honours `elevation`,
 * so the two are declared separately rather than approximated with one.
 */
const shadow = (y: number, blur: number, opacity: number, depth: number) =>
  Platform.select({
    ios: {
      shadowColor: "#0F172A",
      shadowOffset: { width: 0, height: y },
      shadowOpacity: opacity,
      shadowRadius: blur,
    },
    android: { elevation: depth },
    default: {},
  }) as object;

export const elevation = {
  none: {},
  sm: shadow(1, 2, 0.05, 1),
  md: shadow(4, 10, 0.07, 3),
  lg: shadow(10, 22, 0.1, 8),
};

/**
 * Stable tint per module monogram, so a module's tile keeps the same colour
 * everywhere it appears instead of being assigned one at random.
 */
const TILE_TINTS = [
  { bg: "#EEF2FF", fg: "#4F46E5" },
  { bg: "#ECFDF5", fg: "#059669" },
  { bg: "#FEF3C7", fg: "#B45309" },
  { bg: "#FCE7F3", fg: "#DB2777" },
  { bg: "#E0F2FE", fg: "#0284C7" },
  { bg: "#F3E8FF", fg: "#7C3AED" },
  { bg: "#FFE4E6", fg: "#E11D48" },
  { bg: "#ECFEFF", fg: "#0891B2" },
];

export function tileTint(seed: string) {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return TILE_TINTS[h % TILE_TINTS.length];
}
