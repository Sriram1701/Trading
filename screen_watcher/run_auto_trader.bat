@echo off
echo Starting Quotex Auto-Trader AI...
py auto_trader.py
if %errorlevel% neq 0 (
    python auto_trader.py
)
pause
