const { Pool } = require('pg');

// ============================================================================
// 1. Connection Pool
// ============================================================================
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

exports.handler = async (event, context) => {
  // ==========================================================================
  // 2. CORS Headers
  // ==========================================================================
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS'
  };

  // Pre-flight request bypass
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  // Fast-fail if environment variables are missing on the edge
  if (!process.env.DATABASE_URL || !process.env.ADMIN_EMAIL) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Server Configuration Error: Missing Environment Variables (.env)' })
    };
  }

  try {
    // ========================================================================
    // 3. Payload Validation
    // ========================================================================
    if (event.httpMethod !== 'POST') {
      return { 
        statusCode: 405, 
        headers, 
        body: JSON.stringify({ error: 'Method Not Allowed. Expected POST.' }) 
      };
    }

    const { email, password } = JSON.parse(event.body || '{}');

    if (!email || !password) {
      return { 
        statusCode: 400, 
        headers, 
        body: JSON.stringify({ error: 'Validation failed: Missing email or password.' }) 
      };
    }

    // ========================================================================
    // 4. SQL Execution / Authentication Logic
    // ========================================================================
    const validPassword = process.env.ADMIN_PASSWORD || 'SuperSecurePassword2026';
    let client;
    let userRecord = null;

    try {
      client = await pool.connect();
      const res = await client.query(
        'SELECT id, name, email FROM teachers WHERE email = $1 AND deleted_at IS NULL',
        [email]
      );
      if (res.rows.length > 0) {
        userRecord = res.rows[0];
      }
    } catch (err) {
      console.error('[AUTH_DB_ERROR] Failed to query teacher:', err);
    } finally {
      if (client) {
        client.release();
      }
    }

    // Check credential correctness
    const isFallbackAdmin = email === (process.env.ADMIN_EMAIL || 'admin@spokenenglish.com');
    if ((userRecord || isFallbackAdmin) && password === validPassword) {
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          success: true,
          user: {
            id: userRecord ? userRecord.id : 'admin-system-001',
            role: 'teacher',
            email: email,
            name: userRecord ? userRecord.name : 'Administrator'
          }
        })
      };
    } else {
      return {
        statusCode: 401,
        headers,
        body: JSON.stringify({ error: 'Invalid credentials provided.' })
      };
    }

  } catch (error) {
    console.error('[AUTH_ERROR] Execution Failed:', error);
    return { 
      statusCode: 500, 
      headers, 
      body: JSON.stringify({ error: 'Internal Server Error' }) 
    };
  }
};
