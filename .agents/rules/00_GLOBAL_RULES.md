---
trigger: always_on
---

@'
# 00_GLOBAL_RULES

## Architectural Constraints
- Strict Framework Prohibition: DO NOT use any modern frontend framework (e.g., React, Vue, Svelte, Tailwind bundling). The implementation must be 100% Vanilla HTML, CSS, and asynchronous native JavaScript.
- Backend Environment: Built exclusively using Netlify Serverless Functions (Node.js runtime framework).
- Database Infrastructure: Structured entirely within NeonDB (PostgreSQL), utilizing strictly connection pooling configurations to handle stateless lifecycles.

## AI Governance & Autonomous Documentation Workflows
- Plan Before Code: The AI agent must never suggest or write code or SQL statements without presenting an actionable, step-by-step Implementation Plan first.
- Autonomous Knowledge & Decision Updates: The AI agent is strictly mandated to AUTOMATICALLY modify, write, or append to `05_KNOWLEDGE.md` whenever a new technical concept is introduced, and to `06_DECISIONS.md` whenever any modification, addition, change, or new decision is decided upon during the conversation.
- Autonomous Incident Logging: The AI agent must automatically document any diagnosed and resolved bug, styling issue, or exception inside `11_TROUBLESHOOTING.md` immediately using the structure: (Error Description -> Architectural Root Cause -> Technical Solution).
- Schema Synchronization: Any additions, iterations, or structural changes to the database design must be automatically updated and written inside `09_DATABASE_SCHEMA.md` by the agent.

## Brand Identity & Theme Style Guardrails
- Strictly enforce the SpokenEnglish core color palette across the layout workspace: 
  * Deep Blue: `#304587`
  * Vibrant Red: `#EE2C36`
  * Off-White: `#EEEEEE`
'@ | Set-Content -Path ".agents/rules/00_GLOBAL_RULES.md" -Encoding utf8

Write-Host "Rules updated! Antigravity is now fully autonomous in tracking changes." -ForegroundColor Green
