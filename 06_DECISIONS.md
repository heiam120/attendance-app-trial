# Architectural Decision Records (ADR)

## ADR 001: Selection of Core Technology Stack Configuration
- **Context**: The application requires rapid, highly responsive deployments, predictable operations, cost efficiency, and low processing overhead without heavy server provisioning infrastructure.
- **Decision**: The engineering stack is frozen as follows:
  1. Frontend Layer: Vanilla JavaScript to eliminate heavy bundling engines and compile times.
  2. Backend Layer: Netlify Serverless Functions to provide continuous, isolated edge deployment scaling.
  3. Database Layer: NeonDB (PostgreSQL) to leverage fully managed relational structures Optimized for cloud functions.
- **Consequences**: Serverless environments trigger frequent container ephemeral state resets. We must explicitly invoke connection pooling strings to mitigate database pool exhaustion during high concurrent transaction traffic.

## ADR 002: Soft-Delete Strategy and Auditing Architecture
- **Context**: The attendance tracking application requires recording historical attendance records for compliance and audit requirements, while still allowing operators to remove students from active selection screens. Additionally, email addresses must remain unique among active records but allow duplicates for deleted records.
- **Decision**: 
  1. Soft-Delete Design: Implement soft-deletion on the `students` table using a nullable `deleted_at` timestamp. Query filters will default to `deleted_at IS NULL`.
  2. Uniqueness Resolution: Utilize a PostgreSQL partial unique index on `students(email) WHERE (deleted_at IS NULL)`.
  3. Cascading Policy: Declare `ON DELETE CASCADE` on `attendance_logs.student_id` for hard-deletion safety, relying on application-level soft-delete logic to preserve historical records of soft-deleted students.
  4. Audit Trailing: Implement a polymorphic `audit_logs` table storing entity references via generic `table_name` and `record_id` (UUID), recording changes in `old_values` and `new_values` JSONB fields without enforcing database-level foreign keys.
- **Consequences**: 
  - Application queries retrieving active students must consistently include the filter `deleted_at IS NULL`.
  - Hard deletions remain supported at the database level and will cascade to purge orphaned attendance logs automatically.
  - The audit log remains decoupled from individual tables, simplifying migrations and keeping audit records intact even if physical rows are hard-deleted.

