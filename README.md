# Parks

Static explorer and city comparison for public parks and green spaces in Berlin
and Vienna at [`parks.soli.blue`](https://parks.soli.blue). It uses official
open data, MapLibre, basemap.de, and basemap.at—no Google Maps key, application
server, or database.

## Architecture

The production site is fully static:

1. `scripts/refresh-data.mjs` fetches official Berlin and Vienna WFS sources and
   writes normalized, deterministic snapshots under
   `public/data/{berlin,vienna}/`.
2. A separate offline batch combines the 2021 JRC population grid with an
   OpenStreetMap pedestrian graph and writes the city comparison metric to
   `public/data/access.json`.
3. `public/data/cities.json` is the compact city catalogue. The browser fetches
   the selected city's larger files only.
4. Vite bundles the React app and copies the generated data into `dist/data/`;
   Cloudflare Pages serves both.
5. MapLibre loads basemap.de for Berlin or basemap.at for Vienna. Search,
   filtering, point-selected distance estimates, and geolocation stay in the
   browser.

An API or always-on VPS process is unnecessary. A backend would only be needed
for a genuinely dynamic feature such as accounts, submissions, live routing,
or high-frequency data.

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
| `npm run data:refresh` | Fetch and normalize official city data |
| `npm run data:access` | Rebuild the offline access metric from cached inputs |
| `npm run data:access -- --refresh` | Refresh remote routing inputs, then rebuild access |
| `npm run data:check` | Validate generated data and provenance |
| `npm run build` | Type-check and build `dist/` |
| `npm test` | Validate data, build the app, and run Playwright |
| `npm run deploy` | Build and deploy `dist/` to Cloudflare Pages |

Install the Playwright browser once before the first local test:

```sh
npx playwright install chromium
```

## Park data

Berlin uses the official
[WFS dataset “Grünanlagenbestand Berlin (einschließlich der öffentlichen Spielplätze)”](https://daten.berlin.de/datensaetze/grunanlagenbestand-berlin-einschliesslich-der-offentlichen-spielplatze-wfs-737fd0a4).
Additional Berlin WFS layers supply toilets, drinking fountains, and dog
exercise areas.

Vienna uses the City of Vienna's official
[WFS service](https://data.wien.gv.at/daten/geo) and open-data catalogue,
including the
[public-green-space polygons](https://www.data.gv.at/datasets/d0145df8-7f6d-46e1-9bc6-ee7897054104?locale=de)
and separate
[park catalogue](https://www.data.gv.at/datasets/22add642-d849-48ff-9913-8c7ba2d99b46?locale=de).
The polygons drive the map; the point catalogue remains contextual rather than
being mixed into the polygon count.

Every refresh records source URLs, timestamps, record counts, coverage notes,
and exact licensing in the selected city's `sources.json`.

- Official source identifiers remain the canonical park identifiers.
- Source geometries are normalized to WGS84 GeoJSON.
- Summary counts and areas are derived from the normalized snapshot.
- Search covers the supplied park names and districts.
- Amenity filters mean that a positive source match exists inside the park
  geometry or within 75 m. Missing coverage is never presented as proof that an
  amenity is absent.
- A selected origin comes from an explicit map click or opt-in browser
  geolocation. It stays in browser memory and is not sent to an application
  server.
- The displayed freshness date comes from source metadata, not the deployment
  date.

Generated layout:

| File | Contents |
| --- | --- |
| `public/data/cities.json` | City catalogue, map settings, totals, and data paths |
| `public/data/access.json` | Offline city-level park-access comparison |
| `public/data/{city}/parks.geojson` | Normalized park or public-green geometry |
| `public/data/{city}/parks-index.json` | Compact search and nearby records |
| `public/data/{city}/summary.json` | City totals and source freshness |
| `public/data/{city}/sources.json` | Provenance, coverage, licensing, and retrieval metadata |

## Ten-minute access metric

The city comparison's “within a 10-minute walk” percentage is a model estimate:

- **Denominator:** modeled resident population in 2021 JRC 100 m grid cells
  inside the city's administrative boundary.
- **Numerator:** that population whose grid location is within 805 m over an
  OpenStreetMap-derived pedestrian network from a mapped public park or green
  space.
- **Result:** `numerator / denominator`, computed offline and published as a
  static snapshot with its inputs and timestamps.

The metric is suitable for comparing broad access patterns, not for navigation
or guarantees about entrances, opening hours, safety, barriers, or individual
mobility. The 2021 population surface is a modeled grid, and OpenStreetMap and
city inventories have uneven completeness.

This city-level metric is distinct from the 5/10/15-minute rings shown after a
user selects a point. Those rings remain straight-line estimates based on an
assumed walking speed; they are not routes.

The Berlin datasets are published under
[Datenlizenz Deutschland – Zero – Version 2.0](https://www.govdata.de/dl-de/zero-2-0).
Vienna data uses
[CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) with the required
attribution: **Datenquelle: Stadt Wien – data.wien.gv.at**. The app keeps source
and freshness attribution visible. See
[`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md) for map, font, and software
notices.

## Why production does not use Google Isochrones

Google's
[Isochrones API](https://developers.google.com/maps/documentation/isochrones/overview)
can calculate network-aware walking reachability. Its current Preview
[usage and billing documentation](https://developers.google.com/maps/documentation/isochrones/usage-and-billing)
lists calls at $0, but billing must still be enabled. More importantly, the
[EEA Preview terms](https://cloud.google.com/terms/maps-platform/eea/maps-service-terms)
place constraints on using a Pre-GA service with or near a non-Google map.
Production therefore uses reproducible open-data routing offline. Google
Isochrones is not called, and no Google-derived map or routing result is stored
or served.

## Automated refresh

The deployment host runs `ops/systemd/parks-refresh.timer` weekly. Its
`scripts/scheduled-refresh-deploy` flow pulls `main`, refreshes and validates
the city snapshots, and stops immediately when upstream data did not change. A
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
