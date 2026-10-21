# Deploy AUREXO Studio

Serve the app and API from the same Cloudflare Worker. GitHub Pages hosts the static/local workspace only; it cannot hold provider secrets or run the scheduled backend.

1. Use Node.js 22+. At the repository root run `npm ci`, `npm run check`, `npm test`, `npm run build`, and `npm run verify:runtime` on an OS that permits Cloudflare workerd.
2. Sign in with `npx wrangler login`. This opens Cloudflare’s consent flow; do not put account credentials in this repository or chat.
3. Create the private bucket with `npx wrangler r2 bucket create aurexo-media` (or update the existing bucket name in `cloudflare-worker/wrangler.toml`). R2 must be enabled on the account.
4. Set backend secrets with `npx wrangler secret put AUREXO_OWNER_PASSWORD --config cloudflare-worker/wrangler.toml` and `npx wrangler secret put AUREXO_ENCRYPTION_KEY --config cloudflare-worker/wrangler.toml`. Choose a unique owner password with at least 16 characters and a securely generated 64-character hexadecimal encryption key. Keep that key stable across deployments and backed up privately.
5. Run `npx wrangler deploy --config cloudflare-worker/wrangler.toml`. The configured SQLite Durable Object is provisioned by the migration; media uses R2. No external KV namespace is required by this version.
6. Open the deployed Worker URL. The app discovers its same-origin backend. Sign in under Integrations.
7. When ready, enter Gemini/OpenAI keys and model IDs, allow the small test and activate. AI narration and illustrations use OpenAI, independently of the selected text provider. Optional Worker variables `OPENAI_TTS_MODEL` and `OPENAI_IMAGE_MODEL` override the defaults. Provider-model access must be tested in your account.
8. For automatic publishing, register Google/Meta OAuth apps and put their client/app IDs and secrets in the encrypted Integrations forms. Register these exact redirect URIs using the deployed origin:
   - `/api/oauth/youtube/callback`
   - `/api/oauth/meta/callback`
     Meta also requires your Facebook Page ID, Graph API version and the linked Instagram professional account. App permissions, review and eligibility must be accepted by the platforms. Reconnect accounts after changing scopes.
9. Generate or edit one small project, approve its plan, add narration/image, render and review the video, upload it to backend storage and complete final-media approval. Start with an unlisted YouTube upload. Check the platform confirmation and processing status, then test a future schedule and analytics sync.

## Security/operations

- All protected requests go through the single-owner Durable Object. Session and API keys stay server-side; OAuth tokens are encrypted with AES-GCM.
- Same-origin HTTPS is the default. A separate same-site API origin requires an exact `AUREXO_ALLOWED_ORIGIN`. Cross-site GitHub Pages → workers.dev session cookies are not supported.
- Request limits are transactional: login, provider tests, content review/generation, voice and image calls are bounded. `AUREXO_DAILY_AI_LIMIT` can lower the default 100 text-generation/review calls per day. Set financial spend caps at the providers too; request caps are not currency budgets.
- Enable Cloudflare’s account-level traffic controls, monitoring and alerts for the intended load. Worker observability is enabled; application error responses exclude keys and provider payloads.
- Script saves use optimistic revisions. If another device changed the workspace, the app refuses to overwrite it. Download a local backup, then load server projects to resolve the conflict.
- Every publish job stores the reviewed plan/media identity. Replacing content blocks old jobs. Inspect `needs_attention` jobs in the platform console; safe resume reuses the existing YouTube upload session.
- Backups include project JSON, not media bytes or credentials. Download videos/audio/images and maintain a private R2 backup. Test restore before relying on the service.
- Rollback by redeploying a known good Git commit. Keep the encryption key and Durable Object class/migration identity stable. Restoring project JSON must not automatically recreate publication jobs.
- Earlier browser drafts can be imported from Projects without deleting the old storage key. Old simulated approval/publication state is not trusted.
