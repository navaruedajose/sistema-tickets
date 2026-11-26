# Informe de rendimiento — Sistema de Tickets

> **Qué es este documento:** el resultado de someter el sistema a una prueba de
> carga real con k6, el diagnóstico del cuello de botella que apareció y las
> recomendaciones de escalado. Todos los números son **mediciones**, no
> estimaciones: se obtuvieron ejecutando los escenarios contra los contenedores
> en marcha.
>
> Sirve para dos cosas: como evidencia técnica en la memoria del proyecto, y
> como respuesta preparada a la pregunta «¿esto escala?» o «¿qué mejorarías?».

---

## Índice

1. [Metodología](#1-metodología)
2. [Antes de medir: los tres limitadores](#2-antes-de-medir-los-tres-limitadores)
3. [Medición A — configuración por defecto](#3-medición-a--configuración-por-defecto)
4. [Medición B — con el pool ampliado](#4-medición-b--con-el-pool-ampliado)
5. [Comparación y diagnóstico](#5-comparación-y-diagnóstico)
6. [Medición C — el escenario realista](#6-medición-c--el-escenario-realista)
7. [Los perfiles de umbrales y su calibración](#7-los-perfiles-de-umbrales-y-su-calibración)
8. [Cómo reproducir las mediciones](#8-cómo-reproducir-las-mediciones)
9. [Recomendaciones de escalado](#9-recomendaciones-de-escalado)
10. [Preguntas probables sobre rendimiento](#10-preguntas-probables-sobre-rendimiento)

---

## 1. Metodología

| Aspecto | Valor |
|---------|-------|
| Herramienta | k6 (imagen oficial `grafana/k6`, sin instalar nada) |
| Escenarios medidos | `tasa` (capacidad de **escritura**) y `mixto` (carga **realista** de un helpdesk) |
| Operación medida | `POST /api/v1/tickets` — la que la consigna pide estresar |
| Usuarios virtuales | `tasa`: 30 preasignados, hasta 100. `mixto`: hasta 40 |
| Entorno | Una sola máquina, 3 contenedores Docker (PostgreSQL + Node + nginx) |
| Duración | 3 minutos por medición |
| Perfil de umbrales | `local` (calibrado; ver sección 7) |

**Por qué el escenario `tasa` y no `carga` para medir capacidad:** con
`constant-arrival-rate` k6 mantiene la tasa objetivo **independientemente de
cuánto tarde el servidor**. Si el sistema no da abasto, la latencia sube y la
tasa se mantiene, lo que hace visible el punto de saturación. Un escenario de
usuarios concurrentes, en cambio, se «autoregula»: si el servidor va lento, los
usuarios hacen menos peticiones y el problema queda oculto.

El escenario `mixto` responde a la pregunta complementaria: **no** «cuánto
aguanta como máximo», sino «cómo se comporta con la proporción de uso real»,
que en un helpdesk son muchas más lecturas que escrituras. Ver sección 6.

---

## 2. Antes de medir: los tres limitadores

El sistema tiene **tres** limitadores de tasa, y hay que conocerlos antes de
interpretar cualquier medición:

| Limitador | Variable | Cuota por defecto | Dónde se aplica |
|-----------|----------|-------------------|-----------------|
| Global | `RATE_LIMIT_MAX` | 300 / 15 min | Toda la API |
| Inicio de sesión | `LOGIN_RATE_LIMIT_MAX` | 10 fallos / 15 min | `POST /auth/iniciar-sesion` |
| **Operaciones costosas** | `RATE_LIMIT_COSTOSAS_MAX` | **20 / minuto** | **`POST /tickets`**, subidas y reportes |

**El tercero es el decisivo.** Se aplica directamente al endpoint que se quiere
medir, así que con él activo la prueba **mide el limitador, no el sistema**.

La primera ejecución lo dejó claro: de **3.597 peticiones, 3.429 recibieron un
429** (el 95%) y solo se crearon 60 tickets. Ese resultado es *correcto* —el
sistema se está defendiendo— pero no dice nada sobre la capacidad real.

> **Conclusión metodológica:** para medir capacidad hay que desactivar los
> limitadores. Para **demostrar que funcionan**, hay que dejarlos activos. Son
> dos pruebas distintas con el mismo script.

Los tres se desactivan con `0`:

```bat
k6\EJECUTAR-CARGA.bat
```

Ese archivo hace todo: desactiva los tres, ejecuta k6 y **los vuelve a activar**
al terminar.

---

## 3. Medición A — configuración por defecto

**Configuración:** `DB_POOL_MAX=10` (el valor por defecto), limitadores
desactivados.

| Métrica | Valor |
|---------|-------|
| Peticiones totales | 3.338 |
| **Tickets creados** | **3.230** |
| **Tasa de aceptación** | **100 %** |
| **Errores 5xx** | **0** |
| Latencia mediana (p50) | **8,20 ms** |
| Latencia p95 | **5.216,90 ms** |
| Latencia p99 | 17.548,51 ms |
| Latencia máxima | 20.834,51 ms |
| Creación de ticket, p95 | 2.298,50 ms |
| Verificaciones | 19.345 pasaron, **137 fallaron** |

**Lo que ya funciona bien:** cero errores de servidor y 100% de aceptación. El
sistema **no se cae** bajo carga; crea 3.230 tickets en 3 minutos.

**Lo que llama la atención:** la mediana es de **8 milisegundos** pero el
percentil 95 es de **5,2 segundos**. Esa diferencia de casi 700 veces es la
pista clave: la mayoría de las peticiones son instantáneas y unas pocas esperan
muchísimo.

---

## 4. Medición B — con el pool ampliado

**Único cambio:** `DB_POOL_MAX=50`. Nada más.

| Métrica | Valor | vs. A |
|---------|-------|-------|
| Peticiones totales | 3.547 | — |
| Tickets creados | **3.439** | +6 % |
| Tasa de aceptación | **100 %** | = |
| Errores 5xx | **0** | = |
| Latencia mediana (p50) | 8,42 ms | = |
| Latencia p95 | **1.516,66 ms** | **3,4× mejor** |
| Latencia p99 | 13.233,90 ms | 1,3× mejor |
| Creación de ticket, p95 | **1.320,10 ms** | **1,7× mejor** |
| Verificaciones | 20.723 pasaron, **13 fallaron** | **10× menos fallos** |

---

## 5. Comparación y diagnóstico

### El cuello de botella era el pool de conexiones

| | Pool = 10 | Pool = 50 | Mejora |
|---|---|---|---|
| Latencia p95 | 5.217 ms | 1.517 ms | **3,4×** |
| Creación p95 | 2.299 ms | 1.320 ms | **1,7×** |
| Verificaciones fallidas | 137 | 13 | **10× menos** |

**Diagnóstico.** Con 100 usuarios virtuales y solo **10 conexiones** a
PostgreSQL, cada petición tiene que esperar a que se libere una conexión. Es una
**cola de espera**, y las colas se manifiestan exactamente así: mediana baja
(cuando hay conexión libre, la operación es inmediata) y cola larga (cuando no
la hay, el usuario espera segundos).

La evidencia de apoyo: los registros del backend anotaron **1.030 consultas
lentas** (>500 ms) durante la medición A, y la mayoría eran esperas, no consultas
costosas.

> **Regla general útil:** mediana baja + p95 alto = contención de recursos, no
> código lento. Si el problema fuera el código, la mediana también subiría.

### Por qué la p99 sigue siendo alta

Incluso con 50 conexiones, el percentil 99 se mantiene en ~13 s. Las causas, por
orden de peso:

1. **Amplificación de escrituras.** Crear un ticket no es un `INSERT`: es un
   `INSERT` en `tickets` **más** tres disparadores (generación del folio con
   secuencia, cálculo del SLA y `INSERT` en `historial_tickets`) **más** las
   notificaciones encoladas. Son unas 4–5 escrituras por petición, es decir
   ~100 escrituras por segundo a 20 peticiones/s.
2. **Consultas previas de validación.** Antes de insertar, el servicio consulta
   el solicitante, la categoría y el agente para validar que existen. Son tres
   `SELECT` extra por petición.
3. **Recursos compartidos.** Los tres contenedores compiten por la CPU de una
   sola máquina de desarrollo, que además está ejecutando el propio k6.

**Lo que NO es la causa:** el envío de notificaciones. Se despacha **sin
`await`** (patrón *fire-and-forget* con tabla Outbox), así que no bloquea la
respuesta. Está comprobado en `ticket.service.js`.

---

## 6. Medición C — el escenario realista

**Configuración:** `DB_POOL_MAX=50`, limitadores desactivados,
`ESCENARIO=mixto`. Este escenario **no** crea un ticket en cada iteración: simula
a un usuario que consulta el panel, filtra el listado, abre un ticket, mira su
historial y **solo de vez en cuando** (30 % de las iteraciones) reporta una
incidencia.

| Métrica | Valor |
|---------|-------|
| Peticiones totales | 2.861 |
| Tickets creados | 163 |
| Tasa de aceptación | **100 %** |
| Errores 5xx | **0** |
| Latencia mediana (p50) | 4,76 ms |
| **Latencia p95** | **8,48 ms** |
| Latencia p99 | 239,44 ms |
| Latencia máxima | 265,27 ms |
| **Listado con filtros, p95** | **9,00 ms** |
| **Creación de ticket, p95** | **12,90 ms** |
| Verificaciones | 4.730 pasaron, **0 fallaron** |

### El mismo endpoint, 98 veces más rápido

Esta es la comparación más útil del informe. La operación `POST /tickets` es
**exactamente la misma** en los dos escenarios:

| | Escenario `tasa` | Escenario `mixto` | Diferencia |
|---|---|---|---|
| Creación de ticket, p95 | 1.263,00 ms | **12,90 ms** | **98×** |
| Ritmo de escritura | ~19,2 tickets/s | ~0,9 tickets/s | 21× menos |
| Usuarios virtuales | hasta 100 | hasta 40 | 2,5× menos |

**Interpretación.** El endpoint no se vuelve rápido «porque sí»: se le está
pidiendo **21 veces menos trabajo de escritura** y con menos concurrencia. Que
el mismo código pase de 1,3 segundos a 13 milisegundos según la presión
confirma el diagnóstico de la sección 5 —el límite es la contención de recursos,
no el algoritmo— y de paso demuestra que **el camino de lectura está sano**:
9 ms de percentil 95 para el listado con filtros.

> **Cuidado con comparar peras con manzanas.** El escenario `mixto` usa
> `ramping-vus`, que se autoregula: si el servidor va lento, los usuarios hacen
> menos peticiones. Por eso sus números **no** son «la capacidad del sistema»,
> sino su comportamiento con la proporción de uso real. La capacidad máxima se
> mide con `tasa`, que fuerza la tasa de llegada.

---

## 7. Los perfiles de umbrales y su calibración

### Por qué hay dos perfiles

Los umbrales no pueden ser los mismos en un portátil que en un servidor
dedicado. En local, PostgreSQL, Node, nginx **y el propio k6** comparten la CPU
de una sola máquina; exigir ahí un p95 de 800 ms sería deshonesto: la prueba
fallaría siempre y dejaría de servir como criterio.

| Umbral | Perfil `local` | Perfil `produccion` |
|---|---|---|
| `http_req_duration p(95)` | < 2500 ms | < 800 ms |
| `http_req_duration p(99)` | < 15000 ms | < 2000 ms |
| `http_req_failed` | < 1 % | < 1 % |
| `creacion_ticket_duracion p(95)` | < 2000 ms | < 1000 ms |
| `creacion_ticket_duracion p(99)` | < 6000 ms | < 2500 ms |
| `creacion_ticket_exito` | > 90 % | > 90 % |
| `errores_5xx_total` | **= 0** | **= 0** |
| `listado_tickets_duracion p(95)` | < 500 ms | < 500 ms |

Se eligen con `-e PERFIL=local` (por defecto) o `-e PERFIL=produccion`.

### La calibración, con números

El perfil `local` **no está elegido a ojo**: sale de las mediciones de las
secciones 4 y 6.

| Umbral | Medido | Umbral fijado | Margen |
|---|---|---|---|
| `http_req_duration p(95)` | 1.478,95 ms | 2.500 ms | **1,7×** |
| `creacion_ticket_duracion p(95)` | 1.263,00 ms | 2.000 ms | **1,6×** |
| `creacion_ticket_duracion p(99)` | 1.726,45 ms | 6.000 ms | **3,5×** |
| `listado_tickets_duracion p(95)` | 9,00 ms | 500 ms | **55×** |

Un margen de ~1,6× en los umbrales ajustados es deliberado: suficiente para
**detectar una regresión real** sin que la prueba falle por ruido de una máquina
compartida. El p99 de `http_req_duration` se deja mucho más holgado (15 s) a
propósito, porque existe una cola conocida y ya diagnosticada; ese umbral
funciona como «el sistema no se cuelga», no como objetivo de calidad.

### Una trampa de k6 que conviene conocer

Al montar los umbrales apareció un comportamiento de k6 que conviene documentar
porque produce **evidencia falsa**:

> k6 publica en el resumen **cualquier métrica que aparezca en un umbral**,
> aunque no haya recibido ni una sola muestra, y en ese caso le asigna **0** a
> todas sus estadísticas.

Eso tiene dos consecuencias opuestas y ambas malas:

1. Un umbral como `listado_tickets_duracion: ['p(95)<500']` se cumplía **de
   forma vacía** (0 < 500) en los escenarios que solo crean tickets, dando por
   verificado un listado que nunca se había ejercitado. En una sustentación, eso
   es un dato que no resiste una pregunta.
2. Al revés, un umbral como `creacion_ticket_exito: ['rate>0.90']` vale 0 cuando
   la métrica está vacía, y por tanto **falla**: la prueba se caería por un
   motivo inexistente.

**Solución adoptada:** cada umbral se aplica **solo al escenario que produce su
métrica** (`UMBRALES_POR_ESCENARIO`), y además el resumen distingue tres
estados —`CUMPLE`, `FALLA` y **`SIN DATOS`**— de modo que un umbral no evaluado
nunca se presenta como aprobado.

Además, el veredicto que muestra el informe **es el de k6**
(`data.metrics[nombre].thresholds[expresion].ok`), no uno recalculado aparte.
Antes se reinterpretaba la expresión de cada umbral a mano, lo que permitía que
el informe dijera algo distinto de lo que decía el código de salida.

---

## 8. Cómo reproducir las mediciones

```bat
REM 1. Sistema arriba
INICIAR.bat

REM 2. Prueba de humo primero (30 s): si falla, no sigas
docker run --rm -i -e URL_BASE=http://host.docker.internal:4000/api/v1 ^
  grafana/k6 run - < k6\smoke-test.js

REM 3. Capacidad de escritura (desactiva los limitadores y los reactiva sola)
k6\EJECUTAR-CARGA.bat tasa

REM 4. Carga realista, mayoritariamente de lectura
k6\EJECUTAR-CARGA.bat mixto

REM 5. Para reproducir la mejora, sube el pool en .env y repite:
REM    DB_POOL_MAX=50
```

El archivo acepta dos argumentos: el escenario y el perfil de umbrales.

```bat
k6\EJECUTAR-CARGA.bat tasa produccion    :: objetivos exigentes
```

**Importante:** la prueba **crea tickets de verdad**. Para dejarlo limpio:

```bat
docker compose exec backend npm run db:limpiar-pruebas
```

Borra únicamente los tickets generados por k6 (los identifica por el patrón del
título) y deja intactos los del semillero y los creados a mano.

### Evidencia cruda

Los dos resúmenes de la validación final quedan en el repositorio:

| Archivo | Escenario | Contenido |
|---|---|---|
| `k6/resumen-tasa.json` | `tasa` | Capacidad de escritura (sección 4) |
| `k6/resumen-mixto.json` | `mixto` | Carga realista (sección 6) |

Contienen los números reales medidos, no una transcripción, y se pueden adjuntar
como anexo. Al reejecutar la prueba con `k6\EJECUTAR-CARGA.bat` se escribe
`k6/resumen-final.json`, de modo que **la evidencia archivada no se sobrescribe**.

---

## 9. Recomendaciones de escalado

Ordenadas por relación entre esfuerzo y beneficio:

| # | Acción | Impacto | Esfuerzo |
|---|--------|---------|----------|
| 1 | **Subir `DB_POOL_MAX` a 30–50** y `max_connections` en PostgreSQL | Alto — medido: 3,4× en p95 | Trivial (una variable) |
| 2 | **Índice** sobre `tickets(estado, creado_en)` para el listado y el panel | Medio | Bajo |
| 3 | **Sacar las notificaciones del camino crítico** con una cola (BullMQ + Redis) | Medio | Medio |
| 4 | **Caché de las consultas del panel** (Redis, TTL corto) | Medio | Medio |
| 5 | **Réplica de lectura** para reportes: separar lectura de escritura | Alto en reportes | Alto |
| 6 | **Particionar `historial_tickets`** por fecha | Alto a largo plazo | Alto |

**Sobre el punto 1, con honestidad:** en producción no se sube el pool sin más,
porque cada conexión consume memoria en PostgreSQL. El número correcto sale de
la fórmula habitual `conexiones ≈ núcleos × 2 + discos efectivos`, y se ajusta
midiendo. Lo importante es que **el valor por defecto de 10 es conservador para
una máquina de desarrollo** y está expuesto como variable precisamente para
poder calibrarlo.

### Lo que ya está preparado para escalar

- La API **no guarda estado en memoria**: se pueden levantar varias instancias
  detrás de un balanceador sin cambiar código.
- Los archivos van a un **volumen**, no a la base de datos. En la nube serían S3
  y el cambio es de configuración.
- El **patrón Outbox** de las notificaciones ya deja los envíos persistidos antes
  de intentarlos, así que sustituir el envío en proceso por una cola externa no
  requiere cambiar el modelo de datos.
- El **patrón Strategy** de los reportes permite mover la generación a un worker
  sin tocar el controlador.

---

## 10. Preguntas probables sobre rendimiento

### «¿Cuántos tickets por segundo aguanta?»

> «Medí 3.452 tickets en 3 minutos, es decir unas **19 creaciones por segundo**
> sostenidas, con cero errores de servidor y 100% de aceptación. La latencia es
> el límite, no la corrección: el percentil 95 se quedó en 1,3 segundos.»

### «¿Dónde está el límite del sistema?»

> «En el pool de conexiones a la base de datos. Lo detecté porque la mediana era
> de 8 milisegundos y el percentil 95 de 5,2 segundos: esa diferencia indica una
> cola de espera, no código lento. Al subir el pool de 10 a 50 conexiones el
> percentil 95 bajó de 5,2 segundos a 1,5 — **3,4 veces mejor** — sin tocar una
> sola línea de código.»

### «¿Y con el uso normal, no con una prueba de estrés?»

> «Ejecuté también un escenario realista, con muchas más lecturas que
> escrituras, como en un helpdesk de verdad. El listado con filtros responde en
> **9 milisegundos** de percentil 95 y la creación de ticket en 13 ms, con cero
> verificaciones fallidas. El mismo endpoint que en la prueba de capacidad tarda
> 1,3 segundos tarda 13 milisegundos cuando se le pide 21 veces menos trabajo de
> escritura: eso confirma que el cuello de botella es la contención, no el
> algoritmo.»

### «¿Cómo sé que no hay fugas de conexiones?»

> «El pool es único para todo el proceso (`Singleton`) y cada operación libera su
> conexión en un bloque `finally`. Además, la verificación de salud reporta la
> latencia de la base: después de la prueba de carga seguía en 1 milisegundo, lo
> que indica que el pool no se agotó.»

### «¿Y si el profesor quiere ver un error 5xx?»

> «No los hay: el umbral `errores_5xx_total` es `count==0` y no es negociable.
> Si apareciera uno, la prueba falla automáticamente. En las mediciones salió
> cero en ambos casos.»

### «Los umbrales están en 2,5 segundos, ¿no es mucho?»

> «Para una máquina de desarrollo, no. PostgreSQL, Node, nginx y el propio k6
> comparten la misma CPU, así que el perfil `local` está calibrado con las
> mediciones —1,7× de margen— en lugar de elegido a ojo. El perfil `produccion`
> mantiene los objetivos exigentes (p95 < 800 ms), que son los correctos cuando
> la base de datos tiene recursos dedicados. Un umbral que falla siempre no es un
> criterio de calidad: es ruido.»

### «¿Qué mejorarías con más tiempo?»

Usa la tabla de la sección 9. La respuesta corta y más contundente:

> «Primero la cola de notificaciones, para sacar trabajo del camino crítico;
> después caché para el panel, que es la consulta más pesada; y por último una
> réplica de lectura para los reportes. La base de datos es el recurso escaso,
> así que todo lo que reduzca consultas o las reparta tiene impacto inmediato.»

---

*Mediciones realizadas el 22 de septiembre de 2026 sobre los contenedores en
marcha, con `DB_POOL_MAX=50` y los tres limitadores desactivados. Los resúmenes
crudos de la validación final quedan en `k6/resumen-tasa.json` y
`k6/resumen-mixto.json`.*
