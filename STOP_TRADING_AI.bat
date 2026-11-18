@echo off
setlocal enabledelayedexpansion
title Quotex Hybrid AI Live Screen Analyzer - Safe Stopper

:: Automatically change directory to the project root
cd /d "%~dp0"

echo ======================================================================
echo    Quotex Hybrid AI Live Screen Analyzer - Safe Stopper
echo ======================================================================
echo.

:: Inspect port 3000 and stop ONLY the specific node.exe process listening on it
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
    "$conn = Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue;" ^
    "if (-not $conn) {" ^
    "   Write-Host '[INFO] No server is currently listening on port 3000. Nothing to stop.';" ^
    "   exit 0;" ^
    "};" ^
    "$procId = $conn.OwningProcess;" ^
    "$p = Get-Process -Id $procId -ErrorAction SilentlyContinue;" ^
    "if (-not $p) {" ^
    "   Write-Host ('[WARNING] Found port 3000 connection for PID ' + $procId + ' but process could not be inspected.');" ^
    "   exit 1;" ^
    "};" ^
    "if ($p.ProcessName -ne 'node') {" ^
    "   Write-Host ('[SAFETY CHECK FAILED] Process on port 3000 is ' + $p.ProcessName + ' (PID: ' + $procId + '), NOT node.exe. Aborting to protect unrelated applications.');" ^
    "   exit 2;" ^
    "};" ^
    "Write-Host ('Stopping Node.js server (PID: ' + $procId + ')...');" ^
    "Stop-Process -Id $procId -Force;" ^
    "Write-Host '[SUCCESS] Trading AI server on port 3000 has been safely stopped.';" ^
    "Write-Host 'Note: Ollama and any other Node processes were left untouched.';" ^
    "exit 0;"

set STOP_STATUS=%errorlevel%
echo.
if %STOP_STATUS% equ 0 (
    echo Safe shutdown complete.
) else (
    echo Safe shutdown exited with code: %STOP_STATUS%
)
echo.
pause
