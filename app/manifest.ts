import type { MetadataRoute } from "next";

/**
 * The web app manifest, for "add to home screen" on Android — and on iOS, which
 * reads the manifest for the standalone window and the icons but takes its own
 * settings from the `appleWebApp` metadata in the root layout.
 *
 * Icons come from `public/`, generated from `public/app-icon-x2.png` (the 2048px
 * master, opaque, purple with the ghost well inside the safe zone), so the
 * manifest and the metadata point at the same files:
 *
 *   apple-touch-icon.png     180x180   iOS home screen
 *   icon-192.png             192x192   the size Chrome's install prompt wants
 *   icon-512.png             512x512   splash and store listings
 *   icon-maskable-512.png    512x512   the ghost at 90% on the same purple, for
 *                                      Android's adaptive masks, which crop to a
 *                                      circle or a squircle and would otherwise
 *                                      shave the shadow off the ghost
 *
 * `theme_color` and `background_color` are the icon's own purple (sampled from
 * its corner), so the splash screen and the status bar meet the icon instead of
 * framing it in a different colour.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Ghosted",
    short_name: "Ghosted",
    description:
      "Track your job applications and interview progress - and never lose track of the ones that went quiet.",
    start_url: "/app",
    scope: "/",
    display: "standalone",
    background_color: "#582eab",
    theme_color: "#582eab",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      {
        src: "/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
