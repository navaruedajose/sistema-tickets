@echo off
setlocal
REM =====================================================================
REM  SISTEMA DE TICKETS - Coleccion Postman, carpeta por carpeta
REM
REM  Ejecuta las 9 carpetas en orden y se detiene en el primer fallo.
REM  Al final muestra cuantas peticiones pasaron en cada una.
REM
REM  Requisitos:
REM    - Node.js instalado (https://nodejs.org)
REM    - El sistema levantado:  docker compose up -d
REM    - Datos de demostracion: docker compose exec backend npm run db:seed
REM
REM  Uso:
REM    doble clic                  -> entorno local
REM    EJECUTAR.bat nube           -> entorno Render/Railway
REM
REM  Nota: sin acentos a proposito, para que funcione igual en cualquier
REM  configuracion regional de Windows.
REM =====================================================================

cd /d "%~dp0"

echo.
echo ============================================================
echo   COLECCION POSTMAN - SISTEMA DE TICKETS
echo ============================================================
echo.

REM --- 1. Comprobar Node ---------------------------------------------
where node >nul 2>&1
if errorlevel 1 (
  echo   ERROR: Node.js no esta instalado.
  echo   Descargalo de https://nodejs.org y vuelve a ejecutar este archivo.
  echo.
  pause
  exit /b 1
)

REM --- 2. Instalar newman si hace falta -------------------------------
if not exist "node_modules\newman" (
  echo [1/2] Instalando newman (solo la primera vez)...
  call npm install --silent
  if errorlevel 1 (
    echo   ERROR al instalar newman. Revisa la conexion a Internet.
    pause
    exit /b 1
  )
) else (
  echo [1/2] newman ya esta instalado.
)
echo.

REM --- 3. Ejecutar ----------------------------------------------------
echo [2/2] Ejecutando la coleccion...
echo.

if /I "%~1"=="nube" (
  node ejecutar-coleccion.js --nube
) else (
  node ejecutar-coleccion.js
)

if errorlevel 1 (
  echo.
  echo ============================================================
  echo   HAY CARPETAS CON FALLOS
  echo ============================================================
  echo.
  echo   Revisa arriba cual fallo. Si el sistema no esta levantado,
  echo   ejecuta primero:  docker compose up -d
  echo.
  pause
  exit /b 1
)

echo.
echo ============================================================
echo   TODAS LAS CARPETAS PASARON
echo ============================================================
echo.
pause
endlocal
