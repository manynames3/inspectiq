const baseTabBarHeight = 62;
const baseTabBarPadding = 7;

export function tabBarLayout(bottomInset: number): { height: number; paddingBottom: number } {
  const safeBottom = Math.max(0, bottomInset);
  return {
    height: baseTabBarHeight + safeBottom,
    paddingBottom: Math.max(baseTabBarPadding, safeBottom),
  };
}
