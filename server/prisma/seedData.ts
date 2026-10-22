// Static seed data shared by prisma/seed.ts (Express/SQLite) and worker/scripts/seed-sql.ts (Cloudflare D1).

export const CURRENCIES = [
  { code: 'USD', name: 'US Dollar', symbol: '$' },
  { code: 'EUR', name: 'Euro', symbol: '€' },
  { code: 'GBP', name: 'British Pound', symbol: '£' },
  { code: 'PKR', name: 'Pakistani Rupee', symbol: 'Rs' },
  { code: 'INR', name: 'Indian Rupee', symbol: '₹' },
  { code: 'AED', name: 'UAE Dirham', symbol: 'د.إ' },
  { code: 'SAR', name: 'Saudi Riyal', symbol: '﷼' },
  { code: 'CAD', name: 'Canadian Dollar', symbol: 'C$' },
  { code: 'AUD', name: 'Australian Dollar', symbol: 'A$' },
  { code: 'JPY', name: 'Japanese Yen', symbol: '¥' },
]

export const EMAIL_TEMPLATES = [
  {
    code: 'payable_reminder',
    name: 'Payable reminder',
    subject: 'Outstanding payable reminder',
    body: 'Hi {{name}},\n\nYour current payable amount is {{amount}}.\nPlease settle at your earliest convenience.\n\nThanks,\n{{appName}}',
  },
  {
    code: 'welcome',
    name: 'Welcome email',
    subject: 'Welcome to {{appName}}',
    body: 'Hi {{name}},\n\nWelcome to {{appName}} — {{tagline}}.\n\nYou can sign in and start picking items.\n\nThanks!',
  },
]

/** Inserted only when the Item table is empty. */
export const SAMPLE_ITEMS = [
  {
    title: 'Cola Can',
    description: 'Chilled soft drink',
    price: 1.5,
    buyingPrice: 0.9,
    quantity: 20,
    imageUrl: 'https://images.unsplash.com/photo-1629203851122-3726ecdf080e?w=400&h=400&fit=crop',
  },
  {
    title: 'Potato Chips',
    description: 'Crispy snack pack',
    price: 2.0,
    buyingPrice: 1.2,
    quantity: 15,
    imageUrl: 'https://images.unsplash.com/photo-1566478989037-eec1753d04eb?w=400&h=400&fit=crop',
  },
  {
    title: 'Chocolate Bar',
    description: 'Sweet treat',
    price: 1.25,
    buyingPrice: 0.7,
    quantity: 25,
    imageUrl: 'https://images.unsplash.com/photo-1606312619070-d48b4cbc664a?w=400&h=400&fit=crop',
  },
  {
    title: 'Bottled Water',
    description: '500ml still water',
    price: 0.75,
    buyingPrice: 0.35,
    quantity: 30,
    imageUrl: 'https://images.unsplash.com/photo-1548839140-29a749e1cf4d?w=400&h=400&fit=crop',
  },
]
