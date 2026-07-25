# Parks

Static explorer and city comparison for public parks and green spaces in
Berlin, Vienna, Munich, Stuttgart, Madrid, Barcelona, Paris, Copenhagen, and
Cairo at [`parks.soli.blue`](https://parks.soli.blue). It uses municipal open
data and clipped OpenStreetMap extracts with MapLibre, basemap.de, basemap.at,
and OpenFreeMap—no Google Maps key, application server, or database.

## Architecture

The production site is fully static:

1. `scripts/refresh-data.mjs` fetches official park inventories for Berlin,
   Vienna, Paris, and Copenhagen. OpenStreetMap PBF extracts supply parks and
   districts for Munich, Stuttgart, Madrid, Barcelona, and Cairo, plus amenity
   observations for all seven newer cities. It writes normalized, deterministic
   snapshots under `public/data/{city}/`.
2. A separate offline batch builds the same OpenStreetMap green-space layer for
   every city, then combines it with GHSL 2020 population, OpenStreetMap
   pedestrian graphs, and CGLS-LC100 2019 tree cover. It writes the harmonized
   comparison metrics to `public/data/access.json`.
3. `public/data/cities.json` is the compact city catalogue. The browser fetches
   the selected city's larger files only.
4. Vite bundles the React app and copies the generated data into `dist/data/`;
   Cloudflare Pages serves both.
5. MapLibre loads basemap.de, basemap.at, or OpenFreeMap according to the city.
   Search, filtering, point-selected distance estimates, and geolocation stay
   in the browser.

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
| `npm run data:refresh` | Fetch and normalize municipal and OpenStreetMap city data |
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

Paris uses the Ville de Paris
[“Espaces verts et assimilés” dataset](https://opendata.paris.fr/explore/dataset/espaces_verts/),
limited to open promenades and the two municipal woods. Copenhagen uses
Københavns Kommune's official
[Parkregister WFS](https://wfs-kbhkort.kk.dk/k101/ows?service=WFS&version=2.0.0&request=GetCapabilities),
limited to the five public green-space classes used by the explorer.

Munich, Stuttgart, Madrid, Barcelona, and Cairo use OpenStreetMap
`leisure=park` polygons extracted from PBF files and clipped to each city's OSM
administrative boundary. Features tagged `access=no` or `access=private` are
excluded. These community-mapped inventories can be incomplete and are not
equivalent to the four municipal registers.

The seven newer cities use community-mapped OpenStreetMap observations for
playgrounds, toilets, drinking-water points, and dog parks. The five
OpenStreetMap park inventories also use mapped administrative boundaries—or,
for Cairo when those boundaries are unavailable, nearby named place labels—to
group parks into local areas. Paris and Copenhagen retain the district fields
from their official park inventories.

Every refresh records source URLs, timestamps, record counts, coverage notes,
and exact licensing in the selected city's `sources.json`.

- Source identifiers remain the canonical park identifiers.
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
| `public/data/access.json` | Offline nine-city harmonized comparison metrics |
| `public/data/{city}/parks.geojson` | Normalized park or public-green geometry |
| `public/data/{city}/parks-index.json` | Compact search and nearby records |
| `public/data/{city}/summary.json` | City totals and source freshness |
| `public/data/{city}/sources.json` | Provenance, coverage, licensing, and retrieval metadata |

## Harmonized city comparison

The leaderboard does not compare the cities' native municipal and
community-mapped inventories. Those local layers remain available for map,
search, district, and amenity exploration, but differing municipal definitions
would make them unsuitable as common comparison inputs.

Instead, every city uses the same OpenStreetMap definition:
`leisure=park`, `leisure=nature_reserve`, `natural=wood`, and
`landuse=forest`; `leisure=garden` is included only when access is explicitly
public and no fee is tagged. The geometries are clipped to the configured
administrative boundary and dissolved so overlapping ways and relations are
counted once. All core-class components contribute to mapped green-land area,
regardless of access. For routed access, fee-tagged or explicitly restricted
geometry is removed; parks, nature reserves, and public gardens qualify by
class, while woods and forests require an explicit public-access tag. The
0.5 ha minimum applies only to that routed subset. Green-land area is therefore
not the same as publicly accessible park area.

The comparison then reports:

- population within the 805 m pedestrian-network access threshold;
- harmonized green-space share and square metres per GHSL 2020 resident; and
- modeled tree-cover share from CGLS-LC100 2019.

## Ten-minute access metric

The “within a 10-minute walk” percentage published for every city is a
harmonized model estimate:

- **Denominator:** modeled resident population in GHSL 2020 100 m grid cells
  inside the city's administrative boundary.
- **Numerator:** that population whose grid location is within 805 m over an
  OpenStreetMap-derived pedestrian network from a mapped public park or green
  space.
- **Result:** `numerator / denominator`, computed offline and published as a
  static snapshot with its inputs and timestamps.

The metric is suitable for comparing broad access patterns, not for navigation
or guarantees about entrances, opening hours, safety, barriers, or individual
mobility. The GHSL population surface is a modeled grid, and OpenStreetMap and
city inventories have uneven completeness. All nine percentages use the same
population product, threshold, park-size rule, pedestrian-network model, and
population-to-network snap rule.

This city-level metric is distinct from the 5/10/15-minute rings shown after a
user selects a point. Those rings remain straight-line estimates based on an
assumed walking speed; they are not routes.

## Tree-cover metric

Tree-cover share uses the area-weighted 0–100% Tree Cover Fraction from
[Copernicus Global Land Service CGLS-LC100 Collection 3, epoch 2019](https://zenodo.org/records/3939050).
Its land-only denominator uses the matching Permanent Water Cover Fraction.
Both rasters are 100 m products, and boundary pixels are selected by pixel
centre. The data is licensed under
[CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).

This is a modeled regional comparison, not a street-tree census. The product's
global validation reports a mean absolute error of 8.9 percentage points for
tree-cover fraction, so small differences between cities should not be treated
as definitive rankings.

The Berlin datasets are published under
[Datenlizenz Deutschland – Zero – Version 2.0](https://www.govdata.de/dl-de/zero-2-0).
Vienna data uses
[CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) with the required
attribution: **Datenquelle: Stadt Wien – data.wien.gv.at**. The app keeps source
and freshness attribution visible. Paris data is published under
[ODbL](https://opendatacommons.org/licenses/odbl/1-0/). The Copenhagen WFS
capabilities state no fees or access constraints. OpenStreetMap-derived park
data remains under
[ODbL](https://www.openstreetmap.org/copyright) with contributor attribution.
See
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
