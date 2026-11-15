# Bay Area county map

This runnable template demonstrates a D3 choropleth over nine San Francisco
Bay Area counties. The sample values in `data/DATA_FILE.json` join to Census county
boundaries in `data/geography.geojson` by five-character `GEOID`.

`map.js` loads, validates, joins, projects, and draws the files. `style.css`
contains the shared map, legend, tooltip, and attribution styles. The boundary
sample comes from the U.S. Census Bureau's TIGERweb service and is generalized
for a small artifact payload.
