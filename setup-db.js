/* ============================================================
   setup-db.js
   Run this file ONCE to create all the database tables.
   It connects to your Render PostgreSQL and runs the SQL.

   How to run:
       node setup-db.js
   ============================================================ */

const { Pool } = require('pg');   /* PostgreSQL library */
require('dotenv').config();        /* loads DATABASE_URL from .env */

/* Connect to the database using the URL from .env */
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }   /* required for Render.com */
});

/* All the SQL commands to run in order */
const sql = `

    CREATE TABLE IF NOT EXISTS users (
        id             SERIAL PRIMARY KEY,
        full_name      VARCHAR(100) NOT NULL,
        email          VARCHAR(150) UNIQUE NOT NULL,
        password       VARCHAR(255) NOT NULL,
        role           VARCHAR(10)  DEFAULT 'student',
        skills_offered TEXT DEFAULT '',
        skills_needed  TEXT DEFAULT '',
        bio            TEXT DEFAULT '',
        created_at     TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS listings (
        id          SERIAL PRIMARY KEY,
        user_id     INT REFERENCES users(id) ON DELETE CASCADE,
        title       VARCHAR(200) NOT NULL,
        description TEXT NOT NULL,
        category    VARCHAR(10) NOT NULL,
        status      VARCHAR(15) DEFAULT 'available',
        is_approved BOOLEAN DEFAULT FALSE,
        is_flagged  BOOLEAN DEFAULT FALSE,
        created_at  TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS interactions (
        id           SERIAL PRIMARY KEY,
        listing_id   INT REFERENCES listings(id) ON DELETE CASCADE,
        from_user_id INT REFERENCES users(id) ON DELETE CASCADE,
        created_at   TIMESTAMP DEFAULT NOW(),
        UNIQUE (listing_id, from_user_id)
    );

    CREATE TABLE IF NOT EXISTS notifications (
        id         SERIAL PRIMARY KEY,
        user_id    INT REFERENCES users(id) ON DELETE CASCADE,
        message    TEXT NOT NULL,
        is_read    BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS messages (
        id           SERIAL PRIMARY KEY,
        from_user_id INT REFERENCES users(id) ON DELETE CASCADE,
        to_user_id   INT REFERENCES users(id) ON DELETE CASCADE,
        listing_id   INT REFERENCES listings(id) ON DELETE SET NULL,
        body         TEXT NOT NULL,
        created_at   TIMESTAMP DEFAULT NOW()
    );

    INSERT INTO users (full_name, email, password, role)
    VALUES (
        'Admin User',
        'admin@acity.edu.gh',
        '$2b$10$KIXkP1YiSf1b1RlBLs9XeOhQB3J8meF6bWxhWrC4xGe3Md3K.CQKC',
        'admin'
    ) ON CONFLICT (email) DO NOTHING;

`;

/* Run the SQL and print what happens */
async function setup() {
    try {
        console.log('Connecting to database...');
        await pool.query(sql);
        console.log('');
        console.log('SUCCESS! All tables created.');
        console.log('Admin account ready: admin@acity.edu.gh / admin123');
        console.log('');
    } catch (err) {
        console.log('ERROR:', err.message);
    } finally {
        await pool.end();   /* close the connection when done */
    }
}

setup();
