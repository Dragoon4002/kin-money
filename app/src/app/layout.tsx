import type { Metadata, Viewport } from "next";
import { Instrument_Serif, Plus_Jakarta_Sans } from "next/font/google";
import Script from "next/script";
import "./globals.css";

const jakarta = Plus_Jakarta_Sans({ variable: "--font-jakarta", subsets: ["latin"] });
const serif = Instrument_Serif({ variable: "--font-serif", subsets: ["latin"], weight: "400" });

export const metadata: Metadata = {
  title: "Kin",
  description: "Money for the people you love, anywhere.",
  appleWebApp: { capable: true, title: "Kin", statusBarStyle: "black-translucent" },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#faf7f3" },
    { media: "(prefers-color-scheme: dark)", color: "#0d0c0b" },
  ],
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

// Apply saved theme before paint (no flash). "system" = no attribute.
const themeScript = `try{var t=localStorage.getItem("kin.theme");if(t==="light"||t==="dark")document.documentElement.dataset.theme=t}catch(e){}`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${jakarta.variable} ${serif.variable} antialiased`} suppressHydrationWarning>
      <body className="min-h-dvh">
        <Script id="kin-theme" strategy="beforeInteractive">{themeScript}</Script>
        <div className="mx-auto flex min-h-dvh max-w-md flex-col">{children}</div>
      </body>
    </html>
  );
}
