@echo off
echo Installing required packages for Auto-Clicker...
py -m pip install pyautogui
if %errorlevel% neq 0 (
    python -m pip install pyautogui
)
if %errorlevel% neq 0 (
    echo.
    echo -----------------------------------------------------
    echo ERROR: Python is not installed properly!
    echo Please install Python from python.org and try again.
    echo -----------------------------------------------------
) else (
    echo.
    echo -----------------------------------------------------
    echo SUCCESS! Packages installed. You can now run run_auto_trader.bat
    echo -----------------------------------------------------
)
pause
