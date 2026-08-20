import { describe, it, expect } from 'vitest';
import { BLOG_POSTS } from '../data/posts';
import {
  PAGE_PATHS,
  slugify,
  postSlug,
  articlePath,
  pathForRoute,
  titleForRoute,
  routeFromPath,
} from './routes';

// App's page ids. Duplicated rather than imported because App.jsx drags in GSAP
// and every page component; a mismatch here is exactly what the first test
// catches, which is the point of keeping a second copy.
const VALID_PAGES = ['home', 'menu', 'blog', 'gallery', 'studio', 'order', 'status', 'slices', 'admin', 'nights'];

describe('slugify', () => {
  it('lowercases and joins words with hyphens', () => {
    expect(slugify('Read the Blog')).toBe('read-the-blog');
  });

  it('drops apostrophes instead of splitting on them', () => {
    expect(slugify("Peter's Pizzeria")).toBe('peters-pizzeria');
    expect(slugify('Peter’s Pizzeria')).toBe('peters-pizzeria');
  });

  it('collapses punctuation runs and trims the ends', () => {
    expect(slugify('  Dublin, Ireland — Round #2!  ')).toBe('dublin-ireland-round-2');
  });

  it('strips accents rather than dropping the letter', () => {
    expect(slugify('Café Napoli')).toBe('cafe-napoli');
  });
});

describe('PAGE_PATHS', () => {
  it('gives every page id an address', () => {
    for (const page of VALID_PAGES) {
      expect(PAGE_PATHS[page], `no path for page "${page}"`).toBeTruthy();
    }
  });

  it('never maps two pages to the same path', () => {
    const paths = Object.values(PAGE_PATHS);
    expect(new Set(paths).size).toBe(paths.length);
  });
});

describe('routeFromPath ↔ pathForRoute', () => {
  it('round-trips every page', () => {
    for (const page of VALID_PAGES) {
      expect(routeFromPath(pathForRoute(page))).toEqual({ page, article: null });
    }
  });

  it('round-trips every blog post', () => {
    for (const post of BLOG_POSTS) {
      expect(routeFromPath(articlePath(post))).toEqual({ page: 'article', article: post });
    }
  });

  it('resolves an article by slug, not by position', () => {
    const post = BLOG_POSTS[BLOG_POSTS.length - 1];
    const hit = routeFromPath(`/blog/${postSlug(post)}`);
    expect(hit.article.title).toBe(post.title);
  });

  it('prefers a post\'s hand-written slug over its title', () => {
    const post = { id: 99, title: 'A Very Long Headline That Nobody Wants To Text', slug: 'short-one' };
    expect(articlePath(post)).toBe('/blog/short-one');
  });

  it('falls back to the title when a post has no slug', () => {
    expect(postSlug({ id: 98, title: 'No Slug Here' })).toBe('no-slug-here');
  });

  it('keeps every published slug unique', () => {
    const slugs = BLOG_POSTS.map(postSlug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it('reads / as home', () => {
    expect(routeFromPath('/')).toEqual({ page: 'home', article: null });
    expect(routeFromPath('')).toEqual({ page: 'home', article: null });
  });

  it('ignores a trailing slash, case, query and hash', () => {
    expect(routeFromPath('/Menu/')).toEqual({ page: 'menu', article: null });
    expect(routeFromPath('/menu?utm_source=insta')).toEqual({ page: 'menu', article: null });
    expect(routeFromPath('/menu#main')).toEqual({ page: 'menu', article: null });
  });

  it('keeps the nested admin path distinct from /admin', () => {
    expect(routeFromPath('/admin')).toEqual({ page: 'admin', article: null });
    expect(routeFromPath('/admin/nights')).toEqual({ page: 'nights', article: null });
  });

  it('returns null for an unknown path so the caller can canonicalise', () => {
    expect(routeFromPath('/menuu')).toBeNull();
    expect(routeFromPath('/blog/no-such-post')).toBeNull();
    expect(routeFromPath('/admin/nights/extra')).toBeNull();
  });

  it('falls back to /blog for an article with no post attached', () => {
    expect(pathForRoute('article', null)).toBe('/blog');
  });

  it('falls back to home for a page id that has no path', () => {
    expect(pathForRoute('not-a-page')).toBe('/');
  });
});

describe('titleForRoute', () => {
  it('titles home with the bare site name', () => {
    expect(titleForRoute('home')).toBe("Peter's Pizzeria");
  });

  it('gives every page a title', () => {
    for (const page of VALID_PAGES) {
      expect(titleForRoute(page)).toContain("Peter's Pizzeria");
    }
  });

  it('leads an article title with the post title', () => {
    const post = BLOG_POSTS[0];
    expect(titleForRoute('article', post)).toBe(`${post.title} — Peter's Pizzeria`);
  });
});
