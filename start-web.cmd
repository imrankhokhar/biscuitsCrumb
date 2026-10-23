@echo off
setlocal
cd /d "%~dp0"

echo.
echo === BiscuitsCrumb (TeamTask-style: one app on port 4000) ===
echo.

call npm install
if errorlevel 1 exit /b 1

call npm run setup:server
if errorlevel 1 exit /b 1

echo Building frontend...
call npm run build
if errorlevel 1 exit /b 1

echo Building API...
call npm --prefix server run build
if errorlevel 1 exit /b 1

node scripts\copy-web.mjs
if errorlevel 1 exit /b 1

if not exist "server\.env" (
  copy /Y "server\.env.example" "server\.env" >nul
)

echo.
echo Open http://localhost:4000
echo Login: admin@excelorithm.com / admin123
echo.

cd server
set DATABASE_URL=file:./dev.db
set CLIENT_ORIGIN=true
set COOKIE_SECURE=false
set PORT=4000
set PUBLIC_DIR=%cd%\public
call npm start
