const { searchGifs, getTrendingGifs } = require('../services/giphy');

// GET /giphy?q=optional — searches when q is present, otherwise returns
// what's currently trending (the same default GIPHY's own picker shows).
async function getGifs(req, res) {
  if (!process.env.GIPHY_API_KEY) {
    return res.status(503).json({ error: 'GIFs require GIPHY configuration. Add GIPHY_API_KEY to enable.' });
  }
  const q = req.query.q?.trim();
  try {
    const results = q ? await searchGifs(q) : await getTrendingGifs();
    res.json(results);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'GIPHY request failed' });
  }
}

module.exports = { getGifs };
