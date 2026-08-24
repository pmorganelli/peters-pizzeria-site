import { describe, it, expect, vi, afterEach } from 'vitest';
import { api } from './api';

// No DOM needed — api() is a fetch wrapper. It stays on the default `node`
// environment with the rest of the util tests.

function stubFetch({ status = 200, body = {}, throwOnJson = false } = {}) {
  const spy = vi.fn(async () => ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => {
      if (throwOnJson) throw new SyntaxError('Unexpected token < in JSON');
      return body;
    },
  }));
  vi.stubGlobal('fetch', spy);
  return spy;
}

afterEach(() => { vi.unstubAllGlobals(); });

describe('api()', () => {
  it('returns the parsed body on 2xx', async () => {
    stubFetch({ status: 200, body: { order: { id: 'abc' } } });
    await expect(api('/api/orders')).resolves.toEqual({ order: { id: 'abc' } });
  });

  it('sends the admin cookie along', async () => {
    const spy = stubFetch();
    await api('/api/login');
    expect(spy.mock.calls[0][1].credentials).toBe('same-origin');
  });

  it('only sets a JSON content-type when there is a body to send', async () => {
    const spy = stubFetch();
    await api('/api/store');
    expect(spy.mock.calls[0][1].headers).toEqual({});

    await api('/api/orders', { method: 'POST', body: { items: [] } });
    expect(spy.mock.calls[1][1].headers).toEqual({ 'Content-Type': 'application/json' });
    expect(spy.mock.calls[1][1].body).toBe('{"items":[]}');
  });

  // The order page and the admin board both surface `e.message` straight to the
  // user and branch on `e.status` (a 400 refetches store hours, a 403 shows the
  // closed card). Both have to survive the throw.
  it('throws the server error string with .status attached', async () => {
    stubFetch({ status: 403, body: { error: "We're closed right now." } });
    await expect(api('/api/orders', { method: 'POST', body: {} })).rejects.toMatchObject({
      message: "We're closed right now.",
      status: 403,
    });
  });

  it('falls back to a generic message when the error body has no `error`', async () => {
    stubFetch({ status: 500, body: {} });
    await expect(api('/api/orders')).rejects.toMatchObject({
      message: 'Request failed (500)',
      status: 500,
    });
  });

  // A 502 from the edge is an HTML error page, not JSON. Parsing it throws, and
  // that throw must not replace the useful status-code message with a
  // SyntaxError the user can do nothing with.
  it('survives a non-JSON error body', async () => {
    stubFetch({ status: 502, throwOnJson: true });
    await expect(api('/api/orders')).rejects.toMatchObject({
      message: 'Request failed (502)',
      status: 502,
    });
  });

  it('survives a non-JSON success body', async () => {
    stubFetch({ status: 200, throwOnJson: true });
    await expect(api('/api/store')).resolves.toEqual({});
  });
});
