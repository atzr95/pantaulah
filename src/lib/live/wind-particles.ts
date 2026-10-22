import { LngLat, type Map as MLMap } from "maplibre-gl";
import { sampleWind, type LiveGrid } from "./grid-field";

// Few brightness steps, so each frame strokes a few paths instead of one per particle
const STYLES = Array.from({ length: 10 }, (_, i) => `rgba(255,255,255,${(0.4 + (0.55 * i) / 9).toFixed(3)})`);

/** x/y: screen position (CSS px) of lon/lat, kept so each frame projects one point per particle. */
type Particle = { lon: number; lat: number; age: number; x: number; y: number };

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
  private particles: Particle[] = [];
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
    this.particles = Array.from({ length: n }, () => {
      const p = { lon: 0, lat: 0, age: Math.random() * 80, x: 0, y: 0 };
      this.respawn(p, b);
      return p;
    });
  }

  /** Move a particle to a random spot in view and record its screen position. */
  private respawn(p: Particle, b: ReturnType<MLMap["getBounds"]>) {
    p.lon = b.getWest() + Math.random() * (b.getEast() - b.getWest());
    p.lat = b.getSouth() + Math.random() * (b.getNorth() - b.getSouth());
    const s = this.screen(p.lon, p.lat);
    p.x = s.x;
    p.y = s.y;
  }

  /**
   * Screen point without the 3D terrain height lookup. map.project does that lookup for each
   * point, which with terrain on made each frame use the whole CPU; wind is a flat overlay.
   */
  private screen(lon: number, lat: number) {
    return this.map.transform.locationToScreenPoint(new LngLat(lon, lat));
  }

  private frame = () => {
    this.raf = requestAnimationFrame(this.frame);
    if (this.moving || !this.grid || document.hidden) return;
    const { ctx, canvas } = this;
    const dpr = canvas.width / parseFloat(canvas.style.width || `${canvas.width}`) || 1;

    // Fade previous frame to leave trails; a slow fade gives long tails that show the flow direction
    ctx.globalCompositeOperation = "destination-in";
    ctx.fillStyle = "rgba(0,0,0,0.95)";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.globalCompositeOperation = "source-over";
    ctx.lineWidth = 1.6 * dpr;
    ctx.lineCap = "round";

    const b = this.map.getBounds();
    // Degrees moved per frame per km/h — scaled so particles cross ~1° of a zoom-5 view in ~3s
    const zoomScale = Math.pow(2, 5 - this.map.getZoom());
    const k = 0.00025 * zoomScale;

    // Line ends [x0, y0, x1, y1, …] in canvas px, one list per brightness step
    const lines: number[][] = STYLES.map(() => []);
    for (const p of this.particles) {
      const [u, v] = sampleWind(this.grid, this.hour, p.lon, p.lat);
      const speed = Math.hypot(u, v);
      const nlon = p.lon + u * k;
      const nlat = p.lat + v * k;
      const c = this.screen(nlon, nlat);
      // White reads over satellite, smog and the fire glow; stronger wind is brighter (0.4 → 0.95 alpha)
      lines[Math.round(Math.min(1, speed / 22) * (STYLES.length - 1))].push(p.x * dpr, p.y * dpr, c.x * dpr, c.y * dpr);
      p.lon = nlon;
      p.lat = nlat;
      p.x = c.x;
      p.y = c.y;
      p.age++;
      const out = nlon < b.getWest() || nlon > b.getEast() || nlat < b.getSouth() || nlat > b.getNorth();
      if (out || p.age > 90 || speed < 0.5) {
        this.respawn(p, b);
        p.age = 0;
      }
    }
    lines.forEach((xy, i) => {
      if (!xy.length) return;
      ctx.strokeStyle = STYLES[i];
      ctx.beginPath();
      for (let j = 0; j < xy.length; j += 4) {
        ctx.moveTo(xy[j], xy[j + 1]);
        ctx.lineTo(xy[j + 2], xy[j + 3]);
      }
      ctx.stroke();
    });
  };
}
