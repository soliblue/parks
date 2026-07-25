import jsts from "jsts";

const BERLIN_LATITUDE_RADIANS = (52.5 * Math.PI) / 180;
const METERS_PER_DEGREE_LONGITUDE =
  111_320 * Math.cos(BERLIN_LATITUDE_RADIANS);
const METERS_PER_DEGREE_LATITUDE = 110_540;

function squaredDistanceToSegment(point, start, end) {
  let x = start[0];
  let y = start[1];
  let dx = end[0] - x;
  let dy = end[1] - y;

  if (dx !== 0 || dy !== 0) {
    const t =
      ((point[0] - x) * dx + (point[1] - y) * dy) /
      (dx * dx + dy * dy);
    if (t > 1) {
      x = end[0];
      y = end[1];
    } else if (t > 0) {
      x += dx * t;
      y += dy * t;
    }
  }

  dx = point[0] - x;
  dy = point[1] - y;
  return dx * dx + dy * dy;
}

function toMeters(position) {
  return [
    position[0] * METERS_PER_DEGREE_LONGITUDE,
    position[1] * METERS_PER_DEGREE_LATITUDE,
  ];
}

function fromMeters(position) {
  return [
    position[0] / METERS_PER_DEGREE_LONGITUDE,
    position[1] / METERS_PER_DEGREE_LATITUDE,
  ];
}

function simplifyOpenLine(points, toleranceMeters) {
  if (points.length <= 3) return points;

  const projected = points.map(toMeters);
  const keep = new Uint8Array(points.length);
  keep[0] = 1;
  keep[points.length - 1] = 1;
  const toleranceSquared = toleranceMeters * toleranceMeters;
  const stack = [[0, points.length - 1]];

  while (stack.length > 0) {
    const [first, last] = stack.pop();
    let furthestIndex = -1;
    let furthestDistance = toleranceSquared;

    for (let index = first + 1; index < last; index += 1) {
      const distance = squaredDistanceToSegment(
        projected[index],
        projected[first],
        projected[last],
      );
      if (distance > furthestDistance) {
        furthestDistance = distance;
        furthestIndex = index;
      }
    }

    if (furthestIndex !== -1) {
      keep[furthestIndex] = 1;
      stack.push([first, furthestIndex], [furthestIndex, last]);
    }
  }

  return points.filter((_, index) => keep[index] === 1);
}

function positionsEqual(left, right) {
  return left[0] === right[0] && left[1] === right[1];
}

function comparePositions(left, right) {
  return left[0] - right[0] || left[1] - right[1];
}

function compareRotations(points, leftStart, rightStart) {
  for (let offset = 0; offset < points.length; offset += 1) {
    const comparison = comparePositions(
      points[(leftStart + offset) % points.length],
      points[(rightStart + offset) % points.length],
    );
    if (comparison !== 0) return comparison;
  }
  return 0;
}

function signedRingArea(ring) {
  let doubleArea = 0;
  for (let index = 0; index < ring.length - 1; index += 1) {
    const current = ring[index];
    const next = ring[index + 1];
    doubleArea += current[0] * next[1] - next[0] * current[1];
  }
  return doubleArea / 2;
}

function canonicalizeRing(ring, exterior) {
  let points = positionsEqual(ring[0], ring[ring.length - 1])
    ? ring.slice(0, -1)
    : ring.slice();
  const isCounterClockwise = signedRingArea([...points, points[0]]) > 0;
  if ((exterior && !isCounterClockwise) || (!exterior && isCounterClockwise)) {
    points = points.reverse();
  }
  let bestStart = 0;
  for (let index = 1; index < points.length; index += 1) {
    if (compareRotations(points, index, bestStart) < 0) bestStart = index;
  }
  const rotated = [
    ...points.slice(bestStart),
    ...points.slice(0, bestStart),
  ].map((position) => [...position]);
  rotated.push([...rotated[0]]);
  return rotated;
}

function canonicalizePolygon(polygon) {
  const exterior = canonicalizeRing(polygon[0], true);
  const holes = polygon
    .slice(1)
    .map((ring) => canonicalizeRing(ring, false))
    .sort((left, right) =>
      JSON.stringify(left).localeCompare(JSON.stringify(right)),
    );
  return [exterior, ...holes];
}

export function canonicalizeGeometry(geometry) {
  if (geometry.type === "Point") {
    return { type: "Point", coordinates: [...geometry.coordinates] };
  }
  if (geometry.type === "Polygon") {
    return {
      type: "Polygon",
      coordinates: canonicalizePolygon(geometry.coordinates),
    };
  }
  if (geometry.type === "MultiPolygon") {
    return {
      type: "MultiPolygon",
      coordinates: geometry.coordinates
        .map(canonicalizePolygon)
        .sort((left, right) =>
          JSON.stringify(left).localeCompare(JSON.stringify(right)),
        ),
    };
  }
  throw new Error(`Unsupported geometry type: ${geometry.type}`);
}

function roundNumber(value, precision) {
  const factor = 10 ** precision;
  return Math.round(value * factor) / factor;
}

function roundPosition(position, precision) {
  return [
    roundNumber(Number(position[0]), precision),
    roundNumber(Number(position[1]), precision),
  ];
}

function simplifyRing(ring, toleranceMeters, precision) {
  if (!Array.isArray(ring) || ring.length < 4) return null;

  const openRing = positionsEqual(ring[0], ring[ring.length - 1])
    ? ring.slice(0, -1)
    : ring.slice();
  if (openRing.length < 3) return null;

  // Repeating the first point at the end gives Douglas–Peucker a meaningful
  // baseline for a closed ring. Rotate to the point furthest from the first so
  // the baseline does not collapse to zero length.
  let splitIndex = 1;
  let furthest = -1;
  const firstProjected = toMeters(openRing[0]);
  for (let index = 1; index < openRing.length; index += 1) {
    const pointProjected = toMeters(openRing[index]);
    const dx = pointProjected[0] - firstProjected[0];
    const dy = pointProjected[1] - firstProjected[1];
    const distance = dx * dx + dy * dy;
    if (distance > furthest) {
      furthest = distance;
      splitIndex = index;
    }
  }

  const rotated = [
    ...openRing.slice(splitIndex),
    ...openRing.slice(0, splitIndex),
  ];
  const firstHalf = simplifyOpenLine(
    rotated.slice(0, openRing.length - splitIndex + 1),
    toleranceMeters,
  );
  const secondHalf = simplifyOpenLine(
    [
      ...rotated.slice(openRing.length - splitIndex),
      rotated[0],
    ],
    toleranceMeters,
  );
  let simplified = [...firstHalf.slice(0, -1), ...secondHalf.slice(0, -1)];

  if (simplified.length < 3) simplified = openRing;

  const rounded = [];
  for (const position of simplified) {
    const next = roundPosition(position, precision);
    if (
      rounded.length === 0 ||
      !positionsEqual(next, rounded[rounded.length - 1])
    ) {
      rounded.push(next);
    }
  }

  if (rounded.length < 3) {
    const fallback = openRing.map((position) =>
      roundPosition(position, precision),
    );
    if (fallback.length < 3) return null;
    fallback.push([...fallback[0]]);
    return fallback;
  }

  rounded.push([...rounded[0]]);
  return rounded;
}

function normalizePolygonCoordinates(coordinates, toleranceMeters, precision) {
  const rings = coordinates
    .map((ring) => simplifyRing(ring, toleranceMeters, precision))
    .filter(Boolean);
  return rings.length > 0 ? rings : null;
}

export function normalizeGeometry(
  geometry,
  toleranceMeters = 2.5,
  precision = 8,
) {
  if (!geometry || typeof geometry !== "object") {
    throw new Error("Missing geometry");
  }

  if (geometry.type === "Point") {
    return {
      type: "Point",
      coordinates: roundPosition(geometry.coordinates, precision),
    };
  }

  if (geometry.type === "Polygon" || geometry.type === "MultiPolygon") {
    function mapCoordinates(value, mapper) {
      if (
        Array.isArray(value) &&
        value.length >= 2 &&
        Number.isFinite(value[0]) &&
        Number.isFinite(value[1])
      ) {
        return mapper(value);
      }
      return value.map((nested) => mapCoordinates(nested, mapper));
    }

    const projected = {
      type: geometry.type,
      coordinates: mapCoordinates(geometry.coordinates, toMeters),
    };
    const reader = new jsts.io.GeoJSONReader();
    const writer = new jsts.io.GeoJSONWriter();
    const parsed = reader.read(projected);
    const simplified = jsts.simplify.TopologyPreservingSimplifier.simplify(
      parsed,
      toleranceMeters,
    );
    // Quantize on a 10 cm projected grid. The precision reducer removes
    // collapsed micro-rings and repairs polygon topology before browser output.
    const reduced = jsts.precision.GeometryPrecisionReducer.reduce(
      simplified,
      new jsts.geom.PrecisionModel(10),
    );
    const normalized = writer.write(reduced);
    const geographic = {
      type: normalized.type,
      coordinates: mapCoordinates(normalized.coordinates, (position) =>
        roundPosition(fromMeters(position), precision),
      ),
    };
    // Re-run the precision reducer after converting back to WGS84. Rounding
    // longitude/latitude can otherwise collapse tiny rings or create a crossing
    // even when the projected simplified geometry was valid.
    const repaired = writer.write(
      jsts.precision.GeometryPrecisionReducer.reduce(
        reader.read(geographic),
        new jsts.geom.PrecisionModel(10 ** precision),
      ),
    );
    if (repaired.type !== "Polygon" && repaired.type !== "MultiPolygon") {
      throw new Error(
        `Polygon normalization returned ${repaired.type ?? "no geometry"}`,
      );
    }
    return repaired;
  }

  throw new Error(`Unsupported geometry type: ${geometry.type}`);
}

export function geometryPolygons(geometry) {
  if (geometry.type === "Polygon") return [geometry.coordinates];
  if (geometry.type === "MultiPolygon") return geometry.coordinates;
  return [];
}

export function combinePolygonGeometries(geometries) {
  const polygons = geometries.flatMap(geometryPolygons);
  if (polygons.length === 0) {
    throw new Error("Cannot combine geometries without polygons");
  }
  return polygons.length === 1
    ? { type: "Polygon", coordinates: polygons[0] }
    : { type: "MultiPolygon", coordinates: polygons };
}

export function geometryBounds(geometry) {
  const bounds = [Infinity, Infinity, -Infinity, -Infinity];

  function visit(value) {
    if (
      Array.isArray(value) &&
      value.length >= 2 &&
      Number.isFinite(value[0]) &&
      Number.isFinite(value[1])
    ) {
      bounds[0] = Math.min(bounds[0], value[0]);
      bounds[1] = Math.min(bounds[1], value[1]);
      bounds[2] = Math.max(bounds[2], value[0]);
      bounds[3] = Math.max(bounds[3], value[1]);
      return;
    }
    if (Array.isArray(value)) value.forEach(visit);
  }

  visit(geometry.coordinates);
  if (!bounds.every(Number.isFinite)) throw new Error("Invalid geometry bounds");
  return bounds.map((value) => roundNumber(value, 5));
}

function ringAreaAndCentroid(ring) {
  const origin = ring[0];
  let doubleArea = 0;
  let centroidX = 0;
  let centroidY = 0;

  for (let index = 0; index < ring.length - 1; index += 1) {
    const current = [
      ring[index][0] - origin[0],
      ring[index][1] - origin[1],
    ];
    const next = [
      ring[index + 1][0] - origin[0],
      ring[index + 1][1] - origin[1],
    ];
    const cross = current[0] * next[1] - next[0] * current[1];
    doubleArea += cross;
    centroidX += (current[0] + next[0]) * cross;
    centroidY += (current[1] + next[1]) * cross;
  }

  if (Math.abs(doubleArea) < Number.EPSILON) {
    return { area: 0, centroid: ring[0] };
  }

  return {
    area: Math.abs(doubleArea / 2),
    centroid: [
      origin[0] + centroidX / (3 * doubleArea),
      origin[1] + centroidY / (3 * doubleArea),
    ],
  };
}

export function geometryCentroid(geometry) {
  if (geometry.type === "Point") {
    return geometry.coordinates.map((value) => roundNumber(value, 6));
  }

  let weightedX = 0;
  let weightedY = 0;
  let totalWeight = 0;

  for (const polygon of geometryPolygons(geometry)) {
    polygon.forEach((ring, ringIndex) => {
      const { area, centroid } = ringAreaAndCentroid(ring);
      const weight = ringIndex === 0 ? area : -area;
      weightedX += centroid[0] * weight;
      weightedY += centroid[1] * weight;
      totalWeight += weight;
    });
  }

  if (Math.abs(totalWeight) < Number.EPSILON) {
    const bounds = geometryBounds(geometry);
    return [
      roundNumber((bounds[0] + bounds[2]) / 2, 6),
      roundNumber((bounds[1] + bounds[3]) / 2, 6),
    ];
  }

  return [
    roundNumber(weightedX / totalWeight, 6),
    roundNumber(weightedY / totalWeight, 6),
  ];
}

function pointOnSegment(point, start, end) {
  return squaredDistanceToSegment(
    toMeters(point),
    toMeters(start),
    toMeters(end),
  ) < 0.01;
}

function pointInRing(point, ring) {
  let inside = false;
  for (
    let currentIndex = 0, previousIndex = ring.length - 1;
    currentIndex < ring.length;
    previousIndex = currentIndex, currentIndex += 1
  ) {
    const current = ring[currentIndex];
    const previous = ring[previousIndex];
    if (pointOnSegment(point, previous, current)) return true;

    const crosses =
      current[1] > point[1] !== previous[1] > point[1] &&
      point[0] <
        ((previous[0] - current[0]) * (point[1] - current[1])) /
          (previous[1] - current[1]) +
          current[0];
    if (crosses) inside = !inside;
  }
  return inside;
}

export function pointInGeometry(point, geometry) {
  if (geometry.type === "Point") return positionsEqual(point, geometry.coordinates);

  return geometryPolygons(geometry).some((polygon) => {
    if (!pointInRing(point, polygon[0])) return false;
    return !polygon.slice(1).some((hole) => pointInRing(point, hole));
  });
}

function geometryRings(geometry) {
  return geometryPolygons(geometry).flat();
}

function pointToGeometryDistanceMeters(point, geometry) {
  if (pointInGeometry(point, geometry)) return 0;
  const projectedPoint = toMeters(point);
  let minimumSquared = Infinity;

  for (const ring of geometryRings(geometry)) {
    for (let index = 0; index < ring.length - 1; index += 1) {
      minimumSquared = Math.min(
        minimumSquared,
        squaredDistanceToSegment(
          projectedPoint,
          toMeters(ring[index]),
          toMeters(ring[index + 1]),
        ),
      );
    }
  }

  return Math.sqrt(minimumSquared);
}

function orientation(first, second, third) {
  const value =
    (second[1] - first[1]) * (third[0] - second[0]) -
    (second[0] - first[0]) * (third[1] - second[1]);
  if (Math.abs(value) < 1e-8) return 0;
  return value > 0 ? 1 : 2;
}

function segmentsIntersect(a, b, c, d) {
  const pa = toMeters(a);
  const pb = toMeters(b);
  const pc = toMeters(c);
  const pd = toMeters(d);
  const o1 = orientation(pa, pb, pc);
  const o2 = orientation(pa, pb, pd);
  const o3 = orientation(pc, pd, pa);
  const o4 = orientation(pc, pd, pb);
  return o1 !== o2 && o3 !== o4;
}

function polygonsIntersect(left, right) {
  const leftRings = geometryRings(left);
  const rightRings = geometryRings(right);

  for (const leftRing of leftRings) {
    for (const rightRing of rightRings) {
      for (
        let leftIndex = 0;
        leftIndex < leftRing.length - 1;
        leftIndex += 1
      ) {
        for (
          let rightIndex = 0;
          rightIndex < rightRing.length - 1;
          rightIndex += 1
        ) {
          if (
            segmentsIntersect(
              leftRing[leftIndex],
              leftRing[leftIndex + 1],
              rightRing[rightIndex],
              rightRing[rightIndex + 1],
            )
          ) {
            return true;
          }
        }
      }
    }
  }
  return false;
}

export function geometryDistanceMeters(left, right) {
  if (left.type === "Point") {
    return right.type === "Point"
      ? Math.hypot(
          (left.coordinates[0] - right.coordinates[0]) *
            METERS_PER_DEGREE_LONGITUDE,
          (left.coordinates[1] - right.coordinates[1]) *
            METERS_PER_DEGREE_LATITUDE,
        )
      : pointToGeometryDistanceMeters(left.coordinates, right);
  }
  if (right.type === "Point") {
    return pointToGeometryDistanceMeters(right.coordinates, left);
  }

  const leftFirst = geometryRings(left)[0]?.[0];
  const rightFirst = geometryRings(right)[0]?.[0];
  if (
    (leftFirst && pointInGeometry(leftFirst, right)) ||
    (rightFirst && pointInGeometry(rightFirst, left)) ||
    polygonsIntersect(left, right)
  ) {
    return 0;
  }

  let minimum = Infinity;
  for (const ring of geometryRings(left)) {
    for (const position of ring.slice(0, -1)) {
      minimum = Math.min(
        minimum,
        pointToGeometryDistanceMeters(position, right),
      );
    }
  }
  for (const ring of geometryRings(right)) {
    for (const position of ring.slice(0, -1)) {
      minimum = Math.min(
        minimum,
        pointToGeometryDistanceMeters(position, left),
      );
    }
  }
  return minimum;
}

export function boundsCouldBeWithin(left, right, thresholdMeters) {
  const longitudePadding = thresholdMeters / METERS_PER_DEGREE_LONGITUDE;
  const latitudePadding = thresholdMeters / METERS_PER_DEGREE_LATITUDE;
  return !(
    left[2] + longitudePadding < right[0] ||
    left[0] - longitudePadding > right[2] ||
    left[3] + latitudePadding < right[1] ||
    left[1] - latitudePadding > right[3]
  );
}
