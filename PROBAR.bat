@echo off
setlocal
REM =====================================================================
REM  SISTEMA DE TICKETS - Pruebas automatizadas con un doble clic
REM
REM  Ejecuta las 47 pruebas (Jest + Supertest) dentro de Docker, sin
REM  necesidad de tener Node instalado en la maquina.
REM
REM  Por que un script aparte: la imagen de PRODUCCION no incluye Jest a
REM  proposito (las herramientas de desarrollo no viajan a produccion).
REM  Por eso `docker compose exec backend npm test` falla con
REM  "jest: not found". La suite vive en la etapa `pruebas` del Dockerfile,
REM  que si instala devDependencies.
REM
REM  Este archivo detecta solo su propia carpeta con %~dp0, asi que NO hay
REM  que escribir ninguna ruta.
REM
REM  Uso: doble clic sobre este archivo.
REM
REM  Nota: sin acentos ni caracteres especiales a proposito, para que
REM  funcione igual en cualquier configuracion regional de Windows.
REM =====================================================================

cd /d "%~dp0"

echo.
echo ============================================================
echo   SISTEMA DE TICKETS - Pruebas automatizadas
echo ============================================================
echo.
echo Carpeta del proyecto:
echo   %CD%
echo.

REM --- 1. Comprobar que Docker responde ------------------------------
echo [1/3] Comprobando Docker...
docker info >nul 2>&1
if errorlevel 1 (
  echo.
  echo   ERROR: Docker no responde.
  echo.
  echo   Abre "Docker Desktop" desde el menu Inicio y espera a que el
  echo   icono deje de animarse. Despues vuelve a ejecutar este archivo.
  echo.
  pause
  exit /b 1
)
echo       Docker OK.
echo.

REM --- 2. Construir la imagen de pruebas -----------------------------
echo [2/3] Preparando la imagen de pruebas...
echo       La primera vez descarga las dependencias de desarrollo
echo       (jest, supertest). Las siguientes veces es instantaneo.
echo.
docker compose --profile pruebas build pruebas
if errorlevel 1 (
  echo.
  echo   ERROR al construir la imagen de pruebas. Revisa el mensaje de arriba.
  echo.
  pause
  exit /b 1
)
echo.

REM --- 3. Ejecutar la suite ------------------------------------------
echo [3/3] Ejecutando las pruebas...
echo.
docker compose --profile pruebas run --rm pruebas
if errorlevel 1 (
  echo.
  echo ============================================================
  echo   HAY PRUEBAS QUE FALLAN
  echo ============================================================
  echo.
  echo   Revisa arriba el detalle de cada fallo. Las pruebas no tocan
  echo   la base de datos real: usan dobles en memoria.
  echo.
  pause
  exit /b 1
)

echo.
echo ============================================================
echo   TODAS LAS PRUEBAS PASARON
echo ============================================================
echo.
echo   La imagen de produccion sigue sin Jest: las herramientas de
echo   desarrollo solo viven en la etapa `pruebas` del Dockerfile.
echo.
echo   Para cobertura:
echo     docker compose --profile pruebas run --rm pruebas npx jest --coverage --runInBand
echo.
echo ============================================================
echo.
pause
endlocal
