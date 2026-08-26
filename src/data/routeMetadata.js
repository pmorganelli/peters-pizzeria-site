import { pathForRoute, titleForRoute } from '../utils/routes.js';
import { isOptimizable, sourceSrc } from '../utils/photos.js';

export const SITE_URL = 'https://peters-pizzeria-site.vercel.app';
export const DEFAULT_SOCIAL_IMAGE = '/photos/static/pizza-ooni.jpg';

const DESCRIPTIONS = {
  home: 'A student-run pizzeria serving 72-hour fermented slices every Saturday in Medford and Somerville, Massachusetts.',
  menu: 'See the current Peter’s Pizzeria slice menu, add-ons, desserts, prices, and sold-out items.',
  blog: 'Stories, recipes, and lessons from the students behind Peter’s Pizzeria and Saturday Slices.',
  gallery: 'Photos from the Peter’s Pizzeria kitchen, Saturday Slices service, pizzas, crew, and community.',
  studio: 'Create a Peter’s Pizzeria social card from a favorite story and kitchen photo.',
  order: 'Order Peter’s Pizzeria slices ahead for Saturday pickup and track the kitchen’s availability.',
  status: 'Check a Peter’s Pizzeria pickup code and follow an order from received to ready.',
  slices: 'See photos shared by the Peter’s Pizzeria community and post a recent slice of your own.',
  admin: 'Peter’s Pizzeria staff order board.',
  nights: 'Peter’s Pizzeria staff revenue archive.',
};

export function metadataForRoute(page, article = null) {
  const path = pathForRoute(page, article);
  const description = page === 'article'
    ? (article?.excerpt || DESCRIPTIONS.blog)
    : (DESCRIPTIONS[page] || DESCRIPTIONS.home);
  // A social scraper fetches this URL directly — no responsive selection, no
  // /_vercel/image transform — so it has to name a file that actually ships.
  // `article.img` is a bare /photos/<file> path pointing at a camera original,
  // and only photos/large and photos/static are symlinked into public/photos:
  // the raw path 404s into the SPA fallback. Map it onto the source tier,
  // which is a plain deployed file a scraper can read.
  const articleImage = page === 'article' && isOptimizable(article?.img)
    ? sourceSrc(article.img)
    : null;
  const imagePath = articleImage ?? DEFAULT_SOCIAL_IMAGE;
  return {
    title: titleForRoute(page, article),
    description,
    canonical: `${SITE_URL}${path}`,
    image: `${SITE_URL}${imagePath}`,
    type: page === 'article' ? 'article' : 'website',
  };
}
