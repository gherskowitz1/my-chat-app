# The Crows Nest — Discord-like Chat App

A full-stack real-time chat application with text channels, direct messages, admin roles, and voice/video via LiveKit. Ships as a website and as a Windows/Linux desktop app (Electron).

## Stack

| Layer | Tech |
|---|---|
| Frontend | React 18, Vite, CSS Modules |
| Backend | Node.js, Express, Socket.io |
| Database | PostgreSQL |
| Voice/Video | LiveKit |
| Desktop app | Electron, electron-builder |
| Deploy | Railway.app |

## Features

- **Text channels** — multiple channels per server, grouped messaging, typing indicators
- **Direct messages** — 1:1 DMs with any user, real-time delivery
- **Auth** — JWT-based signup/login, bcrypt password hashing
- **Email invites** — any member can invite someone by email, straight to signup
- **Admin role** — admins can create/delete channels, manage users, and reach a full admin dashboard (`admin.<domain>`) or the in-app admin panel
- **Voice/video** — LiveKit-powered rooms, one per voice channel; screen/window sharing, per-user volume mixer, join/leave chimes, push-to-talk, and an AFK channel that auto-mutes after 4h of inactivity
- **Custom avatars** — upload a profile picture (resized client-side, stored as a data URL) or fall back to a colored initial
- **Online presence** — live online/offline status in a member list pinned across text channels, voice channels, and DMs
- **Message deletion** — users delete own messages; admins delete any
- **Desktop app** — Windows and Linux builds with auto-update, native screen-share picker, and an in-app admin portal window

## Local Development

### Prerequisites

- Node.js 18+
- PostgreSQL (or point `DATABASE_URL` at a hosted instance, e.g. Railway's Postgres addon)

### 1. Backend (repo root)

```bash
cp .env.example .env
# Fill in DATABASE_URL, JWT_SECRET, RESEND_API_KEY, LIVEKIT_* — see below
npm install
npm run dev
```

The backend lives at the repo root (`src/`), not in a subfolder.

### 2. Frontend

```bash
cd frontend
cp .env.example .env
# VITE_API_URL is empty for local (uses Vite proxy)
npm install
npm run dev
```

Open http://localhost:5173

### 3. Desktop app (optional)

```bash
cd desktop
npm install
npm run dev   # launches Electron pointed at the production site, not your local dev server
```

To build installers, see **Desktop Releases** below.

### Make yourself admin

After signing up, run this SQL on your database:

```sql
UPDATE users SET role = 'admin' WHERE email = 'your@email.com';
```

---

## Deploy to Railway

### Backend service

1. Create a new Railway project
2. Add a **PostgreSQL** database service — Railway auto-sets `DATABASE_URL`
3. Add a backend service pointing to the **repo root**
4. Set environment variables:

```
JWT_SECRET=<random 64-char string>
CLIENT_URL=https://your-frontend.railway.app
NODE_ENV=production
RESEND_API_KEY=<from resend.com>
LIVEKIT_API_KEY=<from livekit.io>
LIVEKIT_API_SECRET=<from livekit.io>
LIVEKIT_URL=wss://your-project.livekit.cloud
```

### Frontend service

1. Add another service pointing to `/frontend`
2. Set build command: `npm run build`
3. Set start command: `npx serve dist`
4. Set environment variable:

```
VITE_API_URL=https://your-backend.railway.app
```

The same frontend build also serves the admin dashboard — it's the identical app, switching to the admin view based on hostname (anything starting with `admin.`).

---

## LiveKit Setup (optional — required for voice/video)

1. Sign up at [livekit.io](https://livekit.io) (free tier available)
2. Create a project and copy the API Key, API Secret, and WebSocket URL
3. Add them to the backend environment variables

Without LiveKit configured, voice channels show an informational message and text/DMs work normally.

---

## Desktop Releases

The desktop app (`desktop/`) is a separate Electron project that just loads the deployed website — it doesn't bundle the frontend. Releases are built and published from your own machine (not CI):

```bash
cd desktop
npm install

# Build only, no publish:
npm run dist:win     # or dist:mac / dist:linux

# Build and publish to GitHub Releases (needs GH_TOKEN with repo scope):
npm run release:win  # or release:mac / release:linux
```

Linux (`AppImage`) builds need to run on actual Linux — WSL works fine on Windows. macOS builds need to run on a Mac.

Before publishing a new version, bump `version` in **both** `desktop/package.json` and `desktop/package-lock.json` (the two root `version` fields near the top — don't blanket find/replace across the whole lock file, it'll also catch unrelated dependencies that happen to share the same version string).

---

## Project Structure

```
my-chat-app/
├── src/                    # Backend (Express + Socket.io), repo root
│   ├── controllers/        # Route handlers
│   ├── db/                 # Pool + schema.sql
│   ├── middleware/         # JWT auth + admin check
│   ├── routes/             # Express router
│   └── socket/             # Socket.io events
├── frontend/                # React + Vite app (also serves the admin dashboard)
│   └── src/
│       ├── components/      # UI components
│       ├── context/         # Auth + Socket context
│       ├── pages/           # Page-level components
│       ├── services/        # fetch wrapper
│       └── styles/          # Global CSS
├── desktop/                  # Electron wrapper (loads the deployed website)
│   ├── main.js               # Main process — window, tray, auto-updater, screen-share picker
│   └── picker.html            # Screen/window share source picker UI
└── make-docs.js               # Generates CrowsNest-{User,Admin}-Guide.docx
```
