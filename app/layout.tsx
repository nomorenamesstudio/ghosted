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
  title: "Ghosted - For the Job Hunters",
  description:
    "Track your job applications and interview progress - and never lose track of the ones that went quiet.",
  applicationName: "Ghosted",
  metadataBase: new URL(siteUrl),
  openGraph: {
    title: "Ghosted - For the Job Hunters",
    description:
      "Track your job applications and interview progress - and never lose track of the ones that went quiet.",
    type: "website",
    siteName: "Ghosted",
    locale: "en_US",
    images: [
      {
        url: "/og.png",
        width: 1200,
        height: 630,
        alt: "Ghosted - Never let a job application go quiet on you.",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Ghosted - For the Job Hunters",
    description:
      "Track your job applications and interview progress - and never lose track of the ones that went quiet.",
    images: ["/og.png"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Apply the saved/system theme before first paint to avoid a flash, and
            the saved view with it: the board's shell is widened by a rule keyed
            on `data-view` (see globals.css). Setting the attribute here — the
            same place the theme is decided — is the difference between the board
            opening at its real width and opening at the list width and reflowing
            half a second later when the effect in Dashboard finally runs. Board is
            the default, so it applies unless the stored view says otherwise. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `try{var t=localStorage.getItem('ghosted-theme');if(t==='dark'||(!t&&window.matchMedia('(prefers-color-scheme: dark)').matches))document.documentElement.classList.add('dark');if(localStorage.getItem('ghosted-view')!=='list')document.documentElement.setAttribute('data-view','board')}catch(e){}`,
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
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <Providers>
          {children}
          <Footer />
        </Providers>
      </body>
    </html>
  );
}
