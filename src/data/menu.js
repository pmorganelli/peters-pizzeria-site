export const MENU_DATA = [
  {
    category: 'Saturday Slices',
    items: [
      // maxQty lives here for now because Margherita — which normally carries
      // it — is commented out below. Move it back when Margherita returns
      // rather than leaving two capped slices: `CAPPED_ITEM` in
      // tests/helpers/fixtures.js is "whichever slice has its own maxQty", and
      // the per-item cap tests go quiet if no slice has one at all.
      { name: 'Chef\'s Choice',     desc: "Pepperoni slice with hot honey, stracciatella, and fresh basil",         price: '$4', maxQty: 4 },
      { name: 'Cheese',             desc: 'House-made sauce, our mozzarella blend, fresh basil, pecorino romano, & parmigiano reggiano',                   price: '$2'    },
      { name: 'Pepperoni',          desc: 'Pepperoni, house-made sauce, our mozzarella blend, fresh basil, pecorino romano, & parmigiano reggiano',            price: '$2.50' },
      // ── Off this week, back in a future one ──────────────────────────
      // Commented out rather than deleted so the descriptions and prices come
      // back verbatim. Nothing else needs touching to restore one: the order
      // page, the catalog the server prices against, and the sitemap all read
      // this array. (For a single sold-out night use the admin Availability
      // panel instead — that greys the item out where this hides it.)
      //
      // `special` puts an item on the homepage "This week's specials" strip
      // and stamps a SPECIAL tag on its menu row. The three specials below are
      // *also* listed in UPCOMING_SPECIALS so the homepage can still show what
      // is coming back — uncommenting one here means deleting it from there,
      // or it appears twice.
      // { name: 'Margherita',         desc: 'House-made sauce, fior di latte, basil',                             price: '$4', maxQty: 4 },
      // { name: 'Bianca',             desc: 'Ricotta, garlic, olive oil, rosemary',                            price: '$3', special: 'Special' },
      // { name: 'Pesto',              desc: 'House-made pesto sauce, our mozzarella blend, fresh basil',                      price: '$4', special: 'Special' },
      // { name: 'Vodka',              desc: 'House-made vodka sauce, our mozzarella blend, fresh basil',                      price: '$4', special: 'Special' },
      // { name: 'Nduja & Hot Honey',  desc: 'Spicy Calabrian nduja, house hot honey, stracciatella', price: '$4', special: 'Slice of the Week' },
    ],
  },
  {
    category: 'Add Ons',
    items: [
      // `keyword` is checked against an item's desc (case-insensitive substring) to
      // decide whether this add-on reads as "Extra X" there — e.g. stracciatella on
      // Chef's Choice, which already comes with it — vs. plain "X" on a slice that
      // doesn't. See addonLabel() in src/utils/orders.js.
      { name: '+ Stracciatella',             desc: 'Creamy fresh burrata filling',                        price: '+$1',  keyword: 'stracciatella' },
      { name: '+ Hot Honey',                 desc: "Mike's Hot Honey",                                    price: '+50¢', keyword: 'hot honey'     },
      { name: '+ Extra Parm',                desc: 'An extra generous amount',                            price: '+50¢', keyword: 'parm'          },
      { name: '+ Extra Basil',               desc: 'An extra generous amount',                            price: '+50¢', keyword: 'basil'         },
    ],
  },
  // {
  //   category: 'Desserts & Sides',
  //   // Empty for this week — the menu page renders a "coming soon" line for a
  //   // category with no items rather than a bare heading.
  //   items: [
  //     // { name: 'Tiramisu',             desc: 'Made in-house',                                         price: '$4'  },
  //     // { name: 'Focaccia Bread',       desc: 'Made in-house',                                    price: '$2'  },
  //   ],
  // },
];

// Specials that are off the menu right now but are coming back. The homepage
// strip falls back to this when nothing in MENU_DATA carries `special`, so the
// section still says what's on the way instead of going dark for a week.
//
// Deliberately a separate array rather than a flag on a commented-out item:
// everything in MENU_DATA is orderable and priced by the server from it, and
// these are neither. Nothing here can be added to a cart — that's the point.
// Keep it in sync by hand with the commented-out block above; an item should
// be in exactly one of the two places.
export const UPCOMING_SPECIALS = [
  { name: 'Bianca', desc: 'Ricotta, garlic, olive oil, rosemary',                     price: '$3' },
  { name: 'Pesto',  desc: 'House-made pesto sauce, our mozzarella blend, fresh basil', price: '$4' },
  { name: 'Vodka',  desc: 'House-made vodka sauce, our mozzarella blend, fresh basil', price: '$4' },
];
