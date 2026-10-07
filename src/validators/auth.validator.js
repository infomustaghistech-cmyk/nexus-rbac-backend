'use strict';

const { z, email, password } = require('./common');

const refreshBody = z.object({ refreshToken: z.string().min(20).max(200) }).strict();
const logoutBody = z.object({ refreshToken: z.string().min(20).max(200).optional() }).strict().optional();
const codeSchema = z.string().trim().regex(/^\d{6}$/, 'MFA code must be 6 digits');

module.exports = {
  register: {
    body: z.object({
      organizationName: z.string().trim().min(2).max(120),
      name: z.string().trim().min(2).max(100),
      email,
      password,
    }).strict(),
  },
  login: {
    // Login does not enforce the password policy: it only needs to compare.
    body: z.object({ email, password: z.string().min(1).max(72) }).strict(),
  },
  enable2FA: {
    body: z.object({ code: codeSchema }).strict(),
  },
  disable2FA: {
    body: z.object({ password: z.string().min(1).max(72), code: codeSchema }).strict(),
  },
  verify2FA: {
    body: z.object({ mfaToken: z.string().min(20), code: codeSchema }).strict(),
  },
  refresh: { body: refreshBody },
  logout: { body: logoutBody },
};
