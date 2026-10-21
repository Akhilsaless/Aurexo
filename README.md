# AUREXO Studio

A five-screen content workspace: **Create → Projects → Review → Publish → Integrations**. The 16 logical production roles share one orchestrated project workflow. Kids Content Mode configures the same team for an age group and learning goal.

## Workflows

Discover headlines, retrieve educational source text, generate a Gemini/OpenAI plan, edit scripts/scenes/platform copy, run critical source review, approve the plan, create voice/illustrations or upload original assets, render a playable Nova motion video, review its final media and queue a connected social account. YouTube resumable uploads and Durable Object scheduling preserve job state. Performance sync feeds evidence-based suggestions.

Without credentials, manual writing, local media rendering, PNG/SRT/JSON export, backups and legacy-draft import remain available. Add Gemini/OpenAI credentials later through encrypted Integrations forms. The original Lovable demo is separate from this repository.

## Development

```
npm ci
npm run check
npm test
npm run build
npm start
```

Local preview: http://127.0.0.1:4173 . `npm run verify:runtime` exercises the real Cloudflare runtime locally; workerd must be permitted by your OS. CI runs tests, native PNG rendering, runtime verification and a deployment bundle dry-run on Linux.

See [deployment](docs/CLOUDFLARE_SETUP.md) and [release status and limits](docs/PRODUCTION_STATUS.md). A merged frontend is not proof of a deployed backend or successfully connected provider accounts.
