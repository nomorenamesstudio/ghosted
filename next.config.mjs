/** @type {import('next').NextConfig} */

// `unsafe-eval` is required by Next.js dev tooling (webpack HMR) but not by
// the production build; keep the production CSP stricter.
const isProd = process.env.NODE_ENV === "production";

const umamiOrigin = "https://ramen.nomorenames.studio";

// Cloudflare injects its own analytics beacon for zones with Web Analytics on.
// It was being blocked by our CSP (the browser refused the script and logged it),
// so both halves are allowed here: the script it loads and the endpoint it posts
// to. Nothing in the app references either host.
const cloudflareScript = "https://static.cloudflareinsights.com";
const cloudflareBeacon = "https://cloudflareinsights.com";

const scriptSrc = isProd
  ? `'self' 'unsafe-inline' ${umamiOrigin} ${cloudflareScript}` // inline theme no-flash script; no eval in prod
  : `'self' 'unsafe-inline' 'unsafe-eval' ${umamiOrigin} ${cloudflareScript}`;

const securityHeaders = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      `script-src ${scriptSrc}`,
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: https:",
      "font-src 'self' data:",
      `connect-src 'self' ${umamiOrigin} ${cloudflareBeacon}`,
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join("; "),
  },
];

const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  images: {
    /**
     * WebP only, and no remote patterns, on purpose.
     *
     * Next 14's image optimizer inherits a critical advisory from `sharp`'s
     * libheif: **AVIF** optimization can lead to remote code execution
     * (GHSA-2xp9-vwfh-vxw4), with no fix inside the 14.x line. AVIF is therefore
     * never offered as an output, and with no `remotePatterns` the optimizer
     * refuses any URL that is not a local file — verified: a remote request
     * answers `400 "url parameter is not allowed"`. This app uses `next/image`
     * nowhere and ships no AVIF, so the vulnerable path has no input to reach it.
     * Do not add AVIF here (or a remote pattern) before the Next 15 upgrade.
     */
    formats: ["image/webp"],
  },
  // The runtime image copies `.next/standalone` (the server plus the modules the
  // tracer found) instead of the whole node_modules tree. Without it the image
  // carries every dev dependency: measured at 2.4 GB, of which the actual
  // application was 729 MB and the rest was layer duplication.
  output: "standalone",
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
