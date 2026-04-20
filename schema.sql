-- ============================================================
-- ACITY CONNECT — Database Schema
-- Run this file in your PostgreSQL database FIRST
-- before starting the server.
-- ============================================================


-- -----------------------------------------------
-- TABLE: users
-- Stores all registered students and admins
-- -----------------------------------------------
CREATE TABLE IF NOT EXISTS users (
    id          SERIAL PRIMARY KEY,           -- auto number for each user
    full_name   VARCHAR(100) NOT NULL,        -- student's full name
    email       VARCHAR(150) UNIQUE NOT NULL, -- must be unique, acity.edu.gh only
    password    VARCHAR(255) NOT NULL,        -- stored as bcrypt hash (not plain text)
    role        VARCHAR(10)  DEFAULT 'student', -- 'student' or 'admin'
    skills_offered TEXT DEFAULT '',           -- skills the user can teach/offer
    skills_needed  TEXT DEFAULT '',           -- skills the user wants to learn
    bio            TEXT DEFAULT '',           -- short bio about the user
    created_at  TIMESTAMP DEFAULT NOW()       -- when the account was created
);


-- -----------------------------------------------
-- TABLE: listings
-- Items for sale OR skills offered/requested
-- -----------------------------------------------
CREATE TABLE IF NOT EXISTS listings (
    id          SERIAL PRIMARY KEY,
    user_id     INT REFERENCES users(id) ON DELETE CASCADE, -- who posted it
    title       VARCHAR(200) NOT NULL,          -- short title e.g. "Calculus Textbook"
    description TEXT         NOT NULL,          -- full description
    category    VARCHAR(10)  NOT NULL,          -- 'item' or 'skill'
    status      VARCHAR(15)  DEFAULT 'available', -- 'available', 'swapped', 'sold'
    is_approved BOOLEAN      DEFAULT FALSE,     -- admin must approve before public
    is_flagged  BOOLEAN      DEFAULT FALSE,     -- admin can flag bad content
    created_at  TIMESTAMP    DEFAULT NOW()
);


-- -----------------------------------------------
-- TABLE: interactions
-- When a user clicks "Interested" on a listing
-- -----------------------------------------------
CREATE TABLE IF NOT EXISTS interactions (
    id           SERIAL PRIMARY KEY,
    listing_id   INT REFERENCES listings(id) ON DELETE CASCADE,
    from_user_id INT REFERENCES users(id)    ON DELETE CASCADE,
    created_at   TIMESTAMP DEFAULT NOW(),
    -- Each user can only express interest ONCE per listing
    UNIQUE (listing_id, from_user_id)
);


-- -----------------------------------------------
-- TABLE: notifications
-- A simple message sent to a user (bell icon)
-- -----------------------------------------------
CREATE TABLE IF NOT EXISTS notifications (
    id         SERIAL PRIMARY KEY,
    user_id    INT REFERENCES users(id) ON DELETE CASCADE,  -- who receives it
    message    TEXT NOT NULL,                               -- the notification text
    is_read    BOOLEAN   DEFAULT FALSE,                     -- has it been seen?
    created_at TIMESTAMP DEFAULT NOW()
);


-- -----------------------------------------------
-- TABLE: messages
-- Direct messages between users
-- -----------------------------------------------
CREATE TABLE IF NOT EXISTS messages (
    id           SERIAL PRIMARY KEY,
    from_user_id INT REFERENCES users(id) ON DELETE CASCADE, -- sender
    to_user_id   INT REFERENCES users(id) ON DELETE CASCADE, -- receiver
    listing_id   INT REFERENCES listings(id) ON DELETE SET NULL, -- optional: about which listing
    body         TEXT      NOT NULL,           -- the message text
    created_at   TIMESTAMP DEFAULT NOW()
);


-- -----------------------------------------------
-- SEED: Create a default admin account
-- Email: admin@acity.edu.gh
-- Password: admin123  (hashed below)
-- Change this password after first login!
-- -----------------------------------------------
INSERT INTO users (full_name, email, password, role)
VALUES (
    'Admin User',
    'admin@acity.edu.gh',
    '$2b$10$KIXkP1YiSf1b1RlBLs9XeOhQB3J8meF6bWxhWrC4xGe3Md3K.CQKC', -- bcrypt of 'admin123'
    'admin'
) ON CONFLICT (email) DO NOTHING; -- don't insert twice if already exists
