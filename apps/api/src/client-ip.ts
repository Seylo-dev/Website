import type { Server } from "bun";

/**
 * The key requests are rate limited by. Behind Cloudflare or Traefik every request comes from
 * the proxy's address, so with `trustProxy` the first forwarded address is used instead.
 */
export function clientKey(request: Request, server: Server<unknown> | null, trustProxy: boolean): string {
  if (trustProxy) {
    const forwarded =
      request.headers.get("cf-connecting-ip") ?? request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
    if (forwarded) return forwarded;
  }
  return server?.requestIP(request)?.address ?? "unknown";
}
