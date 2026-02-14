export interface FixtureRoute {
  path: string;
  status?: number;
  contentType?: string;
  headers?: Record<string, string>;
  body: string;
}

function page(body: string): string {
  return `<!doctype html><html lang="pl"><head><meta charset="utf-8"><title>Fixture</title></head><body>${body}</body></html>`;
}

export const PAGINATED_SITE_ROUTES: FixtureRoute[] = [
  {
    path: "/",
    body: page(`
      <nav>
        <a href="/o-nas/czytelnia">Czytelnia</a>
        <a href="/cennik">Cennik</a>
        <a href="/cennik">Cennik</a>
      </nav>
    `),
  },
  {
    path: "/robots.txt",
    contentType: "text/plain",
    body: "User-agent: *\nAllow: /\n",
  },
  {
    path: "/o-nas/czytelnia",
    body: page(`
      <h1>Czytelnia page 1</h1>
      <a href="/o-nas/czytelnia?page=2">Następna</a>
      <a href="/cennik">Cennik</a>
      <a href="/cennik">Cennik</a>
      <a href="/cennik">Cennik</a>
    `),
  },
  {
    path: "/o-nas/czytelnia?page=2",
    body: page(`
      <h1>Czytelnia page 2</h1>
      <a href="/o-nas/czytelnia?page=3">Następna</a>
      <a href="/o-nas/czytelnia/zlosc-nie-jest-zla">Artykuł 1</a>
      <a href="/cennik">Cennik</a>
      <a href="/cennik">Cennik</a>
    `),
  },
  {
    path: "/o-nas/czytelnia?page=3",
    body: page(`
      <h1>Czytelnia page 3</h1>
      <a href="/o-nas/czytelnia/jak-stres-wplywa-na-nasza-odpornosc">Artykuł 2</a>
      <a href="/cennik">Cennik</a>
      <a href="/cennik">Cennik</a>
    `),
  },
  {
    path: "/o-nas/czytelnia/zlosc-nie-jest-zla",
    body: page(`<main>Treść artykułu o złości.</main>`),
  },
  {
    path: "/o-nas/czytelnia/jak-stres-wplywa-na-nasza-odpornosc",
    body: page(`<main>Treść artykułu o stresie i odporności.</main>`),
  },
  {
    path: "/cennik",
    body: page(`<main>Cennik usług.</main>`),
  },
];

export const PAGINATED_EXPECTED_PATHS = [
  "/",
  "/o-nas/czytelnia",
  "/o-nas/czytelnia?page=2",
  "/o-nas/czytelnia?page=3",
  "/o-nas/czytelnia/zlosc-nie-jest-zla",
  "/o-nas/czytelnia/jak-stres-wplywa-na-nasza-odpornosc",
  "/cennik",
] as const;
