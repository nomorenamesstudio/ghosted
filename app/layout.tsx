import type { Metadata } from "next";
import localFont from "next/font/local";
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

export const metadata: Metadata = {
  title: "Ghosted - For the Job Hunters",
  description:
    "Track your job applications and interview progress — and never lose track of the ones that went quiet.",
  applicationName: "Ghosted",
  openGraph: {
    title: "Ghosted - For the Job Hunters",
    description:
      "Track your job applications and interview progress — and never lose track of the ones that went quiet.",
    type: "website",
    siteName: "Ghosted",
    locale: "en_US",
  },
  twitter: {
    card: "summary",
    title: "Ghosted - For the Job Hunters",
    description:
      "Track your job applications and interview progress — and never lose track of the ones that went quiet.",
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
        {/* Apply the saved/system theme before first paint to avoid a flash. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `try{var t=localStorage.getItem('ghosted-theme');if(t==='dark'||(!t&&window.matchMedia('(prefers-color-scheme: dark)').matches))document.documentElement.classList.add('dark')}catch(e){}`,
          }}
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
