const rateLimit = require('express-rate-limit');

// Keyed by IP (the default), which is why index.js sets `trust proxy` —
// without it every request behind Railway's proxy would resolve to the same
// internal IP and share one limit across all users.
const make = (windowMs, max, message) => rateLimit({
  windowMs,
  max,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: message },
});

const loginLimiter = make(15 * 60 * 1000, 10, 'Too many login attempts. Please try again in 15 minutes.');
const signupLimiter = make(60 * 60 * 1000, 5, 'Too many accounts created from this network. Please try again later.');
const forgotPasswordLimiter = make(60 * 60 * 1000, 5, 'Too many password reset requests. Please try again later.');

module.exports = { loginLimiter, signupLimiter, forgotPasswordLimiter };
