/** @type {import('next').NextConfig} */

// `unsafe-eval` is required by Next.js dev tooling (webpack HMR) but not by
// the production build; keep the production CSP stricter.
const isProd = process.env.NODE_ENV === "production";

const umamiOrigin = "https://ramen.lostsignals.studio";

const scriptSrc = isProd
  ? `'self' 'unsafe-inline' ${umamiOrigin}` // inline theme no-flash script; no eval in prod
  : `'self' 'unsafe-inline' 'unsafe-eval' ${umamiOrigin}`;

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
      `connect-src 'self' ${umamiOrigin}`,
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join("; "),
  },
];

const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
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
