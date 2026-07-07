# Incident Logs & Troubleshooting Ledger

This ledger tracks diagnosed and resolved bugs, environment timeouts, layout misalignments, and background process deadlocks encountered during the development of this workspace.

---

## Incident 001: Agent Execution Deadlock

### Error Description
- The AI agent execution environment blocked completely, throwing the following runtime exception during prompt processing: `"Executor has not processed the previous input yet"`. This deadlock prevented any subsequent instructions or tools from being processed in the conversational thread.

### Architectural Root Cause
- An asynchronous background execution loop (specifically, the unmanaged local `server.js` background file server) locked the agent's internal state engine queue. The process was started as a non-daemon execution unit that failed to release standard input/output channels, causing a blocking write loop in the host IDE environment and deadlocking the agent's state transitions.

### Technical Solution
- Executed manual process termination of the blocking background thread by sending a `Ctrl + C` interrupt command in the workspace terminal.
- Dispatched an environment refresh signal to clear the agent's active execution queue and reset the state engine memory state, restoring prompt processing capability immediately.

---

## Incident 002: Static Server Connection Timeout

### Error Description
- The local Node.js server background process (`server.js`) failed to render frontend assets in the browser, returning a silent connection timeout or a connection refused page instead of loading the SPA views.

### Architectural Root Cause
- Local port access rules and active Windows Firewall configurations blocked background Node scripts operating from hidden scratch folders (e.g. within temporary system cache directories) from listening on standard ports. The background listener was unable to bind to port 3000, causing browser requests to time out silently.

### Technical Solution
- Terminated the custom server process and bypassed the custom execution script layout.
- Substituted the serving mechanism with official static hosting and local server frameworks, specifically initiating lightweight serving via `netlify dev` or `npx serve` configurations which cleanly negotiate local port configurations and firewall checks.

---

## Incident 003: UI Ledger Grid Misalignment

### Error Description
- The "Active Course Ledgers" table container suffered a visual layout symmetry failure. Button controls within action cells were pushed upward and misaligned, causing elements to clip their boundaries and look off-center during hover transitions.

### Architectural Root Cause
- Implicit vertical alignment rules in standard HTML table cells (`<td>`) default to baseline positioning. This, combined with asymmetric margin distribution and mismatched padding metrics across button components, caused elements to align unevenly on the page.

### Technical Solution
- Declared explicit `vertical-align: middle` parameters on all `<td>` and `<th>` elements inside `public/styles.css` to force the row contents to balance along the horizontal center axis.
- Grouped interactive button triggers inside a `.action-btn-wrapper` flex utility container utilizing `display: inline-flex; align-items: center; justify-content: flex-end; gap: 8px; height: 32px;` to guarantee standard heights and margins.

---

## Incident 004: Git Carriage Return Warnings

### Error Description
- The Git terminal returned line-ending warnings during staging and tracking operations for modified assets, displaying the message: `"warning: LF will be replaced by CRLF in the working copy"`.

### Architectural Root Cause
- Cross-platform file encoding differences arose because the AI agent model generates Unix-native Line Feeds (`LF`) as line endings, while the local OS host environment (Windows) utilizes standard Carriage Return Line Feeds (`CRLF`) to write files to disk.

### Technical Solution
- Checked the files to verify they are handled gracefully by Git's native auto-conversion mechanism.
- Staged the working copy files via `git add .` to allow Git to normalize line feeds to CRLF in the working directory while tracking LF in the Git repository database automatically.

---

## Incident 005: Command Execution Access Denied (NUL ACL Write Failure)

### Error Description
- Any command executed via the agent's `run_command` tool (including basic commands like `git status` or `echo hello`) fails immediately with the runtime exception: `CORTEX_STEP_TYPE_RUN_COMMAND: opening NUL for ACL write: Access is denied.`

### Architectural Root Cause
- The Go-based IDE backend agent attempts to open standard input/output redirection handles to the Windows null device (`NUL`) using specific security descriptors (ACL writes) when starting processes. On certain Windows system configurations, the runner lacks the administrative privileges or encounters security policies blocking direct ACL modification of system devices, resulting in an immediate execution block.

### Technical Solution
- Since the issue is rooted in the internal Go binary execution environment of the IDE and cannot be resolved by code modifications within the workspace, the deployment commands must be executed directly by the developer in the host machine's terminal (PowerShell/Command Prompt) where standard user permissions or elevated rights bypass the runner's handle-sharing restrictions.

---

## Incident 006: Frontend Template Literal Syntax Error

### Error Description
- The IDE runtime flagged severe syntax blocking errors inside `/public/app.js`, including `Invalid character.`, `Unterminated template literal.`, and `Unknown keyword or identifier.` at lines 317 and 442.

### Architectural Root Cause
- During the automated frontend-to-backend API wiring phase, the AI agent injected backslash characters (`\`) to escape backticks inside multi-line template literals. The JavaScript parser interpreted these escapes as invalid syntax, completely breaking the lexical structure of the file and leaving a trailing unterminated template string.

### Technical Solution
- Executed targeted code replacements to remove the invalid backslash escapes surrounding the template strings, successfully restoring syntax integrity and dynamic rendering logic.

---

## Incident 007: Unhandled Promise Rejection on Database Connection Failure

### Error Description
- The UI surfaced a `Database Connection Error: Unknown NeonDB Query Error` when navigating to the Attendance Matrix. This occurred because the Netlify Serverless endpoint crashed with a generic 500 error instead of returning a properly formatted JSON error payload.

### Architectural Root Cause
- The `const client = await pool.connect();` instruction inside `attendance.js` and `analytics.js` was positioned *outside* the primary `try/catch` execution block. If the local environment `.env` variables were missing or the database connection failed, Node.js threw an unhandled promise rejection. The Netlify runtime caught this fatal error and returned an AWS Lambda exception payload (missing the custom `error` string property), causing the frontend JSON parser to default to the fallback "Unknown NeonDB Query Error" message.

### Technical Solution
- Refactored the connection architecture by moving the `pool.connect()` execution inside the `try` block (`let client; try { client = await pool.connect(); ...`).
- Safely wrapped the `finally` block with a null check (`if (client) client.release();`) to ensure connection pools are not leaked if the initial connection fails.
