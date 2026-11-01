import type { MetadataRoute } from "next";

/** Web app manifest: guests can add the menu to their home screen (no native app needed). */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Spotifood",
    short_name: "Spotifood",
    description: "Menu, commande et paiement à table.",
    start_url: "/table",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#fbfaf8",
    theme_color: "#E4572E",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
