const { Pool } = require('pg');
require('dotenv').config();

// Create PostgreSQL connection pool
const pool = new Pool({
    user: process.env.DB_USER || 'postgres',
    host: process.env.DB_HOST || 'localhost',
    database: process.env.DB_NAME || 'casinobot',
    password: process.env.DB_PASSWORD || 'password',
    port: process.env.DB_PORT || 5432,
    // Connection pool settings
    max: 20, // Maximum number of clients in the pool
    idleTimeoutMillis: 30000, // How long a client is allowed to remain idle before being closed
    connectionTimeoutMillis: 2000, // How long to wait for a connection
});

// Test connection on startup
pool.on('connect', () => {
    console.log('✅ Connected to PostgreSQL database');
});

pool.on('error', (err) => {
    console.error('❌ Unexpected error on idle client', err);
    process.exit(-1);
});

// Query helper function
async function query(text, params) {
    const start = Date.now();
    try {
        const res = await pool.query(text, params);
        const duration = Date.now() - start;

        // Log slow queries (over 100ms)
        if (duration > 100) {
            console.log('Slow query:', { text, duration, rows: res.rowCount });
        }

        return res;
    } catch (error) {
        console.error('Database query error:', error);
        console.error('Query:', text);
        console.error('Params:', params);
        throw error;
    }
}

// Get a client from the pool (for transactions)
async function getClient() {
    return await pool.query();
}

// Close pool (for graceful shutdown)
async function closePool() {
    await pool.end();
    console.log('Database pool closed');
}

module.exports = {
    query,
    getClient,
    closePool,
    pool
};
