# CloudVault — Open Source Cloud Storage (Next.js + Convex + Telegram)

CloudVault is an open source, privacy‑minded file manager built on the modern web stack. Files are stored in Telegram via a bot (as encrypted chunks), while metadata and queries are powered by Convex. The UI is a responsive Next.js app with optimistic updates and a rich upload experience.

## Tech Stack
- **Framework**: Next.js 15 (App Router) + React 19
- **Styling**: Tailwind CSS v4
- **State**: Zustand (persisted client store with optimistic updates)
- **Auth**: NextAuth.js (Google provider)
- **Backend DB/Queries**: Convex (TypeScript schema + serverless mutations/queries)
- **Storage**: Telegram Bot API (document uploads as encrypted 5MB chunks)
- **Images/Video**: Sharp (thumbnails), optional Telegram previews
- **UI primitives**: Radix UI + shadcn-inspired components
- **Icons**: lucide-react

## Key Features
- **Folder/file manager** with breadcrumbs and selection
- **Chunked uploads** with pause/resume/cancel and real‑time progress
- **Optimistic UI**: files appear instantly while Convex snapshot catches up
- **Telegram-backed storage**: data redundancy without S3 costs
- **Google Sign‑In** via NextAuth

## Repository Structure
```
app/                      # Next.js App Router routes
  api/                    # Next Route Handlers (server)
    files/create/         # Create file metadata in Convex
    telegram/             # Upload, image-upload, preview, thumbnail, etc.
convex/                   # Convex schema and functions (queries/mutations)
components/               # UI components (Navbar, File Manager, Upload)
lib/                      # Client libs (auth, store, telegram)
public/                   # Static assets
```

## How Storage Works (High Level)
1. Client splits files into 5MB chunks (or server does for images) and sends them to a Next.js route.
2. Route uses a **Telegram bot** to `sendDocument` for each chunk. Chunks are AES-256-CBC encrypted client/server-side.
3. Convex stores file metadata: name, size, mimetype, and Telegram chunk references (with integrity hashes).
4. Downloads reassemble chunks by fetching from Telegram and decrypting.

## Getting Started

### 1) Prerequisites
- Node.js 18+
- A Telegram Bot Token (via @BotFather)
- A Telegram Channel ID where the bot can post (add bot as admin)
- A Convex project (https://www.convex.dev/)
- Google OAuth Client (for NextAuth)

### 2) Environment Variables
Create `.env.local` in the project root:
```bash
# NextAuth
NEXTAUTH_SECRET=your-strong-random-secret
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret

# Convex (public URL used by client)
NEXT_PUBLIC_CONVEX_URL=https://your-convex-deployment.convex.cloud

# Telegram
NEXT_TELEGRAM_BOT_TOKEN=123456:abcdef-your-bot-token
NEXT_TELEGRAM_CHANNEL_ID=@your_channel_or_numeric_id
```

Notes:
- Use a secure random `NEXTAUTH_SECRET`.
- `NEXT_PUBLIC_CONVEX_URL` should point to your Convex deployment (dev or prod).
- For channel ID, you can use `@channelusername` or the numeric ID (ensure the bot is an admin).

### 3) Install & Dev
```bash
npm install
npm run dev
```
Then open http://localhost:3000

### 4) Convex Setup
- Install Convex CLI: `npm i -g convex`
- In the repo root, run `npx convex dev` (or deploy to get a hosted URL)
- Ensure your Convex deployment URL is set as `NEXT_PUBLIC_CONVEX_URL`

### 5) Google OAuth
- Create OAuth credentials in Google Cloud Console
- Set authorized origins/callbacks to your dev/prod domains
- Put client ID/secret into `.env.local`

## Scripts
- `npm run dev` — Next dev (Turbopack)
- `npm run build` — Next build (Turbopack)
- `npm run start` — Next start (production)
- `npm run lint` — ESLint

## Important Files
- `lib/telegram.ts` — Telegram storage client
  - Retries with exponential backoff for 429/5xx
  - AES-256-CBC chunk encryption + integrity hash
- `convex/schema.ts` — Data model (users, folders, files, indices)
- `convex/files.ts` — Create, move, copy, rename, delete, list files
- `components/upload-manager.tsx` — Upload control, pause/resume, optimistic add
- `components/upload-progress.tsx` — Dialog UI for active/completed uploads
- `lib/store.ts` — Zustand store with `isOptimistic` support and scoped replace

## Deploy
- Frontend: Vercel (Recommended for Next.js 15)
- Backend: Convex deployment (link URL via `NEXT_PUBLIC_CONVEX_URL`)
- Telegram Bot: Hosted anywhere (Next functions run on Vercel). Ensure API access is allowed.

Environment variables must be configured in your hosting provider.

## Rate Limits & Resilience
- Telegram API can return 429/5xx. Uploads use retries with jitter and per‑attempt timeouts.
- Client inter‑chunk delay adapts slightly to reduce rate limiting.

## Security
- Files are chunk‑encrypted with per‑chunk keys derived from a random fileId + secret.
- Only metadata is kept in Convex; actual file bytes live in Telegram.
- Use HTTPS everywhere in production and secure your env vars.

## Roadmap Ideas
- Full‑text search on metadata
- Mobile PWA and offline queueing

## Contributing
- Fork the repo, create a feature branch, open a PR.
- Please run `npm run lint` and ensure type checks pass.

## License
MIT — see LICENSE (or update to your preferred license).