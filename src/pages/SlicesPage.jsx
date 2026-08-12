import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { ArrowRight, Camera, ImagePlus, Trash2, User, UserX, X } from 'lucide-react';
import { Footer } from '../components/Footer';
import { LineReveal } from '../components/LineReveal';
import { api } from '../utils/api';
import { agoLabel } from '../utils/orders';
import { downscaleImage } from '../utils/photos';
import { readMine, writeMine, readHandoff, clearHandoff, deviceToken, formReducer, EMPTY_FORM } from '../utils/slices';

// This is a fully public page with no rate limit in front of it, and every
// poll costs a function invocation plus a full read of the wall. 30s still
// reads as live for a page people leave open, at a third of the traffic.
const POLL_MS = 30000;

// `code` deliberately stays in the parent: closing the composer unmounts
// this and everything here resets, but the pickup code is the tedious part
// to retype if you reopen.

function SliceComposer({ code, setCode, name, onPosted, onClose }) {
  const [anon, setAnon] = useState(false);
  const [form, dispatch] = useReducer(formReducer, EMPTY_FORM);
  const { photo, caption, preparing, posting, error, posted } = form;
  const fileRef = useRef(null);

  const pickFile = async (e) => {
    const file = e.target.files?.[0];
    // Reset immediately so picking the same file twice still fires onChange
    e.target.value = '';
    if (!file) return;
    dispatch({ type: 'preparing' });
    try {
      dispatch({ type: 'picked', photo: await downscaleImage(file) });
    } catch {
      dispatch({ type: 'pickFailed' });
    }
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!photo || code.trim().length < 3 || posting) return;
    dispatch({ type: 'submitting' });
    try {
      const { slice } = await api('/api/slices', {
        method: 'POST',
        body: {
          code: code.trim(),
          caption: caption.trim(),
          anon,
          device: deviceToken(),
          image: photo.dataUrl,
        },
      });
      onPosted(slice);
      dispatch({ type: 'posted' });
    } catch (err) {
      dispatch({ type: 'failed', error: err.message });
    }
  };

  if (posted) {
    return (
      <form className="slices-composer" id="slices-composer" onSubmit={submit}>
        <div className="slices-posted">
          <h2 className="confirm-title">You&apos;re on the <em>wall.</em></h2>
          <p className="slices-posted-sub">Thanks for sharing — scroll down to find yourself.</p>
          <div className="slices-posted-actions">
            <button type="button" className="text-link-btn" onClick={() => dispatch({ type: 'postAnother' })}>
              Post another
            </button>
            <button type="button" className="text-link-btn" onClick={onClose}>
              Back to the wall
            </button>
          </div>
        </div>
      </form>
    );
  }

  return (
    <form className="slices-composer" id="slices-composer" onSubmit={submit}>
      <div className="slices-composer-head">
        <div className="slices-composer-label">Got your slice? Put it on the wall.</div>
        <button type="button"
          className="slices-composer-close"
          onClick={onClose}
          aria-label="Close the post form"
          aria-expanded
          aria-controls="slices-composer"
        >
          <X size={14} />
        </button>
      </div>

      {photo ? (
        <div className="slices-preview">
          <img src={photo.dataUrl} alt="Your slice, ready to post" style={{ aspectRatio: `${photo.w}/${photo.h}` }} />
          <button
            type="button"
            className="slices-preview-clear"
            onClick={() => dispatch({ type: 'clearPhoto' })}
            aria-label="Remove this photo"
          >
            <X size={13} />
          </button>
        </div>
      ) : (
        <button
          type="button"
          className="slices-picker"
          onClick={() => fileRef.current?.click()}
          disabled={preparing}
        >
          {preparing ? <>Getting it ready…</> : <><Camera size={20} strokeWidth={1.5} /> Take or choose a photo</>}
        </button>
      )}

      {/* `capture` opens the phone camera directly. It hands off to the
          OS camera app rather than calling getUserMedia, so the
          Permissions-Policy camera=() header doesn't block it. */}
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={pickFile}
        hidden
      />

      <label className="order-field">
        <span>Pickup code</span>
        <input
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="e.g. F4WS"
          maxLength={12}
          autoCapitalize="characters"
        />
      </label>

      <div className="order-field">
        <span>Post as</span>
        <div className="slices-who" role="group" aria-label="Post as">
          <button type="button"
            className={`slices-who-btn${anon ? '' : ' slices-who-on'}`}
            onClick={() => setAnon(false)}
            aria-pressed={!anon}
          >
            <User size={13} /> {name || 'My first name'}
          </button>
          <button type="button"
            className={`slices-who-btn${anon ? ' slices-who-on' : ''}`}
            onClick={() => setAnon(true)}
            aria-pressed={anon}
          >
            <UserX size={13} /> Anonymous
          </button>
        </div>
      </div>

      <label className="order-field">
        <span>Caption <span className="slices-optional">(optional)</span></span>
        <input
          value={caption}
          onChange={(e) => dispatch({ type: 'caption', caption: e.target.value })}
          placeholder="best slice on campus"
          maxLength={80}
        />
      </label>

      <button
        className="btn-primary slices-submit"
        type="submit"
        disabled={!photo || code.trim().length < 3 || posting}
      >
        {posting ? 'Posting…' : <>Post it <ImagePlus size={13} /></>}
      </button>

      {error && <div className="order-error" role="alert">{error}</div>}

      <div className="slices-fineprint">
        Your first name comes from your order — pick Anonymous and it won&apos;t be shown.
        Maximum three photos per order. The code stays good for a few days after you pick up!
      </div>
    </form>
  );
}

// ── Wall ──────────────────────────────────────────────────────────────
// Public community wall. Anyone can look; posting needs a pickup code from a
// real order placed in the last few days.
export function SlicesPage({ nav, openLightbox }) {
  const [slices, setSlices] = useState([]);
  const [loading, setLoading] = useState(true);
  // Read once, in the initializer, because the mount effect clears the handoff
  // key straight afterwards — a later read would always come back empty.
  const [handoff] = useState(readHandoff);
  const [code, setCode] = useState(handoff.code);
  // Arriving from the nav, this page is a wall of pictures and the form would
  // just push it down; arriving from the order confirmation, posting is the
  // entire reason you're here, so the form is already open and prefilled.
  const [composerOpen, setComposerOpen] = useState(Boolean(handoff.code));
  const [mine, setMine] = useState(readMine);
  const [armedDelete, setArmedDelete] = useState(null);
  const [deletingId, setDeletingId] = useState(null);
  // Separate from the composer's own error, which only renders inside the open
  // form. Deleting your own photo happens from the wall with the composer shut,
  // so a failure there needs somewhere of its own to show up.
  const [wallError, setWallError] = useState('');

  // Bumped around every local mutation; a poll that started earlier and lands
  // afterwards is discarded rather than erasing a just-posted photo.
  const epoch = useRef(0);

  useEffect(() => {
    window.scrollTo(0, 0);
    clearHandoff(); // one-shot handoff
  }, []);

  // Persisted from an effect rather than inside the setMine updaters: state
  // updaters have to stay pure, and React may invoke them more than once.
  useEffect(() => {
    writeMine(mine);
  }, [mine]);

  const load = useCallback(async () => {
    const snapshot = epoch.current;
    try {
      const { slices: list } = await api('/api/slices');
      if (epoch.current !== snapshot) return; // a post superseded this poll
      setSlices(list);
    } catch {
      // A failed poll just leaves the current wall up — no error UI for it.
    } finally {
      if (epoch.current === snapshot) setLoading(false);
    }
  }, []);

  // Poll only while the tab is actually being looked at. A wall left open in a
  // background tab otherwise keeps hitting the API for hours.
  useEffect(() => {
    let timer = null;
    const start = () => {
      if (timer) return;
      timer = setInterval(load, POLL_MS);
    };
    const stop = () => {
      clearInterval(timer);
      timer = null;
    };
    const onVisibility = () => {
      if (document.hidden) stop();
      else { load(); start(); }
    };
    load();
    if (!document.hidden) start();
    document.addEventListener('visibilitychange', onVisibility);
    return () => { stop(); document.removeEventListener('visibilitychange', onVisibility); };
  }, [load]);

  const handlePosted = useCallback((slice) => {
    epoch.current += 1;
    setSlices((list) => [slice, ...list]);
    setMine((prev) => new Set(prev).add(slice.id));
  }, []);

  // Two taps rather than a confirm() dialog — deleting the photo and its stored
  // image is permanent, but a modal would block the page.
  const removeMine = async (slice) => {
    if (armedDelete !== slice.id) { setArmedDelete(slice.id); return; }
    setArmedDelete(null);
    setDeletingId(slice.id);
    setWallError('');
    epoch.current += 1;
    try {
      await api(`/api/slices?id=${encodeURIComponent(slice.id)}`, {
        method: 'DELETE',
        body: { device: deviceToken() },
      });
      epoch.current += 1;
      setSlices((list) => list.filter((s) => s.id !== slice.id));
      setMine((prev) => {
        const next = new Set(prev);
        next.delete(slice.id);
        return next;
      });
    } catch (err) {
      setWallError(err.message || 'Could not delete that photo — try again.');
      load(); // resync rather than guess at what the server kept
    } finally {
      setDeletingId(null);
    }
  };

  const urls = useMemo(() => slices.map((s) => s.url), [slices]);
  // Parallel to `urls` — the lightbox shows the poster and caption alongside
  // the enlarged photo. Ages are computed here rather than in the lightbox so
  // they refresh with the poll.
  const captions = useMemo(
    () => slices.map((s) => ({ name: s.name, caption: s.caption, age: agoLabel(s.createdAt) })),
    [slices],
  );

  return (
    <div className="slices-page">
      <div className="slices-hero">
        <div className="section-label" style={{ color: 'var(--gold)' }}>Community</div>
        <LineReveal as="h1" className="slices-hero-title" text="Community pictures." />
        <p className="slices-hero-sub">
          <span className="pulse-dot" aria-hidden="true" />
          {slices.length} {slices.length === 1 ? 'photo' : 'photos'} · updates live
        </p>
      </div>

      <div className="slices-composer-wrap">
        {composerOpen ? (
          <SliceComposer
            code={code}
            setCode={setCode}
            name={handoff.name}
            onPosted={handlePosted}
            onClose={() => setComposerOpen(false)}
          />
        ) : (
          <button type="button"
            className="slices-open-composer"
            onClick={() => setComposerOpen(true)}
            aria-expanded={false}
            aria-controls="slices-composer"
          >
            <Camera size={18} strokeWidth={1.5} />
            <span><strong>Got your slice?</strong> Add your photo to the wall.</span>
            <ArrowRight size={14} />
          </button>
        )}
      </div>

      {wallError && <div className="order-error slices-wall-error" role="alert">{wallError}</div>}

      {loading ? null : slices.length === 0 ? (
        <div className="slices-empty">No slices on the wall yet. Be the first.</div>
      ) : (
        <div className="slices-grid">
          {slices.map((s, i) => (
            <div key={s.id} className="slices-item">
              <button
                type="button"
                className="slices-item-open"
                onClick={() => openLightbox(urls, i, captions)}
                aria-label={`View ${s.name ? `${s.name}'s` : 'this'} photo`}
              >
                <img
                  src={s.url}
                  alt={s.caption || `A slice from ${s.name || 'a customer'}`}
                  loading="lazy"
                  decoding="async"
                  /* Reserving the box from the stored dimensions keeps the
                     masonry from reflowing as photos load */
                  style={{ aspectRatio: `${s.w}/${s.h}` }}
                />
                <span className="slices-item-meta">
                  {s.name && <span className="slices-item-name">{s.name}</span>}
                  {s.caption && <span className="slices-item-caption">{s.caption}</span>}
                  <span className="slices-item-age">{agoLabel(s.createdAt)}</span>
                </span>
              </button>
              {mine.has(s.id) && (
                <button
                  type="button"
                  className={`slices-item-delete${armedDelete === s.id ? ' slices-item-delete-armed' : ''}`}
                  disabled={deletingId === s.id}
                  onClick={() => removeMine(s)}
                  onBlur={() => setArmedDelete((cur) => (cur === s.id ? null : cur))}
                  aria-label={armedDelete === s.id ? 'Confirm deleting your photo' : 'Delete your photo'}
                >
                  {armedDelete === s.id ? <>Delete?</> : <Trash2 size={13} />}
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      <Footer nav={nav} />
    </div>
  );
}
