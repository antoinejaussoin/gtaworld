import { hashGeometry } from "./hash";

export const GROUND = "#b3b07a";

const ROOF_PALETTE = ["#c45c45", "#8d4e34", "#6e767f", "#a35448", "#d9c4a2", "#7a8490", "#b85a3d"];

const NAMED_COLOURS: Record<string, string> = {
  white: "#f4f1ea",
  black: "#4a4744",
  gray: "#9a958c",
  grey: "#9a958c",
  red: "#a33b32",
  brown: "#8a6246",
  blue: "#6d8ea6",
  green: "#6e8b62",
  yellow: "#e2c56a",
  beige: "#e6d7bc",
  orange: "#d28a45",
  pink: "#e4b7b0",
  tan: "#d8c3a0",
};

const LANDCOVER: Record<string, string> = {
  wood: "#2f6a3c",
  grass: "#7ea14e",
  farmland: "#c6b15e",
  sand: "#e0c98a",
  wetland: "#6d907c",
  rock: "#9a968e",
  ice: "#e7eef0",
};

const LANDUSE: Record<string, string> = {
  residential: "#8f876f",
  commercial: "#d2c3ae",
  industrial: "#b5b0a6",
  retail: "#d8c6b2",
  railway: "#b7b2aa",
  cemetery: "#8ea58a",
  military: "#a3aa90",
  school: "#e3d7a4",
  university: "#e3d7a4",
  kindergarten: "#e7dcb0",
  college: "#e3d7a4",
  library: "#e3d7a4",
  hospital: "#e4cfcb",
  stadium: "#b7c49a",
  pitch: "#6ea356",
  playground: "#8fba68",
  track: "#c3b49a",
  garages: "#b9b4ac",
  quarry: "#c2b5a0",
  bus_station: "#cfc6b8",
  theme_park: "#8fba68",
  zoo: "#7ea86a",
};

export function landcoverColor(landClass: string, subclass: string): string | null {
  if (subclass === "park" || subclass === "garden" || subclass === "village_green") return "#8fb85a";
  if (subclass === "beach" || subclass === "dune") return LANDCOVER.sand;
  if (subclass === "scrub" || subclass === "heath" || subclass === "grassland") return "#6d8a45";
  return LANDCOVER[landClass] ?? null;
}

export function landuseColor(landClass: string): string | null {
  return LANDUSE[landClass] ?? null;
}

export function waterColor(waterClass: string, intermittent: boolean): string {
  if (intermittent) return "#8eb8c6";
  if (waterClass === "ocean" || waterClass === "sea") return "#2f6f99";
  if (waterClass === "river") return "#3a86b0";
  if (waterClass === "pond" || waterClass === "swimming_pool") return "#5aa3c4";
  if (waterClass === "dock") return "#4a6e78";
  return "#3d7ea8";
}

export function aerowayColor(kind: string): string {
  if (kind === "runway") return "#6e7378";
  if (kind === "taxiway") return "#7d786e";
  if (kind === "apron" || kind === "helipad") return "#8a8680";
  return "#7a7772";
}

export function roadColors(roadClass: string, tunnel: boolean, bridge: boolean): { casing: string; fill: string } {
  if (tunnel) return { casing: "#23262b", fill: "#3c4148" };
  if (bridge) return { casing: "#2c3138", fill: "#6a727c" };
  if (roadClass === "motorway" || roadClass === "trunk") return { casing: "#2a2e33", fill: "#5c6570" };
  if (roadClass === "track") return { casing: "#8c7d5e", fill: "#c2b08a" };
  if (roadClass === "path") return { casing: "#cfc6b2", fill: "#e4dccb" };
  return { casing: "#2a2d31", fill: "#4e545c" };
}

function luminance(hex: string): number {
  const value = Number.parseInt(hex.slice(1), 16);
  const red = (value >> 16) & 255;
  const green = (value >> 8) & 255;
  const blue = value & 255;
  return (0.2126 * red + 0.7152 * green + 0.0722 * blue) / 255;
}

function explicitColour(colour: unknown): string | null {
  if (typeof colour !== "string") return null;
  const text = colour.trim().toLowerCase();
  if (/^#?[0-9a-f]{6}$/i.test(text)) return text.startsWith("#") ? text : `#${text}`;
  return NAMED_COLOURS[text] ?? null;
}

export function roofColor(colour: unknown, footprint: { x: number; y: number }[]): string {
  const resolved = explicitColour(colour);
  // Pale map colours disappear into the lots, so those footprints take a house colour.
  if (resolved && luminance(resolved) <= 0.62) return resolved;
  return ROOF_PALETTE[hashGeometry(footprint) % ROOF_PALETTE.length];
}

export const CAR_COLOURS = ["#c23b3b", "#2f6fbf", "#e6e8ea", "#1e1f22", "#d8a12e", "#3e8f5a", "#7a4e2d", "#8a8f98"];
export const PED_COLOURS = ["#d64545", "#3d74c9", "#efc14a", "#3f9d62", "#e07a3d", "#8d5cc2", "#f4f4f4", "#22252a"];
