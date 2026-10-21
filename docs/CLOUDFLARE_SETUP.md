# Cloudflare deployment: Studio v2

Deploy the static app and backend together so secure SameSite cookies work. A GitHub Pages page calling an unrelated workers.dev origin is not supported by this session model.

1. Run `npm ci`, `npm test`, `npm run check`, and `npm run build` at the repository root.
2. Install backend development dependencies in `cloudflare-worker` using `npm install`.
3. Create a Cloudflare KV namespace. Add its ID to the `AUREXO_KV` binding in `cloudflare-worker/wrangler.toml`.
4. Set `AUREXO_ALLOWED_ORIGIN` to the exact HTTPS origin that will serve the app (no trailing slash or path). Update `AUREXO_FRONTEND_URL` to match.
5. Set Worker secrets using Cloudflare's secure dashboard or `wrangler secret put`: `AUREXO_OWNER_PASSWORD` (unique, at least 16 characters) and `AUREXO_ENCRYPTION_KEY` (64 random hexadecimal characters; preserve it securely across redeployments). Never commit these values.
6. Deploy from `cloudflare-worker` using `npm run deploy`. Wrangler serves `../dist` through its ASSETS binding and `/api/*` through `src/studio.js`.
7. Open the deployed app, enter that same origin in Integrations, then sign in using the owner password.
8. When ready, enter Gemini or OpenAI API key plus an accessible model ID. Confirm the small connection test. The key is tested, encrypted with AES-GCM in KV, and activated only on success. No provider key is needed during initial development.
9. Generate one small test plan, reload, sign in again, recover server projects, review and export. Run these checks with actual provider accounts before enabling everyday usage.

Owner password, session and provider key values must never be entered in GitHub issues, commits or chat. Provider keys are stored encrypted; only status, model and test time are returned by the API. Rotating the encryption key requires re-entering provider keys.

## Security and operational limitations

- Single-owner deployment; not a multi-user SaaS identity system.
- KV is eventually consistent. Login throttling is best effort; configure Cloudflare edge rate limiting before public exposure. Concurrent edits from multiple tabs/devices may overwrite each other; conflict-safe persistence remains a release gate.
- Sessions expire after eight hours. Sign out revokes the current session. Rotate credentials and clear sessions through server administration if compromise is suspected.
- Backup files include scripts and source notes; store them privately. Provider keys and owner credentials are excluded.
- Same-origin hosting is recommended. No wildcard CORS and no browser-side provider API calls.
- The original `src/index.js` Worker entry is legacy code and is not deployed. The configured entry is `src/studio.js`; legacy AI/OAuth endpoints return no capability from this API.
- Provider calls have a timeout. There is no automatic retry that might duplicate paid requests. Provider quota and spend enforcement must be configured in provider dashboards until measured budgets exist.
