// Public identity strings. Nothing bounded them: registration accepted a username
// of "has space!" and a display name of any length, and both are broadcast to
// every viewer in chat, gift and leaderboard events. One place so register and
// profile-update cannot drift apart.
export const USERNAME = {
  pattern: /^[A-Za-z0-9_.]{3,32}$/,
  message: 'Username must be 3–32 letters, numbers, dots or underscores.'
};

export const DISPLAY_NAME = {
  pattern: /\S/, // not blank
  max: 50,
  message: 'Display name must be 1–50 characters.'
};

export const BIO_MAX = 300;
export const SHORT_FIELD_MAX = 80; // country, city, language
export const URL_MAX = 2048;
