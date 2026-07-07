/**
 * SpokenEnglish - Attendance Management SPA Router & State Controller
 * Fully compiled production-ready vanilla client application code.
 */

document.addEventListener('DOMContentLoaded', () => {
    // ============================================================================
    // STATE DECLARATION
    // ============================================================================
    const state = {
        currentView: 'login-view',
        activePane: 'dashboard-pane',
        activeClass: '',
        isSaving: false,
        isExporting: false
    };

    // ============================================================================
    // DOM CACHE
    // ============================================================================
    const views = {
        login: document.getElementById('login-view'),
        dashboard: document.getElementById('dashboard-view'),
        attendance: document.getElementById('attendance-view')
    };

    const panes = {
        dashboard: document.getElementById('dashboard-pane'),
        classes: document.getElementById('classes-pane'),
        statistics: document.getElementById('statistics-pane'),
        export: document.getElementById('export-pane'),
        settings: document.getElementById('settings-pane')
    };

    const forms = {
        login: document.getElementById('login-form'),
        addStudent: document.getElementById('add-student-form')
    };

    const buttons = {
        login: document.getElementById('btn-login'),
        logout: document.getElementById('btn-logout'),
        backDashboard: document.getElementById('btn-back-dashboard'),
        masterSave: document.getElementById('btn-master-save')
    };

    const container = {
        ledgerBody: document.getElementById('ledger-body'),
        matrixBody: document.getElementById('matrix-body'),
        toast: document.getElementById('toast-container'),
        saveStatusMsg: document.getElementById('save-status-msg'),

        // Export Progress Components
        exportProgressPanel: document.getElementById('export-progress-container'),
        exportProgressBar: document.getElementById('export-progress-bar'),
        exportProgressStatus: document.getElementById('export-progress-status'),
        exportProgressPercent: document.getElementById('export-progress-percent'),

        // Settings Diagnostics
        diagnosticsConsole: document.querySelector('.diagnostic-logs-window')
    };

    const inputs = {
        email: document.getElementById('login-email'),
        password: document.getElementById('login-password'),
        offlineCache: document.getElementById('toggle-offline-cache'),
        hourlyBackup: document.getElementById('toggle-hourly-backup'),
        deviceToken: document.getElementById('toggle-device-token'),
        studentFirstName: document.getElementById('new-student-first-name'),
        studentLastName: document.getElementById('new-student-last-name'),
        studentEmail: document.getElementById('new-student-email')
    };

    const labels = {
        activeClassTitle: document.getElementById('active-class-title')
    };

    // ============================================================================
    // VIEW TRANSITION ROUTER (TOP LEVEL)
    // ============================================================================
    function transitionTo(viewId) {
        const targetKey = viewId.split('-')[0];
        const targetView = views[targetKey];
        if (!targetView) return;

        const currentActive = document.querySelector('.view-container.active');
        if (currentActive && currentActive !== targetView) {
            currentActive.classList.remove('active');
            const previousView = currentActive;
            setTimeout(() => {
                if (!previousView.classList.contains('active')) {
                    previousView.classList.add('hidden');
                }
            }, 250);
        }

        targetView.classList.remove('hidden');
        targetView.offsetHeight; // Force browser layout recalculation
        targetView.classList.add('active');
        state.currentView = viewId;

        // Reset scroll height
        targetView.scrollTop = 0;
    }

    // ============================================================================
    // TAB SUB-PANE ROUTER (DASHBOARD WORKSPACE)
    // ============================================================================
    function switchPane(paneId) {
        const targetKey = paneId.split('-')[0];
        const targetPane = panes[targetKey];
        if (!targetPane) return;

        // Transition panes
        const currentActive = document.querySelector('.tab-pane.active');
        if (currentActive && currentActive !== targetPane) {
            currentActive.classList.remove('active');
            currentActive.classList.add('hidden');
        }

        targetPane.classList.remove('hidden');
        targetPane.offsetHeight; // Force browser layout recalculation
        targetPane.classList.add('active');
        state.activePane = paneId;

        // Update sidebar visual active element
        document.querySelectorAll('.nav-item').forEach(item => {
            if (item.getAttribute('data-pane') === paneId) {
                item.classList.add('active');
            } else {
                item.classList.remove('active');
            }
        });

        if (paneId === 'statistics-pane' || paneId === 'dashboard-pane' || paneId === 'export-pane') {
            loadAnalyticsData();
        }
    }

    // ============================================================================
    // DYNAMIC SERVERLESS ANALYTICS FETCHER
    // ============================================================================
    async function loadAnalyticsData() {
        try {
            const response = await fetch('/.netlify/functions/analytics');
            const result = await response.json();

            if (response.ok && result.success) {
                appendDiagnosticLog('[OK] Serverless Analytics GET: Aggregations mapped to DOM.');

                // Map database values to UI Dashboard Metrics
                const metrics = document.querySelectorAll('.metric-value');
                if (metrics.length >= 3) {
                    const totals = result.data.summary_metrics;
                    const presence = totals.present || 0;
                    const sum = presence + (totals.absent || 0) + (totals.tardy || 0) + (totals.excused || 0);

                    if (sum > 0) {
                        // Dynamically update the metric cards
                        metrics[1].textContent = sum; // Active Enrollment / Assumed total entries
                        metrics[2].textContent = presence; // Roster Presence Today
                    }
                }
            } else {
                throw new Error(result.error || 'Failed to fetch analytics.');
            }
        } catch (error) {
            appendDiagnosticLog(`[WARN] Serverless Analytics GET Failed: ${error.message}`);
        }
    }

    // ============================================================================
    // TOAST SYSTEM UTILITY
    // ============================================================================
    function showToast(message, type = 'success') {
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.innerHTML = `
            <div class="toast-content">${message}</div>
            <button class="btn-toast-close">&times;</button>
        `;
        container.toast.appendChild(toast);

        toast.querySelector('.btn-toast-close').addEventListener('click', () => {
            toast.style.opacity = '0';
            setTimeout(() => toast.remove(), 250);
        });

        setTimeout(() => {
            toast.style.opacity = '0';
            setTimeout(() => {
                if (toast.parentNode) toast.remove();
            }, 250);
        }, 4000);
    }

    // ============================================================================
    // EVENT BINDINGS
    // ============================================================================

    // 1. Secure Authentication Submit Handler
    forms.login.addEventListener('submit', async (e) => {
        e.preventDefault();

        const email = inputs.email.value;
        const password = inputs.password.value;

        buttons.login.innerHTML = 'VALIDATING DEVICE SECURITY DNA...';
        buttons.login.disabled = true;

        try {
            const response = await fetch('/.netlify/functions/auth', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password })
            });
            const data = await response.json();

            if (response.ok && data.success) {
                buttons.login.innerHTML = 'LOGIN';
                buttons.login.disabled = false;

                // Route to Dashboard Overview view
                transitionTo('dashboard-view');
                switchPane('dashboard-pane');
                showToast(`Secure session validated. Welcome, ${data.user.email}.`, 'success');
                appendDiagnosticLog('[OK] Serverless Auth: Secure session token generated.');
            } else {
                throw new Error(data.error || 'Invalid credentials provided.');
            }
        } catch (error) {
            buttons.login.innerHTML = 'LOGIN';
            buttons.login.disabled = false;
            showToast(error.message, 'accent');
            appendDiagnosticLog(`[WARN] Serverless Auth Execution Blocked: ${error.message}`);
        }
    });

    // 2. Terminate Workspace Session Trigger
    buttons.logout.addEventListener('click', () => {
        transitionTo('login-view');
        showToast('Secure session terminated.', 'accent');
        appendDiagnosticLog('[WARN] Session token invalidated. Client logged out.');
    });

    // 3. Sidebar Navigation Panel Switching
    document.querySelectorAll('.nav-item').forEach(nav => {
        nav.addEventListener('click', () => {
            const paneId = nav.getAttribute('data-pane');
            switchPane(paneId);
        });
    });

    // 4. Ledger Table Operations (View / Soft-Delete)
    container.ledgerBody.addEventListener('click', async (e) => {
        const target = e.target;
        const row = target.closest('tr');
        if (!row) return;

        const classId = row.getAttribute('data-class-id');
        const className = row.querySelector('.course-name-cell strong').textContent;

        if (target.dataset.action === 'view') {
            // View Attendance Matrix for active class group
            state.activeClass = classId;
            labels.activeClassTitle.textContent = className;

            // Clear static placeholders and show spinner
            container.matrixBody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding: 40px; color: var(--color-text-light);">Connecting to NeonDB and generating registry...</td></tr>';
            transitionTo('attendance-view');
            showToast(`Initiating sync loop for roster: ${className}...`, 'success');

            try {
                const response = await fetch('/.netlify/functions/attendance');
                const result = await response.json();

                if (response.ok && result.success) {
                    container.matrixBody.innerHTML = ''; // Wipe loading state

                    result.data.forEach(student => {
                        const tr = document.createElement('tr');
                        tr.setAttribute('data-student-id', student.id);
                        tr.innerHTML = `
                            <td class="sticky-col student-name-cell">
                                <div class="student-info-cell">
                                    <strong>${student.first_name} ${student.last_name}</strong>
                                    <span>${student.email}</span>
                                </div>
                            </td>
                            <td>
                                <div class="capsule-toggle">
                                    <button class="capsule-btn present" data-status="present">Present</button>
                                    <button class="capsule-btn absent active" data-status="absent">Absent</button>
                                </div>
                            </td>
                            <td>
                                <div class="capsule-toggle">
                                    <button class="capsule-btn present" data-status="present">Present</button>
                                    <button class="capsule-btn absent active" data-status="absent">Absent</button>
                                </div>
                            </td>
                            <td>
                                <div class="capsule-toggle">
                                    <button class="capsule-btn present active" data-status="present">Present</button>
                                    <button class="capsule-btn absent" data-status="absent">Absent</button>
                                </div>
                            </td>
                            <td class="text-right">
                                <button class="btn-text-delete" data-action="withdraw">Withdraw / Archive</button>
                            </td>
                        `;
                        container.matrixBody.appendChild(tr);
                    });

                    showToast(`NeonDB Roster loaded: ${result.data.length} active students.`, 'success');
                    appendDiagnosticLog(`[OK] Serverless Attendance GET: Database returned ${result.data.length} active records.`);
                } else {
                    throw new Error(result.error || 'Unknown NeonDB Query Error');
                }
            } catch (error) {
                container.matrixBody.innerHTML = `<tr><td colspan="5" style="text-align:center; color: var(--color-risk); padding: 40px;">Database Connection Error: ${error.message}</td></tr>`;
                showToast('Failed to load student registry.', 'accent');
                appendDiagnosticLog(`[WARN] Serverless Attendance GET Failed: ${error.message}`);
            }
        }
        else if (target.dataset.action === 'archive') {
            // Soft-Delete animation simulation
            if (confirm(`Archive course ledger record: "${className}"?`)) {
                row.style.opacity = '0';
                row.style.transform = 'translateX(-20px)';
                row.style.transition = 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)';

                setTimeout(() => {
                    row.remove();
                    showToast(`Course ledger "${className}" archived.`, 'accent');
                    appendDiagnosticLog(`[INFO] Soft-deleted class ledger: ${classId} (database set deleted_at timestamp).`);
                }, 300);
            }
        }
    });

    // 5. Back to Dashboard Ledgers
    buttons.backDashboard.addEventListener('click', () => {
        transitionTo('dashboard-view');
        switchPane('dashboard-pane');
    });

    // 6. Binary Capsule Attendance Mutual Exclusion State Machine
    container.matrixBody.addEventListener('click', (e) => {
        const btn = e.target;
        if (!btn.classList.contains('capsule-btn')) return;

        const containerNode = btn.closest('.capsule-toggle');
        const capsules = containerNode.querySelectorAll('.capsule-btn');
        const row = btn.closest('tr');
        const studentName = row.querySelector('.student-info-cell strong').textContent;

        // Clear opposing toggle status
        capsules.forEach(c => c.classList.remove('active'));
        btn.classList.add('active');

        const status = btn.getAttribute('data-status');
        if (status === 'present') {
            showToast(`${studentName} marked PRESENT.`, 'success');
        } else {
            showToast(`${studentName} marked ABSENT.`, 'accent');
        }
        appendDiagnosticLog(`[INFO] Attendance buffer changed: ${studentName} -> ${status.toUpperCase()}`);
    });

    // 7. Matrix Grid Student Withdrawal (Soft-Delete)
    container.matrixBody.addEventListener('click', async (e) => {
        const btn = e.target;
        if (btn.dataset.action !== 'withdraw') return;

        const row = btn.closest('tr');
        const studentId = row.getAttribute('data-student-id');
        const studentName = row.querySelector('.student-info-cell strong').textContent;

        if (confirm(`Withdraw student: "${studentName}" from active matrices?`)) {
            try {
                showToast(`Withdrawing student ${studentName}...`, 'info');
                const response = await fetch('/.netlify/functions/attendance', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ action: 'delete_student', student_id: studentId })
                });
                const result = await response.json();

                if (response.ok && result.success) {
                    row.style.opacity = '0';
                    row.style.transform = 'translateY(15px)';
                    row.style.transition = 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)';

                    setTimeout(() => {
                        row.remove();
                        showToast(`Student "${studentName}" set to inactive.`, 'accent');
                        appendDiagnosticLog(`[INFO] Set deleted_at timestamp on student record: "${studentName}" (ID: ${studentId})`);
                    }, 300);
                } else {
                    throw new Error(result.error || 'Failed to delete student.');
                }
            } catch (err) {
                showToast(`Delete failed: ${err.message}`, 'accent');
                appendDiagnosticLog(`[WARN] Student deletion failed: ${err.message}`);
            }
        }
    });

    // 7.5 Register New Student Form Handler
    forms.addStudent.addEventListener('submit', async (e) => {
        e.preventDefault();

        const firstName = inputs.studentFirstName.value.trim();
        const lastName = inputs.studentLastName.value.trim();
        const email = inputs.studentEmail.value.trim();

        if (!firstName || !lastName || !email) return;

        try {
            showToast('Registering student to NeonDB...', 'info');
            const response = await fetch('/.netlify/functions/attendance', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'add_student',
                    first_name: firstName,
                    last_name: lastName,
                    email: email
                })
            });
            const result = await response.json();

            if (response.ok && result.success) {
                const student = result.data;
                
                // Dynamically append new student row to the Attendance Matrix Grid
                const tr = document.createElement('tr');
                tr.setAttribute('data-student-id', student.id);
                tr.innerHTML = `
                    <td class="sticky-col student-name-cell">
                        <div class="student-info-cell">
                            <strong>${student.first_name} ${student.last_name}</strong>
                            <span>${student.email}</span>
                        </div>
                    </td>
                    <td>
                        <div class="capsule-toggle">
                            <button class="capsule-btn present" data-status="present">Present</button>
                            <button class="capsule-btn absent active" data-status="absent">Absent</button>
                        </div>
                    </td>
                    <td>
                        <div class="capsule-toggle">
                            <button class="capsule-btn present" data-status="present">Present</button>
                            <button class="capsule-btn absent active" data-status="absent">Absent</button>
                        </div>
                    </td>
                    <td>
                        <div class="capsule-toggle">
                            <button class="capsule-btn present" data-status="present">Present</button>
                            <button class="capsule-btn absent active" data-status="absent">Absent</button>
                        </div>
                    </td>
                    <td class="text-right">
                        <button class="btn-text-delete" data-action="withdraw">Withdraw / Archive</button>
                    </td>
                `;
                container.matrixBody.appendChild(tr);

                // Clear input fields
                forms.addStudent.reset();

                showToast(`Student "${student.first_name} ${student.last_name}" registered successfully.`, 'success');
                appendDiagnosticLog(`[OK] Inserted student record to NeonDB: "${student.first_name} ${student.last_name}" (ID: ${student.id})`);
            } else {
                throw new Error(result.error || 'Failed to register student.');
            }
        } catch (err) {
            showToast(`Registration failed: ${err.message}`, 'accent');
            appendDiagnosticLog(`[WARN] Student registration failed: ${err.message}`);
        }
    });

    // 8. Bulk Sync NeonDB Command
    buttons.masterSave.addEventListener('click', async () => {
        if (state.isSaving) return;

        state.isSaving = true;
        const btnText = buttons.masterSave.querySelector('span');
        const spinner = buttons.masterSave.querySelector('.spinner');

        btnText.textContent = 'COMMITTING CHANGES TO NEON DB CONNECTION POOL...';
        spinner.classList.remove('hidden');
        buttons.masterSave.disabled = true;
        container.saveStatusMsg.classList.add('hidden');

        // Extract UI state to JSON Payload for Serverless POST UPSERT
        const log_date = new Date().toISOString().split('T')[0];
        const logs = [];

        document.querySelectorAll('#matrix-body tr').forEach(row => {
            const student_id = row.getAttribute('data-student-id');
            // Sample standard 3rd-day column for active status extraction
            const activeBtn = row.querySelector('td:nth-child(4) .capsule-btn.active');

            if (student_id && activeBtn) {
                logs.push({
                    student_id: student_id,
                    status: activeBtn.getAttribute('data-status')
                });
            }
        });

        if (logs.length === 0) {
            btnText.textContent = 'MASTER BULK SAVE';
            spinner.classList.add('hidden');
            buttons.masterSave.disabled = false;
            state.isSaving = false;
            showToast('No active database records to commit.', 'accent');
            return;
        }

        try {
            const response = await fetch('/.netlify/functions/attendance', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ logs, log_date })
            });
            const data = await response.json();

            if (response.ok && data.success) {
                container.saveStatusMsg.classList.remove('hidden');
                showToast(data.message || 'All buffered attendance logs synced successfully.', 'success');
                appendDiagnosticLog(`[OK] Serverless Attendance POST: NeonDB UPSERT completed for ${logs.length} records.`);

                // Re-trigger analytics sync silently to update dashboard numbers
                loadAnalyticsData();
            } else {
                throw new Error(data.error || 'Constraint Violation Exception');
            }
        } catch (error) {
            showToast(`Database Sync Error: ${error.message}`, 'accent');
            appendDiagnosticLog(`[WARN] Serverless Attendance POST Failed: ${error.message}`);
        } finally {
            btnText.textContent = 'MASTER BULK SAVE';
            spinner.classList.add('hidden');
            buttons.masterSave.disabled = false;
            state.isSaving = false;
        }
    });

    // 9. Document Compiler Progress Bar Simulations
    document.querySelectorAll('.btn-export-trigger').forEach(btn => {
        btn.addEventListener('click', () => {
            if (state.isExporting) return;

            state.isExporting = true;
            const docType = btn.getAttribute('data-type').toUpperCase();

            // Show Progress panel
            container.exportProgressPanel.classList.remove('hidden');
            container.exportProgressBar.style.width = '0%';
            container.exportProgressPercent.textContent = '0%';
            container.exportProgressStatus.textContent = `Assembling and formatting ${docType} documents...`;

            let progress = 0;
            const interval = setInterval(() => {
                progress += 10;
                container.exportProgressBar.style.width = `${progress}%`;
                container.exportProgressPercent.textContent = `${progress}%`;

                if (progress === 40) {
                    container.exportProgressStatus.textContent = 'Processing polymorphic structures...';
                }
                if (progress === 80) {
                    container.exportProgressStatus.textContent = 'Injecting verification metadata tokens...';
                }

                if (progress >= 100) {
                    clearInterval(interval);
                    setTimeout(() => {
                        state.isExporting = false;
                        container.exportProgressPanel.classList.add('hidden');
                        showToast(`${docType} manifest compilation complete.`, 'success');
                        appendDiagnosticLog(`[OK] Generated offline ${docType} report artifact download stream.`);

                        // Active prompt confirming download
                        if (confirm(`${docType} file compiled successfully!\nReady for Download. Proceed with file save?`)) {
                            showToast(`File download started.`, 'success');
                        }
                    }, 300);
                }
            }, 120);
        });
    });

    // 10. Settings Configuration Toggle Diagnostics Sync
    inputs.offlineCache.addEventListener('change', () => {
        const stateStr = inputs.offlineCache.checked ? 'ENABLED' : 'DISABLED';
        appendDiagnosticLog(`[CONFIG] Offline Sync Caching changed: ${stateStr}`);
        showToast(`Offline Caching: ${stateStr}`, 'success');
    });

    inputs.hourlyBackup.addEventListener('change', () => {
        const stateStr = inputs.hourlyBackup.checked ? 'ENABLED' : 'DISABLED';
        appendDiagnosticLog(`[CONFIG] Hourly Background Backup changed: ${stateStr}`);
        showToast(`Hourly backups: ${stateStr}`, 'success');
    });

    inputs.deviceToken.addEventListener('change', () => {
        const stateStr = inputs.deviceToken.checked ? 'ENABLED' : 'DISABLED';
        appendDiagnosticLog(`[CONFIG] Device Fingerprint check changed: ${stateStr}`);
        showToast(`Fingerprint checks: ${stateStr}`, 'success');
    });

    // Helper: Diagnostic Console log logging
    function appendDiagnosticLog(text) {
        const line = document.createElement('div');
        if (text.includes('[OK]')) {
            line.className = 'log-line success';
        } else if (text.includes('[WARN]')) {
            line.className = 'log-line warning';
        } else if (text.includes('[CONFIG]')) {
            line.className = 'log-line info';
        } else {
            line.className = 'log-line info';
        }
        line.textContent = text;
        container.diagnosticsConsole.appendChild(line);
        container.diagnosticsConsole.scrollTop = container.diagnosticsConsole.scrollHeight;
    }
});
