require('dotenv').config();

const express = require('express');
const path = require('path');
const session = require('express-session');
const SQLiteStore = require('connect-sqlite3')(session);

const app = express();
const PORT = process.env.PORT || 3000;
const isProd = process.env.NODE_ENV === 'production';

// Trust Render's reverse proxy so that secure cookies work over HTTPS
if (isProd) app.set('trust proxy', 1);

if (!process.env.SESSION_SECRET) {
  console.warn('⚠️  SESSION_SECRET is not set. Using insecure default — set it in .env before deploying!');
}

// Initialize DB (runs schema + seed on first start)
require('./database/db');

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use(express.static(path.join(__dirname, 'public')));

// Session — SQLiteStore replaces MemoryStore (production-safe, survives restarts)
app.use(session({
  store: new SQLiteStore({
    db: 'sessions.db',
    dir: process.env.DB_PATH ? require('path').dirname(process.env.DB_PATH) : './database',
    concurrentDB: true,
  }),
  secret: process.env.SESSION_SECRET || 'coffee-insecure-dev-secret',
  resave: false,
  saveUninitialized: false,
  cookie: {
    maxAge: 8 * 60 * 60 * 1000, // 8 hours
    secure: isProd,              // HTTPS only in production (trust proxy ensures this works)
    httpOnly: true,              // Prevent JS access to the cookie
    sameSite: 'lax'
  }
}));

// API Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/menu', require('./routes/menu'));
app.use('/api/sessions', require('./routes/sessions'));
app.use('/api/orders', require('./routes/orders'));

// Route /order to the customer ordering page
app.get('/order', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'order', 'index.html'));
});

// Fallback
app.get('/{*path}', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`\n☕  Coffee E-Menu running at http://localhost:${PORT}`);
  console.log(`   Admin panel: http://localhost:${PORT}/admin/login.html`);
  console.log(`   Mode: ${isProd ? 'production' : 'development'}\n`);
});

