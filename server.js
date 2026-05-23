require('dotenv').config();

const express = require('express');
const path = require('path');
const session = require('express-session');

const app = express();
const PORT = process.env.PORT || 3000;
const isProd = process.env.NODE_ENV === 'production';

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

// Session
app.use(session({
  secret: process.env.SESSION_SECRET || 'coffee-insecure-dev-secret',
  resave: false,
  saveUninitialized: false,
  cookie: {
    maxAge: 8 * 60 * 60 * 1000, // 8 hours
    secure: isProd,              // HTTPS only in production
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

