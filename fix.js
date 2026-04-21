const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
require('dotenv').config();

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

const hash = bcrypt.hashSync('admin123', 10);

pool.query("UPDATE users SET password = $1 WHERE email = 'admin@acity.edu.gh'", [hash])
    .then(() => console.log('Admin password hash successfully fixed to match "admin123"'))
    .catch(console.error)
    .finally(() => pool.end());
