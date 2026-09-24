import type { Metadata } from "next";
import localFont from "next/font/local";
import Script from "next/script";
import "./globals.css";
import { Providers } from "./providers";
import { Footer } from "@/components/Footer";

const geistSans = localFont({
  src: "./fonts/GeistVF.woff",
  variable: "--font-geist-sans",
  weight: "100 900",
});
const geistMono = localFont({
  src: "./fonts/GeistMonoVF.woff",
  variable: "--font-geist-mono",
  weight: "100 900",
});

const siteUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://ghosted.lostsignals.studio";

export const metadata: Metadata = {
  title: "Ghosted",
  description:
    "Track your job applications and interview progress — and never lose track of the ones that went quiet.",
  applicationName: "Ghosted",
  metadataBase: new URL(siteUrl),
  // Home-screen icons, cut from `public/staring-at-phone-sad-app-icon-alt.png`
  // (see app/manifest.ts for how). iOS ignores the manifest's icons in favour of
  // this one link, and composites transparency onto black — hence the flattened
  // 180px square — while Android takes the manifest's 192 and 512.
  icons: {
    icon: [
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    // The `?v=` is not decoration: iOS and Android key their icon caches by URL,
    // so re-adding a home-screen clip to the same path can hand back the art it
    // remembers. Bump this whenever the icon changes, and the re-add is
    // guaranteed to fetch the new one.
    apple: [
      { url: "/apple-touch-icon.png?v=2", sizes: "180x180", type: "image/png" },
    ],
  },
  // iOS standalone: the home-screen name, and the meta tag that makes a saved
  // shortcut open without Safari's chrome (the manifest's `display` covers
  // Android).
  appleWebApp: {
    capable: true,
    title: "Ghosted",
    statusBarStyle: "default",
  },
  // Chrome warns that `apple-mobile-web-app-capable` alone is deprecated and
  // wants the standard name alongside it; iOS still needs the apple one, so
  // both are emitted.
  other: {
    "mobile-web-app-capable": "yes",
  },
  openGraph: {
    title: "Ghosted",
    description:
      "Track your job applications and interview progress — and never lose track of the ones that went quiet.",
    type: "website",
    siteName: "Ghosted",
    locale: "en_US",
    images: [
      {
        // 2400x1260: the 1200x630 card ratio at 2x, so a retina preview and a
        // desktop one come from the same file. The `?v=` is the crawler-cache
        // equivalent of the icon URLs: social cards are cached by URL, so bump it
        // instead of expecting a replaced file to be re-fetched.
        url: "/ghost-og.png?v=1",
        width: 2400,
        height: 1260,
        alt: "The Ghosted ghost holding a phone, beside the words: never let a job application go quiet on you.",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Ghosted",
    description:
      "Track your job applications and interview progress — and never lose track of the ones that went quiet.",
    images: ["/ghost-og.png?v=1"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    // The font variables belong on <html>, not <body>: Tailwind's preflight sets
    // the base font-family on `html`, and a `var()` that is not defined on that
    // element makes the whole declaration invalid at computed-value time — which
    // dropped the fallbacks too and left the page in the browser's serif default.
    // Defined here they inherit everywhere, and `font-sans` resolves to Geist.
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable}`}
      suppressHydrationWarning
    >
      <head>
        {/* Apply the saved/system theme before first paint to avoid a flash, and
            the saved view with it (see the rules in globals.css). Setting them
            here — the same place the theme is decided — is the difference between
            the board opening at its real width and opening at the list width and
            reflowing half a second later when the effect in Dashboard finally
            runs. Board is the default, so they apply unless the stored view says
            otherwise.

            `data-view` follows the stored view on every route, because the header
            goes with the view: a detail page reached from the board keeps the wide
            frame, and a refresh must not change it. `data-board-content` is only
            set on the dashboard, whose content is the only thing that widens with
            the board. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `try{var t=localStorage.getItem('ghosted-theme');if(t==='dark'||(!t&&window.matchMedia('(prefers-color-scheme: dark)').matches))document.documentElement.classList.add('dark');var v=localStorage.getItem('ghosted-view');if(v!=='list'){document.documentElement.setAttribute('data-view','board');if(location.pathname==='/app')document.documentElement.setAttribute('data-board-content','')}}catch(e){}`,
          }}
        />
        {/* Self-hosted umami analytics (tracker + beacon on
            ramen.lostsignals.studio). Loaded after hydration rather than with a
            bare `defer` in <head>: analytics is never worth competing with the
            page's own JS and fonts for bandwidth on first load, and nothing on
            the page waits on it. */}
        <Script
          src="https://ramen.lostsignals.studio/script.js"
          strategy="afterInteractive"
          data-website-id="c8f73665-dca1-464b-9427-a56f8b27c799"
          data-cache="true"
          data-domains="ghosted.lostsignals.studio"
        />
      </head>
      <body className="antialiased">
        <Providers>
          {children}
          <Footer />
        </Providers>
      </body>
    </html>
  );
}
