import type { MetadataRoute } from "next";

/**
 * The web app manifest, for "add to home screen" on Android — and on iOS, which
 * reads the manifest for the standalone window and its colours but takes its icons
 * from the `appleWebApp` metadata in the root layout.
 *
 * Icons are cut from `public/staring-at-phone-sad-app-icon-alt.png` (the 2048px
 * master) into `public/`:
 *
 *   apple-touch-icon.png   180x180   iOS home screen
 *   icon-192.png           192x192   the size Chrome's install prompt asks for
 *   icon-512.png           512x512   splash, and Android's maskable icon
 *
 * That artwork is a close-up that bleeds to all four edges — the ghost and its
 * phone run off the frame on purpose — so every cut is full bleed, and the 512 is
 * declared `any maskable` rather than given a padded twin: Android's masks round
 * the corners, and previewing the circle crop shows the face, eyes and phone all
 * surviving inside the safe area. Padding it to sit inside the safe circle was
 * tried and looked worse — a blurred halo of the artwork round a shrunken face.
 *
 * `theme_color` and `background_color` are the art's own pale ground (#ebedf9,
 * sampled from its corners), so the splash meets the icon instead of framing a
 * pale lavender ghost in the old purple.
 *
 * The previous icon set — the purple square with the small ghost — is kept: its
 * master is `public/app-icon-x2.png` and its cuts are in `public/icons-v1/`, so
 * switching back is a copy plus the one ImageMagick command in the changelog.
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
    background_color: "#ebedf9",
    theme_color: "#ebedf9",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      // The art bleeds to the edges, and previewing Android's circular crop shows
      // the face, eyes and phone surviving it — so one file serves both purposes.
      // It is listed twice because the manifest type takes a single value per
      // entry, not the spec's space-separated "any maskable".
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
