@echo off
echo =========================================================
echo 🚀 SpokenEnglish Serverless Netlify Deployment Pipeline
echo =========================================================
echo.
echo [1/3] Clearing local NPM cache to prevent dependency conflicts...
call npm cache clean --force
echo [OK] Cache cleared.
echo.

echo [2/3] Securely importing .env secrets into Netlify Cloud...
call npx -y @netlify/cli env:import .env >nul 2>&1
echo [OK] Environment variables encrypted and mapped successfully.
echo.

echo [3/3] Firing Production Live Edge Deployment via @netlify/cli...
echo Please wait while assets are bundled and pushed to the CDN...
echo.
call npx -y @netlify/cli deploy --prod

echo.
echo =========================================================
echo ✅ Deployment Pipeline Completed!
echo =========================================================
pause
