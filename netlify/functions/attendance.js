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

    // --- GET HANDLERS (Fetching data) ---
    if (event.httpMethod === 'GET') {
      const action = event.queryStringParameters && event.queryStringParameters.action;

      // ACTION: LIST CLASSROOMS
      if (action === 'list_classrooms' || !action) {
        const query = `
          SELECT c.id, c.name, c.duration_months, c.duration_days, COUNT(cs.student_id)::int as capacity
          FROM classrooms c
          LEFT JOIN classroom_students cs ON c.id = cs.classroom_id
          WHERE c.deleted_at IS NULL
          GROUP BY c.id, c.name, c.duration_months, c.duration_days
          ORDER BY c.name ASC
        `;
        const result = await client.query(query);
        return {
          statusCode: 200,
          headers,
          body: JSON.stringify({ success: true, data: result.rows })
        };
      }

      // ACTION: GET CLASSROOM MATRIX
      if (action === 'get_classroom_matrix') {
        const classroomId = event.queryStringParameters.classroom_id;
        if (!classroomId) {
          return {
            statusCode: 400,
            headers,
            body: JSON.stringify({ error: 'Validation failed: Missing classroom_id.' })
          };
        }

        // 1. Fetch Classroom Metadata
        const classRes = await client.query(
          'SELECT id, name, duration_months, duration_days, created_at FROM classrooms WHERE id = $1 AND deleted_at IS NULL',
          [classroomId]
        );
        if (classRes.rows.length === 0) {
          return {
            statusCode: 404,
            headers,
            body: JSON.stringify({ error: 'Classroom not found.' })
          };
        }
        const classroom = classRes.rows[0];

        // 2. Fetch Enrolled Students
        const studentsRes = await client.query(`
          SELECT s.id, s.first_name, s.last_name, s.email 
          FROM students s
          JOIN classroom_students cs ON s.id = cs.student_id
          WHERE cs.classroom_id = $1 AND s.deleted_at IS NULL
          ORDER BY s.last_name ASC, s.first_name ASC
        `, [classroomId]);

        // 3. Fetch Attendance Logs for this Classroom
        const logsRes = await client.query(`
          SELECT student_id, log_date::text, status, check_in_time, notes
          FROM attendance_logs
          WHERE classroom_id = $1
        `, [classroomId]);

        return {
          statusCode: 200,
          headers,
          body: JSON.stringify({
            success: true,
            data: {
              classroom,
              students: studentsRes.rows,
              logs: logsRes.rows
            }
          })
        };
      }

      // ACTION: GET ALL REGISTERED STUDENTS (for adding to class)
      if (action === 'get_all_students') {
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

      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: `Unknown query action: ${action}` })
      };
    }

    // --- POST HANDLERS (Mutations) ---
    if (event.httpMethod === 'POST') {
      const payload = JSON.parse(event.body || '{}');
      const action = payload.action;

      // ACTION: CREATE CLASSROOM
      if (action === 'create_classroom') {
        const { name, duration_months, duration_days, teacher_email } = payload;
        if (!name || (!duration_days && !duration_months)) {
          return {
            statusCode: 400,
            headers,
            body: JSON.stringify({ error: 'Validation failed: Missing name, duration_days, or duration_months.' })
          };
        }

        // Get teacher id by email (fall back to first teacher if not found)
        const emailToFind = teacher_email || 'admin@spokenenglish.com';
        const tRes = await client.query('SELECT id FROM teachers WHERE email = $1 AND deleted_at IS NULL', [emailToFind]);
        let teacherId;
        if (tRes.rows.length > 0) {
          teacherId = tRes.rows[0].id;
        } else {
          const defaultTRes = await client.query('SELECT id FROM teachers LIMIT 1');
          if (defaultTRes.rows.length === 0) {
            return {
              statusCode: 500,
              headers,
              body: JSON.stringify({ error: 'System Configuration Error: No active teachers available.' })
            };
          }
          teacherId = defaultTRes.rows[0].id;
        }

        const insertQuery = `
          INSERT INTO classrooms (name, duration_months, duration_days, teacher_id)
          VALUES ($1, $2, $3, $4)
          RETURNING id, name, duration_months, duration_days;
        `;
        const result = await client.query(insertQuery, [
          name, 
          parseInt(duration_months || 1, 10), 
          parseInt(duration_days || 20, 10), 
          teacherId
        ]);
        
        // Log audit footprint
        await client.query(
          `INSERT INTO audit_logs (table_name, record_id, action, performed_by, new_values) 
           VALUES ($1, $2, $3, $4, $5)`,
          ['classrooms', result.rows[0].id, 'CREATE', emailToFind, JSON.stringify(result.rows[0])]
        );

        return {
          statusCode: 200,
          headers,
          body: JSON.stringify({ success: true, data: result.rows[0] })
        };
      }

      // ACTION: RENAME CLASSROOM
      if (action === 'rename_classroom') {
        const { classroom_id, name } = payload;
        if (!classroom_id || !name) {
          return {
            statusCode: 400,
            headers,
            body: JSON.stringify({ error: 'Validation failed: Missing classroom_id or name.' })
          };
        }

        const updateQuery = `
          UPDATE classrooms 
          SET name = $2 
          WHERE id = $1 AND deleted_at IS NULL
          RETURNING id, name, duration_months;
        `;
        const result = await client.query(updateQuery, [classroom_id, name]);
        if (result.rowCount === 0) {
          return {
            statusCode: 404,
            headers,
            body: JSON.stringify({ error: 'Classroom not found.' })
          };
        }

        // Log audit footprint
        await client.query(
          `INSERT INTO audit_logs (table_name, record_id, action, performed_by, new_values) 
           VALUES ($1, $2, $3, $4, $5)`,
          ['classrooms', classroom_id, 'RENAME', 'teacher', JSON.stringify(result.rows[0])]
        );

        return {
          statusCode: 200,
          headers,
          body: JSON.stringify({ success: true, data: result.rows[0] })
        };
      }

      // ACTION: ARCHIVE CLASSROOM (SOFT-DELETE)
      if (action === 'archive_classroom') {
        const { classroom_id } = payload;
        if (!classroom_id) {
          return {
            statusCode: 400,
            headers,
            body: JSON.stringify({ error: 'Validation failed: Missing classroom_id.' })
          };
        }

        const deleteQuery = `
          UPDATE classrooms 
          SET deleted_at = CURRENT_TIMESTAMP 
          WHERE id = $1 AND deleted_at IS NULL
          RETURNING id;
        `;
        const result = await client.query(deleteQuery, [classroom_id]);
        if (result.rowCount === 0) {
          return {
            statusCode: 404,
            headers,
            body: JSON.stringify({ error: 'Classroom not found or already archived.' })
          };
        }

        // Log audit footprint
        await client.query(
          `INSERT INTO audit_logs (table_name, record_id, action, performed_by) 
           VALUES ($1, $2, $3, $4)`,
          ['classrooms', classroom_id, 'ARCHIVE', 'teacher']
        );

        return {
          statusCode: 200,
          headers,
          body: JSON.stringify({ success: true, classroom_id: result.rows[0].id })
        };
      }

      // ACTION: ADD EXISTING STUDENT TO CLASSROOM
      if (action === 'add_student_to_class') {
        const { classroom_id, student_id } = payload;
        if (!classroom_id || !student_id) {
          return {
            statusCode: 400,
            headers,
            body: JSON.stringify({ error: 'Validation failed: Missing classroom_id or student_id.' })
          };
        }

        await client.query(
          'INSERT INTO classroom_students (classroom_id, student_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
          [classroom_id, student_id]
        );

        // Fetch student details to return
        const sRes = await client.query('SELECT id, first_name, last_name, email FROM students WHERE id = $1', [student_id]);

        return {
          statusCode: 200,
          headers,
          body: JSON.stringify({ success: true, data: sRes.rows[0] })
        };
      }

      // ACTION: REMOVE STUDENT FROM CLASSROOM (Disassociate)
      if (action === 'remove_student_from_class') {
        const { classroom_id, student_id } = payload;
        if (!classroom_id || !student_id) {
          return {
            statusCode: 400,
            headers,
            body: JSON.stringify({ error: 'Validation failed: Missing classroom_id or student_id.' })
          };
        }

        await client.query(
          'DELETE FROM classroom_students WHERE classroom_id = $1 AND student_id = $2',
          [classroom_id, student_id]
        );

        return {
          statusCode: 200,
          headers,
          body: JSON.stringify({ success: true, student_id })
        };
      }

      // ACTION: REGISTER NEW STUDENT AND ENROLL IN CLASSROOM
      if (action === 'add_new_student_to_class') {
        const { classroom_id, first_name, last_name, email } = payload;
        if (!classroom_id || !first_name || !last_name || !email) {
          return {
            statusCode: 400,
            headers,
            body: JSON.stringify({ error: 'Validation failed: Missing student info or classroom_id.' })
          };
        }

        await client.query('BEGIN');

        // Check if student exists or create
        let studentId;
        const existRes = await client.query(
          'SELECT id FROM students WHERE email = $1 AND deleted_at IS NULL',
          [email]
        );

        if (existRes.rows.length > 0) {
          studentId = existRes.rows[0].id;
        } else {
          const insRes = await client.query(`
            INSERT INTO students (first_name, last_name, email)
            VALUES ($1, $2, $3)
            RETURNING id;
          `, [first_name, last_name, email]);
          studentId = insRes.rows[0].id;
        }

        // Enroll in classroom
        await client.query(`
          INSERT INTO classroom_students (classroom_id, student_id)
          VALUES ($1, $2)
          ON CONFLICT DO NOTHING;
        `, [classroom_id, studentId]);

        await client.query('COMMIT');

        // Fetch complete student record
        const finalStudent = await client.query(
          'SELECT id, first_name, last_name, email FROM students WHERE id = $1',
          [studentId]
        );

        return {
          statusCode: 200,
          headers,
          body: JSON.stringify({ success: true, data: finalStudent.rows[0] })
        };
      }

      // ACTION: SAVE CLASSROOM ATTENDANCE MATRIX
      if (action === 'save_attendance') {
        const { classroom_id, logs, log_date } = payload;
        if (!classroom_id || !logs || !Array.isArray(logs) || !log_date) {
          return {
            statusCode: 400,
            headers,
            body: JSON.stringify({ error: 'Validation failed: Missing classroom_id, logs, or log_date.' })
          };
        }

        await client.query('BEGIN'); // Start Transaction

        const upsertQuery = `
          INSERT INTO attendance_logs (classroom_id, student_id, log_date, status)
          VALUES ($1, $2, $3, $4)
          ON CONFLICT (classroom_id, student_id, log_date) 
          DO UPDATE SET 
            status = EXCLUDED.status,
            updated_at = CURRENT_TIMESTAMP
          RETURNING id
        `;

        for (const log of logs) {
          await client.query(upsertQuery, [
            classroom_id,
            log.student_id,
            log.log_date || log_date,
            log.status
          ]);
        }

        // Log audit footprint
        await client.query(
          `INSERT INTO audit_logs (table_name, record_id, action, performed_by, new_values) 
           VALUES ($1, $2, $3, $4, $5)`,
          [
            'attendance_logs', 
            classroom_id, 
            'BULK_UPSERT', 
            'teacher', 
            JSON.stringify({ affected_records: logs.length, log_date: log_date })
          ]
        );

        await client.query('COMMIT'); // Commit Transaction

        return {
          statusCode: 200,
          headers,
          body: JSON.stringify({ success: true, message: `Saved ${logs.length} attendance records for ${log_date}.` })
        };
      }

      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: `Unknown post action: ${action}` })
      };
    }

    return { 
      statusCode: 405, 
      headers, 
      body: JSON.stringify({ error: 'Method Not Allowed. Expected GET or POST.' }) 
    };

  } catch (error) {
    if (event.httpMethod === 'POST') {
      try { await client.query('ROLLBACK'); } catch(e){}
    }
    console.error('[ATTENDANCE_ERROR] Execution Failed:', error);
    return { 
      statusCode: 500, 
      headers, 
      body: JSON.stringify({ error: 'Internal Server Error', details: error.message }) 
    };
  } finally {
    if (client) {
      client.release();
    }
  }
};
