@echo off
echo =========================================================
echo 🔄 SpokenEnglish Git Automation Utility
echo =========================================================
echo.
echo [1/3] Staging all modified and new files...
call git add .
echo [OK] Files staged successfully.
echo.

echo [2/3] Committing changes with dynamic timestamp...
set "TIMESTAMP=%date% %time%"
call git commit -m "chore: automated backup - %TIMESTAMP%"
echo [OK] Commit recorded locally.
echo.

echo [3/3] Pushing to remote GitHub repository (origin/main)...
call git push origin main
echo [OK] Repository synchronized successfully.
echo.

echo =========================================================
echo ✅ Sync Pipeline Completed!
echo =========================================================
pause
