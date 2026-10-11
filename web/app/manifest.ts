import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Cliprail",
    short_name: "Cliprail",
    description: "Get paid in USDC for every verified view on your clips.",
    start_url: "/me",
    display: "standalone",
    background_color: "#f6f6f2",
    theme_color: "#6e54ff",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      // full-bleed, with the mark inside the 80% safe zone, so Android can crop it to any shape
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
