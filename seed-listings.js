
const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

async function seed() {
    try {
        console.log('Connecting to database...');

        /* First get the admin user's ID to use as the owner */
        var result = await pool.query(
            "SELECT id FROM users WHERE email = 'admin@acity.edu.gh' LIMIT 1"
        );

        if (result.rows.length === 0) {
            console.log('Admin user not found. Run setup-db.js first.');
            return;
        }

        var adminId = result.rows[0].id;

        /* The sample listings to insert */
        var listings = [
            {
                title:       'Calculus Textbook (James Stewart, 8th Edition)',
                description: 'Used for one semester. Good condition, all pages intact. A few pencil marks in chapters 3 and 5 which can be erased. Selling because I have completed the course.',
                category:    'item'
            },
            {
                title:       'Python Programming Tutoring',
                description: 'I offer one-on-one Python tutoring sessions. I can help with basics, data structures, web scraping, and introductory data science. Available weekday evenings and weekends.',
                category:    'skill'
            },
            {
                title:       'HP Laptop Charger (65W, USB-C)',
                description: 'Original HP USB-C 65W charger. Works perfectly, just bought a new laptop. Compatible with most HP Pavilion and Envy models that use USB-C charging.',
                category:    'item'
            },
            {
                title:       'Graphic Design Services (Flyers, Logos)',
                description: 'I can design flyers, logos, social media posts, and presentations using Canva and Adobe Illustrator. Quick turnaround. DM me through the messaging system.',
                category:    'skill'
            }
        ];

        /* Insert each listing as approved so they show immediately */
        for (var i = 0; i < listings.length; i++) {
            var l = listings[i];
            await pool.query(
                `INSERT INTO listings (user_id, title, description, category, status, is_approved)
                 VALUES ($1, $2, $3, $4, 'available', TRUE)
                 ON CONFLICT DO NOTHING`,
                [adminId, l.title, l.description, l.category]
            );
            console.log('Added: ' + l.title);
        }

        console.log('');
        console.log('Done! ' + listings.length + ' listings added to the marketplace.');
        console.log('Refresh your dashboard to see them.');

    } catch (err) {
        console.log('ERROR:', err.message);
    } finally {
        await pool.end();
    }
}

seed();
