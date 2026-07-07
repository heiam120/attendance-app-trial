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
    // As per ADR 010, utilizing environment variables for demo admin context
    // since the schema currently defines 'students' without an internal admin hierarchy.
    const validEmail = process.env.ADMIN_EMAIL || 'admin@spokenenglish.com';
    const validPassword = process.env.ADMIN_PASSWORD || 'admin123';

    if (email === validEmail && password === validPassword) {
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          success: true,
          user: { 
            id: 'admin-system-001', 
            role: 'administrator', 
            email: validEmail 
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
