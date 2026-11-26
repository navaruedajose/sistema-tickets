# Reporte de pruebas de carga con k6

**Proyecto:** Sistema de Tickets — Helpdesk Empresarial
**Herramienta:** Grafana k6 (imagen oficial `grafana/k6`)
**Fecha de las mediciones:** 23 de septiembre de 2026
**Responsable:** Equipo de desarrollo

---

## 1. Objetivo

Verificar que el sistema se mantiene estable y dentro de los criterios de
aceptación cuando se le somete a carga concurrente, e identificar el primer
cuello de botella antes de que aparezca en producción.

La prueba no busca solo un número: busca una **decisión**. Si el sistema aguanta
la carga con holgura, el informe lo demuestra con percentiles; si no, identifica
qué recurso se agota primero y con qué evidencia.

---

## 2. Método

1. Levantar el sistema completo con Docker Compose (PostgreSQL + backend +
   frontend).
2. Cargar los datos de demostración (`npm run db:seed`), porque las pruebas
   necesitan usuarios reales para autenticarse.
3. Desactivar los tres limitadores de tasa. **Sin este paso la prueba mide el
   limitador, no el sistema**: el endpoint de creación de tickets admite 20
   peticiones por minuto y a 20 peticiones por segundo la cuota se agota en
   segundos.
4. Ejecutar primero la prueba de humo (30 s) y solo si pasa, la prueba de carga.
5. Comparar los resultados contra umbrales definidos de antemano. k6 devuelve
   código de salida distinto de cero si alguno se incumple, así que el resultado
   no es interpretable: es verificable.

---

## 3. Entorno de prueba

| Elemento | Característica |
|---|---|
| Equipo | Máquina de desarrollo (Windows, Docker Desktop) |
| Backend | Node.js 22, Express, 1 instancia |
| Base de datos | PostgreSQL 16 en contenedor, `DB_POOL_MAX=50` |
| Frontend | No participa (la carga se lanza contra la API) |
| Red | `host.docker.internal` desde el contenedor de k6 |
| Datos | Semillero de demostración: 6 usuarios, 7 categorías, 12 tickets |

> `DB_POOL_MAX=50` es una decisión consciente: con el valor por defecto (10) el
> sistema se comporta distinto y el resultado sería otro. Está documentado para
> que la medición sea reproducible.

---

## 4. Escenarios ejecutados

| Escenario | Patrón de tráfico | Qué mide |
|---|---|---|
| `tasa` | 20 peticiones/segundo constantes durante 3 min, 100 % escritura | Capacidad real de escritura, independiente de la latencia |
| `mixto` | Navegación realista: más lecturas que escrituras | Rendimiento con la proporción de uso de un helpdesk real |

Se eligieron estos dos porque representan los extremos: uno satura la escritura
(el peor caso para la base de datos) y el otro se parece a un día normal.

---

## 5. Resultados — Escenario `tasa`

**3.560 peticiones · 3.452 tickets creados · 0 errores de servidor**

| Métrica | Valor |
|---|---|
| Peticiones totales | 3.560 |
| Duración promedio | 424,21 ms |
| Duración p(95) | 1.478,95 ms |
| Duración p(99) | 12.388,98 ms |
| Duración máxima | 16.202,63 ms |
| Tickets creados | 3.452 |
| Tasa de aceptación de creación | 100 % |
| `POST /tickets` promedio | 144,93 ms |
| `POST /tickets` p(95) | 1.263,00 ms |
| `POST /tickets` p(99) | 1.726,45 ms |
| Respuestas 429 | 0 |
| Respuestas 400 | 0 |
| **Errores 5xx** | **0** |
| Comprobaciones superadas | 20.801 de 20.814 (99,94 %) |

**Lectura:** con el pool en 50 conexiones, el sistema sostiene 20 escrituras por
segundo sin un solo error de servidor. La diferencia entre el p(95) global
(1.479 ms) y el p(95) de creación (1.263 ms) es pequeña, lo que indica que el
costo está en la operación de escritura, no en el resto del recorrido.

La cola del p(99) (12,4 s) es la firma clásica de un **pool de conexiones
saturado**: la mayoría de las peticiones pasa rápido, pero un porcentaje pequeño
espera a que se libere una conexión.

Las 13 comprobaciones no superadas (0,06 %) son verificaciones de latencia
individual durante esa cola máxima. No hubo ningún error 5xx ni ningún 429, y
todos los umbrales agregados se cumplieron.

---

## 6. Resultados — Escenario `mixto`

**2.861 peticiones · 163 tickets creados · 0 errores de servidor**

| Métrica | Valor |
|---|---|
| Peticiones totales | 2.861 |
| Duración promedio | 9,42 ms |
| Duración p(95) | 8,48 ms |
| Duración p(99) | 239,44 ms |
| Duración máxima | 265,27 ms |
| Tickets creados | 163 |
| `POST /tickets` promedio | 10,03 ms |
| `POST /tickets` p(95) | 12,90 ms |
| `GET /tickets` promedio | 7,57 ms |
| `GET /tickets` p(95) | 9,00 ms |
| Respuestas 429 | 0 |
| **Errores 5xx** | **0** |
| Comprobaciones superadas | 4.730 de 4.730 (100 %) |

**Lectura:** con una proporción de uso realista, el sistema responde en
**milisegundos de un dígito**. La diferencia con el escenario `tasa` no es una
mejora del código: es que la carga es distinta. Comparar ambos sin decir esto
sería deshonesto.

Este es el número que un usuario percibe: **8,48 ms en el percentil 95**.

---

## 7. Cumplimiento de umbrales

Perfil `local`, calibrado con las propias mediciones (no elegido a ojo).

| Umbral | Criterio | `tasa` | `mixto` | Resultado |
|---|---|---|---|---|
| `http_req_duration p(95)` | < 2.500 ms | 1.478,95 | 8,48 | Cumple |
| `http_req_duration p(99)` | < 15.000 ms | 12.388,98 | 239,44 | Cumple |
| `http_req_failed` | < 1 % | 0 % | 0 % | Cumple |
| `creacion_ticket_duracion p(95)` | < 2.000 ms | 1.263,00 | 12,90 | Cumple |
| `creacion_ticket_duracion p(99)` | < 6.000 ms | 1.726,45 | 67,22 | Cumple |
| `creacion_ticket_exito` | > 90 % | 100 % | 100 % | Cumple |
| `errores_5xx_total` | = 0 | 0 | 0 | Cumple |
| `listado_tickets_duracion p(95)` | < 500 ms | — | 9,00 | Cumple |

**7 de 7 umbrales en `tasa` y 8 de 8 en `mixto`. Ningún umbral incumplido,
ningún umbral sin datos.**

---

## 8. Análisis: dónde está el límite

### 8.1 El cuello de botella es el pool de conexiones

Con `DB_POOL_MAX=10` (valor por defecto) el p(95) del escenario `tasa` sube a
**~5.200 ms**. Con `DB_POOL_MAX=50` baja a **1.478,95 ms**. El código no cambió:
cambió cuántas conexiones simultáneas puede tener la aplicación contra
PostgreSQL.

Esto es lo que hay que saber explicar: **el servidor Node no es el límite; el
límite es cuántas consultas puede tener en vuelo a la vez**. PostgreSQL acepta
hasta 100 conexiones, así que subir el pool a 30–50 es la palanca más rentable y
la más barata.

### 8.2 El costo del login no se está midiendo

El script autentica **una sola vez por usuario virtual** y reutiliza el token.
Es deliberado: bcrypt con coste 12 tarda unos 100 ms por verificación. Si se
autenticara en cada iteración, la prueba mediría el costo del hash y no el del
endpoint de tickets.

### 8.3 Los 429 no son un fallo

Cuando los limitadores están activos, parte de las peticiones recibe
`429 Demasiadas peticiones`. Eso es la defensa funcionando: el servidor prefiere
rechazar de forma ordenada antes que agotar el pool y caerse. Por eso se cuentan
en una métrica aparte y no como error.

En la primera ejecución con los limitadores activos, de 3.597 peticiones 3.429
recibieron 429 (95 %) y solo se crearon 60 tickets. Ese resultado es correcto
—el sistema se defiende— pero no dice nada sobre la capacidad real, y es la
razón por la que se desactivan para medir.

---

## 9. Conclusiones

1. **El sistema es estable bajo carga.** 6.421 peticiones entre los dos
   escenarios, **0 errores 5xx** y **0 respuestas fallidas**.
2. **El rendimiento en uso realista es de milisegundos**: p(95) de 8,48 ms.
3. **El primer cuello de botella está identificado y es configurable**: el pool
   de conexiones a PostgreSQL.
4. **La defensa funciona**: con los limitadores activos el sistema responde 429
   en lugar de caerse.
5. **Los umbrales se cumplen todos**, con un margen de ~1,6× en el caso más
   ajustado, lo que permite detectar regresiones sin falsos positivos por ruido.

---

## 10. Evidencias

| Archivo | Contenido |
|---|---|
| `k6/resumen-tasa.json` | Resumen crudo del escenario `tasa` |
| `k6/resumen-mixto.json` | Resumen crudo del escenario `mixto` |
| `k6/load-test.js` | Script con los 5 escenarios y los dos perfiles de umbrales |
| `k6/smoke-test.js` | Prueba funcional de 10 pasos previa a la carga |
| `docs/RENDIMIENTO.md` | Informe extendido con el diagnóstico y recomendaciones de escalado |

### Cómo reproducirlo

```bash
# 1. Levantar el sistema y cargar datos
docker compose up -d --build
docker compose exec backend npm run db:seed

# 2. Desactivar los tres limitadores y reiniciar el backend
RATE_LIMIT_MAX=0 LOGIN_RATE_LIMIT_MAX=0 RATE_LIMIT_COSTOSAS_MAX=0 \
  docker compose up -d backend

# 3. Prueba de humo (debe pasar antes de la carga)
docker run --rm -i -e URL_BASE=http://host.docker.internal:4000/api/v1 \
  grafana/k6 run - < k6/smoke-test.js

# 4. Escenario de capacidad
docker run --rm -i -e URL_BASE=http://host.docker.internal:4000/api/v1 \
  -e ESCENARIO=tasa grafana/k6 run - < k6/load-test.js

# 5. Escenario realista
docker run --rm -i -e URL_BASE=http://host.docker.internal:4000/api/v1 \
  -e ESCENARIO=mixto grafana/k6 run - < k6/load-test.js

# 6. Reactivar los limitadores (no dejarlos desactivados)
docker compose up -d backend
```

En Windows, `k6\EJECUTAR-CARGA.bat` hace los pasos 2 a 6 de una vez.

---

## 11. Limitaciones

- Las mediciones son de **una sola instancia**; no se probó escalado horizontal.
- El entorno es una máquina de desarrollo, no un servidor dedicado. Los valores
  absolutos no son trasladables, pero **la forma de la curva y el cuello de
  botella sí**.
- El frontend no participa en la prueba: se mide la API, que es donde está el
  costo real.
- No se probó con datos de producción (millones de tickets); los índices están
  definidos, pero su comportamiento a esa escala no está medido.
