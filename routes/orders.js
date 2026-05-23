const express = require('express');
const router = express.Router();
const db = require('../database/db');
const requireAuth = require('../middleware/requireAuth');

// Same GMT+7 deadline parser as sessions.js
function parseDeadline(dt) {
  return new Date(dt + ':00+07:00');
}


// POST /api/orders — submit order (public, customer)
router.post('/', (req, res) => {
  const { session_token, customer_name, notes, items } = req.body;

  if (!session_token || !customer_name || !items || !Array.isArray(items) || items.length === 0)
    return res.status(400).json({ error: 'session_token, customer_name, and items[] are required.' });

  // Validate session
  const session = db.prepare('SELECT * FROM sessions WHERE token = ?').get(session_token);
  if (!session) return res.status(404).json({ error: 'Session not found.' });

  // Auto-close check
  if (session.status === 'open' && parseDeadline(session.deadline) < new Date()) {
    db.prepare("UPDATE sessions SET status = 'closed' WHERE id = ?").run(session.id);
    return res.status(403).json({ error: 'Session has expired.' });
  }
  if (session.status !== 'open') return res.status(403).json({ error: 'This session is closed.' });

  // Validate all item IDs exist and are available
  for (const item of items) {
    const menuItem = db.prepare('SELECT * FROM menu_items WHERE id = ? AND is_available = 1').get(item.menu_item_id);
    if (!menuItem) return res.status(400).json({ error: `Item ID ${item.menu_item_id} is not available.` });
  }

  // Insert order + items in a transaction
  const placeOrder = db.transaction(() => {
    const orderResult = db.prepare(
      'INSERT INTO orders (session_id, customer_name, notes) VALUES (?, ?, ?)'
    ).run(session.id, customer_name.trim(), notes || '');

    const orderId = orderResult.lastInsertRowid;
    const insertItem = db.prepare(
      'INSERT INTO order_items (order_id, menu_item_id, quantity, unit_price) VALUES (?, ?, ?, ?)'
    );

    for (const item of items) {
      const menuItem = db.prepare('SELECT price FROM menu_items WHERE id = ?').get(item.menu_item_id);
      insertItem.run(orderId, item.menu_item_id, item.quantity || 1, menuItem.price);
    }

    return orderId;
  });

  const orderId = placeOrder();
  res.status(201).json({ message: 'Order placed successfully!', order_id: orderId });
});

// GET /api/orders?session_id=X — all orders for a session (admin)
router.get('/', requireAuth, (req, res) => {
  const { session_id } = req.query;
  if (!session_id) return res.status(400).json({ error: 'session_id query param required.' });

  const orders = db.prepare(`
    SELECT o.id, o.customer_name, o.notes, o.created_at,
      json_group_array(json_object(
        'menu_item_id', oi.menu_item_id,
        'item_name', m.name,
        'quantity', oi.quantity,
        'unit_price', oi.unit_price,
        'subtotal', oi.quantity * oi.unit_price
      )) as items,
      SUM(oi.quantity * oi.unit_price) as total
    FROM orders o
    JOIN order_items oi ON oi.order_id = o.id
    JOIN menu_items m ON m.id = oi.menu_item_id
    WHERE o.session_id = ?
    GROUP BY o.id
    ORDER BY o.created_at DESC
  `).all(session_id);

  // Parse items JSON string from SQLite
  const parsed = orders.map(o => ({ ...o, items: JSON.parse(o.items) }));
  res.json(parsed);
});

// GET /api/orders/export?session_id=X — CSV export (admin)
router.get('/export', requireAuth, (req, res) => {
  const { session_id } = req.query;
  if (!session_id) return res.status(400).json({ error: 'session_id required.' });

  const session = db.prepare('SELECT * FROM sessions WHERE id = ?').get(session_id);
  if (!session) return res.status(404).json({ error: 'Session not found.' });

  const rows = db.prepare(`
    SELECT o.customer_name, o.notes, o.created_at,
      m.name as item_name, m.category,
      oi.quantity, oi.unit_price,
      (oi.quantity * oi.unit_price) as subtotal
    FROM orders o
    JOIN order_items oi ON oi.order_id = o.id
    JOIN menu_items m ON m.id = oi.menu_item_id
    WHERE o.session_id = ?
    ORDER BY o.created_at, o.id
  `).all(session_id);

  // Helper: convert SQLite UTC string to GMT+7 display string for CSV
  const toGMT7 = (utcStr) => {
    const d = new Date(utcStr.replace(' ', 'T') + 'Z');
    return d.toLocaleString('en-CA', { timeZone: 'Asia/Phnom_Penh', hour12: false })
      .replace(',', ''); // "2026-05-22 21:30:00"
  };

  const csvHeader = 'Customer Name,Item,Category,Qty,Unit Price (៛),Subtotal (៛),Notes,Time (GMT+7)\n';
  const csvRows = rows.map(r =>
    `"${r.customer_name}","${r.item_name}","${r.category}",${r.quantity},${r.unit_price},${r.subtotal},"${r.notes || ''}","${toGMT7(r.created_at)}"`
  ).join('\n');

  const safeTitle = session.title.replace(/[^a-z0-9]/gi, '_');
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="orders_${safeTitle}.csv"`);
  res.send(csvHeader + csvRows);
});

module.exports = router;
