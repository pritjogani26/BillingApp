@echo off
echo ===================================================
echo 1. Building Django Backend with PyInstaller...
echo ===================================================
cd accounts_backend

REM Activate virtual environment
call ..\venv\Scripts\activate

REM Run PyInstaller to bundle server.py
pyinstaller --onefile --noconsole ^
  --add-data "accounts/templates;accounts/templates" ^
  --add-data "accounts/static;accounts/static" ^
  --hidden-import=django.db.backends.postgresql ^
  --hidden-import=psycopg2 ^
  --hidden-import=weasyprint ^
  --hidden-import=openpyxl ^
  --hidden-import=jwt ^
  --hidden-import=dotenv ^
  --collect-all accounts ^
  --collect-all config ^
  --collect-all rest_framework ^
  --collect-all corsheaders ^
  server.py

if %ERRORLEVEL% neq 0 (
  echo ❌ Backend build failed!
  exit /b %ERRORLEVEL%
)

echo.
echo ✅ Backend build completed! (dist/server.exe created)
echo.

echo ===================================================
echo 2. Building Electron Frontend + Installer...
echo ===================================================
cd ..\accounts_frontend

REM Build frontend app and package installer
call npm run build:win

if %ERRORLEVEL% neq 0 (
  echo ❌ Frontend build failed!
  exit /b %ERRORLEVEL%
)

echo.
echo ✅ Build completed! BillingApp Setup.exe is ready in accounts_frontend/dist/
echo ===================================================
pause
