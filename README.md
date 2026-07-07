# SpokenEnglish - Attendance Management App (Netlify & NeonDB)

A highly structured, high-performance web platform designed for teachers to manage classrooms, dynamically track student attendance based on course duration (in teaching days), analyze roster metrics, and log warning notifications.

Built entirely using **Vanilla HTML, CSS, and asynchronous native JavaScript** on the frontend, powered by **Netlify Serverless Functions** (Node.js) on the backend, and backed by a **NeonDB PostgreSQL** relational database.

---

## 🚀 Key Features

### 🏫 1. Classroom & Student Management
- **Teacher Workspace**: Teachers can dynamically create a new classroom ledger, rename existing classrooms, or soft-delete (archive) them directly from the dashboard.
- **Roster Control Grid**: Within each classroom attendance ledger, teachers can search and enroll existing registered students, or register new students and enroll them immediately. Students can also be removed from specific fusions.
- **Pedagogical Terminology**: Terminology is fully optimized to use education-focused terms (`Students`, `Classrooms`, `Attendance Logs`, `Study Groups`) rather than database jargon.

### 📅 2. Dynamic Attendance Tracking Grid
- **Duration-in-Days Configuration**: Specify the exact number of teaching days (e.g. 8 days, 20 days) during classroom creation.
- **Dynamic Columns Generation**: The attendance matrix automatically calculates and renders the exact number of weekday columns (Monday through Friday) starting from a baseline historical week.
- **Flexible Markings**: Toggle student attendance states (`Present`, `Absent`) dynamically in the grid, supporting unmarking, and commit changes securely in a single bulk transaction.

### 📊 3. Interactive Analytics & Insights
- **Filter Dashboard**: Filter attendance trend charts and logs by Classroom, Student, and Timeline windows (7 days, 30 days, current month, all time).
- **Low Attendance Alerts**: A dedicated panel lists students below the 85% presence threshold. Clicking on a record launches the **Actionable Insights Alert Modal** to type and send an immediate warning email note.

### ⚙️ 4. Zero-Dependency Local Dev Server
- Runs on a custom `server.js` development engine that hosts static files and serves serverless functions locally.
- **Bypasses Netlify CLI version blocks** under Node.js v26.x with zero packages required.
- Implements hot-reloading for backend functions.

---

## 🛠️ Architecture & Relational Schema

The database is built on PostgreSQL with connection pooling. The schema contains six core tables:
1. `teachers`: Logs authenticated instructors.
2. `students`: Master list of registered students.
3. `classrooms`: Logs class name, duration in teaching days, and associated teacher.
4. `classroom_students`: Resolves many-to-many enrollment mapping.
5. `attendance_logs`: Logs attendance status per student, classroom, and date.
6. `audit_logs`: Audit footprints tracking modifications.

See [09_DATABASE_SCHEMA.md](file:///c:/Users/hp/attendance-app-trial/09_DATABASE_SCHEMA.md) for full SQL schemas and indexes.

---

## 🏁 Quick Start & Local Run

### Prerequisites
- Node.js installed (supports Node.js v26.x).
- A valid PostgreSQL database connection string in `.env`:
  ```env
  DATABASE_URL="postgres://..."
  ```

### Step 1: Install Dependencies
Run a clean install to download the database driver and config modules:
```powershell
npm install
```
*(If script execution policies block npm wrappers on Windows, run: `npm.cmd install`)*

### Step 2: Run Database Migration & Seeding
Deploy and seed the relational tables:
```powershell
node migration.js
```
*(This drops existing tables cascadingly, creates the 6 core tables, and inserts initial seed data including a teacher account, students, and logs).*

### Step 3: Launch Local Server
Start the local server simulator:
```powershell
npm run dev
```
*(Or run `npm.cmd run dev` or `node server.js` directly).*

Open your browser at **`http://localhost:8888`** and login with:
- **Email**: `admin@spokenenglish.com`
- **Password**: `SuperSecurePassword2026`

---

## 📦 Production Deployment (Netlify Cloud)

To deploy the codebase live to Netlify, run the self-contained pipeline:
```powershell
./deploy.bat
```
This batch script cleans local cache, imports `.env` database secrets securely into Netlify Cloud env, and pushes the live frontend and serverless functions to the edge CDN.
