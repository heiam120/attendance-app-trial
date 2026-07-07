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
DROP TABLE IF EXISTS classroom_students;
DROP TABLE IF EXISTS classrooms;
DROP TABLE IF EXISTS students;
DROP TABLE IF EXISTS teachers;

-- ============================================================================
-- 1. Table: teachers
-- ============================================================================
CREATE TABLE teachers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    deleted_at TIMESTAMP WITH TIME ZONE NULL
);

-- ============================================================================
-- 2. Table: students
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
-- 3. Table: classrooms
-- ============================================================================
CREATE TABLE classrooms (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) NOT NULL,
    duration_months INT NOT NULL DEFAULT 1,
    teacher_id UUID NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    deleted_at TIMESTAMP WITH TIME ZONE NULL,
    
    -- Constraints
    CONSTRAINT fk_classroom_teacher FOREIGN KEY (teacher_id) REFERENCES teachers(id) ON DELETE CASCADE
);

-- Optimize classroom teacher lookup
CREATE INDEX idx_classrooms_teacher ON classrooms(teacher_id);
CREATE INDEX idx_classrooms_deleted_at ON classrooms(deleted_at);

-- ============================================================================
-- 4. Table: classroom_students (Classroom-to-Student Relationship)
-- ============================================================================
CREATE TABLE classroom_students (
    classroom_id UUID NOT NULL,
    student_id UUID NOT NULL,
    
    -- Constraints
    PRIMARY KEY (classroom_id, student_id),
    CONSTRAINT fk_cs_classroom FOREIGN KEY (classroom_id) REFERENCES classrooms(id) ON DELETE CASCADE,
    CONSTRAINT fk_cs_student FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE
);

-- ============================================================================
-- 5. Table: attendance_logs
-- ============================================================================
CREATE TABLE attendance_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    classroom_id UUID NOT NULL,
    student_id UUID NOT NULL,
    log_date DATE NOT NULL DEFAULT CURRENT_DATE,
    status VARCHAR(20) NOT NULL,
    check_in_time TIMESTAMP WITH TIME ZONE NULL,
    notes TEXT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    
    -- Constraints
    CONSTRAINT fk_attendance_classroom FOREIGN KEY (classroom_id) REFERENCES classrooms(id) ON DELETE CASCADE,
    CONSTRAINT fk_attendance_student FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
    CONSTRAINT uq_classroom_student_date UNIQUE (classroom_id, student_id, log_date),
    CONSTRAINT chk_attendance_status CHECK (status IN ('present', 'absent', 'tardy', 'excused'))
);

-- Optimize daily log queries and filtering by classroom and student
CREATE INDEX idx_attendance_classroom_student_date ON attendance_logs(classroom_id, student_id, log_date);

-- ============================================================================
-- 6. Table: audit_logs
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

CREATE TRIGGER trigger_update_teachers_updated_at
BEFORE UPDATE ON teachers
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trigger_update_students_updated_at
BEFORE UPDATE ON students
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trigger_update_classrooms_updated_at
BEFORE UPDATE ON classrooms
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trigger_update_attendance_updated_at
BEFORE UPDATE ON attendance_logs
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
```

---

## 2. Architectural Breakdown

### A. Data Relationships
1. **Teacher-to-Classroom (1-to-Many)**: A classroom is assigned to a single teacher who manages it. Enforced via `classrooms.teacher_id` foreign key.
2. **Classroom-to-Student (Many-to-Many)**: A classroom hosts multiple students, and a student can be enrolled in multiple classrooms. Enabled via the join table `classroom_students`.
3. **Classroom-Isolated Attendance (1-to-Many on logs)**: Attendance is logged per student, date, *and* classroom, allowing separate logs if a student is enrolled in multiple courses. Enforced via composite unique constraint `uq_classroom_student_date` on `(classroom_id, student_id, log_date)`.
