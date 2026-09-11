import { beforeEach, describe, expect, it } from 'vitest';
import { Readable } from 'node:stream';
import { resetEnv } from '../../tests/helpers/env.js';
import {
  BodyTooLargeError, isAdmin, mintAdminToken, readBody,
  SESSION_MAX_AGE_MS, verifyAdminToken,
} from './util.js';

// The admin token used to be an HMAC over a constant string: byte-identical on
// every login, valid forever, and impossible to revoke without changing
// ADMIN_PASSWORD. It now carries its issue time inside the signed message, so
// the server can expire a session it never stored. These tests are the proof
// that the expiry is actually enforced rather than merely advertised.
beforeEach(() => {
  resetEnv();
  process.env.ADMIN_PASSWORD = 'a-test-password';
});

const req = (cookie) => ({ headers: cookie === undefined ? {} : { cookie } });

describe('mintAdminToken', () => {
  it('stamps the issue time into the token', () => {
    const now = 1_700_000_000_000;
    const token = mintAdminToken(now);
    expect(token.startsWith(`${now}.`)).toBe(true);
  });

  it('produces a different token per login, so sessions are distinguishable', () => {
    expect(mintAdminToken(1_700_000_000_000)).not.toBe(mintAdminToken(1_700_000_001_000));
  });

  it('returns null when no admin password is configured in production', () => {
    delete process.env.ADMIN_PASSWORD;
    process.env.VERCEL = '1';
    expect(mintAdminToken()).toBeNull();
  });
});

describe('verifyAdminToken', () => {
  it('accepts a token it just minted', () => {
    const now = Date.now();
    expect(verifyAdminToken(mintAdminToken(now), now)).toBe(now);
  });

  it('accepts a token just inside the session window', () => {
    const issued = 1_700_000_000_000;
    const token = mintAdminToken(issued);
    expect(verifyAdminToken(token, issued + SESSION_MAX_AGE_MS - 1000)).toBe(issued);
  });

  it('rejects a token past the session window', () => {
    const issued = 1_700_000_000_000;
    const token = mintAdminToken(issued);
    expect(verifyAdminToken(token, issued + SESSION_MAX_AGE_MS + 1000)).toBeNull();
  });

  it('rejects a backdated timestamp with the original signature', () => {
    // The attack the signed timestamp exists to stop: take an expired token and
    // rewrite its issue time to now, keeping the signature that was valid for
    // the old one.
    const issued = 1_700_000_000_000;
    const token = mintAdminToken(issued);
    const signature = token.slice(token.indexOf('.') + 1);
    const forged = `${issued + SESSION_MAX_AGE_MS}.${signature}`;
    expect(verifyAdminToken(forged, issued + SESSION_MAX_AGE_MS)).toBeNull();
  });

  it('rejects a tampered signature', () => {
    const now = Date.now();
    const token = mintAdminToken(now);
    const flipped = token.slice(0, -1) + (token.endsWith('a') ? 'b' : 'a');
    expect(verifyAdminToken(flipped, now)).toBeNull();
  });

  it('rejects a token minted under a different password', () => {
    // Rotating ADMIN_PASSWORD is the global logout — every outstanding session
    // has to stop verifying.
    const now = Date.now();
    const token = mintAdminToken(now);
    process.env.ADMIN_PASSWORD = 'a-different-password';
    expect(verifyAdminToken(token, now)).toBeNull();
  });

  it('rejects a token dated well into the future', () => {
    const now = Date.now();
    expect(verifyAdminToken(mintAdminToken(now + 60 * 60 * 1000), now)).toBeNull();
  });

  it('tolerates small clock skew', () => {
    const now = Date.now();
    const issued = now + 60 * 1000;
    expect(verifyAdminToken(mintAdminToken(issued), now)).toBe(issued);
  });

  it('rejects malformed input without throwing', () => {
    const now = Date.now();
    for (const bad of ['', 'garbage', 'no-dot-here', '.', 'abc.def', `${now}.`, null, undefined, 42, {}]) {
      expect(() => verifyAdminToken(bad, now)).not.toThrow();
      expect(verifyAdminToken(bad, now)).toBeNull();
    }
  });
});

describe('isAdmin', () => {
  it('accepts a request carrying a freshly minted cookie', () => {
    expect(isAdmin(req(`pp_admin=${mintAdminToken()}`))).toBe(true);
  });

  it('rejects a request with no cookie header at all', () => {
    expect(isAdmin(req())).toBe(false);
  });

  it('rejects an expired cookie', () => {
    const old = Date.now() - SESSION_MAX_AGE_MS - 1000;
    expect(isAdmin(req(`pp_admin=${mintAdminToken(old)}`))).toBe(false);
  });

  it('finds its cookie among others and ignores a malformed neighbour', () => {
    const token = mintAdminToken();
    expect(isAdmin(req(`pp_cart=%E0%A4%A; pp_admin=${token}; other=1`))).toBe(true);
  });
});

describe('readBody', () => {
  it('enforces the cap while reading a chunked request', async () => {
    const req = Readable.from([Buffer.from('{"value":"'), Buffer.alloc(20, 0x61), Buffer.from('"}')]);
    await expect(readBody(req, { maxBytes: 16 })).rejects.toBeInstanceOf(BodyTooLargeError);
  });
});
