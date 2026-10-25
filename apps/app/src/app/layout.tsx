import type { Metadata } from "next";
import { Archivo, Geist_Mono } from "next/font/google";
import { AppShell } from "@/components/layout/app-shell";
import { Preloader } from "@/components/layout/preloader";
import "./globals.css";
import { Providers } from "./providers";

// globals.css maps the sans font to --font-sans (shadcn convention). The width axis gives the expanded display cut.
const archivo = Archivo({
  variable: "--font-sans",
  subsets: ["latin"],
  axes: ["wdth"],
  style: ["normal", "italic"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: { default: "Pitwall", template: "%s · Pitwall" },
  description: "Unofficial Formula 1 standings, schedules, weather and race replays.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${archivo.variable} ${geistMono.variable} h-full antialiased`}
    >
      <head>
        {/* Before paint: the start lights play once per browser session. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `try{sessionStorage.getItem("pw-lights")?document.documentElement.classList.add("lights-seen"):sessionStorage.setItem("pw-lights","1")}catch(e){}`,
          }}
        />
      </head>
      <body className="min-h-full flex flex-col">
        <Preloader />
        <Providers>
          <AppShell>{children}</AppShell>
        </Providers>
      </body>
    </html>
  );
}
