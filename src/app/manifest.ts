import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "PGS Construction Platform",
    short_name: "PGS",
    description: "Управление строительными проектами и работа стройплощадки",
    start_url: "/projects",
    display: "standalone",
    background_color: "#f5f1e9",
    theme_color: "#15181d",
    lang: "ru",
    icons: [
      { src: "/api/pwa-icon/192", sizes: "192x192", type: "image/png" },
      { src: "/api/pwa-icon/512", sizes: "512x512", type: "image/png" }
    ]
  };
}
