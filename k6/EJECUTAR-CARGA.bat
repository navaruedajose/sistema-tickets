@echo off
REM =====================================================================
REM  SISTEMA DE TICKETS - Prueba de carga con k6
REM
REM  Que hace este archivo:
REM    1. Desactiva TEMPORALMENTE los TRES limitadores de tasa del backend.
REM    2. Ejecuta la prueba de carga de k6.
REM    3. Vuelve a ACTIVARLOS (deja el sistema como estaba).
REM
REM  Por que hay que desactivar el limitador:
REM    Una prueba de carga y un limitador de tasa persiguen objetivos
REM    opuestos. Con el limitador activo, k6 a 20 peticiones por segundo
REM    agota la cuota en menos de un minuto y el resto de la prueba mide
REM    el limitador, no el sistema. Para medir la capacidad real hay que
REM    desactivarlo.
REM
REM  Para DEMOSTRAR que el limitador funciona, NO uses este archivo:
REM    deja el limite activo y ejecuta la prueba de humo.
REM
REM  Uso:  doble clic. Para elegir escenario, pasa el nombre como argumento:
REM        EJECUTAR-CARGA.bat estres
REM
REM  Para usar los umbrales exigentes de produccion:
REM        EJECUTAR-CARGA.bat carga produccion
REM =====================================================================

setlocal

cd /d "%~dp0.."

set ESCENARIO_ARG=%1
if "%ESCENARIO_ARG%"=="" set ESCENARIO_ARG=carga

set PERFIL_ARG=%2
if "%PERFIL_ARG%"=="" set PERFIL_ARG=local

echo.
echo =====================================================================
echo   PRUEBA DE CARGA - SISTEMA DE TICKETS
echo =====================================================================
echo   Escenario: %ESCENARIO_ARG%
echo   Perfil:    %PERFIL_ARG%  (local = calibrado, produccion = exigente)
echo.
echo   Escenarios disponibles:
echo     carga  (por defecto)  hasta 50 usuarios concurrentes
echo     tasa                  20 peticiones por segundo
echo     estres                hasta 200 usuarios concurrentes
echo     picos                 salto subito a 150 usuarios
echo     mixto                 navegacion realista del sistema
echo =====================================================================
echo.

REM --- 1. Comprobar que Docker responde ---------------------------------
docker info >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Docker Desktop no esta en ejecucion.
    echo         Abrelo, espera a que diga "Running" y vuelve a intentarlo.
    echo.
    pause
    exit /b 1
)

REM --- 2. Comprobar que el sistema esta levantado -----------------------
docker compose ps --status running 2>nul | findstr /C:"tickets_backend" >nul
if errorlevel 1 (
    echo [ERROR] El backend no esta corriendo.
    echo         Ejecuta primero INICIAR.bat.
    echo.
    pause
    exit /b 1
)

echo [1/4] Desactivando los limitadores de tasa...
REM Se desactivan LOS TRES limitadores:
REM   RATE_LIMIT_MAX=0           -> limite global de la API
REM   LOGIN_RATE_LIMIT_MAX=0     -> limite de inicios de sesion
REM   RATE_LIMIT_COSTOSAS_MAX=0  -> limite de operaciones costosas
REM
REM El tercero es el importante: se aplica DIRECTAMENTE a POST /tickets, con
REM una cuota de 20 por minuto. Sin desactivarlo, k6 a 20 peticiones por
REM segundo recibe un 95% de respuestas 429 y la prueba termina midiendo el
REM limitador en lugar del sistema.
REM
REM El de login tambien hace falta: con muchos usuarios virtuales, varios
REM inician sesion a la vez y el contador sube antes de que las respuestas
REM exitosas lo bajen.
REM
REM La variable de entorno del shell TIENE PRIORIDAD sobre el archivo .env
REM en la interpolacion de docker-compose, asi que basta con definirla aqui.
set RATE_LIMIT_MAX=0
set LOGIN_RATE_LIMIT_MAX=0
set RATE_LIMIT_COSTOSAS_MAX=0
docker compose up -d backend >nul 2>&1

echo       Esperando a que el backend este listo...
set /a ESPERA=0
:esperar
set /a ESPERA+=1
docker compose exec -T backend curl -fsS http://127.0.0.1:4000/api/v1/salud >nul 2>&1
if not errorlevel 1 goto listo
if %ESPERA% lss 20 (
    timeout /t 2 /nobreak >nul
    goto esperar
)
echo [ERROR] El backend no respondio a tiempo.
pause
exit /b 1

:listo
echo       Backend listo con el limitador desactivado.
echo.

echo [2/4] Ejecutando k6 (esto tarda varios minutos)...
echo.
REM Se monta la carpeta del proyecto dentro del contenedor (-v y -w) para
REM que k6 pueda escribir el informe JSON en k6\resumen-final.json.
docker run --rm -i ^
    -v "%cd%:/app" ^
    -w /app ^
    -e URL_BASE=http://host.docker.internal:4000/api/v1 ^
    -e ESCENARIO=%ESCENARIO_ARG% ^
    -e PERFIL=%PERFIL_ARG% ^
    -e RESUMEN_JSON=k6/resumen-final.json ^
    grafana/k6 run - < k6\load-test.js

set CODIGO_K6=%errorlevel%

echo.
echo [3/4] Reactivando los limitadores de tasa...
set RATE_LIMIT_MAX=
set LOGIN_RATE_LIMIT_MAX=
set RATE_LIMIT_COSTOSAS_MAX=
docker compose up -d backend >nul 2>&1
echo       Limitadores reactivados (vuelven a los valores del archivo .env).
echo.

echo [4/4] Listo.
echo.
echo =====================================================================
if "%CODIGO_K6%"=="0" (
    echo   RESULTADO: todos los umbrales se cumplieron.
) else (
    echo   RESULTADO: k6 termino con codigo %CODIGO_K6%.
    echo   Codigo 99 = algun umbral no se cumplio. Revisa el informe de arriba.
)
echo =====================================================================
echo.
echo   El informe tambien quedo guardado en:
echo     k6\resumen-final.json
echo.
echo   NOTA: esta prueba crea tickets de verdad en la base de datos.
echo         Para borrarlos y dejar los datos de ejemplo limpios:
echo             docker compose exec backend npm run db:limpiar-pruebas
echo.
echo         Ese comando borra SOLO los tickets generados por k6 (los
echo         identifica por el patron del titulo) y respeta los del
echo         semillero y los que hayas creado a mano. NO hace falta
echo         borrar el volumen con "docker compose down -v".
echo.
pause
