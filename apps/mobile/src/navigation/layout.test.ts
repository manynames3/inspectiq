import { tabBarLayout } from "./layout";

describe("mobile navigation layout", () => {
  it("keeps tab controls above Android system navigation", () => {
    expect(tabBarLayout(48)).toEqual({ height: 110, paddingBottom: 48 });
  });

  it("retains compact spacing when no bottom inset is present", () => {
    expect(tabBarLayout(0)).toEqual({ height: 62, paddingBottom: 7 });
  });
});
