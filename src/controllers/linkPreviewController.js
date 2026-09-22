const { pool } = require('../db');
const { getLinkPreview: fetchPreview } = require('../services/linkPreview');

const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 1 week

async function getLinkPreview(req, res) {
  const { url } = req.query;
  if (!url || typeof url !== 'string' || url.length > 2000) {
    return res.status(400).json({ error: 'url required' });
  }

  try {
    const { rows } = await pool.query('SELECT * FROM link_previews WHERE url = $1', [url]);
    const cached = rows[0];
    if (cached && Date.now() - new Date(cached.fetched_at).getTime() < CACHE_TTL_MS) {
      return res.json({
        title: cached.title,
        description: cached.description,
        image: cached.image_url,
        siteName: cached.site_name,
      });
    }

    const preview = await fetchPreview(url);
    await pool.query(
      `INSERT INTO link_previews (url, title, description, image_url, site_name, fetched_at)
       VALUES ($1, $2, $3, $4, $5, NOW())
       ON CONFLICT (url) DO UPDATE SET title = $2, description = $3, image_url = $4, site_name = $5, fetched_at = NOW()`,
      [url, preview?.title || null, preview?.description || null, preview?.image || null, preview?.siteName || null]
    );

    res.json(preview || { title: null });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
}

module.exports = { getLinkPreview };
