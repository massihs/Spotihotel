import type { MetadataRoute } from "next";

/** Web app manifest: guests can add the menu to their home screen (no native app needed). */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Spotihotel",
    short_name: "Spotihotel",
    description: "Menu, commande et paiement à table.",
    start_url: "/table",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#ffffff",
    theme_color: "#14213d",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
