# D3 map artifact

A geographic visualization drawn with D3 into one responsive SVG. It can be a
choropleth, symbol map, point map, route map, or another static geographic
view. It does not assume a world map, a country, or an administrative level.
There is no build step: files are served exactly as written.

## What you edit

- `map.js` — the map. You almost always edit its field mappings, projection,
  marks, legend, tooltip, and attribution.
- `style.css` — extra styling when a class is clearer than attributes.
- `data/geography.geojson` — replace the sample boundaries when the requested
  map needs different geometry. Download it with `shell` to the workspace
  root, then put it in place with `stageDataFile`; nothing may be written
  into `data/` directly, and `writeFile` is the wrong tool for a large
  geometry file anyway.
- `README.md` and `NOTES.md` — the human overview and the durable technical
  handoff for this specific artifact. Both ship describing the sample;
  replace them. `NOTES.md` is where the next builder finds the geography
  source, vintage, join key, and unmatched-key checks.

Do not edit `index.html`. It is template wiring.

## Where your data comes from

Two sources, both provided by the platform. Neither needs importing, and
neither should be replaced with your own `fetch`.

`await artifactData(fileName)` reads a file committed beside your code in
`data/`. Your launch prompt names each staged file, describes it, and shows
its columns and first rows; a `.json` or `.geojson` file arrives parsed.
`map.js` loads its values this way, from the placeholder `DATA_FILE.json` —
replace that with the real name from your launch prompt. Treat a staged
file's shape as given rather than rewriting it. This is where a map's values
almost always come from.

`await artifactQuery(sql)` runs SQL against the catalog at the moment someone
views the map, returning an array of row objects. It works only when your
launch prompt names datasets the artifact may query, and only for those
datasets — any other is refused. Use it when the map genuinely has to be
current rather than fixed, and aggregate in SQL: one row per feature, not
raw rows joined in the browser. A map with thousands of features and a live
query is slow to paint twice over, so prefer staged values at that size.

Either way, render something honest while data is loading and show the error
if it fails.

## The geography

`data/geography.geojson` is a GeoJSON `FeatureCollection`, loaded the same
way. It is sample data, not a basemap that must be retained. Replace it with
geometry appropriate to the request. The sample happens to contain Bay Area
counties only so this template renders before it is edited.

`map.js` joins `data.geoid` to `feature.properties.GEOID`, colors
`data.value`, and labels features with `feature.properties.NAME`. Change
those mappings to match the actual files. Preserve identifier strings and
leading zeroes.

Values and geometry stay in separate files and meet in `map.js`. Never merge
queried values into feature properties and never post-process the downloaded
geometry: the join, the winding fix, the drop of unmatched features, and the
unmatched-row warning are already written, and a value edited into a boundary
file is a number nobody can trace back to its query. Shape the download
through the request itself — `where`, `outFields`, `maxAllowableOffset` — and
shape everything else in `map.js` when it reads the file. If the geometry
came back wrong, fix the request and download it again.

`map.js` imports D3 v7.9.0 as an ES module from jsDelivr. Keep that pinned
import at the top of the file. Do not vendor D3 or add a script tag; many
artifacts share the browser-cached modules from the same origin.

## Choose the geography before coding

First classify what the query provides:

1. If rows contain GeoJSON geometry or longitude and latitude, use it directly.
   A point map does not need a boundary download unless geographic context is
   useful.
2. If rows contain stable geographic identifiers, find boundaries carrying
   the same identifier system and join on those identifiers.
3. If rows contain names only, establish the country and administrative level
   before finding boundaries. Names are not stable join keys. Normalize or
   manually map them only after inspecting unmatched names.
4. If the geography, level, vintage, or identifier system remains ambiguous,
   do not guess. Render an error explaining what is missing rather than showing
   a plausible map of the wrong places.

Prefer sources in this order:

1. Geometry already present in the query or catalog.
2. An official national or local statistical or geospatial agency.
3. geoBoundaries `gbOpen` for standard administrative boundaries worldwide.
4. Natural Earth for low-resolution global or broad regional context.
5. OpenStreetMap-derived boundaries only when no authoritative source fits and
   the requested feature is unambiguous.

Download geometry while authoring and commit it with the artifact. Never fetch
boundaries from a third-party host at view time.

## geoBoundaries

geoBoundaries is the general default for administrative divisions across
countries. Use its open `gbOpen` product. Determine the ISO-3 country code and
requested `ADM` level explicitly; do not assume `ADM1` means the same thing in
every country.

Fetch metadata first:

```bash
curl -fsSL \
  'https://www.geoboundaries.org/api/current/gbOpen/USA/ADM1/' \
  -o /tmp/geoboundaries.json
python - <<'PY'
import json
metadata = json.load(open('/tmp/geoboundaries.json'))
print(metadata['boundaryName'])
print(metadata['boundaryType'])
print(metadata['gjDownloadURL'])
PY
```

Then download the reported `gjDownloadURL`:

```bash
GEOJSON_URL=$(python - <<'PY'
import json
print(json.load(open('/tmp/geoboundaries.json'))['gjDownloadURL'])
PY
)
curl -fsSL "$GEOJSON_URL" -o /tmp/geography.geojson
```

Then stage it with `stageDataFile`, passing `/tmp/geography.geojson`, the
file name `geography.geojson`, and an `origin` naming the source and the
request you made of it.

Read the metadata and feature properties before choosing a join key. Preserve
source attribution required by the dataset's license.

## US Census geography

Use the Census Bureau's TIGERweb services for US states, counties, tracts,
block groups, ZCTAs, legislative districts, and other Census geography.
TIGERweb is separate from geoBoundaries.

Start at the service directory and select the service for the requested
geography and vintage:

```text
https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/
```

Inspect the chosen service as JSON. Its layer IDs vary by service, vintage,
and publication, so never guess or copy a layer number without checking it:

```bash
TIGERWEB='https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb'
curl -fsSL "$TIGERWEB/Tracts_Blocks/MapServer?f=pjson" \
  -o /tmp/tiger-service.json
python - <<'PY'
import json
service = json.load(open('/tmp/tiger-service.json'))
for layer in service.get('layers', []):
    print(layer['id'], layer['name'], layer.get('parentLayerId'))
PY
```

Inspect the selected layer before querying it:

```bash
curl -fsSL \
  "$TIGERWEB/Tracts_Blocks/MapServer/LAYER_ID?f=pjson" \
  -o /tmp/tiger-layer.json
python - <<'PY'
import json
layer = json.load(open('/tmp/tiger-layer.json'))
print(layer.get('name'), layer.get('geometryType'))
for field in layer.get('fields', []):
    print(field['name'], field.get('alias'))
PY
```

Then query only the required area and fields. This pattern requests GeoJSON in
longitude and latitude; replace the service, layer, predicate, and fields with
values verified above:

```bash
TIGER_LAYER="$TIGERWEB/Tracts_Blocks/MapServer/LAYER_ID"
curl -fsSG "$TIGER_LAYER/query" \
  --data-urlencode "where=STATE='06' AND COUNTY='037'" \
  --data-urlencode 'outFields=GEOID,NAME,STATE,COUNTY,TRACT' \
  --data-urlencode 'returnGeometry=true' \
  --data-urlencode 'outSR=4326' \
  --data-urlencode 'f=geojson' \
  -o /tmp/geography.geojson
```

Then `stageDataFile` it as `geography.geojson`.

Use full Census `GEOID` values for joins. Keep them as strings. Filter at the
server rather than downloading the whole nation. ArcGIS services can limit the
number of returned features, so check for transfer-limit metadata and compare
the returned feature count with the expected geography.

## Say where the boundaries came from

A downloaded file carries no query behind it, so the only account of it is
the `origin` you pass to `stageDataFile`. Name the service, the layer, the
filter you applied, and any generalization — for example "Census TIGERweb
Tracts_Blocks layer 8, tracts in planning region 09170,
maxAllowableOffset=0.002, outSR=4326". A reader sees this beside the SQL
behind the artifact's other files, so it should be specific enough to repeat
the download from.

Record the same detail in `NOTES.md` for the next builder.

## Validate every download

A successful `curl` does not prove that the response is usable geometry.
Inspect the download before you stage it:

```bash
python - <<'PY'
import json
path = '/tmp/geography.geojson'
geography = json.load(open(path))
assert geography['type'] == 'FeatureCollection'
assert geography['features']
print('features:', len(geography['features']))
print('geometry types:', sorted({
    feature['geometry']['type']
    for feature in geography['features']
    if feature.get('geometry')
}))
print('properties:', sorted({
    key
    for feature in geography['features'][:20]
    for key in feature.get('properties', {})
}))
PY
```

Also check:

- The response is not an HTML error page or ArcGIS JSON error object.
- Coordinates are longitude then latitude and use a geographic CRS suitable
  for the selected D3 projection.
- Polygon winding is handled by the `rewindPolygon` normalization in `map.js`.
  Keep that normalization when using GeoJSON with `d3.geoPath`.
- The boundary vintage matches the values when the distinction matters.
- Feature IDs are unique and use the same width and zero-padding as the rows.
- Every data key matches at most one feature.
- Unmatched data rows and unmatched features are counted and understood.

Detailed official geometry can be unnecessarily large. Ask the source for a
cartographic or generalized product when available. For ArcGIS REST queries,
`maxAllowableOffset` and `geometryPrecision` can reduce detail, but inspect the
render after using them: too much simplification can erase small areas or
create visible gaps.

## Type and colour

The platform serves the typefaces and sets the body font, so a map
inherits it without asking. Where a rule needs to name a family — legend
labels, attribution — use `var(--family-mono)`.

Every colour is a CSS custom property defined in the `:root` block at the
top of `style.css`, and each one carries both its light and its dark value
in a `light-dark()` pair, so a map that uses the tokens is legible in both
themes and one with hard-coded hexes is not.

Pass the token itself, never its value. The embedding app can switch theme
while the map is on screen, and a `var()` reference re-resolves where a
colour read into JavaScript would stay whatever it was when the map was
drawn:

```js
const color = (name, step) => `var(--${name}-${step})`
const ramp = (name) => d3.range(1, 7).map((step) => color(name, step))
```

A `var()` reference is a string, not a colour, so it can be handed to
`scaleOrdinal` or `scaleThreshold` but never to `scaleSequential` or
`d3.interpolate`, which need real colours to interpolate between. Bucket
the measure into the six steps rather than interpolating across them.

So: never `getComputedStyle(...).getPropertyValue('--sequential-1')`, and
never a `prefers-color-scheme` rule — the theme is the app's to decide,
not the operating system's.

- `sequential`, steps 1–6 — one ordered measure, dark to light. Step 1 is
  the brand orange and is also the right fill for a single-series mark.
- `secondary`, steps 1–6 — the same ramp in blue.
- `diverging`, steps 1–6 — orange through pale to blue, for a measure
  with a meaningful midpoint.
- `categorical`, steps 1–6 — unordered categories. Beyond six, group the
  tail into "Other" rather than inventing a seventh colour.

`--ink`, `--muted`, `--grid`, and `--axis` cover text and rules.
`--surface` is the colour of the page, for filling a shape that has to
read as the page, and it is the right stroke between adjacent features so
boundaries stay visible in both themes. The page itself is never painted:
the app supplies the ground the map sits on.

## Rendering

- Draw into `container`, never `document.body`.
- Use an SVG `viewBox`; never use `vh` or `vw`. The artifact is in an iframe
  whose height follows its content.
- Use `projection.fitExtent()` or `projection.fitSize()` against the actual
  geometry. Do not hard-code a center and scale inherited from sample data.
- Choose a projection appropriate to the requested area. Mercator is only a
  working default, not a universal choice.
- A conic projection (`geoConicConformal`, `geoConicEqualArea`, `geoAlbers`)
  must always be rotated onto the area being drawn. Its default central
  meridian is 0°, so geometry elsewhere is drawn at an angle around the cone:
  California at 120°W comes out rotated roughly 70°, and `fitExtent` then
  scales that rotated shape to fill the frame without erroring. Compute the
  center of the geometry's bounding box with `d3.geoBounds` and pass
  `.rotate([-centerLongitude, 0])` plus `.parallels()` spanning the area's
  latitudes. Never leave the default rotation.
- For choropleths, use a sequential scale for magnitude, a diverging scale for
  values around a meaningful midpoint, and a categorical scale only for real
  categories. Give missing data a distinct neutral fill.
- Build those scales from the brand ramps above rather than from d3's own
  interpolators: `d3.scaleQuantize(domain, ramp('sequential'))` for binned
  magnitude, and `d3.scaleSequential(d3.interpolateRgbBasis(ramp('sequential')))`
  when a continuous ramp genuinely reads better. Reach for a d3 interpolator
  only when the brand ramps cannot express the encoding.
- `d3.scaleSequential` normalizes the domain itself: its interpolator is
  called with `t` between 0 and 1, never with a data value. Passing a function
  that rescales the value again — `scaleSequential((value) => ramp((value -
  min) / (max - min)))` — clamps every feature to one color while the legend,
  which usually calls the ramp directly with `t`, still looks correct. Pass
  `d3.scaleSequential(interpolator).domain([min, max])`, and when the ramp
  needs trimming wrap only `t`: `(t) => d3.interpolateYlGnBu(0.1 + 0.9 * t)`.
- For points, project `[longitude, latitude]`, size marks by area rather than
  radius when encoding magnitude, and provide enough boundary context to
  orient the reader.
- Avoid drawing every boundary when dense geometry makes the result illegible.
  Aggregate, filter, simplify, or choose a more appropriate geographic level.
- Put no title in the frame. The artifact title is rendered outside it.
- Draw statically. Do not add entry animations or transitions on first render;
  preview reloads would restart them after every edit.
- Use no outer border, decorative background, gradient decoration, or shadow.
  A color-scale legend may use a gradient because the gradient carries data.

## Tooltips, legends, and attribution

Add a tooltip wherever a reader needs the exact value or geographic name. The
sample `.tooltip` class is positioned against `container`. Format values with
`d3.format` and dates with `d3.timeFormat`.

Every non-obvious encoding needs a legend. Keep legends inside the SVG so the
`viewBox` accounts for their size, and reserve margins for them.

Update `sourceName` and `sourceUrl` in `map.js` whenever geography changes.
Keep visible attribution required by the source license. Attribution belongs
below the map, not in a tooltip or console message.

## Before submitting

Call `renderArtifact` and inspect the image and console output. Verify that:

- The map depicts the geography the user requested, at the intended level and
  vintage.
- The map fills the frame without clipping, extreme whitespace, or distortion.
- Joins use stable identifiers and unmatched keys are understood.
- Missing values are visually distinct from the low end of the scale.
- Small or dense areas remain visible enough for the stated purpose.
- Tooltips show the correct area and formatted value.
- The legend describes the actual encoding and fits inside the frame.
- Attribution names the geometry source.
- There are no page errors, failed requests, or unexpected console warnings.
