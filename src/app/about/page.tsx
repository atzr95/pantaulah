import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "About — PANTAULAH",
  description:
    "About the PANTAULAH Malaysia Intelligence Terminal. Open source, built with public government data.",
};

const DATA_SOURCES = [
  { name: "data.gov.my", url: "https://developer.data.gov.my", description: "Demographics, GDP, crime, health, education, weather, fuel prices" },
  { name: "DOSM", url: "https://storage.dosm.gov.my", description: "Population estimates, GDP & crime publications" },
  { name: "BNM API", url: "https://api.bnm.gov.my", description: "Exchange rates, OPR" },
  { name: "Open-Meteo", url: "https://open-meteo.com", description: "Current weather, air quality" },
  { name: "MET Malaysia", url: "https://api.met.gov.my", description: "Radar & satellite imagery" },
  { name: "USGS", url: "https://earthquake.usgs.gov", description: "Live regional seismic catalogue" },
  { name: "OpenSky Network", url: "https://opensky-network.org", description: "Live flight tracking" },
  { name: "LLM.gov.my", url: "https://www.llm.gov.my", description: "Highway CCTV feeds" },
  { name: "MyEnergyStats", url: "https://myenergystats.st.gov.my", description: "Electricity consumption & generation" },
  { name: "KKMNow", url: "https://data.gov.my", description: "Hospital bed & ICU utilization" },
];

const GITHUB_URL = "https://github.com/atzr95/pantaulah";

export default function AboutPage() {
  return (
    <main className="min-h-screen w-full max-w-full overflow-x-hidden bg-[var(--color-bg)] scan-lines grid-bg">
      {/* Header */}
      <div
        className="border-b"
        style={{ borderColor: "var(--color-border-mid)", background: "linear-gradient(180deg, var(--color-bg-panel) 0%, var(--color-bg) 100%)" }}
      >
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6 flex items-center justify-between gap-4">
          <div>
            <Link
              href="/"
              className="text-xs tracking-[0.12em] text-[var(--color-text-dim)] hover:text-[var(--color-cyan)] transition-colors"
            >
              PANTAULAH
            </Link>
            <h1 className="text-xl font-bold tracking-wider text-[var(--color-text-bright)] mt-1">
              ABOUT
            </h1>
          </div>
          <Link
            href="/"
            className="text-xs tracking-[0.08em] px-3 py-1.5 border rounded text-[var(--color-text-muted)] border-[var(--color-border-mid)] hover:border-[var(--color-cyan)] hover:text-[var(--color-cyan)] transition-all"
          >
            <span className="sm:hidden">DASHBOARD</span>
            <span className="hidden sm:inline">BACK TO DASHBOARD</span>
          </Link>
        </div>
      </div>

      <div className="w-full max-w-3xl mx-auto px-4 sm:px-6 py-8 sm:py-10 space-y-12">
        {/* Project description */}
        <section>
          <h2 className="text-xs tracking-[0.12em] text-[var(--color-cyan)] mb-4">
            PROJECT
          </h2>
          <p className="break-words text-sm leading-7 text-[var(--color-text-muted)]">
            PANTAULAH is a fun side project, vibecoded into existence. A real-time intelligence
            dashboard for Malaysia that synthesizes 50+ government metrics across all 16 states
            and federal territories into an interactive choropleth map — covering economy, crime,
            health, transport, education, and energy. Live feeds include weather, highway CCTV,
            flight tracking, exchange rates, and fuel prices.
          </p>
          <p className="mt-3 break-words text-sm leading-7 text-[var(--color-text-muted)]">
            Government sources are used where available, with named third-party live feeds
            for current conditions, flights, and seismic activity. No API keys are required
            for core functionality.
          </p>
        </section>

        {/* Tech stack */}
        <section>
          <h2 className="text-xs tracking-[0.12em] text-[var(--color-cyan)] mb-4">
            TECH STACK
          </h2>
          <div className="flex flex-wrap gap-2">
            {["Next.js 16", "React 19", "TypeScript", "Tailwind CSS", "D3-Geo", "Recharts", "TopoJSON"].map((tech) => (
              <span
                key={tech}
                className="text-xs tracking-wider px-2.5 py-1 rounded-sm border text-[var(--color-text-muted)]"
                style={{ borderColor: "rgba(0, 212, 255, 0.15)", background: "rgba(0, 212, 255, 0.04)" }}
              >
                {tech}
              </span>
            ))}
          </div>
        </section>

        {/* Data sources */}
        <section>
          <h2 className="text-xs tracking-[0.12em] text-[var(--color-cyan)] mb-4">
            DATA SOURCES
          </h2>
          <div className="space-y-2">
            {DATA_SOURCES.map((source) => (
              <div
                key={source.name}
                className="flex min-w-0 flex-col gap-1 text-sm sm:flex-row sm:items-baseline sm:gap-3"
              >
                <a
                  href={source.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[var(--color-text-bright)] hover:text-[var(--color-cyan)] transition-colors shrink-0"
                >
                  {source.name}
                </a>
                <span className="min-w-0 break-words text-xs leading-5 text-[var(--color-text-dim)]">
                  {source.description}
                </span>
              </div>
            ))}
          </div>
        </section>

        {/* Data freshness */}
        <section>
          <h2 className="text-xs tracking-[0.12em] text-[var(--color-cyan)] mb-4">
            DATA FRESHNESS
          </h2>
          <p className="break-words text-sm leading-7 text-[var(--color-text-muted)]">
            Government datasets publish on different schedules, so not every metric is
            equally current. Live feeds (weather, floods, transit, flights, CCTV, exchange
            rates) refresh in seconds to minutes. Monthly statistics (CPI, trade, inflation,
            vehicle registrations) follow each agency&apos;s publication cycle. Annual
            statistics (GDP, crime, education, health infrastructure) can lag one to two
            years behind. Each value on the dashboard carries a vintage tag when it comes
            from an older year than the one selected.
          </p>
        </section>

        {/* Contribute */}
        <section>
          <h2 className="text-xs tracking-[0.12em] text-[var(--color-cyan)] mb-4">
            CONTRIBUTE
          </h2>
          <p className="mb-4 break-words text-sm leading-7 text-[var(--color-text-muted)]">
            PANTAULAH is open source. Suggestions, bug reports, and pull requests are welcome.
          </p>
          <div className="flex gap-3">
            <a
              href={GITHUB_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs tracking-[0.08em] px-4 py-2 rounded-sm border text-[var(--color-cyan)] border-[var(--color-cyan)] hover:bg-[rgba(0,212,255,0.1)] transition-all"
            >
              VIEW ON GITHUB
            </a>
            <a
              href={`${GITHUB_URL}/issues/new`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs tracking-[0.08em] px-4 py-2 rounded-sm border text-[var(--color-text-muted)] border-[var(--color-border-mid)] hover:border-[var(--color-cyan)] hover:text-[var(--color-cyan)] transition-all"
            >
              REPORT ISSUE
            </a>
          </div>
        </section>

        {/* License */}
        <section className="pb-10">
          <h2 className="text-xs tracking-[0.12em] text-[var(--color-cyan)] mb-4">
            LICENSE
          </h2>
          <p className="text-sm text-[var(--color-text-muted)]">
            MIT License. See{" "}
            <a
              href={`${GITHUB_URL}/blob/main/LICENSE`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[var(--color-text-bright)] hover:text-[var(--color-cyan)] transition-colors"
            >
              LICENSE
            </a>{" "}
            for details.
          </p>
        </section>
      </div>
    </main>
  );
}
