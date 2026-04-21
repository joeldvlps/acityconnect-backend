/*
   ACITY CONNECT — Main Backend Server

/*
   STEP 1: Load required packages / libraries
*/
const express    = require('express');      // web server framework
const cors       = require('cors');         // allow frontend to call this API
const bcrypt     = require('bcryptjs');     // for hashing passwords securely
const jwt        = require('jsonwebtoken'); // for creating login tokens
const { Pool }   = require('pg');          // for talking to PostgreSQL database
require('dotenv').config();                 // load values from .env file


    /*
    STEP 2: Create the Express app
*/
const app = express();

// Allow requests from any origin (required when frontend & backend are separate)
app.use(cors());

// Tell Express to read JSON from request bodies
app.use(express.json());


/*
    STEP 3: Connect to PostgreSQL database
    We read connection details from environment variables
   so we never write passwords in the code.
*/
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,  // set this in Render.com or .env
    // rejectUnauthorized: false allows self-signed certs (needed for Render.com)
    ssl: { rejectUnauthorized: false }
});


/*
   STEP 4: Middleware — Verify JWT Token
   This function checks if the user is logged in.
   It reads a token from the Authorization header,
   verifies it, and puts the user data on "req.user".
*/
function verifyToken(req, res, next) {

    // The header looks like: "Bearer eyJhbGciOiJIUzI1N..."
    const authHeader = req.headers['authorization'];

    // If there is no header at all, deny access
    if (!authHeader) {
        return res.status(401).json({ error: 'No token provided. Please log in.' });
    }

    // Split "Bearer TOKEN" and take the second part (the actual token)
    const token = authHeader.split(' ')[1];

    try {
        // Verify the token using our secret key
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        // Attach the decoded user info to the request
        req.user = decoded;
        // Pass control to the next function
        next();
    } catch (err) {
        return res.status(401).json({ error: 'Invalid or expired token. Please log in again.' });
    }
}


/*
   STEP 5: Middleware — Check if user is an Admin
   This runs AFTER verifyToken. It checks the user's role.
*/
function isAdmin(req, res, next) {
    if (req.user.role !== 'admin') {
        return res.status(403).json({ error: 'Access denied. Admins only.' });
    }
    next();
}


/*
   AUTH ROUTES — Registration and Login
*/


/*
   POST /api/auth/register
   Creates a new student account.
   Validates that the email is an ACity email.
*/
app.post('/api/auth/register', async (req, res) => {

    // Get the data sent by the form
    const { full_name, email, password } = req.body;

    // Check all fields are filled in
    if (!full_name || !email || !password) {
        return res.status(400).json({ error: 'Please fill in all fields.' });
    }

    // Check that the email ends with @acity.edu.gh
    if (!email.endsWith('@acity.edu.gh')) {
        return res.status(400).json({ error: 'You must use an ACity email (you@acity.edu.gh).' });
    }

    // Check password is at least 6 characters
    if (password.length < 6) {
        return res.status(400).json({ error: 'Password must be at least 6 characters.' });
    }

    try {
        // Hash the password — NEVER save plain text passwords in a database!
        // The "10" is the number of salt rounds (higher = slower but more secure)
        const hashedPassword = await bcrypt.hash(password, 10);

        // Insert the new user into the database
        const result = await pool.query(
            'INSERT INTO users (full_name, email, password) VALUES ($1, $2, $3) RETURNING id, full_name, email, role',
            [full_name, email, hashedPassword]
        );

        // Get the newly created user
        const newUser = result.rows[0];

        // Create a JWT token for the user (so they are logged in immediately after registering)
        const token = jwt.sign(
            { id: newUser.id, email: newUser.email, role: newUser.role },
            process.env.JWT_SECRET,
            { expiresIn: '7d' }  // token lasts 7 days
        );

        // Send the token and user info back to the browser
        res.status(201).json({ token, user: newUser });

    } catch (err) {
        // Check if the email is already taken (unique constraint error)
        if (err.code === '23505') {
            return res.status(400).json({ error: 'This email is already registered.' });
        }
        res.status(500).json({ error: 'Server error: ' + err.message });
    }
});


/*
   POST /api/auth/login
   Logs in an existing user and returns a JWT token.
*/
app.post('/api/auth/login', async (req, res) => {

    const { email, password } = req.body;

    if (!email || !password) {
        return res.status(400).json({ error: 'Please enter your email and password.' });
    }

    try {
        // Find the user in the database by email
        const result = await pool.query(
            'SELECT * FROM users WHERE email = $1',
            [email]
        );

        // If no user found with that email
        if (result.rows.length === 0) {
            return res.status(401).json({ error: 'Wrong email or password.' });
        }

        const user = result.rows[0];

        // Compare the entered password with the hashed password in the database
        const passwordMatch = await bcrypt.compare(password, user.password);

        if (!passwordMatch) {
            return res.status(401).json({ error: 'Wrong email or password.' });
        }

        // Create a JWT token
        const token = jwt.sign(
            { id: user.id, email: user.email, role: user.role },
            process.env.JWT_SECRET,
            { expiresIn: '7d' }
        );

        // Return the token and safe user info (never return the password!)
        res.json({
            token,
            user: {
                id:       user.id,
                full_name: user.full_name,
                email:    user.email,
                role:     user.role
            }
        });

    } catch (err) {
        res.status(500).json({ error: 'Server error: ' + err.message });
    }
});


/*
   USER ROUTES — Profile
*/


/*
   GET /api/users/:id
   Get a user's profile information.
   Requires the user to be logged in (verifyToken).
*/
app.get('/api/users/:id', verifyToken, async (req, res) => {

    try {
        // Select all profile fields but NOT the password
        const result = await pool.query(
            'SELECT id, full_name, email, role, skills_offered, skills_needed, bio, created_at FROM users WHERE id = $1',
            [req.params.id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'User not found.' });
        }

        res.json(result.rows[0]);

    } catch (err) {
        res.status(500).json({ error: 'Server error: ' + err.message });
    }
});


/*
   PUT /api/users/:id
   Update a user's profile info.
   Users can only update THEIR OWN profile.
*/
app.put('/api/users/:id', verifyToken, async (req, res) => {

    // Make sure users can't edit someone else's profile
    if (parseInt(req.params.id) !== req.user.id) {
        return res.status(403).json({ error: 'You can only edit your own profile.' });
    }

    const { full_name, skills_offered, skills_needed, bio } = req.body;

    try {
        const result = await pool.query(
            `UPDATE users
             SET full_name = $1,
                 skills_offered = $2,
                 skills_needed = $3,
                 bio = $4
             WHERE id = $5
             RETURNING id, full_name, email, role, skills_offered, skills_needed, bio`,
            [full_name, skills_offered, skills_needed, bio, req.params.id]
        );

        res.json(result.rows[0]);

    } catch (err) {
        res.status(500).json({ error: 'Server error: ' + err.message });
    }
});


/*
   LISTING ROUTES — Marketplace Posts
*/


/*
   GET /api/listings
   Get all APPROVED listings. Supports search and filters.
   Public route — no login needed to browse.
*/
app.get('/api/listings', async (req, res) => {

    // Get filter values from the URL query string
    // e.g. /api/listings?category=item&status=available&search=book
    const { category, status, search } = req.query;

    // Start building the SQL query
    let query  = `SELECT l.*, u.full_name AS owner_name
                  FROM listings l
                  JOIN users u ON l.user_id = u.id
                  WHERE l.is_approved = TRUE AND l.is_flagged = FALSE`;
    let params = [];

    // Add category filter if provided
    if (category) {
        params.push(category);
        query += ` AND l.category = $${params.length}`;
    }

    // Add status filter if provided
    if (status) {
        params.push(status);
        query += ` AND l.status = $${params.length}`;
    }

    // Add search filter if provided (searches title and description)
    if (search) {
        params.push(`%${search}%`);  // % means "anything" in SQL LIKE
        query += ` AND (l.title ILIKE $${params.length} OR l.description ILIKE $${params.length})`;
    }

    // Show newest listings first
    query += ' ORDER BY l.created_at DESC';

    try {
        const result = await pool.query(query, params);
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: 'Server error: ' + err.message });
    }
});


/*
   GET /api/listings/mine
   Get only the current user's listings (including unapproved).
*/
app.get('/api/listings/mine', verifyToken, async (req, res) => {

    try {
        const result = await pool.query(
            'SELECT * FROM listings WHERE user_id = $1 ORDER BY created_at DESC',
            [req.user.id]
        );
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: 'Server error: ' + err.message });
    }
});


/*
   POST /api/listings
   Create a new listing. Goes into "pending" until admin approves.
*/
app.post('/api/listings', verifyToken, async (req, res) => {

    const { title, description, category } = req.body;

    // Validate required fields
    if (!title || !description || !category) {
        return res.status(400).json({ error: 'Title, description, and category are required.' });
    }

    // Category must be 'item' or 'skill'
    if (category !== 'item' && category !== 'skill') {
        return res.status(400).json({ error: 'Category must be item or skill.' });
    }

    try {
        // is_approved is FALSE by default — admin must approve first
        const result = await pool.query(
            `INSERT INTO listings (user_id, title, description, category)
             VALUES ($1, $2, $3, $4)
             RETURNING *`,
            [req.user.id, title, description, category]
        );

        res.status(201).json(result.rows[0]);

    } catch (err) {
        res.status(500).json({ error: 'Server error: ' + err.message });
    }
});


/*
   PUT /api/listings/:id/status
   Update the status of YOUR OWN listing (available/swapped/sold).
*/
app.put('/api/listings/:id/status', verifyToken, async (req, res) => {

    const { status } = req.body;

    // Status must be one of these three values
    if (!['available', 'swapped', 'sold'].includes(status)) {
        return res.status(400).json({ error: 'Status must be available, swapped, or sold.' });
    }

    try {
        // user_id check ensures only the owner can change status
        const result = await pool.query(
            'UPDATE listings SET status = $1 WHERE id = $2 AND user_id = $3 RETURNING *',
            [status, req.params.id, req.user.id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Listing not found or you do not own it.' });
        }

        res.json(result.rows[0]);

    } catch (err) {
        res.status(500).json({ error: 'Server error: ' + err.message });
    }
});


/*
   DELETE /api/listings/:id
   Delete YOUR OWN listing.
*/
app.delete('/api/listings/:id', verifyToken, async (req, res) => {

    try {
        await pool.query(
            'DELETE FROM listings WHERE id = $1 AND user_id = $2',
            [req.params.id, req.user.id]
        );
        res.json({ message: 'Listing deleted successfully.' });
    } catch (err) {
        res.status(500).json({ error: 'Server error: ' + err.message });
    }
});


/*
   INTERACTION ROUTES — "Interested" Button
*/


/*
   POST /api/interactions
   Express interest in a listing.
   Also sends a notification to the listing owner.
*/
app.post('/api/interactions', verifyToken, async (req, res) => {

    const { listing_id } = req.body;

    if (!listing_id) {
        return res.status(400).json({ error: 'listing_id is required.' });
    }

    try {
        // First, find the listing to get the owner's user_id
        const listingResult = await pool.query(
            'SELECT user_id, title FROM listings WHERE id = $1',
            [listing_id]
        );

        if (listingResult.rows.length === 0) {
            return res.status(404).json({ error: 'Listing not found.' });
        }

        const listing = listingResult.rows[0];

        // Users cannot express interest in their own listings
        if (listing.user_id === req.user.id) {
            return res.status(400).json({ error: 'You cannot express interest in your own listing.' });
        }

        // Insert the interaction (UNIQUE constraint prevents duplicates)
        await pool.query(
            'INSERT INTO interactions (listing_id, from_user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
            [listing_id, req.user.id]
        );

        // Send a notification to the listing owner
        await pool.query(
            'INSERT INTO notifications (user_id, message) VALUES ($1, $2)',
            [listing.user_id, `Someone is interested in your listing: "${listing.title}"`]
        );

        res.status(201).json({ message: 'Interest expressed successfully.' });

    } catch (err) {
        res.status(500).json({ error: 'Server error: ' + err.message });
    }
});


/*
   GET /api/interactions/mine
   Get a list of listings the current user expressed interest in.
*/
app.get('/api/interactions/mine', verifyToken, async (req, res) => {

    try {
        const result = await pool.query(
            `SELECT i.id, i.created_at, l.title AS listing_title, l.status AS listing_status, l.id AS listing_id
             FROM interactions i
             JOIN listings l ON i.listing_id = l.id
             WHERE i.from_user_id = $1
             ORDER BY i.created_at DESC`,
            [req.user.id]
        );
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: 'Server error: ' + err.message });
    }
});


/*
   NOTIFICATION ROUTES
*/


/*
   GET /api/notifications
   Get all notifications for the logged-in user.
*/
app.get('/api/notifications', verifyToken, async (req, res) => {

    try {
        const result = await pool.query(
            'SELECT * FROM notifications WHERE user_id = $1 ORDER BY created_at DESC',
            [req.user.id]
        );
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: 'Server error: ' + err.message });
    }
});


/*
   PUT /api/notifications/:id/read
   Mark a single notification as read.
*/
app.put('/api/notifications/:id/read', verifyToken, async (req, res) => {

    try {
        await pool.query(
            'UPDATE notifications SET is_read = TRUE WHERE id = $1 AND user_id = $2',
            [req.params.id, req.user.id]
        );
        res.json({ message: 'Notification marked as read.' });
    } catch (err) {
        res.status(500).json({ error: 'Server error: ' + err.message });
    }
});


/*
   MESSAGE ROUTES — Simple Direct Messaging
*/


/*
   POST /api/messages
   Send a direct message to another user.
*/
app.post('/api/messages', verifyToken, async (req, res) => {

    const { to_user_id, body, listing_id } = req.body;

    if (!to_user_id || !body) {
        return res.status(400).json({ error: 'to_user_id and body are required.' });
    }

    // Cannot message yourself
    if (parseInt(to_user_id) === req.user.id) {
        return res.status(400).json({ error: 'You cannot message yourself.' });
    }

    try {
        const result = await pool.query(
            `INSERT INTO messages (from_user_id, to_user_id, body, listing_id)
             VALUES ($1, $2, $3, $4)
             RETURNING *`,
            [req.user.id, to_user_id, body, listing_id || null]
        );
        res.status(201).json(result.rows[0]);
    } catch (err) {
        res.status(500).json({ error: 'Server error: ' + err.message });
    }
});


/*
   GET /api/messages
   Get all messages sent TO the current user.
*/
app.get('/api/messages', verifyToken, async (req, res) => {

    try {
        const result = await pool.query(
            `SELECT m.*, u.full_name AS sender_name
             FROM messages m
             JOIN users u ON m.from_user_id = u.id
             WHERE m.to_user_id = $1
             ORDER BY m.created_at DESC`,
            [req.user.id]
        );
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: 'Server error: ' + err.message });
    }
});


/*
   ADMIN ROUTES — Moderate Listings & View Stats
   All routes here require verifyToken + isAdmin
*/


/*
   GET /api/admin/stats
   Returns overall platform numbers for the dashboard.
*/
app.get('/api/admin/stats', verifyToken, isAdmin, async (req, res) => {

    try {
        // Count total listings
        const listingsCount = await pool.query('SELECT COUNT(*) FROM listings');

        // Count total users
        const usersCount = await pool.query('SELECT COUNT(*) FROM users');

        // Count total interactions
        const interactionsCount = await pool.query('SELECT COUNT(*) FROM interactions');

        // Count how many listings are still pending (not yet approved)
        const pendingCount = await pool.query('SELECT COUNT(*) FROM listings WHERE is_approved = FALSE');

        // Send all counts as one object
        res.json({
            total_listings:    parseInt(listingsCount.rows[0].count),
            total_users:       parseInt(usersCount.rows[0].count),
            total_interactions: parseInt(interactionsCount.rows[0].count),
            pending:           parseInt(pendingCount.rows[0].count)
        });

    } catch (err) {
        res.status(500).json({ error: 'Server error: ' + err.message });
    }
});


/*
   GET /api/admin/listings
   Get ALL listings (including unapproved and flagged).
*/
app.get('/api/admin/listings', verifyToken, isAdmin, async (req, res) => {

    try {
        const result = await pool.query(
            `SELECT l.*, u.full_name AS owner_name
             FROM listings l
             JOIN users u ON l.user_id = u.id
             ORDER BY l.created_at DESC`
        );
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: 'Server error: ' + err.message });
    }
});


/*
   GET /api/admin/listings/pending
   Get only the listings that need approval.
*/
app.get('/api/admin/listings/pending', verifyToken, isAdmin, async (req, res) => {

    try {
        const result = await pool.query(
            `SELECT l.*, u.full_name AS owner_name
             FROM listings l
             JOIN users u ON l.user_id = u.id
             WHERE l.is_approved = FALSE
             ORDER BY l.created_at ASC`  // oldest first so admin can clear backlog
        );
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: 'Server error: ' + err.message });
    }
});


/*
   PUT /api/admin/listings/:id/approve
   Admin approves a listing so it appears in the marketplace.
*/
app.put('/api/admin/listings/:id/approve', verifyToken, isAdmin, async (req, res) => {

    try {
        await pool.query(
            'UPDATE listings SET is_approved = TRUE WHERE id = $1',
            [req.params.id]
        );
        res.json({ message: 'Listing approved.' });
    } catch (err) {
        res.status(500).json({ error: 'Server error: ' + err.message });
    }
});


/*
   PUT /api/admin/listings/:id/flag
   Admin flags inappropriate content (hides it from marketplace).
*/
app.put('/api/admin/listings/:id/flag', verifyToken, isAdmin, async (req, res) => {

    try {
        await pool.query(
            'UPDATE listings SET is_flagged = TRUE WHERE id = $1',
            [req.params.id]
        );
        res.json({ message: 'Listing flagged and hidden.' });
    } catch (err) {
        res.status(500).json({ error: 'Server error: ' + err.message });
    }
});


/*
   DELETE /api/admin/listings/:id
   Admin permanently deletes any listing.
*/
app.delete('/api/admin/listings/:id', verifyToken, isAdmin, async (req, res) => {

    try {
        await pool.query('DELETE FROM listings WHERE id = $1', [req.params.id]);
        res.json({ message: 'Listing deleted by admin.' });
    } catch (err) {
        res.status(500).json({ error: 'Server error: ' + err.message });
    }
});


/*
   PUT /api/admin/listings/:id/edit
   Admin edits a listing's title, description and category.
   All three fields are optional — only send what changed.
*/
app.put('/api/admin/listings/:id/edit', verifyToken, isAdmin, async (req, res) => {

    const { title, description, category } = req.body;

    /* At least one field must be provided */
    if (!title && !description && !category) {
        return res.status(400).json({ error: 'Provide at least one field to update.' });
    }

    try {
        await pool.query(
            `UPDATE listings
             SET title       = COALESCE($1, title),
                 description = COALESCE($2, description),
                 category    = COALESCE($3, category)
             WHERE id = $4`,
            [title || null, description || null, category || null, req.params.id]
        );
        res.json({ message: 'Listing updated.' });
    } catch (err) {
        res.status(500).json({ error: 'Server error: ' + err.message });
    }
});


/*
   GET /api/admin/users
   Admin can view all registered users.
*/
app.get('/api/admin/users', verifyToken, isAdmin, async (req, res) => {

    try {
        const result = await pool.query(
            'SELECT id, full_name, email, role, created_at FROM users ORDER BY created_at DESC'
        );
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: 'Server error: ' + err.message });
    }
});


/*
   STEP 6: Start the server
   PORT comes from environment (Render.com sets this automatically)
*/
const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
    console.log('ACity Connect server is running on port ' + PORT);
});
