'use strict';

/**
 * Every success response has the same envelope:
 *   { success: true, data, meta? }
 * Errors use: { success: false, error: { code, message, details?, requestId } }
 */
function sendSuccess(res, data, { status = 200, meta } = {}) {
  const body = { success: true, data };
  if (meta) body.meta = meta;
  return res.status(status).json(body);
}

function sendNoContent(res) {
  return res.status(204).send();
}

module.exports = { sendSuccess, sendNoContent };
