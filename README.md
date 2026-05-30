# Chatter — Discord-like Chat App

A full-stack real-time chat application with text channels, direct messages, admin roles, and voice/video via LiveKit.

## Stack

| Layer | Tech |
|---|---|
| Frontend | React 18, Vite, CSS Modules |
| Backend | Node.js, Express, Socket.io |
| Database | PostgreSQL |
| Voice/Video | LiveKit |
| Deploy | Railway.app |

## Features

- **Text channels** — multiple channels per server, grouped messaging, typing indicators
- **Direct messages** — 1:1 DMs with any user, real-time delivery
- **Auth** — JWT-based signup/login, bcrypt password hashing
- **Admin role** — admins can create/delete channels; first user to signup can be made admin via SQL
- **Voice/video** — LiveKit-powered rooms, one per voice channel
- **Online presence** — live online/offline status in member list
- **Message deletion** — users delete own messages; admins delete any

## Local Development

### Prerequisites

- Node.js 18+
- PostgreSQL running locally (or use Railway's Postgres addon)

### 1. Backend

```bash
cd backend
cp .env.example .env
# Fill in DATABASE_URL and JWT_SECRET in .env
npm install
npm run dev
```

### 2. Frontend

```bash
cd frontend
cp .env.example .env
# VITE_API_URL is empty for local (uses Vite proxy)
npm install
npm run dev
```

Open http://localhost:5173

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
3. Add a backend service pointing to the `/backend` folder
4. Set environment variables:

```
JWT_SECRET=<random 64-char string>
CLIENT_URL=https://your-frontend.railway.app
NODE_ENV=production
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

---

## LiveKit Setup (optional — required for voice/video)

1. Sign up at [livekit.io](https://livekit.io) (free tier available)
2. Create a project and copy the API Key, API Secret, and WebSocket URL
3. Add them to the backend environment variables

Without LiveKit configured, voice channels show an informational message and text/DMs work normally.

---

## Project Structure

```
my-chat-app/
├── backend/
│   └── src/
│       ├── controllers/   # Route handlers
│       ├── db/            # Pool + schema.sql
│       ├── middleware/    # JWT auth + admin check
│       ├── routes/        # Express router
│       ├── socket/        # Socket.io events
│       └── index.js       # Entry point
└── frontend/
    └── src/
        ├── components/    # UI components
        ├── context/       # Auth + Socket context
        ├── pages/         # Page-level components
        ├── services/      # fetch wrapper
        └── styles/        # Global CSS
```
