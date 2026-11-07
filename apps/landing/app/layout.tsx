import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { preload } from "react-dom";
import { heroShot } from "@/lib/captures";
import { brand } from "@/lib/site";
import { pinnedThemeColor, themeColors, themePinAttribute, themeStorageKey } from "@/lib/theme";
import "./globals.css";

const geist = Geist({ subsets: ["latin"], variable: "--font-geist", display: "swap" });
const geistMono = Geist_Mono({ subsets: ["latin"], variable: "--font-geist-mono", display: "swap" });

export const metadata: Metadata = {
  metadataBase: new URL(brand.urls.site),
  title: { default: `${brand.name} - ${brand.tagline}`, template: `%s - ${brand.name}` },
  description: brand.description,
  applicationName: brand.name,
  openGraph: { siteName: brand.name, type: "website", title: brand.tagline, description: brand.description },
  twitter: { card: "summary_large_image" },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: themeColors.light },
    { media: "(prefers-color-scheme: dark)", color: themeColors.dark },
  ],
  colorScheme: "dark light",
};

const json = JSON.stringify;

// Runs before the first paint. A theme chosen with the toggle (components/theme-toggle.tsx) goes on
// <html> as a class, so the page never flashes the system theme first, and gets a theme-color of its own
// (lib/theme.ts) so the browser's chrome matches the page, not the system. Without a saved choice, or
// without JavaScript, there is no class and globals.css follows prefers-color-scheme.
const themeScript = `(function(){var d=document,t=null;
try{t=localStorage.getItem(${json(themeStorageKey)})}catch(e){}
if(t!=="light"&&t!=="dark")return;
d.documentElement.classList.add(t);
try{var m=d.createElement("meta"),f=d.querySelector('meta[name="theme-color"]');m.name="theme-color";m.content=t==="dark"?${json(pinnedThemeColor("dark"))}:${json(pinnedThemeColor("light"))};m.setAttribute(${json(themePinAttribute)},"");f?f.parentNode.insertBefore(m,f):d.head.appendChild(m)}catch(e){}})()`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  // The hero file of the system theme, at high priority, in the head's first links: the media query
  // picks one, with or without JavaScript. The two hero images are eager and low priority
  // (components/shot.tsx), so the one the theme hides loads after the visible one. A script cannot pick
  // the file instead: an inline script runs only once the stylesheet has arrived, and by then the browser
  // has already requested both images. A theme pinned against the system only comes from an earlier
  // visit, so both files are in the browser's cache then.
  preload(heroShot.src, { as: "image", fetchPriority: "high", media: "(prefers-color-scheme: light)" });
  preload(heroShot.srcDark, { as: "image", fetchPriority: "high", media: "not all and (prefers-color-scheme: light)" });
  return (
    // The class on <html> is set by the script above before React hydrates, so it can differ.
    <html lang="en" className={`${geist.variable} ${geistMono.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
