@echo off
setlocal enabledelayedexpansion
title Quotex Hybrid AI Live Screen Analyzer - Server Console

:: Automatically change directory to the project root
cd /d "%~dp0"

echo ======================================================================
echo    Quotex Hybrid AI Live Screen Analyzer - One-Click Launcher
echo ======================================================================
echo Project Root: %~dp0
echo.

:: 0. Verify screen_watcher\server.js exists in project root
if not exist "screen_watcher\server.js" (
    echo.
    echo [ERROR] Expected server file 'screen_watcher\server.js' was not found!
    echo Current Directory: %CD%
    echo Please make sure this launcher is placed in the project root: C:\Users\lovel\Desktop\trading
    echo.
    pause
    exit /b 1
)
echo [0/5] Found screen_watcher\server.js - OK.

:: 1. Check Node.js
echo [1/5] Checking Node.js installation...
where node >nul 2>&1
if %errorlevel% neq 0 (
    echo.
    echo [ERROR] Node.js is not found on your PATH.
    echo Please install Node.js [LTS recommended] from https://nodejs.org/
    echo.
    pause
    exit /b 1
)
for /f "tokens=*" %%v in ('node -v 2^>nul') do set NODE_VERSION=%%v
echo    Found Node.js %NODE_VERSION% - OK.

:: 2. Check Ollama CLI
echo [2/5] Checking Ollama installation...
where ollama >nul 2>&1
if %errorlevel% neq 0 (
    if exist "%LOCALAPPDATA%\Programs\Ollama\ollama.exe" (
        set "PATH=%LOCALAPPDATA%\Programs\Ollama;!PATH!"
        echo    Found Ollama in %LOCALAPPDATA%\Programs\Ollama - Added to PATH.
    ) else (
        echo.
        echo [ERROR] Ollama is not found on your PATH or in %LOCALAPPDATA%\Programs\Ollama.
        echo Please install Ollama from https://ollama.ai/
        echo.
        pause
        exit /b 1
    )
) else (
    echo    Found Ollama CLI - OK.
)

:: 3. Verify Ollama service is running; if not, attempt to start it
echo [3/5] Verifying Ollama service at http://127.0.0.1:11434...
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
    "$r = try { (Invoke-RestMethod -Uri 'http://127.0.0.1:11434/api/tags' -TimeoutSec 2 -ErrorAction Stop) } catch { $null };" ^
    "if ($null -eq $r) { exit 10 } else { exit 0 }"

if %errorlevel% equ 10 (
    echo    Ollama service is not responding. Starting Ollama in background...
    if exist "%LOCALAPPDATA%\Programs\Ollama\ollama app.exe" (
        start "" "%LOCALAPPDATA%\Programs\Ollama\ollama app.exe"
    ) else (
        start "Ollama Background Service" /b ollama serve
    )
    echo    Waiting for Ollama to initialize [up to 15 seconds]...
    powershell -NoProfile -ExecutionPolicy Bypass -Command ^
        "$ok = $false;" ^
        "for ($i=0; $i -lt 30; $i++) {" ^
        "   Start-Sleep -Milliseconds 500;" ^
        "   $r = try { (Invoke-RestMethod -Uri 'http://127.0.0.1:11434/api/tags' -TimeoutSec 2 -ErrorAction Stop) } catch { $null };" ^
        "   if ($null -ne $r) { $ok = $true; break }" ^
        "};" ^
        "if (-not $ok) { exit 11 } else { exit 0 }"
    if !errorlevel! neq 0 (
        echo.
        echo [ERROR] Could not connect to local Ollama service at http://127.0.0.1:11434.
        echo Please ensure Ollama is installed and run 'ollama serve' in a separate terminal.
        echo.
        pause
        exit /b 1
    )
)
echo    Ollama service is active - OK.

:: 4. Verify required model qwen3-vl:4b is installed (DO NOT auto-download without confirmation)
echo [4/5] Checking for required vision model 'qwen3-vl:4b'...
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
    "$r = try { (Invoke-RestMethod -Uri 'http://127.0.0.1:11434/api/tags' -TimeoutSec 3 -ErrorAction Stop) } catch { $null };" ^
    "if ($null -eq $r) { exit 11 };" ^
    "$found = $r.models | Where-Object { $_.name -like 'qwen3-vl:4b*' };" ^
    "if (-not $found) { exit 12 } else { exit 0 }"

set MODEL_STATUS=%errorlevel%
if %MODEL_STATUS% equ 12 (
    echo.
    echo ======================================================================
    echo [ERROR] Required model 'qwen3-vl:4b' is not installed in local Ollama!
    echo ======================================================================
    echo Safety Policy: Models are NEVER downloaded automatically without confirmation.
    echo.
    echo To download this model now, open a command prompt and run:
    echo    ollama pull qwen3-vl:4b
    echo.
    pause
    exit /b 1
)
if %MODEL_STATUS% neq 0 (
    echo.
    echo [ERROR] Failed to query Ollama model list. Error code: %MODEL_STATUS%
    pause
    exit /b 1
)
echo    Model 'qwen3-vl:4b' verified - OK.

:: 5. Check if port 3000 is already occupied (avoid duplicate server instances)
echo [5/5] Checking port 3000 status...
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
    "$conn = Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue;" ^
    "if ($conn) { exit 20 } else { exit 0 }"

if %errorlevel% equ 20 (
    echo.
    echo [NOTICE] A server is ALREADY running on port 3000.
    echo Verifying port 3000 health...
    powershell -NoProfile -ExecutionPolicy Bypass -Command ^
        "$r = try { (Invoke-WebRequest -Uri 'http://127.0.0.1:3000' -UseBasicParsing -TimeoutSec 2 -ErrorAction Stop) } catch { $null };" ^
        "if ($r -and $r.StatusCode -eq 200) { exit 0 } else { exit 21 }"
    if !errorlevel! equ 0 (
        echo    Port 3000 health check: OK.
    ) else (
        echo    [WARNING] Port 3000 is occupied but did not respond with HTTP 200.
    )
    echo Skipping duplicate server startup.
    echo Opening dashboard in browser: http://localhost:3000
    start http://localhost:3000
    echo.
    echo Press any key to close this launcher window - existing server remains running.
    pause >nul
    exit /b 0
)

:: 6. Launch browser opener watcher in background: waits until server responds with HTTP 200
start "Dashboard Opener" /b powershell -NoProfile -ExecutionPolicy Bypass -Command ^
    "$t0 = (Get-Date);" ^
    "while ((Get-Date) -lt $t0.AddSeconds(20)) {" ^
    "   Start-Sleep -Milliseconds 400;" ^
    "   $r = try { (Invoke-WebRequest -Uri 'http://127.0.0.1:3000' -UseBasicParsing -TimeoutSec 2 -ErrorAction Stop) } catch { $null };" ^
    "   if ($r -and $r.StatusCode -eq 200) {" ^
    "       Start-Process 'http://localhost:3000';" ^
    "       break;" ^
    "   }" ^
    "}"

:: 7. Start server in foreground so console remains visible for error diagnosis
echo.
echo ======================================================================
echo Starting server: node screen_watcher/server.js
echo Dashboard URL:   http://localhost:3000
echo Console output will appear below. Keep this window open while trading.
echo Press Ctrl+C in this window to stop the server at any time.
echo ======================================================================
echo.

node screen_watcher/server.js
if %errorlevel% neq 0 (
    echo.
    echo [ERROR] Server terminated unexpectedly with exit code %errorlevel%.
    echo Check the error logs above for diagnosis.
    pause
)
