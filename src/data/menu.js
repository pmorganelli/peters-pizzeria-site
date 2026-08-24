export const MENU_DATA = [
  {
    category: 'Saturday Slices',
    items: [
      { name: 'Chef\'s Choice',     desc: "Pepperoni slice with hot honey, stracciatella, and fresh basil",         price: '$4'    },
      { name: 'Cheese',             desc: 'House-made sauce, our mozzarella blend, fresh basil, pecorino romano, & parmigiano reggiano',                   price: '$2'    },
      { name: 'Pepperoni',          desc: 'Pepperoni, house-made sauce, our mozzarella blend, fresh basil, pecorino romano, & parmigiano reggiano',            price: '$2.50' },
      { name: 'Margherita',         desc: 'House-made sauce, fior di latte, basil',                             price: '$4', maxQty: 4 },
      // `special` puts an item on the homepage "This week's specials" strip
      // and stamps a SPECIAL tag on its menu row.
      // Toggle availability from the admin board — sold-out items grey out
      // everywhere (homepage + order page) and can't be ordered.
      { name: 'Bianca',             desc: 'Ricotta, garlic, olive oil, rosemary',                            price: '$3', special: 'Special' },
      { name: 'Pesto',              desc: 'House-made pesto sauce, our mozzarella blend, fresh basil',                      price: '$4', special: 'Special' },
      { name: 'Vodka',              desc: 'House-made vodka sauce, our mozzarella blend, fresh basil',                      price: '$4', special: 'Special' },
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
  {
    category: 'Desserts & Sides',
    items: [
      { name: 'Tiramisu',             desc: 'Made in-house',                                         price: '$4'  },
      { name: 'Focaccia Bread',       desc: 'Made in-house',                                    price: '$2'  },
    ],
  },
];
