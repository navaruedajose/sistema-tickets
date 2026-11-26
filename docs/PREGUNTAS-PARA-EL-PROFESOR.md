# Preguntas para el profesor — guion de levantamiento de requisitos

> Banco de preguntas para **cerrar el alcance** del proyecto con el profesor antes
> de la sustentación. Cada pregunta trae dos ayudas: **por qué conviene hacerla**
> y **qué tienes ya** (para responder si el profesor te la devuelve).
>
> Sistema de Tickets — Helpdesk Empresarial

---

## Índice

1. [Cómo usar estas preguntas](#1-cómo-usar-estas-preguntas)
2. [Alcance y funcionalidades](#2-alcance-y-funcionalidades)
3. [Arquitectura y calidad del código](#3-arquitectura-y-calidad-del-código)
4. [Base de datos](#4-base-de-datos)
5. [Seguridad, roles y privacidad](#5-seguridad-roles-y-privacidad)
6. [Pruebas y aseguramiento de calidad](#6-pruebas-y-aseguramiento-de-calidad)
7. [Rendimiento y escalabilidad](#7-rendimiento-y-escalabilidad)
8. [Despliegue, infraestructura y costos](#8-despliegue-infraestructura-y-costos)
9. [Documentación y entregables](#9-documentación-y-entregables)
10. [Sustentación y evaluación](#10-sustentación-y-evaluación)
11. [Preguntas que conviene NO hacer](#11-preguntas-que-conviene-no-hacer)
12. [Plantilla de correo para enviarlas](#12-plantilla-de-correo-para-enviarlas)

---

## 1. Cómo usar estas preguntas

**Cuándo.** Antes de dar el proyecto por cerrado. Preguntar el día de la
entrega es tarde: ya no puedes cambiar nada y pareces desorientado.

**Cómo.** En **bloque y por escrito** (correo o mensaje), nunca de una en una.
Un correo con 8 preguntas numeradas se responde; ocho mensajes sueltos se
ignoran. Usa la [plantilla del final](#12-plantilla-de-correo-para-enviarlas).

**Regla de oro.** Toda respuesta ambigua **pídela por escrito**. «Haga lo que
pueda» no es un requisito, y en la sustentación no podrás citarlo.

**No preguntes lo que puedes decidir tú.** Preguntar «¿qué color uso?» te hace
perder autoridad técnica. Pregunta lo que **cambia el alcance o la nota**.

**Truco de priorización.** Ordena tus preguntas de *más peligrosa* a *menos*:
si solo te responden las tres primeras, que sean las que de verdad te cambian
el trabajo.

---

## 2. Alcance y funcionalidades

| # | Pregunta | Por qué conviene preguntarla | Lo que ya tienes |
|---|---|---|---|
| 1 | ¿El sistema es un *helpdesk* **interno de TI** o debe servir también para **atención a clientes externos**? | Cambia el modelo de datos (clientes, contratos, portal público) y la seguridad. | Modelo interno con 3 roles. **No** hay portal público sin autenticación. |
| 2 | ¿Cuántos **roles** espera como mínimo? ¿Bastan tres? | Es la pregunta que más código condiciona. | 3 roles: `SOLICITANTE`, `AGENTE`, `ADMINISTRADOR`, con política de acceso declarativa. |
| 3 | ¿Debe existir un **flujo de aprobación** (que un ticket crítico requiera visto bueno del jefe de área)? | Añade una máquina de estados paralela y un rol nuevo. | **No** lo tienes. Es un añadido, no un defecto. |
| 4 | ¿El **SLA** solo se registra y se mide, o exige **escalamiento automático** al vencerse? | El escalamiento implica *jobs* programados y notificaciones a terceros. | SLA por categoría (8 a 120 h) y vistas de cumplimiento. **No** hay escalamiento automático. |
| 5 | La notificación al resolver un ticket, ¿por **correo, SMS o ambas**? ¿Sirve un proveedor **simulado**? | Define si necesitas cuentas de pago (SendGrid/Twilio) o basta el modo local. | **Ambas**, con proveedores intercambiables y modo simulado sin credenciales. |
| 6 | ¿El **solicitante puede reabrir** un ticket cerrado? | Define si `CERRADO` es terminal. | Hay transiciones validadas; conviene confirmar si `CERRADO` cierra el ciclo. |
| 7 | ¿Hace falta una **base de conocimiento** (artículos de ayuda, autoservicio)? | Es un módulo completo que no está en el alcance original. | **No** lo tienes. |
| 8 | ¿Es **multi-empresa** (*multi-tenant*) o una sola organización? | Multi-tenant es un cambio de esquema transversal a todas las tablas. | **No** lo tienes. |
| 9 | ¿Se exige **encuesta de satisfacción** (CSAT) al cerrar? | Módulo pequeño pero con reglas propias de «una sola respuesta por ticket». | **No** lo tienes. |
| 10 | ¿Debe haber **acuerdos de nivel de servicio configurables** desde la interfaz, o basta con dejarlos en la base? | Define si hace falta un CRUD de administración. | Los SLA se cargan por semilla. **No** hay pantalla de configuración. |

---

## 3. Arquitectura y calidad del código

| # | Pregunta | Por qué conviene preguntarla | Lo que ya tienes |
|---|---|---|---|
| 11 | ¿Exige un **patrón arquitectónico concreto** (capas, hexagonal, *clean architecture*) o valora que sea **consistente y esté justificado**? | Si exige uno concreto y el tuyo es otro, mejor saberlo ahora. | Capas `repository → service → controller → routes`, con un *Composition Root* único (`container.js`). |
| 12 | En la revisión de código, ¿cómo quiere que le **demuestre la separación de responsabilidades**? | Te prepara para la pregunta más típica de la rúbrica. | Puedes mostrar que un *service* no conoce Express ni SQL. |
| 13 | ¿Es requisito que la **lógica de negocio sea testeable sin base de datos**? | Justifica (o no) el esfuerzo en inyección de dependencias. | 13 pruebas de servicio con dobles inyectados, sin tocar la base. |
| 14 | ¿Acepta un **monorepo** con dos aplicaciones (backend y frontend) o espera repositorios separados? | Puede obligarte a reorganizar la entrega. | Monorepo con `backend/` y `frontend/` independientes. |
| 15 | ¿Hay una **convención de estilo obligatoria** (linter, formateador)? ¿Se evalúa? | Es trabajo no hecho si la exige. | **No** hay ESLint ni Prettier configurados. Pregunta si es requisito. |
| 16 | ¿Prefiere **JavaScript o exige TypeScript**? Si lo segundo, ¿en todo el proyecto? | **Pregunta crítica**: migrar a TypeScript es un rediseño, no un retoque. | JavaScript puro (Node + React). |
| 17 | ¿Cómo quiere que documente las **decisiones de arquitectura**: basta el README o exige registros formales (ADR)? | Define cuánto documento adicional hay que producir. | README con sección de decisiones + documento de estrategia. |
| 18 | ¿Se evalúa el **manejo de errores** como criterio propio? | Es un punto donde tu proyecto es fuerte. | Jerarquía de errores propia, *middleware* central y 23 pruebas al respecto. |

---

## 4. Base de datos

| # | Pregunta | Por qué conviene preguntarla | Lo que ya tienes |
|---|---|---|---|
| 19 | ¿Exige un **motor concreto** (PostgreSQL, MySQL, SQL Server) o es libre? | Cambiar de motor es reescribir el esquema y las consultas. | PostgreSQL. |
| 20 | ¿Requiere **diagrama entidad-relación**? ¿En qué formato (herramienta, imagen, Mermaid)? | Un formato no aceptado es trabajo perdido. | Diagramas Mermaid dentro del README. |
| 21 | ¿Se evalúan **triggers, vistas, índices y restricciones** o basta el modelo relacional? | Es un diferenciador si lo valoran. | Triggers de auditoría, vistas analíticas, índices y restricciones `CHECK`/`UNIQUE`. |
| 22 | ¿**Borrado físico o lógico**? ¿Se espera auditoría de cambios? | Cambia el diseño de todas las consultas. | Borrado lógico + bitácora inmutable por *trigger*. |
| 23 | ¿**Migraciones versionadas** o basta un script de esquema inicial? | Las migraciones son una herramienta más que instalar. | Scripts `01-schema.sql` y `02-seed.sql`. Sin herramienta de migraciones. |
| 24 | ¿Cuántos **registros de prueba** espera como mínimo para que la demo se vea realista? | Un mínimo alto obliga a generar datos sintéticos. | 6 usuarios (1 admin, 2 agentes, 3 solicitantes), 12 tickets con comentarios y 7 categorías con SLA. |
| 25 | ¿Debe el esquema **soportar adjuntos en la nube** (S3) o basta el disco local? | En planes gratuitos el disco es efímero. | Almacenamiento local con volumen de Docker; hay aviso documentado sobre el disco efímero en la nube. |
| 26 | ¿Espera **tipos enumerados** en la base o simples cadenas validadas en la aplicación? | Define cuánta lógica vive en la base. | Enumeraciones en la aplicación + restricciones en la base. |

---

## 5. Seguridad, roles y privacidad

| # | Pregunta | Por qué conviene preguntarla | Lo que ya tienes |
|---|---|---|---|
| 27 | ¿Qué mecanismo de **autenticación** espera: sesión con cookies, JWT, OAuth? | Es una decisión que no se cambia al final. | JWT con renovación automática y reintento único al recibir `401`. |
| 28 | ¿Exige un **algoritmo de hash** concreto para las contraseñas? | Si exige Argon2 y usas bcrypt, hay que migrar. | bcrypt con coste 12. |
| 29 | ¿El control de acceso debe ser **por rol, por propiedad del recurso, o ambos**? | El control por propiedad es el que más se olvida. | Ambos: el solicitante solo ve sus tickets; el agente ve los asignados. |
| 30 | ¿Se valoran las **cabeceras de seguridad** (CSP, HSTS, `X-Frame-Options`)? | Es un punto fácil de defender si lo tienes. | 5 cabeceras vía helmet y nginx, **incluida una Content-Security-Policy**. |
| 31 | ¿Exige **limitación de peticiones**? ¿Y protección específica contra **fuerza bruta** en el login? | Justifica (o no) la complejidad añadida. | 3 limitadores: global, login y operaciones costosas. |
| 32 | En la **subida de archivos**, ¿qué espera: validar tipo y tamaño, o también **análisis antivirus**? | Un antivirus es un servicio externo y otro costo. | Validación de tipo, extensión y tamaño. **No** hay antivirus. |
| 33 | ¿Cómo quiere que le **demuestre** que no hay inyección SQL? | Te prepara para la pregunta trampa clásica. | Consultas parametrizadas en todo el repositorio; hay un escenario límite documentado. |
| 34 | ¿Hay requisitos de **privacidad de datos** (Ley 1581 de Colombia, GDPR) que deba cumplir? | Puede exigir anonimización, consentimiento o política de retención. | **No** implementado. |
| 35 | ¿Debe registrarse **quién consulta** información sensible, además de quién la modifica? | La auditoría de lectura es un requisito poco común pero costoso. | La bitácora registra **cambios**, no lecturas. |
| 36 | ¿Espera **doble factor** (2FA) para administradores? | Módulo completo si lo pide. | **No** lo tienes. |

---

## 6. Pruebas y aseguramiento de calidad

| # | Pregunta | Por qué conviene preguntarla | Lo que ya tienes |
|---|---|---|---|
| 37 | ¿Qué **cobertura mínima** exige? ¿Con qué herramienta la mide? | Es la pregunta con respuesta numérica más útil de todo el cuestionario. | 47 pruebas en verde y un script de cobertura listo, pero **sin reporte generado**. |
| 38 | ¿Qué **proporción** espera entre pruebas unitarias, de integración y de extremo a extremo? | Orienta dónde invertir el tiempo que queda. | 36 unitarias (13 de negocio + 23 de errores) y 11 de integración con supertest. |
| 39 | ¿Acepta **dobles y simulaciones** o exige base de datos real en las pruebas? | Cambia por completo la estrategia de pruebas. | Ambas: dobles en unitarias, base real en integración. |
| 40 | ¿Se evalúa que las pruebas **fallen cuando deben fallar** (casos negativos)? | Es un criterio de madurez que tu proyecto ya cubre. | Transición ilegal rechazada con `409`, acceso sin token con `401`. |
| 41 | ¿Debe haber pruebas automáticas en un **pipeline de integración continua**? | Es trabajo no hecho si lo exige. | **No** hay CI configurado. |
| 42 | La **prueba de carga**, ¿es obligatoria? ¿Bajo qué criterio se considera aprobada? | Sin criterio explícito, cualquier resultado es discutible. | 5 escenarios en k6 con umbrales y 10 pasos de prueba funcional. |

---

## 7. Rendimiento y escalabilidad

| # | Pregunta | Por qué conviene preguntarla | Lo que ya tienes |
|---|---|---|---|
| 43 | ¿Hay un número de **usuarios concurrentes** o de tickets esperados que el sistema deba soportar? | Sin cifra objetivo, «funciona» no significa nada. | Medición con 3.452 tickets creados y 0 errores de servidor. |
| 44 | ¿Qué **latencia** considera aceptable (por ejemplo, percentil 95)? | Define si tus umbrales son laxos o exigentes. | Mediana de 4,8 a 7,8 ms y percentil 95 de 8,5 ms en el escenario realista. |
| 45 | ¿Se evalúa el **escalado horizontal** (varias instancias detrás de un balanceador)? | La sesión y los archivos subidos condicionan el diseño. | **No** implementado; el sistema es una sola instancia. |
| 46 | ¿Espera que **identifique y explique el cuello de botella**? | Es la pregunta que separa «funciona» de «entiendo mi sistema». | Sí: el cuello de botella es el **pool de conexiones** a base de datos. Está medido y documentado. |
| 47 | ¿Debe el sistema **degradarse con elegancia** bajo sobrecarga, o basta con no caerse? | Justifica los limitadores de peticiones. | Los limitadores devuelven `429` y protegen la base de datos. |

---

## 8. Despliegue, infraestructura y costos

| # | Pregunta | Por qué conviene preguntarla | Lo que ya tienes |
|---|---|---|---|
| 48 | **¿Es obligatorio desplegar en la nube o basta con ejecutarse localmente con Docker?** | **La pregunta más importante de todas**: puede duplicarte el trabajo. | Funciona en local con un comando; hay guía para Render, Railway y AWS. |
| 49 | ¿Prefiere un **proveedor concreto**? ¿Acepta planes gratuitos? | Los planes gratuitos tienen límites que afectan la demo. | Guía con los tres proveedores y estimación de costos. |
| 50 | ¿Se evalúan las **buenas prácticas de Dockerfile** (multi-etapa, usuario no root, imagen mínima)? | Es un punto fácil si lo tienes. | Imagen multi-etapa, usuario no root, *init* propio y ~25 MB finales. |
| 51 | ¿Debe tener **dominio propio y HTTPS**? | Un dominio implica compra y configuración de DNS. | **No** configurado. |
| 52 | ¿Debe incluirse un **pipeline de despliegue continuo**? | Trabajo adicional si es requisito. | **No** incluido. |
| 53 | ¿Los **datos en la nube** deben persistir entre despliegues? | Los discos efímeros borran las evidencias subidas. | Aviso documentado: en planes gratuitos hace falta un disco persistente o migrar a S3. |
| 54 | ¿Se permite **enviar correos y SMS reales** durante la demo, o se prefiere el modo simulado para no gastar créditos? | Un envío real con credenciales propias impresiona; mal configurado, falla en vivo. | Modo simulado que registra el envío sin llamar al proveedor. |

---

## 9. Documentación y entregables

| # | Pregunta | Por qué conviene preguntarla | Lo que ya tienes |
|---|---|---|---|
| 55 | ¿Qué **documentos** exige exactamente y en qué **formato** (PDF, Markdown, Word)? | Un formato no aceptado es trabajo perdido. | 6 documentos en Markdown dentro de `docs/` y el README. |
| 56 | ¿Exige un **manual de usuario** distinto del manual técnico? | Es un documento aparte que hay que redactar. | Hay guía de uso y demo, pero **no** un manual de usuario formal con capturas. |
| 57 | ¿Debe haber **documentación de la API** (Swagger/OpenAPI) o basta una colección de pruebas? | OpenAPI es trabajo extra y no está. | Colección Postman con 9 carpetas y 53 peticiones + tabla de referencia en el README. **No** hay OpenAPI. |
| 58 | ¿Quiere los **diagramas de arquitectura y de secuencia**? ¿Cuántos? | Define cuántos diagramas producir. | 3 diagramas Mermaid: arquitectura, modelo de datos y flujo de una petición. |
| 59 | ¿Hay un **límite de páginas o de peso** para la entrega? | Los límites cambian el enfoque por completo. | Sin límite conocido. |
| 60 | ¿Debe incluirse el **historial de versiones** del repositorio? | Obliga a hacer *commits* ordenados desde ya. | **Sin confirmar.** |

---

## 10. Sustentación y evaluación

| # | Pregunta | Por qué conviene preguntarla | Lo que ya tienes |
|---|---|---|---|
| 61 | ¿Cuánto dura la **exposición** y cuánto la **ronda de preguntas**? | Ajusta si el discurso es de 2 o de 10 minutos. | Hay un *pitch* cronometrado de 2 minutos. |
| 62 | ¿Se permite **demo en vivo**? ¿Debe funcionar **sin internet**? | Una demo que depende de la nube puede caerse en el aula. | Funciona en local sin internet con Docker; la guía incluye un plan B. |
| 63 | ¿Puede llevarse el sistema **ya desplegado** en la nube? | Ahorra tiempo y riesgo durante la exposición. | **Sin confirmar.** |
| 64 | ¿Se evaluará la **defensa ante escenarios límite** (archivo malicioso, inyección, reporte vacío)? | Puedes prepararlos con antelación. | 3 escenarios límite documentados con su defensa. |
| 65 | ¿Qué penaliza más: un **fallo en vivo** o **no saber explicarlo**? | Define si conviene arriesgar o ir sobre seguro. | Hay una tabla para convertir un fallo en vivo en «funcionalidad planificada». |
| 66 | ¿Puede llevarse **material de apoyo impreso** (chuleta)? | Hay una chuleta lista si lo permiten. | Chuleta imprimible en el documento de estrategia. |
| 67 | ¿La nota es **individual o grupal**? ¿Cómo se reparte por integrante? | Afecta cómo documentas la autoría del trabajo. | El proyecto se presenta como trabajo de equipo. |
| 68 | ¿Se valoran **funcionalidades extra** por encima del mínimo, o solo el cumplimiento? | Define si conviene invertir en extras o en pulir lo pedido. | Hay extras: reportes PDF y Excel, notificaciones, bitácora de auditoría, prueba de carga. |

---

## 11. Preguntas que conviene NO hacer

| Evita | Por qué | Alternativa mejor |
|---|---|---|
| «¿Está bien así?» | Es una pregunta abierta: invita a que te cambien el alcance justo antes de entregar. | «¿Cumple con el requisito X que pide el enunciado?» |
| «¿Qué lenguaje uso?» | Si el enunciado ya lo fija, delata que no lo leíste. | «El enunciado fija Node; ¿el frontend también debe ser JavaScript o acepta un *framework*?» |
| «¿Cuánto vale esto?» | Antes de entregar, es pedir la nota sin mérito. | Pregunta por los **criterios** de evaluación, no por el puntaje. |
| «¿Me da el código / un ejemplo?» | Se percibe como falta de autonomía. | «¿Hay un ejemplo de referencia que pueda consultar?» |
| «¿Qué hago si falla la demo?» | Sugiere que no la has probado. | «¿Se permite un plan B grabado si hay un problema técnico ajeno al sistema?» |
| Cualquier pregunta cuya respuesta ya está en el enunciado | Es la forma más rápida de perder credibilidad. | Relee el enunciado y pregunta solo lo que **no** está cubierto. |
| «¿Y si no me alcanza el tiempo?» | Comunica que ya sabes que vas a incumplir. | «¿Cuál de los requisitos es prioritario si hay que recortar alcance?» |

---

## 12. Plantilla de correo para enviarlas

> **Asunto:** Sistema de Tickets — Consultas sobre el alcance antes de la entrega
>
> Profesor [apellido]:
>
> Estoy cerrando el alcance del proyecto **Sistema de Tickets** (helpdesk con
> Node.js, PostgreSQL, React y Docker) y quiero asegurarme de que lo que estoy
> construyendo coincide con lo que usted espera evaluar. Le planteo las dudas
> por orden de impacto:
>
> 1. **Despliegue:** ¿es obligatorio publicarlo en la nube o basta con que se
>    ejecute localmente con Docker?
> 2. **Tipado:** el enunciado fija Node.js para el backend; ¿el frontend debe
>    ser JavaScript o acepta otro enfoque?
> 3. **Cobertura de pruebas:** ¿hay un porcentaje mínimo exigido? ¿Con qué
>    herramienta quiere que lo mida?
> 4. **Estilo de código:** ¿exige linter y formateador configurados?
> 5. **Documentación de la API:** ¿basta una colección de pruebas o requiere
>    especificación OpenAPI?
> 6. **Sustentación:** ¿cuánto dura la exposición y cuánto la ronda de
>    preguntas? ¿Se permite demo en vivo?
>
> Con su respuesta puedo priorizar el tiempo que queda. Quedo atento.
>
> Gracias por su tiempo,
> [Tu nombre]

**Consejo final:** guarda la respuesta por escrito. Si más adelante surge una
duda sobre el alcance, tener la conversación archivada vale más que cualquier
argumento.

---

*Documento de apoyo para la sustentación. Complementa a
`GUIA-DE-PRUEBAS-Y-DEMO.md` (guion de demo) y a
`ESTRATEGIA-COMERCIAL-Y-DEFENSA.md` (pitch y defensa técnica).*
