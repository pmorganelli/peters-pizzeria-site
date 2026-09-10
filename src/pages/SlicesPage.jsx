import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { ArrowRight, Camera, Flag, ImagePlus, Trash2, User, UserX, X } from 'lucide-react';
import { Footer } from '../components/Footer';
import { LineReveal } from '../components/LineReveal';
import { api } from '../utils/api';
import { agoLabel } from '../utils/orders';
import { downscaleImage } from '../utils/photos';
import { readMine, writeMine, readHandoff, clearHandoff, readPosterName, writePosterName, deviceToken, formReducer, EMPTY_FORM } from '../utils/slices';

// Matches StatusPage's poll cadence so the wall feels just as live — a new
// photo shows up for everyone else on the page without a refresh.
const POLL_MS = 8000;

// `name` deliberately stays in the parent: closing the composer unmounts this
// and everything local to it resets, but a name you've already typed is the
// one thing worth carrying back if you reopen. (The pickup code used to hold
// that spot, for the same reason.)

function SliceComposer({ name, setName, onPosted, onClose }) {
  // The toggle is UI only — the API has no `anon` flag any more, because a
  // blank name *is* anonymous there. Anonymous mode therefore posts '' while
  // keeping whatever is typed in `name`, so flipping back and forth doesn't
  // make someone retype it.
  //
  // Which side it starts on follows whether there's a name to start with (the
  // handoff from an order card, or the one this device last posted under).
  // With nothing to prefill, the attributed option would just be an empty
  // required-looking field.
  const [anon, setAnon] = useState(() => !name);
  const [form, dispatch] = useReducer(formReducer, EMPTY_FORM);
  const { photo, caption, preparing, posting, error, posted } = form;
  const libraryRef = useRef(null);

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
    if (!photo || posting) return;
    dispatch({ type: 'submitting' });
    try {
      const posterName = anon ? '' : name.trim();
      const { slice } = await api('/api/slices', {
        method: 'POST',
        body: {
          name: posterName,
          caption: caption.trim(),
          device: deviceToken(),
          image: photo.dataUrl,
        },
      });
      // Remembered only once the server has taken it, so a name that gets
      // rejected isn't the one waiting in the field next time. Posting
      // anonymously deliberately clears it too — that's a choice, and the next
      // visit shouldn't helpfully re-attach the name you just opted out of.
      writePosterName(posterName);
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
      ) : preparing ? (
        <div className="slices-picker slices-picker-loading">Getting it ready…</div>
      ) : (
        <button type="button" className="slices-picker" onClick={() => libraryRef.current?.click()}>
          <Camera size={20} strokeWidth={1.5} /> Take a photo or choose from library
        </button>
      )}

      {/* One input, and deliberately no `capture` attribute. `capture` hands
          off straight to the OS camera app, which is why this used to need a
          second button — with it set, the OS never offers the library as a
          choice at all. Without it, mobile Safari and Chrome both open their
          native sheet listing Take Photo *and* Photo Library, which is the
          same choice the two buttons offered, made by the OS instead of by
          us. Don't re-add `capture` to "make the camera button work" — it
          would silently remove the library option again. */}
      <input
        ref={libraryRef}
        type="file"
        accept="image/*"
        onChange={pickFile}
        hidden
      />

      <div className="order-field">
        <span>Post as</span>
        <div className="slices-who" role="group" aria-label="Post as">
          <button type="button"
            className={`slices-who-btn${anon ? '' : ' slices-who-on'}`}
            onClick={() => setAnon(false)}
            aria-pressed={!anon}
          >
            <User size={13} /> My name
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

      {/* Only under the attributed option — an always-visible name field next
          to an Anonymous button reads as a contradiction. The name used to
          come off the order the pickup code resolved to; with no order behind
          a post, it's typed. */}
      {!anon && (
        <label className="order-field slices-name-field">
          <span><span className="slices-optional">Your name</span></span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="First name"
            maxLength={20}
            autoComplete="given-name"
          />
        </label>
      )}

      <label className="order-field">
        <span><span className="slices-optional">Caption (optional)</span></span>
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
        disabled={!photo || posting}
      >
        {posting ? 'Posting…' : <>Post it <ImagePlus size={13} /></>}
      </button>

      {error && <div className="order-error" role="alert">{error}</div>}
    </form>
  );
}

// ── Wall ──────────────────────────────────────────────────────────────
// Public community wall. Anyone can look, and now anyone can post — posting
// used to require a pickup code from a real order placed in the last few days.
// What's left standing between the wall and a flood is the per-device cap on
// the server, the IP rate limits behind it, and admin take-down.
export function SlicesPage({ nav, openLightbox, isAdmin }) {
  const [slices, setSlices] = useState([]);
  const [loading, setLoading] = useState(true);
  // Read once, in the initializer, because the mount effect clears the handoff
  // key straight afterwards — a later read would always come back empty.
  const [handoff] = useState(readHandoff);
  // The name from the order you just picked up wins over the one this device
  // last posted under; either beats an empty field.
  const [posterName, setPosterName] = useState(() => handoff.name || readPosterName());
  // Arriving from the nav, this page is a wall of pictures and the form would
  // just push it down; arriving from the order confirmation, posting is the
  // entire reason you're here, so the form is already open and prefilled.
  const [composerOpen, setComposerOpen] = useState(Boolean(handoff.name));
  const [mine, setMine] = useState(readMine);
  const [armedDelete, setArmedDelete] = useState(null);
  const [busyId, setBusyId] = useState(null);
  // Takedown requests this device has already sent, so the button can settle
  // into a "requested" state instead of inviting the same tap again. Purely
  // cosmetic — the server dedupes by device hash regardless of what's here.
  const [reported, setReported] = useState(() => new Set());
  const [armedReport, setArmedReport] = useState(null);
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
    // Same as the admin board: `load` awaits the fetch before setting
    // anything, so this schedules work rather than updating state during the
    // effect. The rule can't see through the async boundary to prove it.
    // eslint-disable-next-line react-hooks/set-state-in-effect
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
  // image is permanent, but a modal would block the page. Used both for a
  // poster removing their own photo and an admin taking one down — the server
  // tells the two apart by cookie vs. device token, so the client doesn't need
  // to know which case it's in.
  const removeSlice = async (slice) => {
    if (armedDelete !== slice.id) { setArmedDelete(slice.id); return; }
    setArmedDelete(null);
    setBusyId(slice.id);
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
      setBusyId(null);
    }
  };

  // Anyone can ask for a photo to come down — including the person *in* it,
  // who has no device token for a post they didn't make. That mattered when
  // posting took a pickup code; it matters more now that it doesn't.
  // Two taps like the delete button, since the first tap is easy to hit by
  // accident on a phone-sized tile.
  const requestTakedown = async (slice) => {
    if (armedReport !== slice.id) { setArmedReport(slice.id); return; }
    setArmedReport(null);
    setBusyId(slice.id);
    setWallError('');
    try {
      await api('/api/reports', { method: 'POST', body: { sliceId: slice.id, device: deviceToken() } });
      setReported((prev) => new Set(prev).add(slice.id));
    } catch (err) {
      setWallError(err.message || 'Could not send that request — try again.');
    } finally {
      setBusyId(null);
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
            name={posterName}
            setName={setPosterName}
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
              {(mine.has(s.id) || isAdmin) && (
                <button
                  type="button"
                  className={`slices-item-delete${armedDelete === s.id ? ' slices-item-delete-armed' : ''}`}
                  disabled={busyId === s.id}
                  onClick={() => removeSlice(s)}
                  onBlur={() => setArmedDelete((cur) => (cur === s.id ? null : cur))}
                  aria-label={armedDelete === s.id ? 'Confirm deleting this photo' : (mine.has(s.id) ? 'Delete your photo' : 'Take down this photo')}
                >
                  {armedDelete === s.id ? <>Delete?</> : <Trash2 size={13} />}
                </button>
              )}
              {/* Not shown to the poster or an admin — both already have a
                  delete button on this tile, and asking yourself to review
                  your own photo is a dead end. */}
              {!mine.has(s.id) && !isAdmin && (
                reported.has(s.id) ? (
                  <span className="slices-item-report slices-item-report-done">Requested</span>
                ) : (
                  <button
                    type="button"
                    className={`slices-item-report${armedReport === s.id ? ' slices-item-report-armed' : ''}`}
                    disabled={busyId === s.id}
                    onClick={() => requestTakedown(s)}
                    onBlur={() => setArmedReport((cur) => (cur === s.id ? null : cur))}
                    aria-label={armedReport === s.id ? 'Confirm takedown request' : 'Request that this photo be taken down'}
                    title="Ask us to take this photo down"
                  >
                    {armedReport === s.id ? <>Request to take down?</> : <Flag size={13} />}
                  </button>
                )
              )}
            </div>
          ))}
        </div>
      )}

      <Footer nav={nav} />
    </div>
  );
}
