# Engineering Insights & Knowledge Repository

This file acts as a persistent repository for technical concepts and execution insights acquired during the development of this application.

---

## 1. Soft-Delete Mechanisms in Relational Databases
In modern enterprise applications, deleting data physically (`DELETE FROM table`) is often restricted due to regulatory, analytical, or audit compliance. Soft-deletion is a pattern where rows are marked as deleted instead of physically purged.

### A. The Nullable Timestamp Approach
- A column named `deleted_at` of type `TIMESTAMP WITH TIME ZONE` is added.
- Active records carry `NULL` in this column.
- Deletion sets `deleted_at = CURRENT_TIMESTAMP`.

### B. Uniqueness Resolution under Soft-Delete
- In standard SQL, a unique constraint (e.g. on `email`) treats all values globally. If a user is soft-deleted, their email remains in the table, preventing a new user from registering with that same email.
- **PostgreSQL Solution**: Partial Unique Indexes.
  ```sql
  CREATE UNIQUE INDEX idx_students_active_email ON students(email) WHERE (deleted_at IS NULL);
  ```
  This instructs the query planner to enforce uniqueness only on records where `deleted_at IS NULL`, allowing unlimited duplicates for soft-deleted rows.

---

## 2. Polymorphic Auditing via JSONB
When building an audit trail system, creating separate audit tables for every single schema is high maintenance. A generic, application-wide `audit_logs` table is preferred.

### A. Polymorphic Identity
- Classical foreign key constraints require pointing to a single destination table.
- Since audits track multiple entities (`students`, `attendance_logs`, etc.), we store the target table name (`table_name`) and target row ID (`record_id` as UUID).
- Database-level foreign keys are omitted to decouple audit records from entity life-cycles.

### B. Dynamic States via JSONB
- **JSONB** (Binary JSON) in PostgreSQL is optimized for high-performance retrieval and nesting.
- Storing state shifts (`old_values` and `new_values`) within `JSONB` allows schema-agnostic tracking. If a new column is added to `students`, the audit log does not need to be updated; the new attribute is automatically serialized within the JSON payloads.

---

## 3. Serverless Connection Pooling (NeonDB / Netlify)
Serverless architectures are highly concurrent but stateless. Each request to a Netlify Function initiates a new execution container.

### A. The Connection Exhaustion Problem
- Traditional database clients open a connection pool and hold onto it throughout the application lifetime.
- Serverless environments launch hundreds of containers concurrently. Each container opens a connection but cannot coordinate pooling with other containers, quickly hitting the database maximum concurrent connection limit.

### B. Architectural Mitigation
- **Neon Connection Pooler**: Neon DB provides a transaction-level connection pooler powered by PgBouncer.
- **Implementation**: Instead of connecting to the direct database port (usually `5432`), developers connect through the pooling port (usually `6543` or using connection string parameters like `?sslmode=require&options=project%3D...` with `-pooler` suffix in the host name).
- **Asynchronous Lifecycles**: Application code must explicitly release client connections back to the pool immediately upon command completion.
