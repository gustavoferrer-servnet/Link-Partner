# Cuentas de clientes CX

Registro y login por email/contraseña en la misma API de Link Partner, accesibles por HTTPS en el puerto 8081. Las cuentas CX no reciben roles, tokens ni permisos de personal de operaciones/Keycloak.

- Registro: nombre completo, empresa, email y contraseña de 8–128 caracteres, con al menos una mayúscula, una minúscula y un carácter especial (sin contar espacios). No se requieren números. El login conserva compatibilidad con las contraseñas de cuentas existentes.
- Sesión de 30 días mediante cookie HttpOnly, Secure en producción, SameSite=Strict y sin Domain. Token aleatorio de 256 bits; sólo su SHA-256 persiste. Login rota la sesión del navegador, logout la revoca. Cada petición valida expiración.
- Contraseñas scrypt N=131072, r=8, p=1, sal aleatoria de 128 bits, derivación asíncrona y concurrencia limitada. No se devuelven hashes.
- Escrituras: JSON + X-CX-Request: 1 y, con sesión, X-CSRF-Token obtenido de /customers/me. Se rechazan peticiones cross-site. Limitación de intentos por email y origen; un despliegue distribuido requiere cuotas compartidas en gateway. El edge TCP actual agrupa direcciones de origen; la cuota por email es independiente.
- Nuevas consultas autenticadas: customerId asignado por el servidor; email debe corresponder a la cuenta. Idempotencia no cruza cuentas ni consulta anónima/autenticada. Permanecen visibles para operaciones en Oportunidades → Consultas CX.
- No se agrupan consultas históricas por email al registrarse: el correo no está verificado. Importación individual exige código y email de la cuenta, conserva la propiedad ya asignada y es atómica. El código + email sigue siendo el método de recuperación pública autorizado para consultas anteriores.
- Al registrarse o iniciar sesión desde una consulta abierta, CX agrega únicamente esa consulta si el email coincide con la cuenta. Después abre Mis consultas. Las consultas nuevas con sesión se guardan automáticamente; las anteriores pueden agregarse por código.
- Historial y detalle validan propiedad. Los clientes reciben sólo resultados públicos, etapa, estado, próxima acción y fecha de compromiso de los proyectos vinculados. No se exponen tareas, documentos, credenciales ni notas internas.
- Las pantallas de historial y seguimiento actualizan cada 30 segundos. Si no existe proyecto, muestran solicitud recibida y fecha por confirmar.
- FileRepository persiste clientes, sesiones, consultas y propiedad en el volumen existente con escrituras atómicas y rollback. Firestore usa índices de email únicos por transacción y colecciones cx_customers, cx_customer_emails, cx_customer_sessions. Las sesiones expiradas se ignoran; configurar TTL/limpieza para cx_customer_sessions en despliegues Firestore de larga duración.
- El envío solicitado desde un resultado utiliza Google Workspace (SMTP con TLS) hacia el email guardado en la consulta; no acepta destinatarios alternativos. Configura `CX_MAIL_FROM`, `SMTP_HOST`, `SMTP_PORT` y, si se requiere autenticación, `SMTP_USER`/`SMTP_PASSWORD` en el archivo privado del deployment. El relay por IP requiere autorización en Google Admin. Sin remitente configurado informa que está pendiente; no simula envío. La aceptación SMTP no garantiza recepción en la bandeja. Verificación de email y restablecimiento por correo siguen pendientes.
- Cada email admite un intento por minuto y hasta cinco por hora en una instancia, incluyendo fallos. Concurrencia por destinatario está bloqueada. Múltiples réplicas o cuotas entre reinicios requieren un límite compartido en el gateway.

## Endpoints

| Método | Ruta /api/v1 | Acceso |
| --- | --- | --- |
| POST | /customers/register | Público; JSON y X-CX-Request |
| POST | /customers/login | Público; JSON y X-CX-Request |
| GET | /customers/me | Sesión pública o null |
| POST | /customers/logout | Sesión + CSRF |
| GET | /customers/consultations | Sesión; sólo propias |
| GET | /customers/consultations/{code} | Sesión; propiedad obligatoria |
| POST | /customers/consultations/{code} | Sesión + CSRF; importar con email de la cuenta |

El proxy CX permite estas rutas; el API de administración sigue bloqueado en el puerto público.

Pruebas: registro, conflictos de email, login, aislamiento entre cuentas, idempotencia, importación, cookies, CSRF, expiración, revocación, límites, persistencia y seguimiento real vinculado.

## Anonimización de prefactibilidad (13 de octubre de 2026)

CX presenta un resumen por servicio y localidad: rutas prefactibles, MW/FO y distancia informativa al PoP más cercano en línea recta. Sin PoP explícito, la distancia queda por confirmar. Cuenta redes distintas elegibles una sola vez, independientemente de archivos y tecnologías; L2L requiere opciones comunes a ambas puntas, sin confirmar el transporte ni la independencia física.

La API pública usa una lista explícita de campos permitidos, también para consultas históricas, recuperación por código/email o llave, historial de cuenta, cambios de preferencia y correo. Excluye nombres e identificadores de carriers y PoPs, referencias, coordenadas de infraestructura, archivos, mapas, revisiones, huellas y texto operativo libre. El seguimiento muestra hitos públicos sin copiar instrucciones internas.

La consulta y oportunidad internas conservan intactos proveedores, PoPs, mapas, distancias, revisiones y evidencia técnica. `/digital-consultations/:code` y `/coverage/check` siguen protegidos por autenticación interna. Se utiliza el resultado guardado, sin reevaluar mapas ni modificar la información histórica.

Desplegado en staging con imágenes `link-partner-api:cx-anonymous-20261013`, `link-partner-web:cx-anonymous-20261013` y `link-partner-cx:cx-anonymous-20261013`. Respaldo previo: `/app/data/backups/pre-cx-anonymous-20261013.json`; configuración y rollback en `/Users/gustavo.ferrer/link-partner-releases/cx-anonymous-20261013`. La huella del estado completo no cambió durante el despliegue. Auditoría posterior: 34 resúmenes históricos y 20 recuperaciones por API, sin campos de identidad de red; API interno rechaza peticiones sin autenticación. 63 pruebas aprobadas con `node --import tsx --test --test-concurrency=1 tests/*.test.ts`; compilaciones API, operaciones y CX correctas. QA visual local: recuperación por código/email, resumen anónimo, distancia sin nombre de PoP, preferencia de rutas guardada y consola sin errores.

## Códigos de consulta de 6 caracteres

Las nuevas consultas de CX y de cobertura interna generan 6 caracteres alfanuméricos sin prefijo; se conserva el alfabeto sin 0, O, 1 ni I. La reserva atómica y sus reintentos ante colisiones siguen vigentes. La idempotencia conserva el código original y no cambia códigos ni oportunidades existentes. Recuperación, correo, preferencias e historial aceptan códigos nuevos de 6 y anteriores de 8 caracteres. Las consultas con códigos largos anteriores mantienen recuperación por llave privada. Los formularios de recuperación e importación de historial aceptan únicamente longitudes cortas de 6 u 8, sin aceptar códigos de 7 caracteres.

Desplegado en staging con imágenes `link-partner-api:six-codes-20261013`, `link-partner-web:six-codes-20261013` y `link-partner-cx:six-codes-20261013`. Respaldo previo: `/app/data/backups/pre-six-codes-20261013.json`; configuración y rollback en `/Users/gustavo.ferrer/link-partner-releases/six-codes-20261013`. Huella del estado sin cambios durante el despliegue. Validación: 64 pruebas aprobadas; compilaciones API, operaciones y CX correctas; recuperación visual local de código nuevo de 6 en minúsculas y de código anterior de 8, rechazo de longitud 7 y consola sin errores. Formulario de staging confirmado con longitud nueva.
