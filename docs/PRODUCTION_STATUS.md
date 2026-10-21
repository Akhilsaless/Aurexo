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

Cloudflare CLI currently reports **not authenticated**. The backend has not been deployed to a real account. Hosting needs a Cloudflare sign-in, an R2 bucket, and server owner/encryption secrets. AI keys and social OAuth app credentials are intentionally deferred and can be entered through Integrations after deployment.

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
