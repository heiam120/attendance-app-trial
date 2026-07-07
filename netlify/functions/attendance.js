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
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS'
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

  let client;
  try {
    // Acquire dedicated client from the pool
    client = await pool.connect();

    // ========================================================================
    // 3. Payload Validation & Routing
    // ========================================================================
    
    // --- GET HANDLER (Fetch Master Student Registry) ---
    if (event.httpMethod === 'GET') {
      // 4. SQL Execution (GET)
      const query = `
        SELECT id, first_name, last_name, email 
        FROM students 
        WHERE deleted_at IS NULL 
        ORDER BY last_name ASC, first_name ASC
      `;
      const result = await client.query(query);
      
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ success: true, data: result.rows })
      };
    }

    // --- POST HANDLER (ROUTING ACTIONS) ---
    if (event.httpMethod === 'POST') {
      const payload = JSON.parse(event.body || '{}');
      const action = payload.action;

      // ACTION: ADD STUDENT
      if (action === 'add_student') {
        const { first_name, last_name, email } = payload;
        if (!first_name || !last_name || !email) {
          return {
            statusCode: 400,
            headers,
            body: JSON.stringify({ error: 'Validation failed: Missing student info (first_name, last_name, email).' })
          };
        }

        const insertQuery = `
          INSERT INTO students (first_name, last_name, email)
          VALUES ($1, $2, $3)
          RETURNING id, first_name, last_name, email;
        `;
        const result = await client.query(insertQuery, [first_name, last_name, email]);
        return {
          statusCode: 200,
          headers,
          body: JSON.stringify({ success: true, data: result.rows[0] })
        };
      }

      // ACTION: DELETE STUDENT (SOFT-DELETE)
      if (action === 'delete_student') {
        const { student_id } = payload;
        if (!student_id) {
          return {
            statusCode: 400,
            headers,
            body: JSON.stringify({ error: 'Validation failed: Missing student_id.' })
          };
        }

        const deleteQuery = `
          UPDATE students 
          SET deleted_at = CURRENT_TIMESTAMP 
          WHERE id = $1
          RETURNING id;
        `;
        const result = await client.query(deleteQuery, [student_id]);
        
        if (result.rowCount === 0) {
          return {
            statusCode: 404,
            headers,
            body: JSON.stringify({ error: 'Student not found.' })
          };
        }

        return {
          statusCode: 200,
          headers,
          body: JSON.stringify({ success: true, student_id: result.rows[0].id })
        };
      }

      // FALLBACK ACTION: UPSERT ATTENDANCE LOGS
      const logs = payload.logs;
      const log_date = payload.log_date;

      if (!logs || !Array.isArray(logs) || !log_date) {
        return { 
          statusCode: 400, 
          headers, 
          body: JSON.stringify({ error: 'Validation failed: Missing or invalid logs array and log_date.' }) 
        };
      }

      // 4. SQL Execution (POST / UPSERT)
      await client.query('BEGIN'); // Start Transaction

      const upsertQuery = `
        INSERT INTO attendance_logs (student_id, log_date, status, check_in_time, notes)
        VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT (student_id, log_date) 
        DO UPDATE SET 
          status = EXCLUDED.status,
          check_in_time = EXCLUDED.check_in_time,
          notes = EXCLUDED.notes,
          updated_at = CURRENT_TIMESTAMP
        RETURNING id
      `;

      for (const log of logs) {
        await client.query(upsertQuery, [
          log.student_id,
          log_date,
          log.status,
          log.check_in_time || null,
          log.notes || null
        ]);
      }

      // Optional: Generate a generic bulk audit log footprint
      await client.query(
        `INSERT INTO audit_logs (table_name, record_id, action, performed_by, new_values) 
         VALUES ($1, $2, $3, $4, $5)`,
        [
          'attendance_logs', 
          '00000000-0000-0000-0000-000000000000', 
          'BULK_UPSERT', 
          'admin-system-001', 
          JSON.stringify({ affected_records: logs.length, log_date: log_date })
        ]
      );

      await client.query('COMMIT'); // Commit Transaction

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ success: true, message: `Successfully saved ${logs.length} attendance records for ${log_date}.` })
      };
    }

    // Fallback for unsupported methods
    return { 
      statusCode: 405, 
      headers, 
      body: JSON.stringify({ error: 'Method Not Allowed. Expected GET or POST.' }) 
    };

  } catch (error) {
    // If we are in a transaction block, we must rollback cleanly.
    if (event.httpMethod === 'POST') {
      await client.query('ROLLBACK');
    }
    console.error('[ATTENDANCE_ERROR] Execution Failed:', error);
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
