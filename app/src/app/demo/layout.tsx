import type { Metadata } from "next";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import "./demo.css";

// Dev-only screen test bed: fake data, no account, no chain. 404 in production builds.
export const metadata: Metadata = { title: "Kin demo", robots: { index: false, follow: false } };

export default function DemoLayout({ children }: { children: ReactNode }) {
  if (process.env.NODE_ENV === "production") notFound();
  return children;
}
