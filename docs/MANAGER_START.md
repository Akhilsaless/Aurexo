# AUREXO: owner and manager start guide

App: https://aurexo-backend.akhil-khali-111.workers.dev

## Owner activation
1. Complete the Google OAuth web client. Exact redirect: https://aurexo-backend.akhil-khali-111.workers.dev/api/auth/google/callback
2. Save its client ID and client secret in Cloudflare runtime secrets GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET. Keep AUREXO_ENCRYPTION_KEY stable. No credentials belong in chat.
3. Sign in with akhil.khali.111@gmail.com. Ask the manager to sign in with Google. Refresh Team access and approve her request. Revoke access there when necessary.
4. Add Gemini and/or OpenAI key plus the text model ID in Integrations, permit the small test, activate. Gemini animation access must be available separately; a text test does not establish video access.
5. Connect a Google OAuth application and YouTube channel through the owner-only social connection panel. Its publishing callback is /api/oauth/youtube/callback. Google may require test-user registration or app verification for the requested publishing and analytics scopes.

## Manager daily workflow
1. Sign in with your own Google account after owner approval.
2. Create an idea; select Kids Content Mode and age group where applicable. Include reliable source notes and learning goal. Generate the plan using an active provider.
3. Read and revise every script and scene. Check facts and audience suitability. Approve the plan in Review.
4. Open the project. Generate animated scenes individually, confirm provider usage, and refresh progress. The default cap is three video requests daily; each clip is up to ten seconds. Inspect provider usage for any needs-attention job; do not start duplicate requests.
5. Preview every clip, then Assemble animated scenes. Keep the browser tab visible during assembly. Alternatively generate narration/illustration and use the local captioned Nova renderer, or upload an edited finished video.
6. Preview the entire video, download a backup, save it to the secure backend and complete final-media approval. Check voices, facts, captions, rights, age suitability, disclosures and platform metadata.
7. Start with an unlisted YouTube upload. Confirm the video in YouTube Studio. Only then use public publishing or scheduling.
8. Review actual analytics and improve the next video.

## Ownership and boundaries
The owner keeps billing, recovery, provider keys and social-account connections. AUREXO Manager permission does not grant direct YouTube Studio membership; the channel owner must separately invite the manager through YouTube channel permissions if she needs direct channel administration. Do not share a Google password.

Local drafts and rendered media live on the device until synced/uploaded. Use separate browser profiles on shared computers and keep backups. An API request limit is not a financial budget; set provider spending controls too.

## Release verification still required
Real owner and manager Google sign-in/approval, paid video generation and assembled playback, server save/restore, unlisted upload, scheduling and analytics must pass with the real accounts before treating this as fully operational.
