import type { Map as MLMap } from "maplibre-gl";
import { sampleWind, type LiveGrid } from "./grid-field";

/**
 * Wind particle animation drawn on a <canvas> stacked over a MapLibre map.
 * Particles live in lon/lat, are advected by the interpolated wind field and
 * projected to screen each frame. Trails come from fading the previous frame.
 *
 * ponytail: ≤1200 particles scaled to viewport, plain 2D canvas. Move to a GL layer if this
 * ever needs to run on a 4K display with 20k particles.
 */
export class WindParticles {
  private raf = 0;
  private particles: { lon: number; lat: number; age: number }[] = [];
  private hour = 0;
  private grid: LiveGrid | null = null;
  private moving = false;
  private ctx: CanvasRenderingContext2D;

  constructor(private map: MLMap, private canvas: HTMLCanvasElement, private count = 1200) {
    this.ctx = canvas.getContext("2d")!;
    map.on("movestart", this.onMoveStart);
    map.on("moveend", this.onMoveEnd);
    map.on("resize", this.resize);
    this.resize();
  }

  setData(grid: LiveGrid, hour: number) {
    this.grid = grid;
    this.hour = hour;
    this.seed();
    if (!this.raf) this.raf = requestAnimationFrame(this.frame);
  }

  setHour(hour: number) {
    this.hour = hour;
  }

  /** Halt the animation loop and clear the canvas; setData() restarts it. */
  stop() {
    cancelAnimationFrame(this.raf);
    this.raf = 0;
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }

  destroy() {
    this.stop();
    this.map.off("movestart", this.onMoveStart);
    this.map.off("moveend", this.onMoveEnd);
    this.map.off("resize", this.resize);
  }

  private resize = () => {
    const c = this.map.getCanvas();
    this.canvas.width = c.width;
    this.canvas.height = c.height;
    this.canvas.style.width = c.style.width;
    this.canvas.style.height = c.style.height;
  };

  private onMoveStart = () => {
    this.moving = true;
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
  };
  private onMoveEnd = () => {
    this.moving = false;
    this.seed();
  };

  /** Scatter particles across the visible viewport (clamped to the grid). */
  private seed() {
    const b = this.map.getBounds();
    // ~1 particle per 900 css px², capped — phones get ~300, a laptop ~850
    const c = this.map.getCanvas();
    const area = parseFloat(c.style.width || "0") * parseFloat(c.style.height || "0");
    const n = Math.min(this.count, Math.max(200, Math.round(area / 900)));
    this.particles = Array.from({ length: n }, () => ({
      lon: b.getWest() + Math.random() * (b.getEast() - b.getWest()),
      lat: b.getSouth() + Math.random() * (b.getNorth() - b.getSouth()),
      age: Math.random() * 80,
    }));
  }

  private frame = () => {
    this.raf = requestAnimationFrame(this.frame);
    if (this.moving || !this.grid || document.hidden) return;
    const { ctx, canvas } = this;
    const dpr = canvas.width / parseFloat(canvas.style.width || `${canvas.width}`) || 1;

    // Fade previous frame to leave trails
    ctx.globalCompositeOperation = "destination-in";
    ctx.fillStyle = "rgba(0,0,0,0.92)";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.globalCompositeOperation = "source-over";
    ctx.lineWidth = 1 * dpr;
    ctx.lineCap = "round";

    const b = this.map.getBounds();
    // Degrees moved per frame per km/h — scaled so particles cross ~1° of a zoom-5 view in ~3s
    const zoomScale = Math.pow(2, 5 - this.map.getZoom());
    const k = 0.00025 * zoomScale;

    for (const p of this.particles) {
      const [u, v] = sampleWind(this.grid, this.hour, p.lon, p.lat);
      const speed = Math.hypot(u, v);
      const nlon = p.lon + u * k;
      const nlat = p.lat + v * k;
      const a = this.map.project([p.lon, p.lat]);
      const c = this.map.project([nlon, nlat]);
      const alpha = Math.min(0.9, 0.25 + speed / 40);
      ctx.strokeStyle = `rgba(39,215,238,${alpha})`;
      ctx.beginPath();
      ctx.moveTo(a.x * dpr, a.y * dpr);
      ctx.lineTo(c.x * dpr, c.y * dpr);
      ctx.stroke();
      p.lon = nlon;
      p.lat = nlat;
      p.age++;
      const out = nlon < b.getWest() || nlon > b.getEast() || nlat < b.getSouth() || nlat > b.getNorth();
      if (out || p.age > 90 || speed < 0.5) {
        p.lon = b.getWest() + Math.random() * (b.getEast() - b.getWest());
        p.lat = b.getSouth() + Math.random() * (b.getNorth() - b.getSouth());
        p.age = 0;
      }
    }
  };
}
