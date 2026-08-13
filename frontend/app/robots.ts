import type { MetadataRoute } from "next";

/** GateGuard is an authenticated operational application, not a public content site. */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      disallow: "/",
    },
  };
}
