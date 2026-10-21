# AUREXO Studio — release status

## Implemented

| Workflow                                 | Implementation                                                                                                                                                                                                    |
| ---------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Discovery and scoring                    | Current headline feed; transparent freshness/fit/effort heuristic, not a prediction of views                                                                                                                      |
| Research and fact review                 | Restricted educational-source retrieval, source notes and separate AI reviewer with exact-quote checks; human verification remains required                                                                       |
| Strategy, writing and creative direction | Gemini/OpenAI content plans, script and scene revision, brand direction and platform metadata                                                                                                                     |
| Nova, direction and editing              | Original animated Nova mascot, local 720×1280 video recording, optional uploaded or OpenAI narration, original/uploaded/AI illustration and caption/SRT export                                                    |
| Thumbnail                                | Original PNG/SVG cover export plus optional OpenAI illustration                                                                                                                                                   |
| Platform adaptation                      | Editable YouTube/Instagram/Facebook titles and captions; vertical media export. Instagram/Facebook uploads require MP4                                                                                            |
| Quality and approval                     | Separate plan and final-media review; reviewed media and plan snapshots enforced on the server; edits invalidate approval                                                                                         |
| Publishing                               | Encrypted YouTube/Meta OAuth configuration and tokens, YouTube refresh and resumable upload, Instagram container processing/publish and Facebook upload processing                                                |
| Scheduling                               | Transactionally queued Durable Object alarms, duplicate job protection, interrupted-job handling, cancel and safe YouTube session resume                                                                          |
| Growth and optimization                  | YouTube API reports, Meta metric adapters with explicit unsupported/error states, evidence-based suggestions; no fabricated metrics                                                                               |
| Persistence and security                 | Single-owner sessions, encrypted provider/social credentials, transactional revisions, request/login limits, body limits, private R2 media, short-lived signed fetch URLs, backup/restore and legacy-draft import |

The 16 logical roles share these capabilities and the same project state. They are not 16 subscriptions. Source review is not a guarantee of truth or legal compliance.

## Validation evidence

- Backend, DOM, editorial, media timing/storage, source restrictions and publish recovery tests run locally.
- Cloudflare deployment bundle dry-run succeeds.
- Native Canvas and the Cloudflare workerd executable are blocked by Windows application control on this machine; the corresponding real PNG and Durable Object runtime checks run in Linux GitHub CI. Check the latest CI result before release.
- The merged five-screen frontend was opened successfully at https://akhilsaless.github.io/Aurexo/ . Browser testing of the new production controls is recorded after merge.

## Required activation and external verification

The app and Durable Object backend are deployed at https://aurexo-backend.akhil-khali-111.workers.dev with a private R2 bucket. Runtime secrets exist; the earlier owner-password value was below the required length and cannot authenticate. Health now validates the actual password length and encryption-key format. Google login implementation requires GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in Cloudflare before use. AI keys and social OAuth app credentials remain intentionally deferred.

Live provider requests, OAuth consent, media playback on target devices, social account eligibility/permissions, real upload/processing, real scheduled jobs and analytics must be exercised in staging with the actual accounts. Until that evidence exists, this is an implementation ready for activation and release verification, **not a claim that the whole service is already operational**.

## Product limits

- Single-owner workspace, not a multi-user SaaS.
- Native graphics/motion-video renderer, not a photorealistic avatar or generative-video model. External edited MP4s can be uploaded.
- Captions use estimated word timing; final playback review is required.
- Keep the rendering tab visible. Browser encoding format/support varies; use uploaded MP4s when a target platform requires MP4.
- Cloudflare upload limit in this app: 40 MB/video. Narration/image files are capped separately.
- API/account restrictions can keep uploads private or deny metrics even with valid credentials. Such states require owner attention and are not reported as successful publication.
- A platform can accept a request and lose the response. Ambiguous operations are held for inspection rather than retried blindly. No distributed system can promise exactly-once publication without platform support.
- Media blobs are stored separately from JSON project backups. Download original media and export R2 objects when taking a complete backup.
- The Lovable demo is a separate application. This repository is the selected implementation; it does not modify that demo automatically.

## Owner and manager access

Google OIDC verifies signature, issuer, audience, expiry, nonce, browser-bound one-time state and PKCE. The configured owner is akhil.khali.111@gmail.com. Other verified Google accounts request access; only the owner can approve Manager access. Revocation is checked on every request. Managers can create, review, use activated providers and publish; API keys, social connections and team changes remain owner-only.

## AI animation

Gemini Omni scene generation runs through Durable Object alarms and stores real returned MP4 bytes in private R2. Requests are deduplicated by scene and exact plan fingerprint. Default daily limit is three clips, up to ten seconds each. Ambiguous/interrupted requests need attention and are never blindly retried. Browser assembly retains clip audio in scene order. This integration and assembly require live provider and target-browser verification; mock contract tests are not evidence of provider access, character consistency or output quality.

Current limitations: no phoneme/lip synchronization or guaranteed identical character/voice across generated clips; generated narration and captions need human inspection. Automatic captions are available for the local motion renderer; the animated-clip assembler retains original generated audio and does not create verified word-aligned captions. Longer videos require more clips and a deliberately raised owner request cap.

## Deployment and browser evidence (21 October 2026)

PR #4 is merged (52e17a77146de9587961e079dc011b459d9ed394). Main CI and Pages deployment passed. Cloudflare shows that commit Ready at 100% traffic (version af7a72f1). The real browser assembly diagnostic combined two original animated test clips into a playable 720×1280 MP4 (180,532 bytes, 3.90 seconds). This proves the encoder/assembly path, not paid provider output quality or successful publishing. Google OAuth client AUREXO Studio has been created with owner confirmation; secure credential entry is pending.
