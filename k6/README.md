# Pruebas de carga con k6 — Sistema de Tickets

Verificación de rendimiento y estabilidad del sistema bajo carga concurrente.

## Archivos

| Archivo | Propósito | Duración |
|---|---|---|
| `EJECUTAR-CARGA.bat` | **Recomendado en Windows:** desactiva los limitadores, ejecuta la carga y los reactiva. Doble clic. Acepta 2 argumentos: escenario y perfil | 2–7 min |
| `smoke-test.js` | Verificación funcional rápida: valida el flujo completo y las defensas de seguridad | ~30 s |
| `load-test.js` | Prueba de carga con 5 escenarios configurables y 2 perfiles de umbrales | 2–7 min |
| `resumen-tasa.json` | **Evidencia medida:** resumen crudo del escenario `tasa` (capacidad de escritura) | — |
| `resumen-mixto.json` | **Evidencia medida:** resumen crudo del escenario `mixto` (carga realista) | — |

## Instalación de k6

**No hace falta instalar nada:** los scripts de este proyecto usan la imagen
oficial de Docker. Si además quieres k6 en tu equipo:

```bash
# Windows
winget install k6 --source winget
# o bien: choco install k6

# macOS
brew install k6

# Linux (Debian/Ubuntu)
sudo apt update && sudo apt install k6
```

Con Docker, la forma de ejecutar un script es pasarlo por la entrada estándar:

```bash
docker run --rm -i -e URL_BASE=http://host.docker.internal:4000/api/v1 \
  grafana/k6 run - < k6/smoke-test.js
```

> **`URL_BASE` es obligatorio con Docker.** Dentro del contenedor de k6,
> `localhost` es el propio contenedor, no tu equipo, así que el valor por
> defecto (`http://localhost:4000/api/v1`) no alcanza a la API y la prueba falla
> con "connection refused" — parece que el sistema está caído cuando no lo está.
> `host.docker.internal` es el nombre que Docker Desktop resuelve hacia tu
> máquina.

> **Nota:** los scripts **no dependen de Internet**. Antes importaban dos
> funciones auxiliares desde `jslib.k6.io`, lo que impedía arrancar la prueba
> sin conexión; ahora están implementadas dentro del propio script. Es
> deliberado: en una sustentación la red no es algo de lo que convenga
> depender.

## Preparación

```bash
# 1. Levantar el sistema
docker compose up -d --build

# 2. Cargar los datos de demostración (los usuarios de prueba son necesarios)
docker compose exec backend npm run db:seed

# 3. Confirmar que responde
curl http://localhost:4000/api/v1/salud
```

## Ejecución

### Paso 1 — Prueba de humo (siempre primero)

```bash
k6 run k6/smoke-test.js
```

Valida 10 pasos del flujo real: salud → login → catálogos → crear ticket →
consultar → comentar → cambiar estado → verificar que la máquina de estados
rechaza una transición ilegal → verificar que sin token responde 401 →
generar un reporte PDF.

**Si la prueba de humo falla, no ejecute la de carga.** Corrija primero el
problema: someter a 200 usuarios un sistema que ya falla con uno solo no aporta
información útil.

### Paso 2 — Prueba de carga

**Antes de nada, lee esto: la prueba de carga y los limitadores de tasa son
incompatibles por diseño.**

El backend tiene **tres** limitadores, y el que arruina la medición no es el
global:

| Limitador | Variable | Cuota por defecto | Dónde se aplica |
|---|---|---|---|
| Global | `RATE_LIMIT_MAX` | 300 / 15 min | Toda la API |
| Inicio de sesión | `LOGIN_RATE_LIMIT_MAX` | 10 fallos / 15 min | `POST /auth/iniciar-sesion` |
| **Operaciones costosas** | `RATE_LIMIT_COSTOSAS_MAX` | **20 / minuto** | **`POST /tickets`**, subidas y reportes |

**El tercero es el decisivo**, porque se aplica justo al endpoint que se quiere
medir. A 20 peticiones por segundo, la cuota se agota en segundos y a partir de
ahí la prueba **mide el limitador en lugar del sistema**: el umbral
`creacion_ticket_exito` fallará aunque el código esté perfecto.

En la primera ejecución real de esta prueba, de **3.597 peticiones 3.429
recibieron 429** (el 95%) y solo se crearon 60 tickets. Ese resultado es
correcto —el sistema se defiende— pero no dice nada sobre la capacidad real.

Para medir capacidad hay que desactivar los tres. La forma más sencilla es el
archivo que hace todo el trabajo:

```bat
k6\EJECUTAR-CARGA.bat                    :: escenario "carga", perfil "local"
k6\EJECUTAR-CARGA.bat estres             :: escenario "estres"
k6\EJECUTAR-CARGA.bat tasa produccion    :: escenario y perfil de umbrales
```

El script desactiva los tres limitadores, ejecuta k6 y **vuelve a activarlos al
terminar**, de modo que el sistema queda como estaba.

**Si prefieres hacerlo a mano** (con k6 instalado en tu equipo):

```bash
# 1. Desactivar los TRES limitadores y reiniciar el backend
RATE_LIMIT_MAX=0 LOGIN_RATE_LIMIT_MAX=0 RATE_LIMIT_COSTOSAS_MAX=0 \
  docker compose up -d backend

# 2. Ejecutar la prueba
k6 run -e ESCENARIO=tasa k6/load-test.js

# 3. Reactivar los limitadores (importante: no dejarlos desactivados)
docker compose up -d backend
```

`0` significa «sin límite» en las tres variables. La forma de comprobarlo es
preguntarle al propio contenedor:

```bash
docker compose exec backend sh -c 'echo "$RATE_LIMIT_MAX $LOGIN_RATE_LIMIT_MAX $RATE_LIMIT_COSTOSAS_MAX"'
```

> **Para DEMOSTRAR que el limitador funciona**, haz lo contrario: deja el
> límite activo y ejecuta la **prueba de humo**, o el escenario `estres`. Verás
> cómo el sistema responde `429` en lugar de caerse. Eso es la defensa
> funcionando, no un fallo.

### Escenarios disponibles

Se eligen con la variable de entorno `ESCENARIO`:

```bash
k6 run -e ESCENARIO=carga   k6/load-test.js   # por defecto
k6 run -e ESCENARIO=tasa    k6/load-test.js
k6 run -e ESCENARIO=estres  k6/load-test.js
k6 run -e ESCENARIO=picos   k6/load-test.js
k6 run -e ESCENARIO=mixto   k6/load-test.js
```

| Escenario | Patrón de tráfico | Qué demuestra |
|---|---|---|
| `carga` | 0 → 50 usuarios en 1 min, meseta de 3 min | Comportamiento en un día laboral normal |
| `tasa` | 20 peticiones/segundo constantes durante 3 min | Capacidad real del servidor, independiente de la latencia |
| `estres` | Hasta 200 usuarios concurrentes | Dónde está el punto de quiebre y si el limitador de tasa actúa |
| `picos` | Salto de 5 → 150 usuarios en 10 s | Si el sistema aguanta una caída masiva y se recupera |
| `mixto` | Navegación realista (más lecturas que escrituras) | Rendimiento con la proporción real de uso de un helpdesk |

### Otros parámetros

```bash
# Elegir el perfil de umbrales (local = calibrado, produccion = exigente)
k6 run -e PERFIL=produccion k6/load-test.js

# Contra un entorno desplegado
k6 run -e URL_BASE=https://mi-servicio.onrender.com/api/v1 k6/load-test.js

# Guardar el resumen con los números reales (requiere montar el directorio)
docker run --rm -i -v "%cd%:/app" -w /app \
  -e URL_BASE=http://host.docker.internal:4000/api/v1 \
  -e RESUMEN_JSON=k6/resumen-final.json \
  grafana/k6 run - < k6/load-test.js

# Etiquetar la ejecución (aparece en el resumen)
k6 run -e ENTORNO=produccion k6/load-test.js

# Cambiar las credenciales si modificó el semillero
k6 run -e CONTRASENA=MiOtraContrasena k6/load-test.js
```

> **Sobre `RESUMEN_JSON`:** el archivo solo se escribe si se indica la ruta, y
> por eso no se escribe siempre. La forma recomendada de ejecutar k6 con Docker
> es pasar el script por la entrada estándar (`run - < script.js`), y en ese
> caso el contenedor **no tiene el directorio `k6/`**, así que intentar escribir
> en él haría fallar el resumen con
> `could not open 'k6/resumen-final.json': no such file or directory`. Para
> obtener el archivo hay que montar el directorio y pedirlo, como en el ejemplo.

## Métricas personalizadas

Además de las métricas automáticas de k6 (`http_req_duration`, `http_req_failed`,
`vus`, `iterations`), el script define métricas de negocio:

| Métrica | Tipo | Significado |
|---|---|---|
| `creacion_ticket_duracion` | Trend | Latencia exclusiva de `POST /tickets` |
| `listado_tickets_duracion` | Trend | Latencia del listado con filtros |
| `creacion_ticket_exito` | Rate | Proporción de creaciones aceptadas |
| `tickets_creados_total` | Counter | Tickets realmente persistidos |
| `respuestas_429_total` | Counter | Peticiones frenadas por el limitador de tasa |
| `respuestas_400_total` | Counter | Envíos rechazados por validación |
| `errores_5xx_total` | Counter | **Fallos no controlados. Debe ser 0.** |
| `tickets_iniciales` | Gauge | Tickets existentes al inicio de la prueba |

## Umbrales (criterios de aceptación)

La prueba **falla automáticamente** (código de salida ≠ 0) si no se cumplen.
Hay **dos perfiles**, porque exigir lo mismo en un portátil que en un servidor
dedicado no es honesto: los umbrales fallarían siempre y dejarían de ser útiles.

Se eligen con `-e PERFIL=...` (por defecto, `local`):

| Umbral | Perfil `local` | Perfil `produccion` | Justificación |
|---|---|---|---|
| `http_req_duration p(95)` | < 2500 ms | < 800 ms | Un usuario no debe esperar segundos |
| `http_req_duration p(99)` | < 15000 ms | < 2000 ms | Margen para la cola conocida del pool |
| `http_req_failed` | < 1% | < 1% | Los 429 ya no cuentan como fallo (ver abajo) |
| `creacion_ticket_duracion p(95)` | < 2000 ms | < 1000 ms | Operación crítica |
| `creacion_ticket_duracion p(99)` | < 6000 ms | < 2500 ms | Cola de la operación crítica |
| `creacion_ticket_exito` | > 90% | > 90% | Al menos 9 de cada 10 intentos aceptados |
| `errores_5xx_total` | **= 0** | **= 0** | No negociable: un 5xx es un fallo de código |
| `listado_tickets_duracion p(95)` | < 500 ms | < 500 ms | Solo en el escenario `mixto` (ver abajo) |

**El perfil `local` está calibrado con mediciones, no elegido a ojo.** Con
`ESCENARIO=tasa` y `DB_POOL_MAX=50` se midió `p(95) = 1.517 ms`, y el umbral se
puso en 2.500 ms: un margen de ~1,6× que detecta regresiones sin fallar por
ruido. El informe completo, con las dos mediciones y el diagnóstico del cuello
de botella, está en [`docs/RENDIMIENTO.md`](../docs/RENDIMIENTO.md).

> **Por qué `listado_tickets_duracion` no aparece en todos los escenarios.**
> k6 publica en el resumen **cualquier métrica que aparezca en un umbral**,
> aunque no haya recibido ni una sola muestra, y en ese caso le asigna **0** a
> todas sus estadísticas. Eso tiene dos consecuencias: un umbral como
> `p(95)<500` se cumplía de forma **vacía** (0 < 500) en los escenarios que solo
> crean tickets, dando por verificado un listado que nunca se ejercitó; y al
> revés, un umbral como `rate>0.90` sobre una métrica vacía vale 0 y por tanto
> **falla**. Por eso cada umbral se aplica solo al escenario que produce su
> métrica. Si el resumen muestra `[SIN DATOS]`, ese umbral **no se evaluó** y no
> debe contarse como verificado.

Para ejecutarlo contra el plan gratuito de Render (que duerme la instancia tras
15 minutos de inactividad), usa el perfil `local`: el primer arranque puede
tardar hasta 50 segundos.

## Cómo interpretar los resultados

### Las respuestas 429 NO son un fallo

El backend tiene un limitador de tasa (`rateLimit.middleware.js`):

- 300 peticiones por cada 15 minutos por IP en toda la API.
- **20 peticiones por minuto** en la creación de tickets.

Bajo carga alta, parte de las peticiones recibirá `429 Demasiadas peticiones`.
**Eso es la defensa funcionando**, no un error: el servidor prefiere rechazar
peticiones de forma ordenada antes que agotar el pool de conexiones y caerse.

Por eso el script las cuenta en una métrica aparte (`respuestas_429_total`) y no
las considera fallos. Si desea medir la capacidad máxima sin el limitador, ponga
las tres variables a `0` (ver la sección de ejecución más arriba) y documente el
cambio.

### Lo que sí es un fallo

- **`errores_5xx_total` > 0**: hay una excepción no controlada. Revise los logs
  con `docker compose logs backend | grep "Error no controlado"`.
- **`http_req_failed` alto sin 429**: revise si hay timeouts de conexión.
- **Latencia creciente durante la meseta**: señal de fuga de conexiones o de
  consultas sin índice.

### Comandos útiles durante la prueba

```bash
# Ver el consumo de recursos de los contenedores en vivo
docker stats

# Seguir los logs del backend mientras corre la prueba
docker compose logs -f backend

# Contar los errores no controlados que ocurrieron
docker compose logs backend | grep -c "Error no controlado"

# Ver las consultas lentas detectadas por el logger (> 500 ms)
docker compose logs backend | grep "Consulta lenta"
```

## Resultados esperados en un entorno local

Los valores dependen muchísimo del escenario, así que en lugar de «esperados»
aquí van los **medidos** en una máquina de desarrollo, con `DB_POOL_MAX=50` y
los limitadores desactivados:

| Métrica | `tasa` (100 % escritura) | `mixto` (uso realista) |
|---|---|---|
| `http_req_duration` mediana | 7,79 ms | 4,76 ms |
| `http_req_duration` p(95) | 1.478,95 ms | **8,48 ms** |
| `creacion_ticket_duracion` p(95) | 1.263,00 ms | 12,90 ms |
| `listado_tickets_duracion` p(95) | — (no aplica) | **9,00 ms** |
| `errores_5xx_total` | 0 | 0 |
| `http_req_failed` | 0 | 0 |

Con la configuración por defecto (`DB_POOL_MAX=10`) el p95 de `tasa` sube a
~5.200 ms: **el pool de conexiones es el cuello de botella**. El informe
completo, con el diagnóstico y las recomendaciones de escalado, está en
[`docs/RENDIMIENTO.md`](../docs/RENDIMIENTO.md).

Las primeras peticiones de cada VU son más lentas porque incluyen el hash bcrypt
del inicio de sesión (12 rondas, deliberadamente costoso por seguridad).

## Nota sobre el diseño del script

El script **inicia sesión una sola vez por VU** y reutiliza el token durante
toda la prueba. Es intencional: si se autenticara en cada iteración, la medición
reflejaría el costo del hash bcrypt (≈100 ms por login) en lugar del rendimiento
del endpoint de creación de tickets, que es lo que la consigna pide evaluar.
