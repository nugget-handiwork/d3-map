import * as d3 from 'https://cdn.jsdelivr.net/npm/d3@7.9.0/+esm'

const container = document.getElementById('map')
const [data, geography] = await Promise.all([
  artifactData('DATA_FILE.json'),
  artifactData('geography.geojson'),
])

const dataKey = 'geoid'
const featureKey = 'GEOID'
const valueKey = 'value'
const featureLabel = 'NAME'
const sourceName = 'U.S. Census Bureau TIGERweb'
const sourceUrl = 'https://tigerweb.geo.census.gov/'

if (geography.type !== 'FeatureCollection' || !geography.features.length) {
  throw new Error('geography.geojson must be a non-empty FeatureCollection')
}

function signedRingArea(ring) {
  return d3.pairs(ring, (start, end) =>
    start[0] * end[1] - end[0] * start[1],
  ).reduce((sum, value) => sum + value, 0)
}

function rewindPolygon(rings) {
  rings.forEach((ring, index) => {
    const isClockwise = signedRingArea(ring) < 0
    if ((index === 0 && !isClockwise) || (index > 0 && isClockwise)) {
      ring.reverse()
    }
  })
}

for (const feature of geography.features) {
  if (feature.geometry?.type === 'Polygon') {
    rewindPolygon(feature.geometry.coordinates)
  } else if (feature.geometry?.type === 'MultiPolygon') {
    feature.geometry.coordinates.forEach(rewindPolygon)
  }
}

const rowsByKey = new Map(
  data.map((row) => [String(row[dataKey]), row]),
)
const matchedFeatures = geography.features.filter((feature) =>
  rowsByKey.has(String(feature.properties?.[featureKey])),
)
const values = matchedFeatures
  .map((feature) =>
    Number(rowsByKey.get(String(feature.properties[featureKey]))?.[valueKey]),
  )
  .filter(Number.isFinite)

if (!values.length) {
  throw new Error(
    `No numeric ${valueKey} values matched geography by ${dataKey} and ${featureKey}`,
  )
}

const width = 800
const height = 500
const margin = { top: 16, right: 16, bottom: 56, left: 16 }
const projection = d3
  .geoMercator()
  .fitExtent(
    [
      [margin.left, margin.top],
      [width - margin.right, height - margin.bottom],
    ],
    geography,
  )
const path = d3.geoPath(projection)
const valueExtent = d3.extent(values)
const color = d3
  .scaleSequential(d3.interpolateBlues)
  .domain(
    valueExtent[0] === valueExtent[1]
      ? [valueExtent[0] - 1, valueExtent[1]]
      : valueExtent,
  )

const svg = d3
  .select(container)
  .append('svg')
  .attr('viewBox', `0 0 ${width} ${height}`)

const tooltip = d3.select(container).append('div').attr('class', 'tooltip')

svg
  .append('g')
  .selectAll('path')
  .data(geography.features)
  .join('path')
  .attr('class', 'feature')
  .attr('d', path)
  .attr('fill', (feature) => {
    const row = rowsByKey.get(String(feature.properties?.[featureKey]))
    const value = Number(row?.[valueKey])
    return Number.isFinite(value) ? color(value) : '#eee'
  })
  .on('mousemove', (event, feature) => {
    const row = rowsByKey.get(String(feature.properties?.[featureKey]))
    const value = Number(row?.[valueKey])
    const label = feature.properties?.[featureLabel] ?? 'Unknown area'
    tooltip
      .style('opacity', 1)
      .style('left', `${event.offsetX + 12}px`)
      .style('top', `${event.offsetY + 12}px`)
      .text(
        Number.isFinite(value)
          ? `${label}: ${d3.format(',')(value)}`
          : `${label}: no data`,
      )
  })
  .on('mouseleave', () => tooltip.style('opacity', 0))

const legendWidth = 220
const legendX = width - margin.right - legendWidth
const legendY = height - 28
const legendScale = d3
  .scaleLinear()
  .domain(color.domain())
  .range([legendX, legendX + legendWidth])
const legend = svg.append('g').attr('class', 'legend')

legend
  .append('defs')
  .append('linearGradient')
  .attr('id', 'legend-gradient')
  .selectAll('stop')
  .data(d3.range(0, 1.01, 0.1))
  .join('stop')
  .attr('offset', (value) => `${value * 100}%`)
  .attr('stop-color', (value) => d3.interpolateBlues(value))

legend
  .append('rect')
  .attr('x', legendX)
  .attr('y', legendY - 10)
  .attr('width', legendWidth)
  .attr('height', 10)
  .attr('fill', 'url(#legend-gradient)')

legend
  .append('g')
  .attr('transform', `translate(0,${legendY})`)
  .call(d3.axisBottom(legendScale).ticks(5).tickSize(4))
  .call((axis) => axis.select('.domain').remove())

const unmatchedRows = data.filter(
  (row) =>
    !geography.features.some(
      (feature) =>
        String(feature.properties?.[featureKey]) === String(row[dataKey]),
    ),
)
if (unmatchedRows.length) {
  console.warn(`${unmatchedRows.length} data rows did not match geography`)
}

d3.select(container)
  .append('div')
  .attr('class', 'attribution')
  .append('a')
  .attr('href', sourceUrl)
  .attr('target', '_blank')
  .attr('rel', 'noreferrer')
  .text(`Boundary source: ${sourceName}`)
