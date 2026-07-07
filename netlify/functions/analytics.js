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
    client = await pool.connect();

    // ========================================================================
    // 3. GET HANDLER (Filtered Reporting & Analytics)
    // ========================================================================
    if (event.httpMethod === 'GET') {
      const params = event.queryStringParameters || {};
      const classroomId = params.classroom_id;
      const studentId = params.student_id;
      const timeline = params.timeline; // '7days', '30days', 'current_month', 'all'

      // Construct Date Limit Clause
      let dateFilter = '';
      let dateValue = null;
      if (timeline === '7days') {
        dateFilter = "AND log_date >= CURRENT_DATE - INTERVAL '7 days'";
      } else if (timeline === '30days') {
        dateFilter = "AND log_date >= CURRENT_DATE - INTERVAL '30 days'";
      } else if (timeline === 'current_month') {
        dateFilter = "AND log_date >= DATE_TRUNC('month', CURRENT_DATE)";
      }

      // Build parameters array for parameterized query security
      const queryParams = [];
      let paramCounter = 1;
      
      let classFilter = '';
      if (classroomId && classroomId !== 'all') {
        classFilter = `AND classroom_id = $${paramCounter}`;
        queryParams.push(classroomId);
        paramCounter++;
      }

      let studentFilter = '';
      if (studentId && studentId !== 'all') {
        studentFilter = `AND student_id = $${paramCounter}`;
        queryParams.push(studentId);
        paramCounter++;
      }

      // Query A: Status Totals
      const statusQuery = `
        SELECT status, COUNT(id)::int as total
        FROM attendance_logs
        WHERE 1=1 ${classFilter} ${studentFilter} ${dateFilter}
        GROUP BY status
      `;
      const statusResult = await client.query(statusQuery, queryParams);

      const totals = { present: 0, absent: 0, tardy: 0, excused: 0 };
      statusResult.rows.forEach(row => {
        if (totals[row.status] !== undefined) {
          totals[row.status] = row.total;
        }
      });

      // Query B: Classroom trends (attendance rate per classroom)
      // Present & Tardy count as present, absent/excused do not.
      // We calculate (present + tardy) / total * 100
      const trendParams = [];
      let trendDateFilter = '';
      if (timeline === '7days') {
        trendDateFilter = "AND a.log_date >= CURRENT_DATE - INTERVAL '7 days'";
      } else if (timeline === '30days') {
        trendDateFilter = "AND a.log_date >= CURRENT_DATE - INTERVAL '30 days'";
      } else if (timeline === 'current_month') {
        trendDateFilter = "AND a.log_date >= DATE_TRUNC('month', CURRENT_DATE)";
      }

      const trendQuery = `
        SELECT 
          c.id as classroom_id,
          c.name,
          COALESCE(
            ROUND(
              (COUNT(CASE WHEN a.status IN ('present', 'tardy') THEN 1 END) * 100.0) / 
              NULLIF(COUNT(a.id), 0), 
              1
            ), 
            100.0
          )::float as attendance_rate
        FROM classrooms c
        LEFT JOIN attendance_logs a ON c.id = a.classroom_id
        WHERE c.deleted_at IS NULL ${trendDateFilter}
        GROUP BY c.id, c.name
        ORDER BY c.name ASC
      `;
      const trendResult = await client.query(trendQuery, trendParams);

      // Query C: Low Attendance Warning Records (Student rates below 85%)
      // If student filter is active, only show that student if they are below 85%.
      // If classroom filter is active, only show students in that classroom.
      const warningParams = [];
      let wCounter = 1;
      
      let wClassFilter = '';
      if (classroomId && classroomId !== 'all') {
        wClassFilter = `AND cs.classroom_id = $${wCounter}`;
        warningParams.push(classroomId);
        wCounter++;
      }

      let wStudentFilter = '';
      if (studentId && studentId !== 'all') {
        wStudentFilter = `AND s.id = $${wCounter}`;
        warningParams.push(studentId);
        wCounter++;
      }

      const warningQuery = `
        SELECT 
          s.id as student_id,
          s.first_name,
          s.last_name,
          s.email,
          c.id as classroom_id,
          c.name as classroom_name,
          COALESCE(
            ROUND(
              (COUNT(CASE WHEN a.status IN ('present', 'tardy') THEN 1 END) * 100.0) / 
              NULLIF(COUNT(a.id), 0), 
              1
            ), 
            0.0
          )::float as attendance_rate,
          COUNT(CASE WHEN a.status = 'absent' THEN 1 END)::int as total_absences
        FROM students s
        JOIN classroom_students cs ON s.id = cs.student_id
        JOIN classrooms c ON cs.classroom_id = c.id
        LEFT JOIN attendance_logs a ON c.id = a.classroom_id AND s.id = a.student_id ${dateFilter}
        WHERE s.deleted_at IS NULL AND c.deleted_at IS NULL
        ${wClassFilter} ${wStudentFilter}
        GROUP BY s.id, s.first_name, s.last_name, s.email, c.id, c.name
        HAVING 
          (COUNT(CASE WHEN a.status IN ('present', 'tardy') THEN 1 END) * 100.0) / NULLIF(COUNT(a.id), 0) < 85.0
          OR COUNT(a.id) = 0
        ORDER BY attendance_rate ASC, total_absences DESC
      `;
      const warningResult = await client.query(warningQuery, warningParams);

      // Query D: Recent history log details
      const historyQuery = `
        SELECT 
          s.id as student_id,
          s.first_name, 
          s.last_name, 
          c.name as classroom_name,
          a.log_date::text as log_date, 
          a.status, 
          a.check_in_time,
          a.notes
        FROM attendance_logs a
        JOIN students s ON a.student_id = s.id
        JOIN classrooms c ON a.classroom_id = c.id
        WHERE s.deleted_at IS NULL AND c.deleted_at IS NULL
        ${classFilter} ${studentFilter} ${dateFilter}
        ORDER BY a.log_date DESC, s.last_name ASC
        LIMIT 250
      `;
      const historyResult = await client.query(historyQuery, queryParams);

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          success: true,
          data: {
            summary_metrics: totals,
            classroom_trends: trendResult.rows,
            low_attendance_warnings: warningResult.rows,
            recent_logs: historyResult.rows
          }
        })
      };
    }

    // ========================================================================
    // 4. POST HANDLER (Actionable Insights / Alerts Logging)
    // ========================================================================
    if (event.httpMethod === 'POST') {
      const payload = JSON.parse(event.body || '{}');
      const action = payload.action;

      if (action === 'send_student_alert') {
        const { student_id, classroom_id, message } = payload;
        if (!student_id || !classroom_id || !message) {
          return {
            statusCode: 400,
            headers,
            body: JSON.stringify({ error: 'Validation failed: Missing student_id, classroom_id, or message.' })
          };
        }

        // Insert audit log tracking that alert has been sent.
        const auditRes = await client.query(`
          INSERT INTO audit_logs (table_name, record_id, action, performed_by, new_values)
          VALUES ($1, $2, $3, $4, $5)
          RETURNING id, created_at;
        `, [
          'students',
          student_id,
          'ALERT_SENT',
          'teacher',
          JSON.stringify({ classroom_id, message })
        ]);

        return {
          statusCode: 200,
          headers,
          body: JSON.stringify({
            success: true,
            message: 'Student alert sent and logged successfully.',
            audit_id: auditRes.rows[0].id
          })
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
    console.error('[ANALYTICS_ERROR] Execution Failed:', error);
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
