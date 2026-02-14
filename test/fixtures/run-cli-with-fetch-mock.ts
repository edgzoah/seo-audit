import { createRouteAwareFetchMock } from "./fetch-mock.js";
import type { FixtureRoute } from "./paginated-site.js";

const baseUrl = process.env.SEO_AUDIT_FIXTURE_BASE_URL;
const routesJson = process.env.SEO_AUDIT_FIXTURE_ROUTES_JSON;

if (!baseUrl || !routesJson) {
  throw new Error("Missing SEO_AUDIT_FIXTURE_BASE_URL or SEO_AUDIT_FIXTURE_ROUTES_JSON for fixture CLI run.");
}

const routes = JSON.parse(routesJson) as FixtureRoute[];
globalThis.fetch = createRouteAwareFetchMock(baseUrl, routes);

void (async () => {
  await import("../../src/cli.ts");
})().catch((error) => {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exit(1);
});
