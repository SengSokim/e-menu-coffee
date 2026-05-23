const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { parse } = require('csv-parse/sync');
const db = require('../database/db');
const requireAuth = require('../middleware/requireAuth');

// Multer config for images
const imageStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(__dirname, '../uploads/images');
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `item_${Date.now()}${ext}`);
  },
});

// Multer config for CSVs
const csvStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(__dirname, '../uploads/csv');
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    cb(null, `menu_${Date.now()}.csv`);
  },
});

const uploadImage = multer({ storage: imageStorage, limits: { fileSize: 5 * 1024 * 1024 } });
const uploadCSV = multer({ storage: csvStorage });

// GET /api/menu — public
router.get('/', (req, res) => {
  const items = db.prepare('SELECT * FROM menu_items ORDER BY category, name').all();
  res.json(items);
});

// POST /api/menu — add single item (admin)
router.post('/', requireAuth, uploadImage.single('image'), (req, res) => {
  const { name, description, price, category } = req.body;
  if (!name || !price) return res.status(400).json({ error: 'Name and price are required.' });

  const image_url = req.file ? `/uploads/images/${req.file.filename}` : null;
  const result = db.prepare(
    'INSERT INTO menu_items (name, description, price, category, image_url) VALUES (?, ?, ?, ?, ?)'
  ).run(name, description || '', parseFloat(price), category || 'Uncategorized', image_url);

  res.status(201).json({ id: result.lastInsertRowid, message: 'Menu item added.' });
});

// POST /api/menu/upload-csv — bulk upload (admin)
router.post('/upload-csv', requireAuth, uploadCSV.single('csv'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No CSV file uploaded.' });

  const content = fs.readFileSync(req.file.path, 'utf8');
  let records;
  try {
    records = parse(content, { columns: true, skip_empty_lines: true, trim: true });
  } catch (err) {
    return res.status(400).json({ error: 'Invalid CSV format: ' + err.message });
  }

  const insert = db.prepare(
    'INSERT INTO menu_items (name, description, price, category) VALUES (?, ?, ?, ?)'
  );
  const insertMany = db.transaction((rows) => {
    let count = 0;
    for (const row of rows) {
      if (!row.name || !row.price) continue;
      insert.run(row.name, row.description || '', parseFloat(row.price), row.category || 'Uncategorized');
      count++;
    }
    return count;
  });

  const count = insertMany(records);
  fs.unlinkSync(req.file.path); // Clean up temp csv
  res.json({ message: `${count} items imported successfully.` });
});

// PUT /api/menu/:id — update item (admin)
router.put('/:id', requireAuth, uploadImage.single('image'), (req, res) => {
  const { name, description, price, category } = req.body;
  const item = db.prepare('SELECT * FROM menu_items WHERE id = ?').get(req.params.id);
  if (!item) return res.status(404).json({ error: 'Item not found.' });

  const image_url = req.file ? `/uploads/images/${req.file.filename}` : item.image_url;
  db.prepare(
    'UPDATE menu_items SET name=?, description=?, price=?, category=?, image_url=? WHERE id=?'
  ).run(
    name || item.name,
    description !== undefined ? description : item.description,
    price ? parseFloat(price) : item.price,
    category || item.category,
    image_url,
    req.params.id
  );

  res.json({ message: 'Item updated.' });
});

// PATCH /api/menu/:id/availability — toggle availability (admin)
router.patch('/:id/availability', requireAuth, (req, res) => {
  const item = db.prepare('SELECT * FROM menu_items WHERE id = ?').get(req.params.id);
  if (!item) return res.status(404).json({ error: 'Item not found.' });

  const newVal = item.is_available ? 0 : 1;
  db.prepare('UPDATE menu_items SET is_available = ? WHERE id = ?').run(newVal, req.params.id);
  res.json({ is_available: newVal });
});

// DELETE /api/menu/:id (admin)
router.delete('/:id', requireAuth, (req, res) => {
  const item = db.prepare('SELECT * FROM menu_items WHERE id = ?').get(req.params.id);
  if (!item) return res.status(404).json({ error: 'Item not found.' });

  db.prepare('DELETE FROM menu_items WHERE id = ?').run(req.params.id);
  res.json({ message: 'Item deleted.' });
});

module.exports = router;
