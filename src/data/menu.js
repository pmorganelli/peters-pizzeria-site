export const MENU_DATA = [
  {
    category: 'Saturday Slices',
    items: [
      { name: 'Chef\'s Choice',     desc: "Pepperoni slice with hot honey, burrata, basil, and parmigiano reggiano",         price: '$4'    },
      { name: 'Cheese Slice',       desc: 'Fresh basil & parmigiano reggiano',                   price: '$2'    },
      { name: 'Pepperoni',          desc: 'Tomato, our mozzarella blend, pepperoni',            price: '$2.50' },
      { name: 'Margherita',         desc: 'Bianco DiNapoli tomatoes, fior di latte, basil',      price: '$4' },
      { name: 'Bianca',             desc: 'Ricotta, garlic, olive oil, rosemary',                price: '$3' },
      // `special` puts an item on the homepage "This week's specials" strip.
      // Toggle availability from the admin board — sold-out items grey out
      // everywhere (homepage + order page) and can't be ordered.
      { name: 'Pesto',              desc: 'House-made pesto sauce, cheese',                      price: '$4', special: 'Special' },
      { name: 'Vodka',              desc: 'House-made vodka sauce, cheese',                      price: '$4', special: 'Special' },
      { name: 'Nduja & Hot Honey',  desc: 'Spicy Calabrian nduja, house hot honey, stracciatella', price: '$4', special: 'Slice of the Week' },
    ],
  },
  {
    category: 'Add Ons',
    items: [
      { name: '+ Burrata',             desc: 'Creamy fresh burrata filling',                        price: '+$1'   },
      { name: '+ Hot Honey',           desc: "Mike's Hot Honey",                                    price: '+50¢'  },
      { name: '+ Pepperoni',           desc: 'Cup & char, crispy edges',                            price: '+50¢'  },
    ],
  },
  {
    category: 'Desserts & Sides',
    items: [
      { name: 'Tiramisu',       desc: 'Made in-house',                                         price: '$5'  },
      { name: 'Focaccia Bread',       desc: 'Made in-house',                                    price: '$2'  },
    ],
  },
];
