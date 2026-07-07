require('dotenv').config();
const { Pool } = require('pg');

if (!process.env.DATABASE_URL) {
    console.error('❌ Error: DATABASE_URL is missing in .env file');
    process.exit(1);
}

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

const seedStudents = [
    { first_name: 'John', last_name: 'Doe', email: 'john.doe@spokenenglish.edu' },
    { first_name: 'Jane', last_name: 'Smith', email: 'jane.smith@spokenenglish.edu' },
    { first_name: 'Bob', last_name: 'Johnson', email: 'bob.johnson@spokenenglish.edu' },
    { first_name: 'Alice', last_name: 'Williams', email: 'alice.williams@spokenenglish.edu' },
    { first_name: 'Charlie', last_name: 'Brown', email: 'charlie.brown@spokenenglish.edu' }
];

const seedClassrooms = [
    { name: 'English Advanced', duration_months: 2, duration_days: 20 },
    { name: 'Speech & Presentation', duration_months: 1, duration_days: 15 },
    { name: 'Conversational ESL', duration_months: 3, duration_days: 20 },
    { name: 'Professional Writing', duration_months: 2, duration_days: 15 }
];

async function runMigration() {
    console.log('🔌 Connecting to NeonDB pool...');
    let client;
    try {
        client = await pool.connect();
        
        console.log('🧹 Dropping existing tables for a clean rebuild...');
        await client.query(`
            DROP TABLE IF EXISTS audit_logs, attendance_logs, classroom_students, classrooms, students, teachers CASCADE;
        `);

        console.log('🛠️ Creating teachers table if not exists...');
        await client.query(`
            CREATE TABLE IF NOT EXISTS teachers (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                name VARCHAR(100) NOT NULL,
                email VARCHAR(255) UNIQUE NOT NULL,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
                deleted_at TIMESTAMP WITH TIME ZONE NULL
            );
        `);

        console.log('🛠️ Creating classrooms table if not exists...');
        await client.query(`
            CREATE TABLE IF NOT EXISTS classrooms (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                name VARCHAR(100) NOT NULL,
                duration_months INT NOT NULL DEFAULT 1,
                duration_days INT NOT NULL DEFAULT 20,
                teacher_id UUID NOT NULL REFERENCES teachers(id) ON DELETE CASCADE,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
                deleted_at TIMESTAMP WITH TIME ZONE NULL
            );
        `);

        console.log('🛠️ Creating classroom_students table if not exists...');
        await client.query(`
            CREATE TABLE IF NOT EXISTS classroom_students (
                classroom_id UUID NOT NULL REFERENCES classrooms(id) ON DELETE CASCADE,
                student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
                PRIMARY KEY (classroom_id, student_id)
            );
        `);

        console.log('🛠️ Adding classroom_id and updating constraints on attendance_logs...');
        // Add column if it doesn't exist
        await client.query(`
            ALTER TABLE attendance_logs 
            ADD COLUMN IF NOT EXISTS classroom_id UUID REFERENCES classrooms(id) ON DELETE CASCADE;
        `);

        // Drop the old constraints if they exist
        await client.query(`
            ALTER TABLE attendance_logs DROP CONSTRAINT IF EXISTS uq_student_date;
            ALTER TABLE attendance_logs DROP CONSTRAINT IF EXISTS uq_classroom_student_date;
        `);

        // Add new unique constraint
        await client.query(`
            ALTER TABLE attendance_logs 
            ADD CONSTRAINT uq_classroom_student_date UNIQUE (classroom_id, student_id, log_date);
        `);

        // Add updated_at trigger function and triggers for classrooms and teachers
        await client.query(`
            CREATE OR REPLACE FUNCTION update_updated_at_column()
            RETURNS TRIGGER AS $$
            BEGIN
                NEW.updated_at = CURRENT_TIMESTAMP;
                RETURN NEW;
            END;
            $$ LANGUAGE plpgsql;
        `);

        await client.query(`
            DROP TRIGGER IF EXISTS trigger_update_teachers_updated_at ON teachers;
            CREATE TRIGGER trigger_update_teachers_updated_at
            BEFORE UPDATE ON teachers
            FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
        `);

        await client.query(`
            DROP TRIGGER IF EXISTS trigger_update_classrooms_updated_at ON classrooms;
            CREATE TRIGGER trigger_update_classrooms_updated_at
            BEFORE UPDATE ON classrooms
            FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
        `);

        console.log('🧹 Clearing all data for a clean migration seed...');
        await client.query('TRUNCATE TABLE audit_logs, attendance_logs, classroom_students, classrooms, students, teachers RESTART IDENTITY CASCADE');

        console.log('🚀 Seeding default teacher Hiam...');
        const teacherRes = await client.query(`
            INSERT INTO teachers (name, email)
            VALUES ($1, $2)
            RETURNING id;
        `, ['Hiam', 'admin@spokenenglish.com']);
        const teacherId = teacherRes.rows[0].id;
        console.log(`✅ Seeded teacher (ID: ${teacherId})`);

        console.log('🚀 Seeding students...');
        const studentIds = [];
        for (const s of seedStudents) {
            const res = await client.query(`
                INSERT INTO students (first_name, last_name, email)
                VALUES ($1, $2, $3)
                RETURNING id;
            `, [s.first_name, s.last_name, s.email]);
            studentIds.push({ name: `${s.first_name} ${s.last_name}`, id: res.rows[0].id });
        }
        console.log(`✅ Seeded ${studentIds.length} students`);

        console.log('🚀 Seeding classrooms and enrolling students...');
        const classroomIds = [];
        for (const c of seedClassrooms) {
            const res = await client.query(`
                INSERT INTO classrooms (name, duration_months, duration_days, teacher_id)
                VALUES ($1, $2, $3, $4)
                RETURNING id, name;
            `, [c.name, c.duration_months || 1, c.duration_days || 20, teacherId]);
            const classroomId = res.rows[0].id;
            classroomIds.push({ name: res.rows[0].name, id: classroomId });
            
            // Enroll students.
            // English Advanced: John, Jane, Bob, Alice, Charlie
            // Speech & Presentation: John, Jane, Bob
            // Conversational ESL: John, Jane, Bob, Alice, Charlie
            // Professional Writing: Bob, Alice, Charlie
            let enrolled = [];
            if (c.name === 'English Advanced' || c.name === 'Conversational ESL') {
                enrolled = studentIds;
            } else if (c.name === 'Speech & Presentation') {
                enrolled = studentIds.slice(0, 3); // John, Jane, Bob
            } else if (c.name === 'Professional Writing') {
                enrolled = studentIds.slice(2); // Bob, Alice, Charlie
            }

            for (const stud of enrolled) {
                await client.query(`
                    INSERT INTO classroom_students (classroom_id, student_id)
                    VALUES ($1, $2);
                `, [classroomId, stud.id]);
            }
            console.log(`✅ Seeded classroom: ${c.name} with ${enrolled.length} students`);
        }

        console.log('🚀 Seeding historical attendance logs (for analytics dashboard visual richness)...');
        // Let's create logs for the last 5 days
        const dates = [];
        const baseDate = new Date();
        for (let i = 0; i < 5; i++) {
            const d = new Date(baseDate);
            d.setDate(d.getDate() - i);
            const day = d.getDay();
            if (day !== 0 && day !== 6) { // Weekdays only
                dates.push(d.toISOString().split('T')[0]);
            }
        }

        for (const classInfo of classroomIds) {
            // Get enrolled students for this class
            const enrollRes = await client.query(`
                SELECT student_id FROM classroom_students WHERE classroom_id = $1
            `, [classInfo.id]);
            const studentsInClass = enrollRes.rows.map(r => r.student_id);

            for (const date of dates) {
                for (const studentId of studentsInClass) {
                    let status = 'present';
                    const studObj = studentIds.find(s => s.id === studentId);
                    if (classInfo.name === 'Conversational ESL') {
                        if (studObj.name.includes('Bob') || studObj.name.includes('Charlie')) {
                            status = Math.random() > 0.3 ? 'absent' : 'tardy';
                        } else {
                            status = Math.random() > 0.9 ? 'absent' : 'present';
                        }
                    } else {
                        status = Math.random() > 0.85 ? 'absent' : 'present';
                    }

                    await client.query(`
                        INSERT INTO attendance_logs (classroom_id, student_id, log_date, status)
                        VALUES ($1, $2, $3, $4)
                        ON CONFLICT (classroom_id, student_id, log_date) DO NOTHING;
                    `, [classInfo.id, studentId, date, status]);
                }
            }
        }
        console.log('✅ Seeded attendance logs.');
        console.log('🎉 Migration and database seeding finished successfully!');

    } catch (err) {
        console.error('❌ Migration failed:', err.message);
    } finally {
        if (client) {
            client.release();
        }
        await pool.end();
    }
}

runMigration();
