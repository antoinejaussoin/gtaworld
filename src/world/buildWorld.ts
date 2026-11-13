import { bboxOfPoints, bboxOfRings, offsetPolyline, pointInRings, polygonParts, polylineLength, walkSamples, type Vec } from "./geometry";
import { hashParts, mulberry32 } from "./hash";
import { tileBounds, tileKey, type TileId } from "./project";
import { isPedestrianWay, roadProfile } from "./roads";
import {
  CAR_COLOURS,
  PED_COLOURS,
  aerowayColor,
  landcoverColor,
  landuseColor,
  roadColors,
  roofColor,
  waterColor,
} from "./style";
import type { DecodedFeature, ParkedCar, PedSpawn, PolyShape, Road, StrokeLine, TileWorld } from "./types";

const PARK_CLASSES = new Set(["minor", "service"]);
const PED_CLASSES = new Set(["minor", "service"]);
const MAJOR_LABEL = new Set(["motorway", "trunk", "primary", "secondary", "tertiary"]);
const MAX_CARS = 100;
const MAX_PEDS = 70;
const MAX_POIS = 50;

function propString(props: DecodedFeature["properties"], key: string): string {
  const value = props[key];
  return value == null ? "" : String(value);
}

function propNumber(props: DecodedFeature["properties"], key: string, fallback = 0): number {
  const value = props[key];
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

class SolidGrid {
  private readonly cell = 24;
  private readonly map = new Map<string, Vec[][][]>();

  add(rings: Vec[][]): void {
    const box = bboxOfRings(rings);
    if (!Number.isFinite(box.minX)) return;
    const x0 = Math.floor(box.minX / this.cell);
    const x1 = Math.floor(box.maxX / this.cell);
    const y0 = Math.floor(box.minY / this.cell);
    const y1 = Math.floor(box.maxY / this.cell);
    for (let x = x0; x <= x1; x++) {
      for (let y = y0; y <= y1; y++) {
        const key = `${x},${y}`;
        const list = this.map.get(key);
        if (list) list.push(rings);
        else this.map.set(key, [rings]);
      }
    }
  }

  blocks(x: number, y: number): boolean {
    const list = this.map.get(`${Math.floor(x / this.cell)},${Math.floor(y / this.cell)}`);
    if (!list) return false;
    for (const rings of list) {
      if (pointInRings(x, y, rings)) return true;
    }
    return false;
  }
}

function stride<T>(items: T[], max: number): T[] {
  if (items.length <= max) return items;
  const step = Math.ceil(items.length / max);
  const out: T[] = [];
  for (let i = 0; i < items.length; i += step) out.push(items[i]);
  return out;
}

function poiKind(feature: DecodedFeature): "fuel" | "parking" | "station" | null {
  const cls = propString(feature.properties, "class");
  const sub = propString(feature.properties, "subclass");
  if (cls === "fuel" || sub === "fuel") return "fuel";
  if (cls === "parking" || sub === "parking") return "parking";
  if (cls === "railway" || cls === "bus" || sub === "station" || sub === "halt" || sub === "bus_stop" || sub === "tram_stop") {
    return "station";
  }
  return null;
}

export function buildTileWorld(
  id: TileId,
  features: DecodedFeature[],
  buildingSource: "map" | "osm" = "map",
): TileWorld {
  const key = tileKey(id);
  const roads: Road[] = [];
  const polygons: PolyShape[] = [];
  const strokes: StrokeLine[] = [];
  const labels: TileWorld["labels"] = [];
  const pois: TileWorld["pois"] = [];
  const solids = new SolidGrid();

  for (const feature of features) {
    if (feature.layer === "building" && feature.type === 3) {
      const height = Math.max(0, propNumber(feature.properties, "render_height", 8)) || 8;
      for (const rings of polygonParts(feature.geometry)) {
        const color = roofColor(feature.properties.colour, rings[0]);
        const poly: PolyShape = {
          rings,
          kind: "building",
          cls: "building",
          color,
          height,
          bbox: bboxOfRings(rings),
        };
        polygons.push(poly);
        solids.add(rings);
      }
      continue;
    }

    if ((feature.layer === "water" || feature.layer === "waterway") && feature.type === 3 && feature.layer === "water") {
      const cls = propString(feature.properties, "class") || "lake";
      const intermittent = propNumber(feature.properties, "intermittent") === 1;
      for (const rings of polygonParts(feature.geometry)) {
        const poly: PolyShape = {
          rings,
          kind: "water",
          cls,
          color: waterColor(cls, intermittent),
          height: 0,
          bbox: bboxOfRings(rings),
        };
        polygons.push(poly);
        solids.add(rings);
      }
      continue;
    }

    if (feature.layer === "waterway" && feature.type === 2) {
      const cls = propString(feature.properties, "class");
      const width = cls === "river" ? 12 : cls === "canal" ? 8 : cls === "stream" ? 3 : 2.2;
      const tunnel = propString(feature.properties, "brunnel") === "tunnel";
      for (const line of feature.geometry) {
        if (line.length < 2) continue;
        strokes.push({
          points: line,
          width,
          color: tunnel ? "#6d8e9c" : waterColor(cls === "river" || cls === "canal" ? "river" : "pond", false),
          blocking: !tunnel && (cls === "river" || cls === "canal"),
          bbox: bboxOfPoints(line),
          kind: "waterway",
        });
      }
      continue;
    }

    if (feature.layer === "landcover" && feature.type === 3) {
      const cls = propString(feature.properties, "class");
      const sub = propString(feature.properties, "subclass");
      const color = landcoverColor(cls, sub);
      if (!color) continue;
      for (const rings of polygonParts(feature.geometry)) {
        polygons.push({ rings, kind: "landcover", cls, color, height: 0, bbox: bboxOfRings(rings) });
      }
      continue;
    }

    if (feature.layer === "landuse" && feature.type === 3) {
      const cls = propString(feature.properties, "class");
      const color = landuseColor(cls);
      if (!color) continue;
      for (const rings of polygonParts(feature.geometry)) {
        polygons.push({ rings, kind: "landuse", cls, color, height: 0, bbox: bboxOfRings(rings) });
      }
      continue;
    }

    if (feature.layer === "park" && feature.type === 3) {
      for (const rings of polygonParts(feature.geometry)) {
        polygons.push({
          rings,
          kind: "park",
          cls: propString(feature.properties, "class") || "park",
          color: "#6e9a5c",
          height: 0,
          bbox: bboxOfRings(rings),
        });
      }
      continue;
    }

    if (feature.layer === "aeroway") {
      const cls = propString(feature.properties, "class") || "aeroway";
      if (feature.type === 3) {
        for (const rings of polygonParts(feature.geometry)) {
          polygons.push({
            rings,
            kind: "aeroway",
            cls,
            color: aerowayColor(cls),
            height: 0,
            bbox: bboxOfRings(rings),
          });
        }
      } else if (feature.type === 2) {
        const width = cls === "runway" ? 30 : cls === "taxiway" ? 12 : 6;
        for (const line of feature.geometry) {
          if (line.length < 2) continue;
          strokes.push({
            points: line,
            width,
            color: aerowayColor(cls),
            blocking: false,
            bbox: bboxOfPoints(line),
            kind: "aeroway",
          });
        }
      }
      continue;
    }

    if (feature.layer === "transportation" && feature.type === 3) {
      for (const rings of polygonParts(feature.geometry)) {
        polygons.push({
          rings,
          kind: "paved",
          cls: propString(feature.properties, "class") || "paved",
          color: "#c9c3b4",
          height: 0,
          bbox: bboxOfRings(rings),
        });
      }
      continue;
    }

    if (feature.layer === "transportation" && feature.type === 2) {
      const cls = propString(feature.properties, "class");
      const sub = propString(feature.properties, "subclass");
      if (isPedestrianWay(cls, sub)) continue;
      const profile = roadProfile({
        class: cls,
        subclass: sub,
        surface: propString(feature.properties, "surface"),
        brunnel: propString(feature.properties, "brunnel"),
        layer: propNumber(feature.properties, "layer"),
      });
      for (const line of feature.geometry) {
        if (line.length < 2) continue;
        if (profile.railway) {
          strokes.push({
            points: line,
            width: 2.2,
            color: "#5c534c",
            blocking: false,
            bbox: bboxOfPoints(line),
            kind: "railway",
          });
          continue;
        }
        const road: Road = {
          points: line,
          width: profile.width,
          driveable: profile.driveable,
          walkable: profile.walkable,
          speedFactor: profile.speedFactor,
          maxSpeed: profile.maxSpeed,
          bridge: profile.bridge,
          tunnel: profile.tunnel,
          layer: profile.layer,
          roadClass: cls || "road",
          subclass: sub,
          bbox: bboxOfPoints(line),
        };
        roads.push(road);
      }
      continue;
    }

    if (feature.layer === "transportation_name" && feature.type === 2) {
      const cls = propString(feature.properties, "class");
      const text = propString(feature.properties, "name");
      if (!text || !MAJOR_LABEL.has(cls)) continue;
      for (const line of feature.geometry) {
        if (line.length < 2) continue;
        const mid = line[Math.floor(line.length / 2)];
        labels.push({ x: mid.x, y: mid.y, text, kind: "road" });
      }
      continue;
    }

    if (feature.layer === "water_name") {
      const text = propString(feature.properties, "name");
      if (!text) continue;
      const point = feature.geometry[0]?.[0];
      if (!point) continue;
      labels.push({ x: point.x, y: point.y, text, kind: "water" });
      continue;
    }

    if (feature.layer === "poi" && feature.type === 1) {
      const kind = poiKind(feature);
      const point = feature.geometry[0]?.[0];
      if (!kind || !point || pois.length >= MAX_POIS) continue;
      pois.push({ x: point.x, y: point.y, kind, name: propString(feature.properties, "name") });
    }
  }

  const parked = placeCars(key, roads, solids);
  const pedestrians = placePeds(key, roads, solids);
  return {
    key,
    id,
    bounds: tileBounds(id),
    buildingSource,
    roads,
    polygons,
    strokes,
    parked,
    pedestrians,
    labels: labels.slice(0, 24),
    pois,
  };
}

function placeCars(tileKeyId: string, roads: Road[], solids: SolidGrid): ParkedCar[] {
  const candidates: ParkedCar[] = [];
  const ordered = [...roads].sort((a, b) => a.points[0].x - b.points[0].x || a.points[0].y - b.points[0].y || a.roadClass.localeCompare(b.roadClass));
  for (const road of ordered) {
    if (!road.driveable || road.bridge || road.tunnel) continue;
    if (!PARK_CLASSES.has(road.roadClass)) continue;
    if (road.subclass === "driveway" && polylineLength(road.points) < 36) continue;
    const side = hashParts([tileKeyId, Math.round(road.points[0].x), Math.round(road.points[0].y)]) & 1 ? 1 : -1;
    const offset = side * road.width * 0.55;
    const samples = walkSamples(road.points, 18, 12);
    for (const sample of samples) {
      const heading = sample.heading;
      const x = sample.x + Math.cos(heading + side * Math.PI / 2) * Math.abs(offset);
      const y = sample.y + Math.sin(heading + side * Math.PI / 2) * Math.abs(offset);
      if (solids.blocks(x, y)) continue;
      const seed = hashParts([Math.round(x * 10), Math.round(y * 10), "car"]);
      const rng = mulberry32(seed);
      candidates.push({
        id: "",
        x,
        y,
        heading: rng() < 0.5 ? heading : heading + Math.PI,
        color: CAR_COLOURS[seed % CAR_COLOURS.length],
      });
    }
  }
  const kept = stride(candidates, MAX_CARS);
  kept.forEach((car, index) => {
    car.id = `${tileKeyId}:c:${index}`;
  });
  return kept;
}

function placePeds(tileKeyId: string, roads: Road[], solids: SolidGrid): PedSpawn[] {
  const candidates: PedSpawn[] = [];
  const ordered = [...roads].sort((a, b) => a.points[0].x - b.points[0].x || a.points[0].y - b.points[0].y);
  for (const road of ordered) {
    if (road.tunnel || !PED_CLASSES.has(road.roadClass)) continue;
    if (!road.walkable && road.roadClass !== "path") continue;
    const side = hashParts([tileKeyId, "ped", Math.round(road.points[0].x * 10), Math.round(road.points[0].y * 10)]) & 1 ? 1 : -1;
    const dist = side * (road.width / 2 + 0.8);
    let path = offsetPolyline(road.points, dist);
    if (path.some((p) => solids.blocks(p.x, p.y))) {
      path = offsetPolyline(road.points, -dist);
      if (path.some((p) => solids.blocks(p.x, p.y))) continue;
    }
    const length = polylineLength(path);
    if (length < 20) continue;
    const samples = walkSamples(path, 48, 8);
    for (const sample of samples) {
      const seed = hashParts([Math.round(sample.x * 10), Math.round(sample.y * 10), "ped"]);
      const rng = mulberry32(seed);
      candidates.push({
        id: "",
        path,
        distance: sample.along,
        dir: rng() < 0.5 ? 1 : -1,
        speed: 1.05 + rng() * 0.45,
        color: PED_COLOURS[seed % PED_COLOURS.length],
      });
    }
  }
  const kept = stride(candidates, MAX_PEDS);
  kept.forEach((ped, index) => {
    ped.id = `${tileKeyId}:p:${index}`;
  });
  return kept;
}

export function roadPaint(road: Road): { casing: string; fill: string; casingWidth: number } {
  const colors = roadColors(road.roadClass, road.tunnel, road.bridge);
  const casingWidth = road.roadClass === "path" ? road.width : road.width + 1.1;
  return { ...colors, casingWidth };
}
