import type { FixtureRoute } from "./paginated-site.js";

function normalizeInputUrl(input: string | URL | Request): string {
  if (typeof input === "string") {
    return input;
  }
  if (input instanceof URL) {
    return input.toString();
  }
  return input.url;
}

export function createRouteAwareFetchMock(baseUrl: string, routes: FixtureRoute[]): typeof fetch {
  const routeMap = new Map<string, FixtureRoute>();
  for (const route of routes) {
    routeMap.set(route.path, route);
  }

  return async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const requestUrl = normalizeInputUrl(input);
    const parsed = new URL(requestUrl, baseUrl);
    if (!parsed.origin.startsWith(new URL(baseUrl).origin)) {
      return new Response("external blocked in fixture", { status: 404 });
    }

    const key = `${parsed.pathname}${parsed.search}`;
    const route = routeMap.get(key);
    const status = route?.status ?? 404;
    const method = (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
    const headers = new Headers(route?.headers ?? {});
    if (!headers.has("content-type")) {
      headers.set("content-type", route?.contentType ?? "text/html; charset=utf-8");
    }

    if (method === "HEAD") {
      return new Response(null, { status, headers });
    }

    return new Response(route?.body ?? "not found", {
      status,
      headers,
    });
  };
}
