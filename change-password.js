/**
 * Change Admin Password Utility
 * Usage: node change-password.js <username> <newpassword>
 * Example: node change-password.js admin MyNewSecurePass123
 */
const bcrypt = require('bcryptjs');
const db = require('./database/db');

const [,, username, newPassword] = process.argv;

if (!username || !newPassword) {
  console.error('Usage: node change-password.js <username> <newpassword>');
  process.exit(1);
}

if (newPassword.length < 8) {
  console.error('❌ Password must be at least 8 characters.');
  process.exit(1);
}

const admin = db.prepare('SELECT id FROM admins WHERE username = ?').get(username);
if (!admin) {
  console.error(`❌ Admin user "${username}" not found.`);
  process.exit(1);
}

const hash = bcrypt.hashSync(newPassword, 12);
db.prepare('UPDATE admins SET password_hash = ? WHERE username = ?').run(hash, username);
console.log(`✅ Password for "${username}" updated successfully.`);
process.exit(0);
