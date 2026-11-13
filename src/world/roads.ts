import { ROAD_MAX_SPEED_MPS, ROAD_WIDTH_M } from "./config";

const DRIVE = new Set([
  "motorway",
  "trunk",
  "primary",
  "secondary",
  "tertiary",
  "minor",
  "service",
  "track",
  "raceway",
  "busway",
  "bus_guideway",
]);

const WALK_ONLY_SUB = new Set([
  "footway",
  "path",
  "cycleway",
  "steps",
  "bridleway",
  "corridor",
  "pedestrian",
  "platform",
]);

const RAIL_SUB = new Set([
  "rail",
  "narrow_gauge",
  "preserved",
  "funicular",
  "subway",
  "light_rail",
  "monorail",
  "tram",
]);

export interface RoadProfile {
  width: number;
  driveable: boolean;
  walkable: boolean;
  speedFactor: number;
  maxSpeed: number;
  bridge: boolean;
  tunnel: boolean;
  layer: number;
  railway: boolean;
}

export function isRailway(roadClass: string, subclass: string): boolean {
  return RAIL_SUB.has(subclass) || roadClass === "rail" || roadClass === "transit" || roadClass.includes("rail");
}

/** Footways, cycleways, steps, and other paths. Streets and tracks stay. */
export function isPedestrianWay(roadClass: string, subclass: string): boolean {
  return roadClass === "path" || WALK_ONLY_SUB.has(subclass);
}

export function roadProfile(props: {
  class?: string;
  subclass?: string;
  surface?: string;
  brunnel?: string;
  layer?: number;
}): RoadProfile {
  const roadClass = props.class ?? "";
  const subclass = props.subclass ?? "";
  const railway = isRailway(roadClass, subclass);
  const construction = roadClass.endsWith("_construction");
  const walkOnly = isPedestrianWay(roadClass, subclass);
  const driveable = !railway && !construction && !walkOnly && DRIVE.has(roadClass);
  const walkable = !railway && !construction && (driveable || walkOnly || roadClass === "track");
  let width = ROAD_WIDTH_M[roadClass] ?? (walkOnly ? 1.6 : 4);
  if (subclass === "living_street") width = 5;
  if (subclass === "steps") width = 1.2;
  const surface = props.surface === "unpaved" || roadClass === "track" ? 0.55 : 1;
  const maxSpeed = ROAD_MAX_SPEED_MPS[roadClass] ?? (driveable ? 14 : 4);
  return {
    width,
    driveable,
    walkable,
    speedFactor: driveable ? surface : 1,
    maxSpeed,
    bridge: props.brunnel === "bridge",
    tunnel: props.brunnel === "tunnel",
    layer: props.layer ?? 0,
    railway,
  };
}
