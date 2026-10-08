# Contributing to Pantaulah

Bug fixes, data corrections, accessibility improvements, and documentation updates are welcome. For a large feature or a new data provider, open an issue first to discuss scope and maintenance needs.

## Local setup

Use Node.js 24 and npm. Fork and clone the repository, then run:

```bash
npm ci
cp .env.example .env.local
npm run dev
```

Open [localhost:3000](http://localhost:3000). Cached datasets and map geometry are included; ingestion and API keys are optional for core features.

Read the [development guide](docs/DEVELOPMENT.md) for architecture and deployment, and the [data reference](docs/DATA.md) before changing data processing.

## Reporting an issue

Use [GitHub Issues](https://github.com/atzr95/pantaulah/issues). Search existing issues first, then include:

- The affected page, metric, or feed, and the state or location if relevant.
- Steps to reproduce, expected behavior, and actual behavior.
- Browser, device, and approximate time with timezone.
- A screenshot or a short log, with secrets and personal data removed.

For incorrect data, also include the displayed year or timestamp and a link to the source observation you expect. Source publication and app refresh schedules differ; an older dataset is not always a bug.

Report vulnerabilities privately using [SECURITY.md](SECURITY.md).

## Making changes

- Keep each pull request focused on one change.
- Prefer simple implementations and use TypeScript types to make assumptions clear.
- Follow [PRODUCT.md](PRODUCT.md) and [DESIGN.md](DESIGN.md) for UI changes. Check desktop and mobile layouts, keyboard use, and reduced motion where relevant.
- Add focused tests when changing behavior. Documentation-only changes do not need application tests.
- Update documentation when commands, configuration, data sources, or behavior change.
- Keep credentials out of commits. Use `.env.local` locally.

## Generated data

Do not edit generated cache or geometry files by hand. Change the processing script or source mapping, then run the relevant command in the [data reference](docs/DATA.md#ingestion).

Only regenerate files affected by your change. Review the diff for missing values, unexpected coverage changes, and unrelated updates. Explain the source and processing changes in the pull request. Preserve provider attribution when adding or changing datasets.

Camera coordinates in `src/lib/data/cctv-coords.json` are maintained by camera name and can be updated directly when verified.

## Checks and pull requests

For code changes, run:

```bash
npm test
npm run lint
npm run build
```

For Cloudflare-specific changes, also use `npm run preview` to check the Worker build locally. Deployment is handled by the maintainer.

Describe the problem, the resulting behavior, and how you checked the change. Include before-and-after screenshots for visible UI changes. Name any remaining limitation or source outage that affected verification.

For documentation-only changes, check Markdown formatting, relative links, and any commands you changed.
