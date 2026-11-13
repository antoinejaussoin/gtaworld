import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

export class PinMap {
  private map: maplibregl.Map | null = null;
  private marker = new maplibregl.Marker({ color: "#e2b33c" });
  private pin: { lon: number; lat: number } | null = null;
  private center: [number, number] = [0, 20];
  private zoom = 1.6;

  constructor(
    private readonly container: HTMLElement,
    private readonly onChange: () => void,
  ) {
    this.mount();
  }

  private mount(): void {
    this.map = new maplibregl.Map({
      container: this.container,
      style: "https://tiles.openfreemap.org/styles/liberty",
      center: this.center,
      zoom: this.zoom,
      dragRotate: false,
      pitchWithRotate: false,
    });
    this.map.on("load", () => this.map?.resize());
    this.map.on("click", (event) => {
      this.setPin(event.lngLat.lng, event.lngLat.lat, false);
    });
    if (this.pin) this.marker.setLngLat([this.pin.lon, this.pin.lat]).addTo(this.map);
  }

  setPin(lon: number, lat: number, fly: boolean): void {
    this.pin = { lon, lat };
    if (!this.map) return;
    this.marker.setLngLat([lon, lat]).addTo(this.map);
    if (fly) this.map.flyTo({ center: [lon, lat], zoom: Math.max(this.map.getZoom(), 13) });
    this.onChange();
  }

  getPin(): { lon: number; lat: number } | null {
    return this.pin;
  }

  suspend(): void {
    if (!this.map) return;
    const center = this.map.getCenter();
    this.center = [center.lng, center.lat];
    this.zoom = this.map.getZoom();
    this.marker.remove();
    this.map.remove();
    this.map = null;
  }

  resume(): void {
    if (this.map) return;
    this.mount();
  }
}
