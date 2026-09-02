// Replaces the plain `serve` static file server so the deployed frontend can
// actually set security headers — `serve@14`'s CLI dropped support for a
// serve.json config entirely (verified by running it: no --config flag,
// and a serve.json alongside it is silently ignored), so a config-file-only
// approach doesn't work with the pinned version. This is a small enough
// static server that hand-rolling it with Express + Helmet is simpler than
// switching to a different static-serving package.
import path from 'path';
import { fileURLToPath } from 'url';
import express from 'express';
import helmet from 'helmet';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distDir = path.join(__dirname, 'dist');

const app = express();

// No inline <script> tags exist in the Vite build (checked dist/index.html
// directly), so script-src can stay strict. style-src needs 'unsafe-inline'
// because the app uses plenty of inline style={{...}} props, which render
// as real style="..." attributes subject to CSP — tightening that further
// would mean refactoring inline styles out of dozens of components, well
// beyond what this pass is for.
app.use(helmet({
  contentSecurityPolicy: {
    useDefaults: false,
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
      fontSrc: ["'self'", 'https://fonts.gstatic.com'],
      // The API lives on a separate origin from this static site (that's
      // why the backend needs CORS at all), and message link-previews load
      // thumbnails from whatever domain someone pastes a link to — images
      // can't execute code, so allowing any https image is a low-risk way
      // to support that instead of trying to enumerate every possible host.
      imgSrc: ["'self'", 'data:', 'blob:', 'https:'],
      mediaSrc: ["'self'", 'data:', 'blob:'],
      // Link-preview embeds (YouTube/Twitch/Vimeo/Spotify/SoundCloud) render
      // as iframes from these exact platforms — see linkEmbeds.js/LinkEmbed.jsx.
      frameSrc: [
        "'self'",
        'https://www.youtube.com',
        'https://clips.twitch.tv', 'https://player.twitch.tv',
        'https://player.vimeo.com',
        'https://open.spotify.com',
        'https://w.soundcloud.com',
      ],
      connectSrc: [
        "'self'",
        'https://*.thecrowsnesttalk.com', 'wss://*.thecrowsnesttalk.com',
        'https://*.up.railway.app', 'wss://*.up.railway.app',
        'https://*.railway.app', 'wss://*.railway.app',
        'https://*.livekit.cloud', 'wss://*.livekit.cloud',
      ],
      workerSrc: ["'self'"],
      manifestSrc: ["'self'"],
      objectSrc: ["'none'"],
      baseUri: ["'self'"],
      formAction: ["'self'"],
      frameAncestors: ["'none'"],
    },
  },
}));

app.use(express.static(distDir));

// SPA fallback — a hard refresh or deep link on any client-side route
// (React Router) still needs to resolve to index.html.
app.get('*', (req, res) => {
  res.sendFile(path.join(distDir, 'index.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Frontend serving on :${PORT}`));
