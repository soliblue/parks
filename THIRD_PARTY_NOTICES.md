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

## Population grid

The city-level access estimate uses the European Commission Joint Research
Centre's
[JRC-ESTAT Census Population 2021 100 m grid](https://data.jrc.ec.europa.eu/dataset/98336641-fd1c-4992-8c7b-c470dd5eb81e).
It is a modeled, gridded estimate of 2021 resident population; the dataset's
reuse notice and metadata apply.

## OpenStreetMap routing data

The offline pedestrian-network calculation uses OpenStreetMap data.
`© OpenStreetMap contributors`; the OpenStreetMap database is available under
the
[Open Data Commons Open Database License](https://www.openstreetmap.org/copyright).
The application publishes only the resulting aggregate city metric, not an
OpenStreetMap database extract.

## Basemaps

Berlin uses
[basemap.de Web Vektor](https://basemap.de/produkte-und-dienste/web-vektor/),
provided by the German federal and state surveying authorities under
[CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). The application
displays `© GeoBasis-DE / BKG 2026 · CC BY 4.0 · Darstellung verändert` because
it adapts the source style colors.

Vienna uses the subdued
[basemap.at](https://basemap.at/) raster tiles through its official
WMTS-compatible endpoint. The service's own license, usage, and attribution
terms apply. The application does not redistribute either provider's tile
archive.

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
