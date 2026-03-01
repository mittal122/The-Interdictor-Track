import Database from 'better-sqlite3';
import bcrypt from 'bcrypt';

const db = new Database('interdictor.db');

// Initialize database schema
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    role TEXT NOT NULL
  )
`);

// Seed initial users if they don't exist
const insertUser = db.prepare('INSERT OR IGNORE INTO users (username, password, role) VALUES (?, ?, ?)');

const adminHash = bcrypt.hashSync('admin', 10);
const viewerHash = bcrypt.hashSync('viewer', 10);

insertUser.run('admin', adminHash, 'admin');
insertUser.run('viewer', viewerHash, 'viewer');

export default db;
