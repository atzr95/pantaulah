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
  { name: "OpenSky Network", url: "https://opensky-network.org", description: "Live flight tracking" },
  { name: "LLM.gov.my", url: "https://www.llm.gov.my", description: "Highway CCTV feeds" },
  { name: "MyEnergyStats", url: "https://myenergystats.st.gov.my", description: "Electricity consumption & generation" },
  { name: "KKMNow", url: "https://data.gov.my", description: "Hospital bed & ICU utilization" },
];

const GITHUB_URL = "https://github.com/atzr95/pantaulah";

export default function AboutPage() {
  return (
    <main className="min-h-screen bg-[var(--color-bg)] scan-lines grid-bg">
      {/* Header */}
      <div
        className="border-b"
        style={{ borderColor: "rgba(0, 212, 255, 0.1)", background: "linear-gradient(180deg, #0d0d14 0%, #0a0a0f 100%)" }}
      >
        <div className="max-w-3xl mx-auto px-6 py-6 flex items-center justify-between">
          <div>
            <Link
              href="/"
              className="text-[10px] tracking-[3px] text-[var(--color-text-dim)] hover:text-[var(--color-cyan)] transition-colors"
            >
              PANTAULAH
            </Link>
            <h1 className="text-xl font-bold tracking-wider text-[var(--color-text-bright)] mt-1">
              ABOUT
            </h1>
          </div>
          <Link
            href="/"
            className="text-[10px] tracking-[2px] px-3 py-1.5 border rounded text-[var(--color-text-muted)] border-[rgba(0,212,255,0.2)] hover:border-[var(--color-cyan)] hover:text-[var(--color-cyan)] transition-all"
          >
            BACK TO DASHBOARD
          </Link>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-6 py-10 space-y-12">
        {/* Project description */}
        <section>
          <h2 className="text-[10px] tracking-[3px] text-[var(--color-cyan)] mb-4">
            PROJECT
          </h2>
          <p className="text-sm text-[var(--color-text-muted)] leading-relaxed">
            PANTAULAH is a fun side project, vibecoded into existence. A real-time intelligence
            dashboard for Malaysia that synthesizes 50+ government metrics across all 16 states
            and federal territories into an interactive choropleth map — covering economy, crime,
            health, transport, education, and energy. Live feeds include weather, highway CCTV,
            flight tracking, exchange rates, and fuel prices.
          </p>
          <p className="text-sm text-[var(--color-text-muted)] leading-relaxed mt-3">
            All data is sourced from official Malaysian government APIs. No API keys are
            required for core functionality.
          </p>
        </section>

        {/* Tech stack */}
        <section>
          <h2 className="text-[10px] tracking-[3px] text-[var(--color-cyan)] mb-4">
            TECH STACK
          </h2>
          <div className="flex flex-wrap gap-2">
            {["Next.js 16", "React 19", "TypeScript", "Tailwind CSS", "D3-Geo", "Recharts", "TopoJSON"].map((tech) => (
              <span
                key={tech}
                className="text-[10px] tracking-wider px-2.5 py-1 rounded-sm border text-[var(--color-text-muted)]"
                style={{ borderColor: "rgba(0, 212, 255, 0.15)", background: "rgba(0, 212, 255, 0.04)" }}
              >
                {tech}
              </span>
            ))}
          </div>
        </section>

        {/* Data sources */}
        <section>
          <h2 className="text-[10px] tracking-[3px] text-[var(--color-cyan)] mb-4">
            DATA SOURCES
          </h2>
          <div className="space-y-2">
            {DATA_SOURCES.map((source) => (
              <div
                key={source.name}
                className="flex items-baseline gap-3 text-sm"
              >
                <a
                  href={source.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[var(--color-text-bright)] hover:text-[var(--color-cyan)] transition-colors shrink-0"
                >
                  {source.name}
                </a>
                <span className="text-[var(--color-text-dim)] text-xs">
                  {source.description}
                </span>
              </div>
            ))}
          </div>
        </section>

        {/* Contribute */}
        <section>
          <h2 className="text-[10px] tracking-[3px] text-[var(--color-cyan)] mb-4">
            CONTRIBUTE
          </h2>
          <p className="text-sm text-[var(--color-text-muted)] leading-relaxed mb-4">
            PANTAULAH is open source. Suggestions, bug reports, and pull requests are welcome.
          </p>
          <div className="flex gap-3">
            <a
              href={GITHUB_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[10px] tracking-[2px] px-4 py-2 rounded-sm border text-[var(--color-cyan)] border-[var(--color-cyan)] hover:bg-[rgba(0,212,255,0.1)] transition-all"
            >
              VIEW ON GITHUB
            </a>
            <a
              href={`${GITHUB_URL}/issues/new`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[10px] tracking-[2px] px-4 py-2 rounded-sm border text-[var(--color-text-muted)] border-[rgba(0,212,255,0.2)] hover:border-[var(--color-cyan)] hover:text-[var(--color-cyan)] transition-all"
            >
              REPORT ISSUE
            </a>
          </div>
        </section>

        {/* License */}
        <section className="pb-10">
          <h2 className="text-[10px] tracking-[3px] text-[var(--color-cyan)] mb-4">
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
