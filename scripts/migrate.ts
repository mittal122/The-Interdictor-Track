import { Pool } from 'pg';
import bcrypt from 'bcrypt';
import dotenv from 'dotenv';

dotenv.config();

const pool = new Pool({
    host: process.env.PG_HOST || 'localhost',
    port: parseInt(process.env.PG_PORT || '5432'),
    user: process.env.PG_USER || 'interdictor',
    password: process.env.PG_PASSWORD || 'interdictor',
    database: process.env.PG_DATABASE || 'interdictor_db',
});

async function migrate() {
    const client = await pool.connect();

    try {
        console.log('🔄 Starting PostgreSQL migration...');

        // Create users table
        await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        username VARCHAR(255) UNIQUE NOT NULL,
        password VARCHAR(255) NOT NULL,
        role VARCHAR(50) NOT NULL CHECK (role IN ('admin', 'viewer')),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )
    `);
        console.log('✅ Users table created (or already exists).');

        // Seed admin account
        const adminHash = await bcrypt.hash('admin', 10);
        await client.query(`
      INSERT INTO users (username, password, role)
      VALUES ($1, $2, $3)
      ON CONFLICT (username) DO UPDATE SET password = $2, role = $3
    `, ['admin', adminHash, 'admin']);
        console.log('✅ Admin account seeded (admin / admin).');

        // Seed viewer account
        const viewerHash = await bcrypt.hash('viewer', 10);
        await client.query(`
      INSERT INTO users (username, password, role)
      VALUES ($1, $2, $3)
      ON CONFLICT (username) DO UPDATE SET password = $2, role = $3
    `, ['viewer', viewerHash, 'viewer']);
        console.log('✅ Viewer account seeded (viewer / viewer).');

        console.log('\n🎉 Migration complete! Database is ready.');
    } catch (error) {
        console.error('❌ Migration failed:', error);
        process.exit(1);
    } finally {
        client.release();
        await pool.end();
    }
}

migrate();
