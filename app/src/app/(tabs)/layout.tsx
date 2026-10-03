import { NavBar } from "@/components/core/NavBar";

// Tab screens share one persistent NavBar: it never remounts while moving between tabs.
// Screens outside this group (send, details…) render without it.
export default function TabsLayout({ children }: LayoutProps<"/">) {
  return (
    <>
      {/* room for the floating nav; screens outside tabs keep only the safe-area gap, so bottom buttons sit low */}
      <div className="flex flex-1 flex-col pb-[5.75rem]">{children}</div>
      <NavBar />
    </>
  );
}
