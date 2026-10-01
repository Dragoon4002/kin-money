import { NavBar } from "@/components/core/NavBar";

// Tab screens share one persistent NavBar: it never remounts while moving between tabs.
// Screens outside this group (send, details…) render without it.
export default function TabsLayout({ children }: LayoutProps<"/">) {
  return (
    <>
      {children}
      <NavBar />
    </>
  );
}
