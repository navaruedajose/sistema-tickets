@echo off
REM =====================================================================
REM  SISTEMA DE TICKETS - Detener los contenedores
REM
REM  Uso: doble clic sobre este archivo.
REM  Los datos de la base de datos SE CONSERVAN.
REM =====================================================================

cd /d "%~dp0"

echo.
echo ============================================================
echo   SISTEMA DE TICKETS - Detener
echo ============================================================
echo.
echo Opciones:
echo.
echo   [1] Apagar los contenedores  (conserva la base de datos)
echo   [2] Apagar Y BORRAR los datos (reinicio limpio)
echo   [3] Solo ver el estado actual
echo   [0] Cancelar
echo.

set /p opcion="Elige una opcion y pulsa Enter: "

if "%opcion%"=="1" goto apagar
if "%opcion%"=="2" goto borrar
if "%opcion%"=="3" goto estado
goto fin

:apagar
echo.
echo Apagando los contenedores...
REM Se incluyen los perfiles para que tambien se detengan Adminer y el
REM servicio de pruebas; sin ellos quedarian huerfanos.
docker compose --profile herramientas --profile pruebas down
echo.
echo Listo. La base de datos sigue intacta.
goto fin

:borrar
echo.
echo ATENCION: esto borra la base de datos y todas las evidencias subidas.
echo.
set /p confirma="Escribe SI para confirmar: "
if /i not "%confirma%"=="SI" (
  echo Cancelado. No se borro nada.
  goto fin
)
echo.
docker compose --profile herramientas --profile pruebas down -v
echo.
echo Todo borrado. Vuelve a ejecutar INICIAR.bat para empezar de cero.
goto fin

:estado
echo.
docker compose ps
echo.
echo Direcciones:
echo   Aplicacion:  http://localhost:5173
echo   API:         http://localhost:4000/api/v1/salud
goto fin

:fin
echo.
pause
