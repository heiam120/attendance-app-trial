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

async function runSeed() {
    console.log('🔌 Connecting to NeonDB pool...');
    let client;
    try {
        client = await pool.connect();
        
        console.log('🧹 Clearing existing students & attendance records (Clean Slate)...');
        await client.query('TRUNCATE TABLE attendance_logs, students RESTART IDENTITY CASCADE');

        console.log('🚀 Inserting 5 seed students...');
        for (const student of seedStudents) {
            const query = `
                INSERT INTO students (first_name, last_name, email)
                VALUES ($1, $2, $3)
                RETURNING id, first_name, last_name;
            `;
            const res = await client.query(query, [student.first_name, student.last_name, student.email]);
            console.log(`✅ [OK] Inserted student: ${res.rows[0].first_name} ${res.rows[0].last_name} (${res.rows[0].id})`);
        }
        console.log('🎉 Database seeding completed successfully!');
    } catch (err) {
        console.error('❌ Seeding failed:', err.message);
    } finally {
        if (client) {
            client.release();
        }
        await pool.end();
    }
}

runSeed();
