# Parkblick

Berlin-first explorer for public parks and green spaces at
[`parks.soli.blue`](https://parks.soli.blue). It uses official open data,
MapLibre, and basemap.de—no Google Maps key, paid API, application server, or
database.

## Architecture

Parkblick is static-first:

1. `scripts/refresh-data.mjs` fetches Berlin WFS sources and writes normalized,
   deterministic files to `public/data/`.
2. Vite bundles the React app; the generated data is copied into `dist/data/`.
3. Cloudflare Pages serves the app and data.
4. The browser loads basemap.de vector tiles and performs search, filtering,
   distance estimates, and geolocation locally.

An API or VPS is unnecessary for the Berlin MVP. Add a backend only for a
genuinely dynamic feature such as accounts, submissions, server-side routing,
or high-frequency live data.

## Local development

Requires Node.js 22 or newer.

```sh
npm ci
npm run dev
```

The repository includes a data snapshot. To replace it with current upstream
data:

```sh
npm run data:refresh
npm run data:check
```

Useful commands:

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start Vite on the local network |
| `npm run data:refresh` | Fetch and normalize official Berlin data |
| `npm run data:check` | Validate generated data and provenance |
| `npm run build` | Type-check and build `dist/` |
| `npm test` | Validate data, build the app, and run Playwright |
| `npm run deploy` | Build and deploy `dist/` to Cloudflare Pages |

Install the Playwright browser once before the first local test:

```sh
npx playwright install chromium
```

## Data and methodology

The primary source is Berlin's
[WFS dataset “Grünanlagenbestand Berlin (einschließlich der öffentlichen Spielplätze)”](https://daten.berlin.de/datensaetze/grunanlagenbestand-berlin-einschliesslich-der-offentlichen-spielplatze-wfs-737fd0a4).
Additional Berlin WFS layers supply toilets, drinking fountains, and dog
exercise areas. Every refresh records source URLs, timestamps, record counts,
and coverage notes in [`public/data/sources.json`](public/data/sources.json).

- The official `PITID` is the canonical park identifier.
- Source geometries are normalized to WGS84 GeoJSON.
- Summary counts and areas are derived from the normalized snapshot.
- Search covers the supplied park names and districts.
- Amenity filters mean that a positive source match exists inside the park
  geometry or within 75 m. Missing coverage is never presented as proof that an
  amenity is absent.
- A selected origin comes from an explicit map click or opt-in browser
  geolocation. It stays in browser memory and is not sent to a Parkblick server.
- Distance and 5/10/15-minute bands are local geometric estimates, not walking
  routes or accessibility guarantees.
- The displayed freshness date comes from source metadata, not the deployment
  date.

Generated files:

| File | Contents |
| --- | --- |
| `parks.geojson` | Park geometry and normalized properties |
| `parks-index.json` | Compact records for search and nearby results |
| `summary.json` | Berlin-wide totals and source freshness |
| `sources.json` | Source provenance, coverage, and retrieval metadata |

The Berlin datasets are published under
[Datenlizenz Deutschland – Zero – Version 2.0](https://www.govdata.de/dl-de/zero-2-0).
The app still keeps source and freshness attribution visible. See
[`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md) for map, font, and software
notices.

## Automated refresh

The deployment host runs `ops/systemd/parks-refresh.timer` weekly. Its
`scripts/scheduled-refresh-deploy` flow pulls `main`, refreshes and validates
the snapshot, and stops immediately when the upstream data did not change. A
real change must pass the full test suite before the script commits, pushes,
deploys, and verifies that exact commit.

GitHub Actions runs `.github/workflows/ci.yml` on pushes and pull requests as a
separate verification gate. Production upload stays on the deployment host
because the Cloudflare token is IP-restricted.

## Cloudflare Pages

The Pages project is `parks`, its production branch is `main`, and the custom
domain is `parks.soli.blue`. `npm run deploy` builds the current clean commit,
uses the local IP-restricted Cloudflare credentials, uploads it, then verifies
both the immutable `*.parks-4rq.pages.dev` URL and
`https://parks.soli.blue`. Zone-level redirects or rules can make the custom
domain behave differently from the Pages origin, so both probes are required.

## License

Project code is released under the [MIT License](LICENSE). Data, map services,
fonts, and third-party packages retain their own terms.
