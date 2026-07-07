# Relational Database Schema Blueprints (NeonDB PostgreSQL)

This document specifies the production-ready relational schema layout designed for the Miniature Attendance Tracking Application. The database is hosted on NeonDB, utilizing connection pooling structures.

---

## 1. Schema DDL Definitions

```sql
-- ============================================================================
-- Clean Existing Tables (Ordering respects foreign key dependencies)
-- ============================================================================
DROP TABLE IF EXISTS audit_logs;
DROP TABLE IF EXISTS attendance_logs;
DROP TABLE IF EXISTS students;

-- ============================================================================
-- 1. Table: students
-- ============================================================================
CREATE TABLE students (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    email VARCHAR(255) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    deleted_at TIMESTAMP WITH TIME ZONE NULL
);

-- Enforce email uniqueness only for active (non-soft-deleted) students
CREATE UNIQUE INDEX idx_students_active_email ON students(email) WHERE (deleted_at IS NULL);

-- Optimize soft-delete lookup and filtering queries
CREATE INDEX idx_students_deleted_at ON students(deleted_at);

-- ============================================================================
-- 2. Table: attendance_logs
-- ============================================================================
CREATE TABLE attendance_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id UUID NOT NULL,
    log_date DATE NOT NULL DEFAULT CURRENT_DATE,
    status VARCHAR(20) NOT NULL,
    check_in_time TIMESTAMP WITH TIME ZONE NULL,
    notes TEXT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    
    -- Constraints
    CONSTRAINT fk_attendance_student FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
    CONSTRAINT uq_student_date UNIQUE (student_id, log_date),
    CONSTRAINT chk_attendance_status CHECK (status IN ('present', 'absent', 'tardy', 'excused'))
);

-- Optimize daily log queries and filtering by student
CREATE INDEX idx_attendance_student_date ON attendance_logs(student_id, log_date);

-- ============================================================================
-- 3. Table: audit_logs
-- ============================================================================
CREATE TABLE audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    table_name VARCHAR(50) NOT NULL,
    record_id UUID NOT NULL,
    action VARCHAR(20) NOT NULL,
    old_values JSONB NULL,
    new_values JSONB NULL,
    performed_by VARCHAR(255) NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
);

-- Optimize audit trailing by polymorphic entity lookup
CREATE INDEX idx_audit_logs_target ON audit_logs(table_name, record_id);

-- ============================================================================
-- Triggers for Automatic updated_at Column Updates
-- ============================================================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_students_updated_at
BEFORE UPDATE ON students
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trigger_update_attendance_updated_at
BEFORE UPDATE ON attendance_logs
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();
```

---

## 2. Architectural Breakdown

### A. Data Types Rationale
1. **`UUID` (Universally Unique Identifier)**: 
   - Chosen for all primary key columns (`students.id`, `attendance_logs.id`, `audit_logs.id`).
   - In stateless, serverless environments like Netlify functions, UUID generation can happen on the client or serverless side safely, preventing enumeration attacks and collisions if database partitions or offline syncing are ever introduced.
   - Leverages PostgreSQL's native `gen_random_uuid()` (PG 13+ standard) avoiding external extension overhead.
2. **`TIMESTAMP WITH TIME ZONE` (`timestamptz`)**:
   - Mandated for all timestamps (`created_at`, `updated_at`, `deleted_at`, `check_in_time`).
   - Ensures absolute chronological tracking regardless of Serverless Function execution zones or database cluster configurations. PostgreSQL stores these values in UTC and converts them automatically to the client connection's timezone.
3. **`DATE`**:
   - Used for `attendance_logs.log_date` to isolate the specific calendar date (YYYY-MM-DD) of the record independently of timestamps or check-in zones.
4. **`JSONB`**:
   - Selected for `audit_logs.old_values` and `new_values`.
   - Offers structured, binary-serialized storage of payload state before and after edits. It allows fast key lookups, indexing, and accommodates schema drift in audited tables without requiring schema modifications to the audit log itself.

### B. Soft-Delete Mechanism and Unique Constraints
1. **Soft-Delete Architecture**:
   - The `students` table features a nullable `deleted_at` timestamp. Active records have `deleted_at IS NULL`, while soft-deleted records hold the timestamp of deletion.
   - To query active students, the application must query `WHERE deleted_at IS NULL`. We created a regular B-Tree index `idx_students_deleted_at` to make this check highly performant.
2. **Partial Uniqueness Constraints**:
   - A traditional unique constraint on `students(email)` would fail if we wanted to soft-delete a student and register a new active student with the same email.
   - To bypass this, we implemented a **Partial Unique Index** (`idx_students_active_email`):
     ```sql
     CREATE UNIQUE INDEX idx_students_active_email ON students(email) WHERE (deleted_at IS NULL);
     ```
   - This ensures email uniqueness is only enforced for active students, allowing unlimited duplicate emails among soft-deleted records.

### C. Foreign Key Cascading and Auditing Mappings
1. **Foreign Key Cascade (`ON DELETE CASCADE`)**:
   - Declared on `attendance_logs.student_id`.
   - If a student is **hard-deleted** (completely purged from the database), their dependent attendance records are automatically deleted to maintain referential integrity.
   - However, since the primary deletion model is soft-deletion, setting `deleted_at` on the `students` table does not trigger cascading, leaving all historical `attendance_logs` intact and accessible.
2. **Polymorphic Auditing (No Foreign Key on `audit_logs.record_id`)**:
   - The `audit_logs` table records modifications across multiple tables (`students`, `attendance_logs`).
   - Because `record_id` can reference rows in any table, we cannot enforce a classic PostgreSQL foreign key constraint. Instead, we use `table_name` and `record_id` polymorphically.
   - To query the audit history of any record, we filter by both fields, optimized by the composite index `idx_audit_logs_target`.
   - If a record is hard-deleted, its audit records persist, serving as a historical trail.
