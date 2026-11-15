# Working notes

These notes describe the sample this template ships with. Replace them with
the real artifact's.

The sample is a choropleth joining `data.geoid` to the Census boundary
property `GEOID`; both are strings so leading zeroes survive. The values are
illustrative rather than a published measure. The boundaries were queried
from layer 29 of the TIGERweb `State_County` service with
`maxAllowableOffset=0.002`, `geometryPrecision=4`, and `outSR=4326`.
