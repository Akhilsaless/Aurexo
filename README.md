# AUREXO Studio

A simpler, single-owner content planning workspace built from the existing AUREXO repository. The five screens are Create, Projects, Review, Publish and Integrations. Kids Content Mode configures the existing 16-role workflow rather than adding subscriptions or agents.

## What this version implements

- Manual ideas, source notes, editable content mode and age group.
- Real Gemini/OpenAI text generation through a private backend, returning scripts, scenes, platform copy, thumbnail direction and review flags.
- Owner sign-in, secure session cookies, origin checks, request size limits and login throttling.
- Integration forms: save, test, encrypt, activate and disconnect. Failed tests never activate a key. Saved keys never return to the browser.
- Local project persistence and explicit backups; optional server persistence and sign-in recovery.
- Human content-plan approval with required review acknowledgements.
- JSON briefs and original SVG text covers for manual production/publishing.
- Automated backend and DOM tests plus GitHub Actions validation.

## Run and verify

Node.js 22 or later:

```
npm ci
npm test
npm run check
npm run build
npm start
```

The static preview is http://127.0.0.1:4173. Local manual ideas work without credentials. The authenticated backend is required for live AI.

## Deploy

See [Cloudflare setup](docs/CLOUDFLARE_SETUP.md). Serve frontend and API together from the Worker. The GitHub Pages frontend alone cannot store keys securely or perform live AI requests.

## Production status

This is a reviewed implementation increment, **not the complete autonomous production company**. See [remaining work and release gates](docs/PRODUCTION_STATUS.md). Do not represent a content plan as a rendered video, an AI assertion as fact verification, or a manual upload as a confirmed platform publication.
