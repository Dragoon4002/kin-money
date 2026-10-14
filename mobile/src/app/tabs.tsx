import { useLocalSearchParams } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { Animated, View } from "react-native";
import PagerView from "react-native-pager-view";
import { SafeAreaView } from "react-native-safe-area-context";
import { NavBar, registerPager, tabIndex } from "@/components/NavBar";
import { useNotificationTaps } from "@/lib/push";
import Activity from "@/screens/Activity";
import Explore from "@/screens/Explore";
import Home from "@/screens/Home";
import Money from "@/screens/Money";
import People from "@/screens/People";
import { useTheme } from "@/theme";

const AnimatedPager = Animated.createAnimatedComponent(PagerView);
const PAGES = [Money, Explore, Home, People, Activity]; // same order as TABS

/** The five tab pages in one native pager: swipe or tap the nav to move, like the web carousel. */
export default function Tabs() {
  const t = useTheme();
  const { tab } = useLocalSearchParams<{ tab?: string }>();
  const [initial] = useState(() => tabIndex(tab));
  const [active, setActive] = useState(initial);
  const pager = useRef<PagerView>(null);
  // Pager position + offset drive the nav strip on the native thread.
  const [{ progress, onPageScroll }] = useState(() => {
    const position = new Animated.Value(initial);
    const offset = new Animated.Value(0);
    return { progress: Animated.add(position, offset), onPageScroll: Animated.event([{ nativeEvent: { position, offset } }], { useNativeDriver: true }) };
  });
  useNotificationTaps();

  useEffect(() => {
    registerPager((i) => pager.current?.setPage(i));
    return () => void registerPager(null);
  }, []);

  return (
    <SafeAreaView edges={["top", "left", "right"]} style={{ flex: 1, backgroundColor: t.bg }}>
      <AnimatedPager
        ref={pager}
        style={{ flex: 1 }}
        initialPage={initial}
        onPageScroll={onPageScroll}
        onPageSelected={(e) => setActive(e.nativeEvent.position)}
      >
        {PAGES.map((Page, i) => (
          <View key={i} style={{ flex: 1 }}>
            <Page />
          </View>
        ))}
      </AnimatedPager>
      <NavBar progress={progress} active={active} onPick={(i) => pager.current?.setPage(i)} />
    </SafeAreaView>
  );
}
