const express = require('express');
const router = express.Router();
const { nanoid } = require('nanoid');
const db = require('../database/db');
const requireAuth = require('../middleware/requireAuth');

// Deadline is stored as a local GMT+7 datetime string from the browser's datetime-local input
// (e.g. '2026-05-22T22:00'). Append +07:00 so Node.js parses it as the correct UTC epoch.
function parseDeadline(dt) {
  return new Date(dt + ':00+07:00');
}


// GET /api/sessions — list all (admin)
router.get('/', requireAuth, (req, res) => {
  const sessions = db.prepare(`
    SELECT s.*, 
      (SELECT COUNT(*) FROM orders o WHERE o.session_id = s.id) as order_count
    FROM sessions s
    ORDER BY s.created_at DESC
  `).all();
  res.json(sessions);
});

// POST /api/sessions — create new session (admin)
router.post('/', requireAuth, (req, res) => {
  const { title, deadline } = req.body;
  if (!title || !deadline) return res.status(400).json({ error: 'Title and deadline are required.' });

  const token = nanoid(10);
  const result = db.prepare(
    'INSERT INTO sessions (token, title, deadline, created_by) VALUES (?, ?, ?, ?)'
  ).run(token, title, deadline, req.session.adminId);

  const session = db.prepare('SELECT * FROM sessions WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json(session);
});

// GET /api/sessions/:token — get by token (public, used by customer page)
router.get('/:token', (req, res) => {
  const session = db.prepare('SELECT * FROM sessions WHERE token = ?').get(req.params.token);
  if (!session) return res.status(404).json({ error: 'Session not found.' });

  // Auto-close if past deadline
  if (session.status === 'open' && parseDeadline(session.deadline) < new Date()) {
    db.prepare("UPDATE sessions SET status = 'closed' WHERE id = ?").run(session.id);
    session.status = 'closed';
  }

  res.json(session);
});

// PATCH /api/sessions/:id/close — manually close (admin)
router.patch('/:id/close', requireAuth, (req, res) => {
  const session = db.prepare('SELECT * FROM sessions WHERE id = ?').get(req.params.id);
  if (!session) return res.status(404).json({ error: 'Session not found.' });

  db.prepare("UPDATE sessions SET status = 'closed' WHERE id = ?").run(req.params.id);
  res.json({ message: 'Session closed.' });
});

// PATCH /api/sessions/:id/open — reopen session (admin)
router.patch('/:id/open', requireAuth, (req, res) => {
  const session = db.prepare('SELECT * FROM sessions WHERE id = ?').get(req.params.id);
  if (!session) return res.status(404).json({ error: 'Session not found.' });

  db.prepare("UPDATE sessions SET status = 'open' WHERE id = ?").run(req.params.id);
  res.json({ message: 'Session reopened.' });
});

// DELETE /api/sessions/:id (admin)
router.delete('/:id', requireAuth, (req, res) => {
  const session = db.prepare('SELECT * FROM sessions WHERE id = ?').get(req.params.id);
  if (!session) return res.status(404).json({ error: 'Session not found.' });

  db.prepare('DELETE FROM order_items WHERE order_id IN (SELECT id FROM orders WHERE session_id = ?)').run(req.params.id);
  db.prepare('DELETE FROM orders WHERE session_id = ?').run(req.params.id);
  db.prepare('DELETE FROM sessions WHERE id = ?').run(req.params.id);
  res.json({ message: 'Session deleted.' });
});

module.exports = router;
