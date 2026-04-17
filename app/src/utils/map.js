const TILE_SIZE = 256;
const TILE_URL_TEMPLATE = (process.env.EXPO_PUBLIC_MAP_TILE_URL_TEMPLATE || "").trim();

function buildTileUrl(zoom, x, y) {
  if (!TILE_URL_TEMPLATE) {
    throw new Error(
      "Map tile URL template is not configured. Set EXPO_PUBLIC_MAP_TILE_URL_TEMPLATE."
    );
  }

  return TILE_URL_TEMPLATE.replace("{z}", String(zoom))
    .replace("{x}", String(x))
    .replace("{y}", String(y));
}

export function latLonToWorld({ latitude, longitude }, zoom) {
  const scale = TILE_SIZE * 2 ** zoom;
  const sinLat = Math.sin((latitude * Math.PI) / 180);
  const x = ((longitude + 180) / 360) * scale;
  const y =
    (0.5 -
      Math.log((1 + Math.min(Math.max(sinLat, -0.9999), 0.9999)) / (1 - Math.min(Math.max(sinLat, -0.9999), 0.9999))) /
        (4 * Math.PI)) *
    scale;
  return { x, y };
}

export function getMapRegion(points = []) {
  if (!points.length) {
    return { latitude: 30.900965, longitude: 75.857277, zoom: 13 };
  }

  const lats = points.map((point) => point.latitude);
  const lons = points.map((point) => point.longitude);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLon = Math.min(...lons);
  const maxLon = Math.max(...lons);
  const latitude = (minLat + maxLat) / 2;
  const longitude = (minLon + maxLon) / 2;
  const latDelta = Math.max(0.01, maxLat - minLat);
  const lonDelta = Math.max(0.01, maxLon - minLon);
  const span = Math.max(latDelta, lonDelta);

  let zoom = 13;
  if (span > 0.5) zoom = 9;
  else if (span > 0.2) zoom = 10;
  else if (span > 0.08) zoom = 11;
  else if (span > 0.03) zoom = 12;
  else if (span > 0.015) zoom = 13;
  else zoom = 14;

  return { latitude, longitude, zoom };
}

export function buildTileGrid(region, rows = 3, cols = 3) {
  const centerWorld = latLonToWorld(region, region.zoom);
  const centerTileX = Math.floor(centerWorld.x / TILE_SIZE);
  const centerTileY = Math.floor(centerWorld.y / TILE_SIZE);
  const originX = centerWorld.x - (cols * TILE_SIZE) / 2;
  const originY = centerWorld.y - (rows * TILE_SIZE) / 2;
  const tiles = [];

  for (let row = -1; row <= 1; row += 1) {
    for (let col = -1; col <= 1; col += 1) {
      const x = centerTileX + col;
      const y = centerTileY + row;
      tiles.push({
        key: `${region.zoom}-${x}-${y}`,
        x,
        y,
        left: x * TILE_SIZE - originX,
        top: y * TILE_SIZE - originY,
        url: buildTileUrl(region.zoom, x, y),
      });
    }
  }

  return {
    width: cols * TILE_SIZE,
    height: rows * TILE_SIZE,
    originX,
    originY,
    tiles,
  };
}

export function projectToGrid(point, region, grid) {
  const world = latLonToWorld(point, region.zoom);
  return {
    x: world.x - grid.originX,
    y: world.y - grid.originY,
  };
}
