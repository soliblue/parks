# Third-party notices

The project's MIT license covers only original project code. The following data,
services, fonts, and libraries retain their own terms.

## Official Berlin data

Park and amenity snapshots are derived from WFS services published by the
Senatsverwaltung für Mobilität, Verkehr, Klimaschutz und Umwelt Berlin,
including:

- [Grünanlagenbestand Berlin, including public playgrounds](https://daten.berlin.de/datensaetze/grunanlagenbestand-berlin-einschliesslich-der-offentlichen-spielplatze-wfs-737fd0a4)
- Öffentliche Toiletten
- Trinkwasserbrunnen
- Hundefreilaufflächen

License:
[Datenlizenz Deutschland – Zero – Version 2.0 (`dl-de-zero-2.0`)](https://www.govdata.de/dl-de/zero-2-0).
Source and per-refresh details are retained in
`public/data/berlin/sources.json`.

## Official Vienna data

Vienna park, public-green-space, amenity, and district snapshots come from the
City of Vienna's official
[WFS service](https://data.wien.gv.at/daten/geo) and
[open-data catalogue](https://data.wien.gv.at/), including:

- [Publicly accessible green-space polygons](https://www.data.gv.at/datasets/d0145df8-7f6d-46e1-9bc6-ee7897054104?locale=de)
- [Park catalogue](https://www.data.gv.at/datasets/22add642-d849-48ff-9913-8c7ba2d99b46?locale=de)
- Playground, public toilet, drinking fountain, dog-zone, and district layers

License:
[Creative Commons Attribution 4.0 International (`CC BY 4.0`)](https://creativecommons.org/licenses/by/4.0/).
Required attribution: **Datenquelle: Stadt Wien – data.wien.gv.at**. Source and
per-refresh details are retained in `public/data/vienna/sources.json`.

## Official Paris data

Paris park snapshots come from the Ville de Paris
[“Espaces verts et assimilés” dataset](https://opendata.paris.fr/explore/dataset/espaces_verts/).
The explorer includes open promenades and the two municipal woods.

License:
[Open Database License 1.0 (`ODbL`)](https://opendatacommons.org/licenses/odbl/1-0/).
Source and per-refresh details are retained in
`public/data/paris/sources.json`.

## Official Copenhagen data

Copenhagen park snapshots come from Københavns Kommune's official
[Parkregister WFS](https://wfs-kbhkort.kk.dk/k101/ows?service=WFS&version=2.0.0&request=GetCapabilities).
The explorer includes the five mapped public green-space classes selected for
this project. The service capabilities state `NONE` for fees and access
constraints. Source and per-refresh details are retained in
`public/data/copenhagen/sources.json`.

## OpenStreetMap park, amenity, and district data

Munich, Stuttgart, Madrid, Barcelona, and Cairo use OpenStreetMap
`leisure=park` polygons extracted from PBF files, clipped to the corresponding
OSM administrative boundary, and filtered to exclude `access=no` and
`access=private`. Munich, Stuttgart, Madrid, and Barcelona use
[BBBike extracts](https://download.bbbike.org/osm/bbbike/); Cairo uses the
[Geofabrik Egypt extract](https://download.geofabrik.de/africa/egypt.html).
Those five cities also use OpenStreetMap administrative boundaries, with named
place labels as Cairo's fallback, to group parks into local areas.

Munich, Stuttgart, Madrid, Barcelona, Cairo, Paris, and Copenhagen use the same
extracts for community-mapped playground, public-toilet, drinking-water, and
dog-park observations. Paris park polygons remain from Ville de Paris and
Copenhagen park polygons remain from Københavns Kommune. Copenhagen's
OpenStreetMap observations come from the
[Geofabrik Denmark extract](https://download.geofabrik.de/europe/denmark.html).
These community-mapped observations have uneven completeness and access tags.

`© OpenStreetMap contributors`; the OpenStreetMap database is available under
the
[Open Data Commons Open Database License](https://www.openstreetmap.org/copyright).
Per-refresh source details are retained in each city's `sources.json`.

The city leaderboard uses a separate harmonized OpenStreetMap green-space
inventory for all nine cities. It includes `leisure=park`,
`leisure=nature_reserve`, `natural=wood`, and `landuse=forest`, plus
`leisure=garden` only with explicit public access and no tagged fee. Geometries
are clipped to each administrative boundary and dissolved before area or access
calculations. Core classes count toward mapped green land regardless of access.
For routing, fee-tagged or explicitly restricted geometry is removed; parks,
nature reserves, and public gardens qualify by class, while woods and forests
require an explicit public-access tag. Components smaller than 0.5 ha remain in
the mapped green-land metrics but are excluded from routing.
The native municipal and community-mapped park layers remain map-exploration
sources and are not leaderboard inputs.

## Population grid

All nine city-level access estimates use the European Commission Joint Research
Centre's
[GHSL GHS-POP R2023A epoch 2020 100 m grid](https://data.jrc.ec.europa.eu/dataset/2ff68a52-5b5b-4a22-8f40-c41da8332cfe).
It is a global modeled grid of 2020 resident population; the dataset's reuse
notice and metadata apply. Recommended citation: Schiavina, Freire, Carioli &
MacManus (2023), GHS-POP R2023A, European Commission JRC,
DOI 10.2905/2FF68A52-5B5B-4A22-8F40-C41DA8332CFE.

## Copernicus tree-cover fractions

All nine tree-cover estimates use
[Copernicus Global Land Service: Land Cover 100 m, Collection 3, epoch 2019](https://zenodo.org/records/3939050),
published by the Copernicus Global Land Service and VITO. The calculation uses
the fractional Tree Cover layer and the matching Permanent Water Cover layer for
its land-only denominator. Both are 100 m rasters.

License:
[Creative Commons Attribution 4.0 International (`CC BY 4.0`)](https://creativecommons.org/licenses/by/4.0/).
Recommended dataset citation: Buchhorn et al. (2020), CGLS Land Cover 100 m
Collection 3, epoch 2019, version 3.0.1,
DOI 10.5281/zenodo.3939050.

The source validation reports a global mean absolute error of 8.9 percentage
points for the tree-cover fraction. It is a modeled land-cover estimate rather
than a street-tree census.

## OpenStreetMap routing data

The offline nine-city pedestrian-network calculations use OpenStreetMap data.
`© OpenStreetMap contributors`; the OpenStreetMap database is available under
the
[Open Data Commons Open Database License](https://www.openstreetmap.org/copyright).
The application publishes only the resulting aggregate city metric, not an
OpenStreetMap database extract.

## Basemaps

Berlin, Munich, and Stuttgart use
[basemap.de Web Vektor](https://basemap.de/produkte-und-dienste/web-vektor/),
provided by the German federal and state surveying authorities under
[CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). The application
displays `© GeoBasis-DE / BKG 2026 · CC BY 4.0 · Darstellung verändert` because
it adapts the source style colors.

Vienna uses the subdued
[basemap.at](https://basemap.at/) raster tiles through its official
WMTS-compatible endpoint. The service's own license, usage, and attribution
terms apply.

Madrid, Barcelona, Paris, Copenhagen, and Cairo use
[OpenFreeMap](https://openfreemap.org/) with OpenMapTiles styling and
OpenStreetMap data. The application displays the required provider and data
attributions. It does not redistribute any provider's tile archive.

## Google Maps Platform

Google Maps Platform is not used in production. The
[Google Isochrones API](https://developers.google.com/maps/documentation/isochrones/overview)
is a Preview service whose current
[usage and billing documentation](https://developers.google.com/maps/documentation/isochrones/usage-and-billing)
lists calls at $0 while still requiring billing to be enabled. The
[EEA Preview terms](https://cloud.google.com/terms/maps-platform/eea/maps-service-terms)
also constrain use of a Pre-GA offering with or near a non-Google map. The
project instead computes its access metric offline from JRC and OpenStreetMap
inputs; it stores and serves no Google-derived map or routing result.

## Fonts

Fraunces and Lora are distributed under the
[SIL Open Font License 1.1](https://openfontlicense.org/open-font-license-official-text/).
The installed font packages include their license texts.

## Runtime libraries

Major bundled libraries include:

- MapLibre GL JS — BSD 3-Clause
- React and React DOM — MIT
- Turf modules — MIT
- Lucide — ISC

Transitive packages and exact versions are recorded in `package-lock.json`.
Their license texts are distributed with their packages.
