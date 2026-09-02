// Server-side mirror of frontend/src/utils/mentions.js's mentionsUser — kept
// as a small duplicate rather than shared, since the frontend file is an ES
// module bundled by Vite and this runs under plain CommonJS Node.
function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function mentionsUsername(content, username) {
  if (!username) return false;
  const re = new RegExp(`@(?:${escapeRegExp(username)}|everyone)\\b`, 'i');
  return re.test(content);
}

module.exports = { mentionsUsername };
