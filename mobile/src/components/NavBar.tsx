import { router } from "expo-router";
import { AlignLeft, House, LayoutGrid, Users, Wallet } from "lucide-react-native";
import { Animated, Pressable, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "@/theme";

/** Swipeable tab order (same as web NavBar). Home sits in the middle so the strip starts balanced. */
export const TABS = [
  ["Money", Wallet],
  ["Explore", LayoutGrid],
  ["Home", House],
  ["People", Users],
  ["Activity", AlignLeft],
] as const;
export type Tab = (typeof TABS)[number][0];
export function tabIndex(name?: string) {
  const i = TABS.findIndex(([n]) => n.toLowerCase() === name?.toLowerCase());
  return i < 0 ? 2 : i;
}

const SLOT = 76; // px between icon centers
export const NAV_H = 112;
/** Bottom space a tab page's scroll content needs so its end clears the floating nav (which stays see-through). */
export const useNavPad = () => NAV_H - 16 + Math.max(16, useSafeAreaInsets().bottom);

// Set by the mounted tabs screen; lets deep links / notification taps switch tabs without a second tabs screen.
let setPage: ((i: number) => void) | null = null;
export const registerPager = (fn: typeof setPage) => (setPage = fn);

/** Show tab `name`: pops any flow screens above the tabs, then slides to the page. */
export function goTab(name: Tab) {
  const i = tabIndex(name);
  if (!setPage) return router.replace({ pathname: "/tabs", params: { tab: name.toLowerCase() } });
  if (router.canDismiss()) router.dismissAll();
  setPage(i);
}

/**
 * Carousel nav: the active tab slides to the center at 1.3×. `progress` = pager position + offset,
 * so the strip tracks the finger while swiping. Rendered once by the tabs screen.
 */
export function NavBar({ progress, active, onPick }: { progress: Animated.AnimatedAddition<number>; active: number; onPick: (i: number) => void }) {
  const t = useTheme();
  const bottom = Math.max(16, useSafeAreaInsets().bottom);
  const x = Animated.multiply(progress, -SLOT);
  return (
    <View pointerEvents="box-none" style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: NAV_H + bottom - 16 }}>
      <Animated.View accessibilityRole="tablist"
        style={{ position: "absolute", bottom, left: "50%", height: 80, flexDirection: "row", alignItems: "center", transform: [{ translateX: -SLOT / 2 }, { translateX: x }] }}>
        {TABS.map(([label, Icon], i) => {
          const on = progress.interpolate({ inputRange: [i - 1, i, i + 1], outputRange: [0, 1, 0], extrapolate: "clamp" });
          const scale = on.interpolate({ inputRange: [0, 1], outputRange: [1, 1.3] });
          const circle = { position: "absolute", top: 0, left: 0, width: 56, height: 56, borderRadius: 28, alignItems: "center", justifyContent: "center" } as const;
          return (
            <View key={label} style={{ width: SLOT, alignItems: "center" }}>
              <Pressable onPress={() => onPick(i)} accessibilityRole="tab" accessibilityLabel={label} accessibilityState={{ selected: i === active }} hitSlop={6}>
                <Animated.View style={{ width: 56, height: 56, transform: [{ scale }] }}>
                  <View style={[circle, { backgroundColor: t.surface2, borderWidth: 1, borderColor: t.line }]}>
                    <Icon color={t.muted} size={24} />
                  </View>
                  <Animated.View style={[circle, { opacity: on, backgroundColor: t.ink, elevation: 8, shadowColor: t.ink, shadowOpacity: 0.2, shadowRadius: 12 }]}>
                    <Icon color={t.bg} size={24} />
                  </Animated.View>
                </Animated.View>
              </Pressable>
            </View>
          );
        })}
      </Animated.View>
    </View>
  );
}
