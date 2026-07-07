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
    'Access-Control-Allow-Methods': 'GET, OPTIONS'
  };

  // Pre-flight request bypass
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  // Fast-fail if environment variables are missing on the edge
  if (!process.env.DATABASE_URL) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Server Configuration Error: Missing DATABASE_URL (.env)' })
    };
  }

  try {
    // ========================================================================
    // 3. Payload Validation
    // ========================================================================
    if (event.httpMethod !== 'GET') {
      return { 
        statusCode: 405, 
        headers, 
        body: JSON.stringify({ error: 'Method Not Allowed. Expected GET.' }) 
      };
    }
  } catch (err) {
    // Validation try block edge case
  }

  let client;
  try {
    // Acquire dedicated client from the pool
    client = await pool.connect();

    // ========================================================================
    // 4. SQL Execution (Aggregations and Reporting)
    // ========================================================================
    
    // Query A: Status Totals (For Dashboard Charts)
    const statusQuery = `
      SELECT status, COUNT(id) as total
      FROM attendance_logs
      GROUP BY status
    `;
    const statusResult = await client.query(statusQuery);

    // Format totals cleanly
    const totals = { present: 0, absent: 0, tardy: 0, excused: 0 };
    statusResult.rows.forEach(row => {
      if (totals[row.status] !== undefined) {
        totals[row.status] = parseInt(row.total, 10);
      }
    });

    // Query B: Recent History Joining Students Table (For Export Center)
    const historyQuery = `
      SELECT 
        s.id as student_id,
        s.first_name, 
        s.last_name, 
        a.log_date, 
        a.status, 
        a.check_in_time,
        a.notes
      FROM attendance_logs a
      JOIN students s ON a.student_id = s.id
      WHERE s.deleted_at IS NULL
      ORDER BY a.log_date DESC, s.last_name ASC
      LIMIT 250
    `;
    const historyResult = await client.query(historyQuery);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        data: {
          summary_metrics: totals,
          recent_logs: historyResult.rows
        }
      })
    };

  } catch (error) {
    console.error('[ANALYTICS_ERROR] Execution Failed:', error);
    return { 
      statusCode: 500, 
      headers, 
      body: JSON.stringify({ error: 'Internal Server Error', details: error.message }) 
    };
  } finally {
    // Release the client safely back to the connection pool
    if (client) {
      client.release();
    }
  }
};
