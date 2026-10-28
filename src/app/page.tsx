import type { Metadata } from "next";
import Link from "next/link";
import HomeView from "./home-view";
import { buildJsonLd, METRIC_CATEGORIES, serializeJsonLd, STATE_LIST } from "@/lib/seo";
import { DATA_SOURCES, LIVE_FEEDS, SITE_DESCRIPTION, SITE_TITLE } from "@/lib/site";

export const metadata: Metadata = {
  alternates: { canonical: "/" },
};

export default function Page() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(buildJsonLd()) }}
      />
      {/* The dashboard renders client-side only; this is what crawlers and screen readers can read without it. */}
      <section className="sr-only" aria-labelledby="site-summary-title">
        <h1 id="site-summary-title">{SITE_TITLE}</h1>
        <p>{SITE_DESCRIPTION}</p>
        <h2>State metrics</h2>
        {METRIC_CATEGORIES.map((category) => (
          <div key={category.name}>
            <h3>{category.name}</h3>
            <ul>
              {category.metrics.map((m) => (
                <li key={m.label}>{m.label}: {m.description}</li>
              ))}
            </ul>
          </div>
        ))}
        <h2>Live feeds</h2>
        <ul>
          {LIVE_FEEDS.map((feed) => <li key={feed}>{feed}</li>)}
        </ul>
        <h2>States and federal territories</h2>
        <ul>
          {STATE_LIST.map((s) => (
            <li key={s.name}>{s.name}{s.isFederalTerritory ? " (federal territory)" : ""}, capital {s.capital}</li>
          ))}
        </ul>
        <h2>Data sources</h2>
        <ul>
          {DATA_SOURCES.map((source) => (
            <li key={source.name}><a href={source.url}>{source.name}</a>: {source.description}</li>
          ))}
        </ul>
        <p><Link href="/about">About Pantaulah</Link></p>
      </section>
      <HomeView />
    </>
  );
}
