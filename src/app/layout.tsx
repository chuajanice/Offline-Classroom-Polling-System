import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { SilkBackground } from "@/components/background/silk-background";
import { AppearanceProvider } from "@/components/theme/theme-provider";
import { ServiceWorkerRegister } from "@/components/pwa/service-worker-register";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Pollify",
  description: "Pollify runs live classroom activities on your own network. No internet required.",
};

// Runs before first paint so the saved or system theme never flashes. It only sets
// the "dark" class; all colours live in globals.css. The try/catch covers blocked storage.
const APPEARANCE_SCRIPT = `(function(){try{var t=localStorage.getItem('pollify-theme');var dark=t==='dark'||(t!=='light'&&window.matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.classList.toggle('dark',dark);}catch(e){}})();`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: APPEARANCE_SCRIPT }} />
      </head>
      <body className="relative isolate flex min-h-full flex-col">
        <AppearanceProvider>
          <ServiceWorkerRegister />
          <SilkBackground />
          {children}
        </AppearanceProvider>
      </body>
    </html>
  );
}
