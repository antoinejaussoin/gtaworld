import { Game } from "./game/Game";
import { PinMap } from "./start/PinMap";
import { inspectPin } from "./world/inspect";
import { sharedCache } from "./world/stream";
import "./style.css";

declare global {
  interface Window {
    __gtaworld?: Game;
  }
}

const startRoot = document.querySelector<HTMLElement>("#start");
const mapNode = document.querySelector<HTMLElement>("#map");
const form = document.querySelector<HTMLFormElement>("#panel");
const searchBox = document.querySelector<HTMLInputElement>("#search");
const resultList = document.querySelector<HTMLUListElement>("#results");
const startButton = document.querySelector<HTMLButtonElement>("#go");
const statusLine = document.querySelector<HTMLElement>("#message");
const gameCanvas = document.querySelector<HTMLCanvasElement>("#game");

if (!startRoot || !mapNode || !form || !searchBox || !resultList || !startButton || !statusLine || !gameCanvas) {
  throw new Error("Missing page structure");
}

const screen: HTMLElement = startRoot;
const query: HTMLInputElement = searchBox;
const hits: HTMLUListElement = resultList;
const launch: HTMLButtonElement = startButton;
const status: HTMLElement = statusLine;
const surface: HTMLCanvasElement = gameCanvas;

let game: Game | null = null;
let searching = false;

const pinMap = new PinMap(mapNode, () => {
  launch.disabled = pinMap.getPin() === null;
  if (pinMap.getPin()) status.textContent = "";
});

interface NominatimHit {
  lat: string;
  lon: string;
  display_name: string;
}

async function searchPlace(text: string): Promise<NominatimHit[]> {
  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("q", text);
  url.searchParams.set("limit", "5");
  let lastStatus = 0;
  for (let attempt = 0; attempt < 2; attempt++) {
    const response = await fetch(url, { headers: { Accept: "application/json" } });
    lastStatus = response.status;
    if (response.status === 204) continue;
    if (!response.ok) throw new Error(`Search failed (${response.status})`);
    const data = (await response.json()) as NominatimHit[];
    if (data.length > 0 || attempt === 1) return data;
  }
  if (lastStatus === 204) return [];
  throw new Error(`Search failed (${lastStatus})`);
}

form.addEventListener("submit", (event) => {
  event.preventDefault();
  void runSearch();
});

query.addEventListener("keydown", (event) => {
  if (event.key !== "Enter") return;
  event.preventDefault();
  void runSearch();
});

launch.addEventListener("click", () => {
  const pin = pinMap.getPin();
  if (!pin) {
    status.textContent = "Drop a pin on the map first.";
    return;
  }
  void begin(pin.lon, pin.lat);
});

async function runSearch(): Promise<void> {
  const text = query.value.trim();
  if (!text || searching) return;
  searching = true;
  status.textContent = "Searching…";
  hits.replaceChildren();
  try {
    const found = await searchPlace(text);
    if (found.length === 0) {
      status.textContent = "No matches. Try a city or a street.";
      return;
    }
    status.textContent = "";
    for (const hit of found) {
      const item = document.createElement("li");
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = hit.display_name;
      button.addEventListener("click", () => {
        pinMap.setPin(Number(hit.lon), Number(hit.lat), true);
        hits.replaceChildren();
      });
      item.append(button);
      hits.append(item);
    }
    pinMap.setPin(Number(found[0].lon), Number(found[0].lat), true);
  } catch {
    status.textContent = "Search needs a connection to OpenStreetMap.";
  } finally {
    searching = false;
  }
}

async function begin(lon: number, lat: number): Promise<void> {
  launch.disabled = true;
  status.textContent = "Checking the pin…";
  const cache = await sharedCache();
  const check = await inspectPin(lon, lat, cache);
  if (check === "water") {
    status.textContent = "That pin is in the water. Choose a spot on land.";
    launch.disabled = pinMap.getPin() === null;
    return;
  }
  if (check === "error") {
    status.textContent = "Couldn't download that part of the map. Check the connection and try again.";
    launch.disabled = pinMap.getPin() === null;
    return;
  }
  status.textContent = "";
  pinMap.suspend();
  screen.hidden = true;
  surface.style.display = "block";
  game?.stop();
  game = new Game(surface, cache, lon, lat, () => {
    game = null;
    delete window.__gtaworld;
    surface.style.display = "none";
    screen.hidden = false;
    pinMap.resume();
    launch.disabled = pinMap.getPin() === null;
  });
  window.__gtaworld = game;
  game.start();
  launch.disabled = pinMap.getPin() === null;
}
