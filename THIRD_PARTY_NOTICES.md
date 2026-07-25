# Third-party notices

Parkblick's MIT license covers only original project code. The following data,
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
Source and per-refresh details are retained in `public/data/sources.json`.

## Basemap

The live background map is
[basemap.de Web Vektor](https://basemap.de/produkte-und-dienste/web-vektor/),
provided by the German federal and state surveying authorities. Its own license,
usage, and attribution terms apply under
[CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). The application
displays `© GeoBasis-DE / BKG 2026 · CC BY 4.0 · Darstellung verändert` because
it adapts the source style colors. It does not redistribute the vector-tile
archive.

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
