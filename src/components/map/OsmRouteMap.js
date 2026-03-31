import React, { useMemo, useState } from "react";
import { View, Image, StyleSheet, Text, Pressable, useWindowDimensions } from "react-native";
import Svg, { Circle, Path } from "react-native-svg";
import { COLORS } from "../../constants";
import { buildTileGrid, getMapRegion, projectToGrid } from "../../utils/map";

const MIN_ZOOM = 9;
const MAX_ZOOM = 18;

function buildPath(points, region, grid) {
  return points
    .map((point, index) => {
      const projected = projectToGrid(point, region, grid);
      return `${index === 0 ? "M" : "L"} ${projected.x.toFixed(1)} ${projected.y.toFixed(1)}`;
    })
    .join(" ");
}

function Marker({ point, color, region, grid }) {
  const projected = projectToGrid(point, region, grid);
  return (
    <>
      <Circle cx={projected.x} cy={projected.y} r={9} fill={color} opacity={0.18} />
      <Circle cx={projected.x} cy={projected.y} r={5} fill={color} stroke="#FFFFFF" strokeWidth={2} />
    </>
  );
}

export default function OsmRouteMap({ pickup, drop, driver, routePoints = [] }) {
  const { width: windowWidth } = useWindowDimensions();
  const allPoints = [pickup, drop, driver, ...routePoints].filter(Boolean);
  const autoRegion = useMemo(() => getMapRegion(allPoints), [pickup, drop, driver, routePoints]);
  const [zoom, setZoom] = useState(() => autoRegion.zoom || 13);
  const region = useMemo(
    () => ({ ...autoRegion, zoom: Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom)) }),
    [autoRegion, zoom]
  );
  const grid = useMemo(() => buildTileGrid(region), [region]);
  const path = useMemo(() => buildPath(routePoints, region, grid), [routePoints, region, grid]);
  const [tileLoadFailures, setTileLoadFailures] = useState(0);
  const [tileLoadSuccess, setTileLoadSuccess] = useState(0);
  const scale = Math.min(1, Math.max(0.42, (windowWidth - 32) / grid.width));
  const showTileFallback = tileLoadFailures >= grid.tiles.length && tileLoadSuccess === 0;
  const canZoomIn = zoom < MAX_ZOOM;
  const canZoomOut = zoom > MIN_ZOOM;

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
          {path ? <Path d={path} stroke={COLORS.primary} strokeWidth={5} strokeLinecap="round" strokeLinejoin="round" fill="none" /> : null}
          {driver ? <Marker point={driver} color={COLORS.accentOrange} region={region} grid={grid} /> : null}
          {pickup ? <Marker point={pickup} color={COLORS.success} region={region} grid={grid} /> : null}
          {drop ? <Marker point={drop} color={COLORS.error} region={region} grid={grid} /> : null}
        </Svg>
      </View>
      </View>

      {showTileFallback ? (
        <View style={styles.fallbackBanner}>
          <Text style={styles.fallbackTitle}>Live route active</Text>
          <Text style={styles.fallbackText}>Map tiles could not load on this device, but pickup, drop, driver, and route tracking are still being rendered.</Text>
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
    flex: 1,
    overflow: "hidden",
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
  fallbackBanner: {
    position: "absolute",
    left: 12,
    right: 12,
    top: 12,
    backgroundColor: "rgba(17,24,39,0.82)",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  fallbackTitle: {
    fontSize: 12,
    fontWeight: "800",
    color: COLORS.white,
    marginBottom: 2,
  },
  fallbackText: {
    fontSize: 11,
    color: "rgba(255,255,255,0.82)",
    lineHeight: 16,
  },
  attribution: {
    position: "absolute",
    right: 10,
    bottom: 10,
    backgroundColor: "rgba(255,255,255,0.9)",
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
    top: "40%",
    backgroundColor: "rgba(255,255,255,0.94)",
    borderRadius: 10,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(15,23,42,0.08)",
  },
  zoomButton: {
    width: 38,
    height: 38,
    alignItems: "center",
    justifyContent: "center",
  },
  zoomButtonDisabled: {
    opacity: 0.4,
  },
  zoomButtonText: {
    fontSize: 22,
    fontWeight: "700",
    color: COLORS.text,
    lineHeight: 24,
  },
});
