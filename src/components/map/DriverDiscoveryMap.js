import React, { useEffect, useMemo, useRef, useState } from "react";
import { View, Image, StyleSheet, Text, Pressable, useWindowDimensions } from "react-native";
import Svg, { Circle, Text as SvgText } from "react-native-svg";
import { COLORS } from "../../constants";
import { buildTileGrid, getMapRegion, projectToGrid } from "../../utils/map";

const CLUSTER_RADIUS_PX = 38;
const ANIMATION_MS = 1300;
const MIN_ZOOM = 9;
const MAX_ZOOM = 18;

function toPoint(item) {
  return {
    id: item.id,
    name: item.name,
    latitude: Number(item.latitude),
    longitude: Number(item.longitude),
    etaMinutes: item.etaMinutes,
    distanceKm: item.distanceKm,
    vehicleType: item.vehicleType,
  };
}

function groupDriversForClusters(drivers, region, grid) {
  const buckets = [];

  drivers.forEach((driver) => {
    const point = projectToGrid(driver, region, grid);
    let assigned = null;

    for (let index = 0; index < buckets.length; index += 1) {
      const cluster = buckets[index];
      const dx = point.x - cluster.anchor.x;
      const dy = point.y - cluster.anchor.y;
      if (Math.sqrt(dx * dx + dy * dy) <= CLUSTER_RADIUS_PX) {
        assigned = cluster;
        break;
      }
    }

    if (!assigned) {
      buckets.push({
        anchor: point,
        items: [driver],
      });
      return;
    }

    assigned.items.push(driver);
  });

  return buckets.map((cluster) => {
    const latitude =
      cluster.items.reduce((acc, item) => acc + item.latitude, 0) / cluster.items.length;
    const longitude =
      cluster.items.reduce((acc, item) => acc + item.longitude, 0) / cluster.items.length;
    const point = projectToGrid({ latitude, longitude }, region, grid);

    return {
      point,
      items: cluster.items,
      count: cluster.items.length,
    };
  });
}

function DriverDot({ point, color }) {
  return (
    <>
      <Circle cx={point.x} cy={point.y} r={10} fill={color} opacity={0.2} />
      <Circle cx={point.x} cy={point.y} r={5.5} fill={color} stroke="#FFFFFF" strokeWidth={2} />
    </>
  );
}

function ClusterDot({ point, count }) {
  return (
    <>
      <Circle cx={point.x} cy={point.y} r={15} fill={COLORS.primary} opacity={0.25} />
      <Circle cx={point.x} cy={point.y} r={11} fill={COLORS.primary} />
      <SvgText
        x={point.x}
        y={point.y + 4}
        fontSize={10}
        fill={COLORS.white}
        fontWeight="800"
        textAnchor="middle"
      >
        {String(count)}
      </SvgText>
    </>
  );
}

export default function DriverDiscoveryMap({
  pickup,
  drivers = [],
  refreshedAt,
  autoRefreshSeconds = 6,
  loading = false,
}) {
  const { width: windowWidth } = useWindowDimensions();
  const previousPointsRef = useRef(new Map());
  const [renderDrivers, setRenderDrivers] = useState([]);
  const [tileLoadFailures, setTileLoadFailures] = useState(0);
  const [tileLoadSuccess, setTileLoadSuccess] = useState(0);

  const allPoints = useMemo(() => [pickup, ...renderDrivers].filter(Boolean), [pickup, renderDrivers]);
  const autoRegion = useMemo(() => getMapRegion(allPoints), [allPoints]);
  const [zoom, setZoom] = useState(() => autoRegion.zoom || 13);
  const region = useMemo(
    () => ({ ...autoRegion, zoom: Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom)) }),
    [autoRegion, zoom]
  );
  const grid = useMemo(() => buildTileGrid(region), [region]);
  const clusters = useMemo(
    () => groupDriversForClusters(renderDrivers, region, grid),
    [renderDrivers, region, grid]
  );

  const scale = Math.min(1, Math.max(0.42, (windowWidth - 32) / grid.width));
  const showTileFallback = tileLoadFailures >= grid.tiles.length && tileLoadSuccess === 0;
  const canZoomIn = zoom < MAX_ZOOM;
  const canZoomOut = zoom > MIN_ZOOM;

  useEffect(() => {
    const normalized = drivers
      .filter((item) => Number.isFinite(Number(item.latitude)) && Number.isFinite(Number(item.longitude)))
      .map(toPoint);

    const nextMap = new Map(normalized.map((item) => [item.id, item]));
    const startMap = new Map();
    normalized.forEach((item) => {
      startMap.set(item.id, previousPointsRef.current.get(item.id) || item);
    });

    const animationStart = Date.now();
    let frameId = null;

    const tick = () => {
      const progressRaw = (Date.now() - animationStart) / ANIMATION_MS;
      const progress = Math.max(0, Math.min(1, progressRaw));
      const eased = 1 - (1 - progress) * (1 - progress);

      const interpolated = normalized.map((target) => {
        const start = startMap.get(target.id) || target;
        return {
          ...target,
          latitude: start.latitude + (target.latitude - start.latitude) * eased,
          longitude: start.longitude + (target.longitude - start.longitude) * eased,
        };
      });

      setRenderDrivers(interpolated);

      if (progress < 1) {
        frameId = requestAnimationFrame(tick);
      } else {
        previousPointsRef.current = nextMap;
      }
    };

    tick();

    return () => {
      if (frameId) cancelAnimationFrame(frameId);
    };
  }, [drivers]);

  return (
    <View style={styles.wrapper}>
      <View style={[styles.canvasWrap, { transform: [{ scale }] }]}>
        <View style={styles.canvas}>
          {grid.tiles.map((tile) => (
            <Image
              key={tile.key}
              source={{
                uri: tile.url,
                headers: {
                  "User-Agent": "ghoomo-app/1.0",
                },
              }}
              style={[styles.tile, { left: tile.left, top: tile.top }]}
              resizeMode="cover"
              onLoad={() => setTileLoadSuccess((count) => count + 1)}
              onError={() => setTileLoadFailures((count) => count + 1)}
            />
          ))}

          <Svg width={grid.width} height={grid.height} style={styles.overlay}>
            {pickup ? <DriverDot point={projectToGrid(pickup, region, grid)} color={COLORS.success} /> : null}
            {clusters.map((cluster, index) =>
              cluster.count > 1 ? (
                <ClusterDot key={`cluster-${index}`} point={cluster.point} count={cluster.count} />
              ) : (
                <DriverDot
                  key={cluster.items[0].id}
                  point={cluster.point}
                  color={COLORS.accentOrange}
                />
              )
            )}
          </Svg>
        </View>
      </View>

      <View style={styles.headerOverlay}>
        <Text style={styles.headerTitle}>Live Driver Discovery</Text>
        <Text style={styles.headerSub}>
          {loading
            ? "Refreshing nearby drivers..."
            : `${drivers.length} online drivers • auto-refresh ${autoRefreshSeconds}s`}
        </Text>
        {refreshedAt ? (
          <Text style={styles.headerTime}>
            Updated {new Date(refreshedAt).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", second: "2-digit" })}
          </Text>
        ) : null}
      </View>

      {showTileFallback ? (
        <View style={styles.fallbackBanner}>
          <Text style={styles.fallbackText}>Live driver dots stay active even when map tiles fail to load.</Text>
        </View>
      ) : null}

      <View style={styles.attribution}>
        <Text style={styles.attributionText}>Map data © OpenStreetMap contributors</Text>
      </View>

      <View style={styles.zoomControls}>
        <Pressable
          style={[styles.zoomButton, !canZoomIn && styles.zoomButtonDisabled]}
          onPress={() => setZoom((value) => Math.min(MAX_ZOOM, value + 1))}
          disabled={!canZoomIn}
        >
          <Text style={styles.zoomButtonText}>+</Text>
        </Pressable>
        <Pressable
          style={[styles.zoomButton, !canZoomOut && styles.zoomButtonDisabled]}
          onPress={() => setZoom((value) => Math.max(MIN_ZOOM, value - 1))}
          disabled={!canZoomOut}
        >
          <Text style={styles.zoomButtonText}>-</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    height: 240,
    overflow: "hidden",
    borderRadius: 18,
    backgroundColor: "#D9E8F3",
    justifyContent: "center",
  },
  canvasWrap: {
    alignSelf: "center",
  },
  canvas: {
    width: 256 * 3,
    height: 256 * 3,
    alignSelf: "center",
  },
  tile: {
    position: "absolute",
    width: 256,
    height: 256,
  },
  overlay: {
    position: "absolute",
    left: 0,
    top: 0,
  },
  headerOverlay: {
    position: "absolute",
    top: 10,
    left: 10,
    right: 10,
    backgroundColor: "rgba(15,23,42,0.72)",
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  headerTitle: {
    fontSize: 12,
    fontWeight: "800",
    color: COLORS.white,
  },
  headerSub: {
    fontSize: 11,
    color: "rgba(255,255,255,0.88)",
    marginTop: 2,
  },
  headerTime: {
    fontSize: 10,
    color: "rgba(255,255,255,0.74)",
    marginTop: 3,
  },
  fallbackBanner: {
    position: "absolute",
    left: 10,
    right: 10,
    bottom: 28,
    borderRadius: 10,
    backgroundColor: "rgba(15,23,42,0.72)",
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  fallbackText: {
    fontSize: 10,
    color: "rgba(255,255,255,0.86)",
  },
  attribution: {
    position: "absolute",
    right: 10,
    bottom: 8,
    backgroundColor: "rgba(255,255,255,0.92)",
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  attributionText: {
    fontSize: 10,
    color: COLORS.textSecondary,
    fontWeight: "600",
  },
  zoomControls: {
    position: "absolute",
    right: 10,
    top: "42%",
    backgroundColor: "rgba(255,255,255,0.94)",
    borderRadius: 10,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(15,23,42,0.08)",
  },
  zoomButton: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
  },
  zoomButtonDisabled: {
    opacity: 0.4,
  },
  zoomButtonText: {
    fontSize: 20,
    fontWeight: "700",
    color: COLORS.text,
    lineHeight: 22,
  },
});
