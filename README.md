# AUREXO — AI Media Operating System

AUREXO is a personal, free-first multi-platform AI media control room for YouTube, Instagram and Facebook.

## Current live layer
- Mission Control, Discover, Studio, Review, Calendar, Publishing Hub, Growth Intelligence, Library and Settings.
- 16-agent orchestration model.
- Zero-Cost Lock ON by default.
- Universal AI Hub connector (separate service) plus optional Qwen, DeepSeek, Kimi, Gemini, Groq, OpenRouter and OpenAI slots.
- Hybrid/free-first video plus optional Wan, Hunyuan, Kling, Hailuo, Pika, Runway and custom video slots.
- Optional voice/storage slots.
- PWA/offline shell and browser-local state.

## Security boundary
The public frontend never stores provider API secrets. Live AI calls, social OAuth/publishing, analytics sync and secret-bearing video calls must go through the secure backend layer (Cloudflare Worker recommended). Until that backend is connected, AUREXO uses explicit demo/manual-publish states rather than pretending an external action succeeded.

Universal AI Hub is a separate project/service. AUREXO connects to it through the secure backend; Hub source is intentionally not embedded in this repository.
