@echo off
setlocal
REM =====================================================================
REM  SISTEMA DE TICKETS - Arranque con un doble clic
REM
REM  Este archivo detecta solo su propia carpeta con %~dp0, asi que NO hay
REM  que escribir ninguna ruta. Eso evita el problema del espacio en el
REM  nombre de la carpeta ("WorkBuddy AI"), que es lo que hace fallar al
REM  comando cd cuando se escribe la ruta a mano.
REM
REM  Uso: doble clic sobre este archivo.
REM
REM  Nota: este archivo no lleva acentos ni caracteres especiales a
REM  proposito, para que funcione igual en cualquier configuracion
REM  regional de Windows.
REM =====================================================================

cd /d "%~dp0"

echo.
echo ============================================================
echo   SISTEMA DE TICKETS - Arranque
echo ============================================================
echo.
echo Carpeta del proyecto:
echo   %CD%
echo.

REM --- 1. Comprobar que Docker responde ------------------------------
echo [1/4] Comprobando Docker...
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

REM --- 2. Comprobar el archivo .env ----------------------------------
echo [2/4] Comprobando el archivo .env...
if not exist ".env" (
  echo.
  echo   ERROR: falta el archivo .env en esta carpeta.
  echo.
  echo   Solucion rapida: copia ".env.example" a ".env" y edita la
  echo   linea JWT_SECRETO con una cadena larga y aleatoria.
  echo.
  pause
  exit /b 1
)
echo       .env encontrado.
echo.

REM --- 3. Construir y levantar ---------------------------------------
echo [3/4] Construyendo y levantando los contenedores...
echo       La primera vez tarda entre 3 y 6 minutos. Ten paciencia:
echo       veras pasar mucha salida de texto y es normal.
echo.
docker compose up -d --build
if errorlevel 1 (
  echo.
  echo   ERROR al levantar los contenedores. Revisa el mensaje de arriba.
  echo.
  pause
  exit /b 1
)
echo.

REM --- 4. Cargar los datos de demostracion (con reintentos) ----------
echo [4/4] Cargando los datos de demostracion...
echo       Esperando a que PostgreSQL y el backend esten listos.
echo.

set /a intento=0

:reintentar
set /a intento+=1
echo   Intento %intento% de 6...
docker compose exec -T backend npm run db:seed >nul 2>&1
if not errorlevel 1 goto exito

if %intento% lss 6 (
  timeout /t 10 /nobreak >nul
  goto reintentar
)

echo.
echo   AVISO: no se pudieron cargar los datos automaticamente.
echo   Los contenedores SI estan levantados; solo falto el semillero.
echo.
echo   Espera un minuto y ejecuta a mano:
echo     docker compose exec backend npm run db:seed
echo.
goto fin

:exito
echo       Datos de demostracion cargados correctamente.

:fin
echo.
echo ============================================================
echo   LISTO
echo ============================================================
echo.
echo   Abre el navegador en:
echo     http://localhost:5173
echo.
echo   Usuario:     admin@sistema-tickets.local
echo   Contrasena:  Demo2026#Tickets
echo.
echo   Para apagar todo, ejecuta DETENER.bat
echo.
echo ============================================================
echo.
pause
endlocal
