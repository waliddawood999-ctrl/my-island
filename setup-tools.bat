@echo off
chcp 65001 >nul
title MyIsland - Install Dev Tools
echo ============================================================
echo   Installing the 4 dev tools via winget (Windows installer)
echo   Keep this window open. The VS Build Tools step is the
echo   biggest download (a few GB) and can take a while.
echo ============================================================
echo.

:: --- Admin check ---
net session >nul 2>&1
if %errorlevel% neq 0 (
  echo [!] Please right-click this file and choose "Run as administrator".
  pause
  exit /b 1
)

echo [1/4] Rust (rustup + MSVC toolchain)...
winget install --id Rustlang.Rustup -e --accept-source-agreements --accept-package-agreements
echo.

echo [2/4] Node.js LTS...
winget install --id OpenJS.NodeJS.LTS -e --accept-source-agreements --accept-package-agreements
echo.

echo [3/4] Visual Studio 2022 Build Tools (C++ workload + Windows SDK)...
winget install --id Microsoft.VisualStudio.2022.BuildTools -e --accept-source-agreements --accept-package-agreements --override "--wait --passive --add Microsoft.VisualStudio.Workload.VCTools --includeRecommended"
echo.

echo [4/4] Microsoft Edge WebView2 Runtime (usually already on Windows 11)...
winget install --id Microsoft.EdgeWebView2Runtime -e --accept-source-agreements --accept-package-agreements
echo.

echo ------------------------------------------------------------
echo Setting the Rust default toolchain to MSVC (required by Tauri)...
call "%USERPROFILE%\.cargo\bin\rustup.exe" default stable-x86_64-pc-windows-msvc

echo.
echo ============================================================
echo   Verification (close and reopen the terminal if a version
echo   does not show here - PATH needs a fresh window):
echo ============================================================
call "%USERPROFILE%\.cargo\bin\rustc.exe" --version
call "%USERPROFILE%\.cargo\bin\cargo.exe" --version
node --version
npm --version
echo.
echo If all four versions printed above, you are READY.
echo Send a photo of this window to Cairo.
pause
