import { useEffect, useRef, useState } from 'react';
import { Download } from 'lucide-react';
import { Footer } from '../components/Footer';
import { BLOG_POSTS, ALL_PHOTOS } from '../data/posts';
import { thumbSrc, webSrc } from '../utils/photos';
import { prepareWithSegments, layoutWithLines } from '@chenglou/pretext';

const W = 1080;
const H = 1350; // 4:5, Instagram portrait
const PAD_X = 80;
const TITLE_FONT = 'italic 800 76px "EB Garamond", Georgia, serif';
const TITLE_LINE_H = 88;
const MONO_FONT = '600 27px "EB Garamond", Georgia, serif';

async function drawCard(canvas, { photo, title, tag }, isStale) {
  const ctx = canvas.getContext('2d');

  const img = await new Promise((resolve, reject) => {
    const im = new Image();
    im.onload = () => resolve(im);
    im.onerror = reject;
    im.src = webSrc(photo);
  });
  if (document.fonts?.load) {
    await Promise.all([
      document.fonts.load(TITLE_FONT, title),
      document.fonts.load(MONO_FONT, 'A'),
    ]).catch(() => {});
  }
  if (isStale()) return;

  // Photo, cover-cropped
  const scale = Math.max(W / img.width, H / img.height);
  const dw = img.width * scale;
  const dh = img.height * scale;
  ctx.clearRect(0, 0, W, H);
  ctx.drawImage(img, (W - dw) / 2, (H - dh) / 2, dw, dh);

  // Ink gradient so the type always reads
  const g = ctx.createLinearGradient(0, H * 0.3, 0, H);
  g.addColorStop(0, 'rgba(26,18,8,0)');
  g.addColorStop(1, 'rgba(26,18,8,0.95)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  const gTop = ctx.createLinearGradient(0, 0, 0, 200);
  gTop.addColorStop(0, 'rgba(26,18,8,0.55)');
  gTop.addColorStop(1, 'rgba(26,18,8,0)');
  ctx.fillStyle = gTop;
  ctx.fillRect(0, 0, W, 200);

  // Tag, top-left
  ctx.font = MONO_FONT;
  if ('letterSpacing' in ctx) ctx.letterSpacing = '7px';
  ctx.fillStyle = '#c8933a';
  ctx.fillText((tag || 'Journal').toUpperCase(), PAD_X, 116);

  // Headline, wrapped by Pretext (canvas has no native line wrapping)
  let lines = [title];
  try {
    const prepared = prepareWithSegments(title, TITLE_FONT);
    lines = layoutWithLines(prepared, W - PAD_X * 2, 1).lines.map((l) => l.text);
  } catch { /* draw unwrapped */ }

  const metaY = H - 88;
  const lastLineY = metaY - 96;
  let y = lastLineY - (lines.length - 1) * TITLE_LINE_H;

  ctx.fillStyle = '#e03616';
  ctx.fillRect(PAD_X, y - 76 - 34, 72, 6);

  if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
  ctx.font = TITLE_FONT;
  ctx.fillStyle = '#fef5ef';
  for (const line of lines) {
    ctx.fillText(line, PAD_X, y);
    y += TITLE_LINE_H;
  }

  // Footer line
  ctx.font = MONO_FONT;
  if ('letterSpacing' in ctx) ctx.letterSpacing = '5px';
  ctx.fillStyle = 'rgba(254,245,239,0.72)';
  ctx.fillText("PETER'S PIZZERIA · SATURDAY SLICES", PAD_X, metaY);
}

export function StudioPage({ nav }) {
  const canvasRef = useRef(null);
  const seq = useRef(0);
  const [postId, setPostId] = useState(BLOG_POSTS[0].id);
  const post = BLOG_POSTS.find((p) => p.id === postId) ?? BLOG_POSTS[0];
  const [title, setTitle] = useState(post.title);
  const [photo, setPhoto] = useState(post.img);

  useEffect(() => { window.scrollTo(0, 0); }, []);

  const pickPost = (id) => {
    const p = BLOG_POSTS.find((x) => x.id === id) ?? BLOG_POSTS[0];
    setPostId(p.id);
    setTitle(p.title);
    setPhoto(p.img);
  };

  useEffect(() => {
    const id = ++seq.current;
    const canvas = canvasRef.current;
    if (!canvas) return;
    drawCard(canvas, { photo, title, tag: post.tag }, () => seq.current !== id).catch(() => {});
  }, [photo, title, post.tag]);

  const download = () => {
    canvasRef.current?.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'peters-pizzeria-card.png';
      document.body.appendChild(a);
      a.click();
      a.remove();
      // Revoking synchronously invalidates the URL before some browsers start the fetch
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }, 'image/png');
  };

  return (
    <div className="studio-page">
      <div className="studio-head">
        <div className="section-label" style={{ color: 'var(--gold)' }}>Studio</div>
        <h1 className="studio-title">Share-card <em>studio.</em></h1>
        <p className="studio-sub">Pick a post, a photo, and a headline — download a 1080×1350 card for Instagram.</p>
      </div>

      <div className="studio-grid">
        <div>
          <label className="studio-label" htmlFor="studio-post">Post</label>
          <select
            id="studio-post"
            className="studio-select"
            value={postId}
            onChange={(e) => pickPost(Number(e.target.value))}
          >
            {BLOG_POSTS.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
          </select>

          <label className="studio-label" htmlFor="studio-headline">Headline</label>
          <textarea
            id="studio-headline"
            className="studio-textarea"
            rows={3}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />

          <div className="studio-label">Photo</div>
          <div className="studio-photos">
            {ALL_PHOTOS.map((src) => (
              <button
                key={src}
                className={`studio-photo${photo === src ? ' selected' : ''}`}
                onClick={() => setPhoto(src)}
                aria-label="Use this photo"
              >
                <img src={thumbSrc(src)} alt="" loading="lazy" decoding="async" />
              </button>
            ))}
          </div>

          <button
            className="btn-primary"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}
            onClick={download}
          >
            <Download size={14} /> Download PNG
          </button>
        </div>

        <div className="studio-preview">
          <canvas ref={canvasRef} width={W} height={H} />
        </div>
      </div>

      <Footer nav={nav} />
    </div>
  );
}
