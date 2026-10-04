import type { Metadata } from "next";
import localFont from "next/font/local";
import Script from "next/script";
import "./globals.css";
import { Providers } from "./providers";
import { Footer } from "@/components/Footer";
import { siteIdentity, siteOrigin } from "@/lib/site";

/**
 * Rendered per request on purpose. The analytics tags and the robots metadata
 * below come from the environment, and a statically optimised route bakes them
 * in at build time — which would mean one published image could no longer be
 * reconfigured by environment alone, the whole point of the deployment flags.
 * The cost is a render per request on the handful of pages that would otherwise
 * be static (the legal pages); everything else was already dynamic.
 */
export const dynamic = "force-dynamic";

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

const siteUrl = siteOrigin();

/**
 * Read at request time, never at module scope. `siteIdentity()` validates the
 * deployment configuration — it refuses open registration in production without
 * a delivering email transport — and a `next build` loads this module to collect
 * routes. Evaluating it at import time therefore fails the *build* of an image
 * whose runtime environment is perfectly valid, which is exactly the documented
 * `docker compose up --build` path.
 */
export function generateMetadata(): Metadata {
  const identity = siteIdentity();
  return {
  // The brand alone ranks for nothing: the title carries the term a job seeker
  // actually types. Kept under 60 characters so Google does not truncate it.
  title: "Ghosted — the job application tracker that never goes quiet",
  // Only the operator's own instance should turn up in search results; a
  // self-hosted one is private unless it says otherwise.
  robots: identity.indexable ? undefined : { index: false, follow: false },
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
    // The short name, not the page title: iOS puts this under the icon and
    // truncates it, and a home screen cannot hold a sentence.
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
    // Absolute, because a share card with a relative URL tells a crawler that
    // only has the HTML nothing about where this page lives.
    url: siteUrl,
    title: "Ghosted — the job application tracker that never goes quiet",
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
    title: "Ghosted — the job application tracker that never goes quiet",
    description:
      "Track your job applications and interview progress — and never lose track of the ones that went quiet.",
    images: ["/ghost-og.png?v=1"],
  },
  };
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const identity = siteIdentity();

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
            __html: `try{var t=location.pathname==='/'?null:localStorage.getItem('ghosted-theme');if(t==='dark'||(!t&&window.matchMedia('(prefers-color-scheme: dark)').matches))document.documentElement.classList.add('dark');var v=localStorage.getItem('ghosted-view');if(v!=='list'){document.documentElement.setAttribute('data-view','board');if(location.pathname==='/app')document.documentElement.setAttribute('data-board-content','')}}catch(e){}`,
          }}
        />
        {/* Analytics, only when this deployment configured it: `UMAMI_SRC` and
            `UMAMI_WEBSITE_ID` both set, or nothing is rendered at all. The
            hosted instance sets them; a self-hosted one inherits no tracker and
            reports nowhere. Loaded after hydration rather than with a bare
            `defer` in <head>: analytics is never worth competing with the page's
            own JS and fonts for bandwidth on first load, and nothing on the page
            waits on it. */}
        {identity.umami && (
          <Script
            src={identity.umami.src}
            strategy="afterInteractive"
            data-website-id={identity.umami.websiteId}
            data-cache="true"
            data-domains={identity.umami.domains ?? undefined}
          />
        )}
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
