# AUREXO Cloudflare backend setup

AUREXO's public frontend stays on GitHub Pages. The Worker in `cloudflare-worker/` is the secure runtime for API secrets, AI routing and social OAuth.

## Deploy
1. In Cloudflare, create/import a Worker from the GitHub repository `Akhilsaless/Aurexo`.
2. Set the project/root directory to `cloudflare-worker`.
3. Deploy using Wrangler (`npm run deploy`).
4. Ensure the `AUREXO_KV` binding exists. If Cloudflare does not auto-provision it from `wrangler.toml`, create a KV namespace and bind it as `AUREXO_KV`.
5. Copy the resulting `https://<worker>.workers.dev` URL.

## Secrets
Add only the services you want. Paid services can remain absent/off.

AI Hub: `AI_HUB_URL`, optional `AI_HUB_API_KEY`.
AI fallbacks: `OPENROUTER_API_KEY` + `OPENROUTER_MODEL`; `GROQ_API_KEY` + `GROQ_MODEL`; `QWEN_API_KEY` + `QWEN_BASE_URL` + `QWEN_MODEL`; `DEEPSEEK_API_KEY` + `DEEPSEEK_MODEL`; `KIMI_API_KEY` + `KIMI_BASE_URL` + `KIMI_MODEL`; `GEMINI_OPENAI_API_KEY` + `GEMINI_OPENAI_BASE_URL` + `GEMINI_MODEL`; optional paid `OPENAI_API_KEY` + `OPENAI_MODEL`.

YouTube: `YOUTUBE_CLIENT_ID`, `YOUTUBE_CLIENT_SECRET`.
Meta: `META_APP_ID`, `META_APP_SECRET`; optional `META_GRAPH_VERSION`.
Video slots: `RUNWAY_API_KEY`, `PIKA_API_KEY`, `KLING_API_KEY`, `HAILUO_API_KEY`, plus provider base URLs where required. Open/self-hosted Wan/Hunyuan can use their own base URLs.

Never put provider secrets in the GitHub Pages frontend or commit them to this repository.

## OAuth redirect URIs
After deployment, configure provider developer consoles to use:
- YouTube/Google: `https://<worker>.workers.dev/api/oauth/youtube/callback`
- Meta: `https://<worker>.workers.dev/api/oauth/meta/callback`

## Verification
Open `https://<worker>.workers.dev/api/health`. It should return JSON containing `"ok": true`.
Open `/api/providers` to see which provider slots are configured without exposing secret values.

The Worker enforces explicit campaign approval before its social publish route will proceed and never reports a fake publication when no real media has been supplied.
