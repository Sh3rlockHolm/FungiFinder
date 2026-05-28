// Optional deployment-time overrides.
// Set these values in production to enable shared, remote feedback logging.
// Example:
// window.FUNGI_FEEDBACK_ENDPOINT = "https://script.google.com/macros/s/AKfycb.../exec";
window.FUNGI_FEEDBACK_ENDPOINT =
  window.FUNGI_FEEDBACK_ENDPOINT ||
  "https://script.google.com/macros/s/AKfycbwbvr8rT9tdGsWW9GAwApi5ewELW0rRJNCjHPRxknL09I--x_izpioXX8qxWY_x2gVu/exec";
window.FUNGI_FEEDBACK_API_KEY =
  window.FUNGI_FEEDBACK_API_KEY ||
  "6bn+dytyr8WpItnu5H7LVHf0biLSAO9Zf7+Oe5Svv8PAXrCcfs6DD4m4hLF74JCN";
window.FUNGI_FEEDBACK_API_KEY_HEADER = window.FUNGI_FEEDBACK_API_KEY_HEADER || "x-api-key";
