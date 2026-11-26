# Colección de Postman — Sistema de Tickets

Colección completa de pruebas de la API, con scripts que validan automáticamente
el código de estado **y** la forma del cuerpo de cada respuesta.

## Archivos

| Archivo | Contenido |
|---|---|
| `Sistema-Tickets.postman_collection.json` | Colección completa: 9 carpetas, 53 peticiones |
| `Sistema-Tickets-Local.postman_environment.json` | Entorno para el backend en `localhost:4000` |
| `Sistema-Tickets-Nube.postman_environment.json` | Entorno para el backend desplegado |
| `ejecutar-coleccion.js` | Ejecutor por consola: corre las 9 carpetas en orden y se detiene en el primer fallo |
| `EJECUTAR.bat` | Doble clic en Windows: instala newman si hace falta y ejecuta |
| `fixtures/` | Archivos de prueba para las peticiones de carga (PNG válido y `.exe` rechazable) |

## Cómo importarla

1. Abra Postman → **Import** → arrastre los tres archivos (o elija la carpeta).
2. En el selector de entornos (arriba a la derecha), elija **Sistema de Tickets - Local**.
3. Ejecute primero **`00 - Salud del sistema → Verificar que el servicio responde`**.
   Si esta petición falla, ninguna otra funcionará: revise que el backend esté
   levantado (`docker compose up -d`).
4. Ejecute **`01 - Autenticación → Iniciar sesión (administrador)`**. Esta petición
   guarda automáticamente el token que usan todas las demás.

## Ejecución automatizada completa

### Opción A — Desde Postman (interfaz)

1. Clic derecho sobre la colección → **Run collection**.
2. Verifique que el entorno seleccionado sea el correcto.
3. Pulse **Run Sistema de Tickets - API v1**.

El orden de las carpetas ya está definido para que las dependencias se resuelvan
solas: autenticación captura los tokens, categorías captura `idCategoria`,
tickets captura `idTicket`, y así sucesivamente.

### Opción B — Por consola, carpeta por carpeta (recomendado para entregar)

Cumple literalmente lo que se pide: **correr una por una y que todas salgan
bien**. El ejecutor se detiene en el primer fallo y muestra un resumen por
carpeta.

```bash
cd postman
npm install          # solo la primera vez
npm run ejecutar     # entorno local
npm run ejecutar:nube  # entorno desplegado
```

En Windows, doble clic sobre `EJECUTAR.bat` (o `EJECUTAR.bat nube`).

Salida esperada:

```
==================================================================
  RESUMEN
==================================================================
  OK     00 - Salud del sistema          2 peticiones, 4 aserciones
  OK     01 - Autenticación              9 peticiones, 24 aserciones
  ...
------------------------------------------------------------------
  Carpetas correctas: 9 de 9
  Peticiones ejecutadas: 53
  Fallos: 0
==================================================================
```

Para ejecutar una sola carpeta:

```bash
node ejecutar-coleccion.js --folder "03 - Tickets (CRUD)"
```

> **Cómo se conserva el encadenamiento.** Los scripts guardan `idTicket`,
> `idComentario`, `idAdjunto` y los tokens en variables de colección. Si cada
> carpeta corriera en un proceso independiente, esas variables se perderían y
> las carpetas siguientes fallarían. El ejecutor conserva el estado de la
> colección entre carpetas, de modo que cada una ve lo que produjo la anterior.

> **Archivos de la carpeta 05.** En la interfaz de Postman hay que seleccionar
> los archivos a mano en las dos peticiones `formdata`. Por consola no hace
> falta: el ejecutor inyecta `fixtures/evidencia.png` (válido) y
> `fixtures/archivo-no-permitido.exe` (debe ser rechazado) automáticamente.

## Estructura

```
00 - Salud del sistema          Verificación de disponibilidad
01 - Autenticación              Login, registro, renovación de token, logout
02 - Categorías                 Catálogo de categorías y SLA
03 - Tickets (CRUD)             Ciclo de vida completo del ticket
04 - Comentarios                Conversación y notas internas
05 - Evidencias                 Carga, descarga y borrado de archivos
06 - Reportes                   PDF, Excel y datos del dashboard
07 - Notificaciones             Cola de correo/SMS y reintentos
08 - Pruebas de seguridad       Inyección SQL, IDOR, escalada de privilegios
```

## Pruebas de seguridad incluidas

Estas peticiones están diseñadas para **fallar de forma controlada**: demuestran
que el sistema rechaza la acción. Son el material ideal para la defensa contra
el cliente tóxico.

| Petición | Ataque simulado | Defensa verificada |
|---|---|---|
| `01 → Registro con intento de escalada` | Enviar `"rol": "ADMINISTRADOR"` en el registro público | El servicio fuerza `SOLICITANTE`; el JWT también lo confirma |
| `01 → Reutilizar token de refresco` | Reusar un refresh token ya consumido | Rotación obligatoria: el token usado se revoca |
| `02 → Crear categoría como agente` | Agente intentando administrar el catálogo | Middleware `autorizar('ADMINISTRADOR')` → 403 |
| `03 → Transición ilegal de estado` | Saltar de `NUEVO` a `CERRADO` | Máquina de estados → 409 |
| `03 → Resolver sin solución` | Marcar como resuelto sin documentar | Regla de negocio → 400 |
| `05 → Subir archivo no permitido` | Subir un `.exe` o un `.png` falso | Lista blanca de MIME + verificación de firma binaria |
| `06 → Formato de reporte inválido` | Pedir `formato=word` | Validación en la capa HTTP → 400 |
| `08 → Inyección SQL en búsqueda` | `'; DROP TABLE tickets; --` | Consultas parametrizadas: se trata como texto literal |
| `08 → Inyección SQL en ordenamiento` | `ordenarPor=(SELECT contrasena_hash...)` | Lista blanca de columnas → 400 |
| `08 → IDOR: leer ticket ajeno` | Solicitante leyendo el ticket de otro | Control de acceso a nivel de fila → 404 |
| `08 → JWT manipulado` | Cambiar el rol en el payload y falsificar la firma | Verificación de firma + reconsulta del usuario en la BD |

## Variables que se capturan automáticamente

| Variable | Se obtiene en | Se usa en |
|---|---|---|
| `tokenAcceso` | Iniciar sesión (administrador) | Todas las peticiones protegidas |
| `tokenRefresco` | Iniciar sesión (administrador) | Renovar token, cerrar sesión |
| `tokenAgente` | Iniciar sesión (agente) | Pruebas de permisos |
| `tokenSolicitante` | Iniciar sesión (solicitante) | Pruebas IDOR y de reportes |
| `idUsuario` | Iniciar sesión | Consultas de usuario |
| `idCategoria` | Listar categorías | Crear ticket |
| `idTicket` | Crear ticket | Detalle, comentarios, adjuntos |
| `idComentario` | Agregar comentario | Eliminar comentario |
| `idAdjunto` | Subir evidencia | Descargar / eliminar evidencia |
| `idAgente` | Listar agentes | Asignar responsable |

## Requisito previo

Los usuarios de prueba se crean con el semillero del backend:

```bash
docker compose exec backend npm run db:seed
```

Cuentas disponibles (contraseña común `Demo2026#Tickets`):

- `admin@sistema-tickets.local` — ADMINISTRADOR
- `agente1@sistema-tickets.local` — AGENTE
- `usuario1@sistema-tickets.local` — SOLICITANTE
