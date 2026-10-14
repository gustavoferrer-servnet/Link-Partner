# Link Partner

Aplicación independiente para operar abastecimiento de conectividad, proveedores, cobertura, entrega y rentabilidad dentro del ecosistema Application Hub.

## Contrato con Application Hub

- Link Partner se publica como un `Application` con un `Deployment` compartido.
- Usa un client público propio de Keycloak: `link-partner-frontend`.
- Comparte el realm `application-hub`, pero mantiene usuarios, roles y datos de dominio en su propia base.
- El Hub valida el acceso base; Link Partner aplica sus permisos internos.
- La app ocupa la pantalla completa y siempre ofrece `Volver al Hub`.
- Ningún token o secreto viaja en query params.
- Las rutas de operaciones requieren sesión OIDC. Al abrir una URL directa se comprueba el SSO sin mostrar login; si no existe una sesión válida (o falla la comprobación), se reemplaza la navegación por `VITE_HUB_URL`. El modo de demostración sólo funciona en el servidor de desarrollo, nunca en un build publicado.
- `/cx` y el deployment CX son públicos y no montan el proveedor OIDC de operaciones. Sus clientes, contraseñas y sesiones se administran por separado de los usuarios y roles del Hub; una cuenta CX no habilita operaciones ni sus endpoints privados.

## Estructura

```text
apps/web   React 19 + Vite + TypeScript
apps/api   Express + TypeScript + validación JWT/JWKS + Firestore
deploy     Contratos de catálogo, deployment, Caddy y Docker Compose
docs       Arquitectura, publicación y conceptos visuales
```

## Desarrollo local

```bash
npm install
npm run dev:api
npm run dev
```

En desarrollo, web y API usan datos de demostración. Producción exige `VITE_AUTH_MODE=oidc`, `DATA_BACKEND=firestore` y un client configurado en Keycloak.

## Validación

```bash
npm run check
npm run build
docker compose -f deploy/docker-compose.staging.yml config
```

Consulta [la guía de publicación](docs/PUBLISHING.md) antes de registrar el deployment en Application Hub.

## Link Partner CX — primera entrega

Abre `/cx` para consultar conectividad sin sesión. Enterprise y Wholesale usan el mismo endpoint y la misma entidad de oportunidad. El perfil Wholesale en esta entrega describe el canal: no habilita tarifas privadas ni acceso a cuentas de socios.

- `POST /api/v1/prefeasibility`: requiere nombre completo (`fullName`), email (`email`) y empresa (`company`), `Idempotency-Key` UUID, dirección confirmada, `locationToken`, coordenadas, servicio, capacidad y canal. Crea una oportunidad `source=DIGITAL` y consulta en una sola operación; reusar la clave con otros datos devuelve 409.
- `POST /api/v1/consultations/{code}/retrieve`: recibe `{ "email": "nombre@empresa.com" }`. Valida la coincidencia con el email registrado ignorando mayúsculas y espacios exteriores. El código solo, el nombre, el apellido y la empresa no dan acceso. Cinco fallos por código y origen bloquean nuevos intentos hasta cumplir un minuto; los errores no revelan si existe el código. CX captura nombre completo, email y empresa y obtiene la ciudad automáticamente de Google Maps.
- `GET /api/v1/consultations/{code}`: compatibilidad con consultas anteriores; requiere `X-Consultation-Key` con la UUID original. La llave nunca viaja por URL. La respuesta omite proveedores, evidencia interna y hashes privados.
- La oportunidad aparece en la cartera interna. La escritura usa memoria en desarrollo, archivo en staging y una transacción Firestore en producción. El archivo admite estados existentes sin consultas y conserva nuevas consultas tras reiniciar.
- CX sólo consume JSON del API de Link Partner; no descarga ni interpreta KMZ. El backend evalúa todas las coberturas del mismo repositorio donde Gestión de proveedores persiste sus KML/KMZ normalizados a GeoJSON.
- `POST /api/v1/locations/validate`: busca dirección y ciudad en el geocodificador configurado, devuelve candidatos y un token firmado con vigencia de 30 minutos. El cliente confirma un candidato. Editar dirección/ciudad invalida la selección y el backend rechaza coordenadas o dirección que no correspondan al token.
- `POST /api/v1/coverage/check`: consulta independiente y autenticada por JWT/sesión Link Partner; admite latitud/longitud y devuelve clasificación por proveedor. Usa exactamente el motor que ejecuta la prefactibilidad CX, sin hacer llamadas HTTP del servidor a sí mismo. Se restringe hoy a roles internos. La publicación a proveedores requerirá identidades, scopes, cuotas y política comercial de visibilidad; no se habilitan permisos externos anticipadamente.
- FO se valida por contención en los polígonos del mapa y sus etiquetas OnNet/NearNet/OffNet. Una zona sin etiqueta se considera OnNet dentro del polígono; una línea o un punto sin área requiere validación. Ninguna distancia extiende cobertura. MW requiere contención en su mancha y presenta por separado las distancias a PoPs. Las distancias son informativas y no confirman capacidad, SLA ni precio.
- Cada carga de mapa y su actividad se guardan atómicamente: usuario, fecha, archivo, revisión única, número de versión, SHA-256 y versión anterior. El historial paginado está en `GET /api/v1/suppliers/:id/coverage-activity` y en Proveedores → cobertura → Historial de actualización de mapas. Cada prefactibilidad persiste y devuelve `coverage.versions` y `coverage.policyVersion`; la recuperación conserva el resultado original. Los mapas existentes reciben una versión base reproducible sin inventar eventos anteriores.
- El visor consulta el catálogo ligero de versiones y descarga cada archivo por `GET /api/v1/supplier-coverages/:id?revision=...`. Muestra capas progresivamente y reutiliza geometría por usuario y revisión entre pantallas y renovaciones de sesión. El API rechaza revisiones sustituidas con 409; sólo se descarga el mapa que cambió. Las transferencias tienen un límite de espera y reintento manual para archivos fallidos. La geometría original no se simplifica ni se modifica para calcular prefactibilidad.
- El listado de proveedores inicia colapsado, incluso cuando aparecen archivos durante la carga. Las capas identificadas como PoPs por carpeta, archivo o metadatos inician apagadas en Inicio y Cobertura; pueden encenderse manualmente. Ocultar los marcadores conserva las referencias PoP para calcular distancias de los proveedores con áreas activas.
- Los puntos con iconos invisibles en el KMZ (`icon-opacity: 0` o `icon-scale: 0`), incluidos dentro de colecciones de polígonos, se omiten únicamente del renderizado. La geometría original permanece disponible para los cálculos y la trazabilidad del mapa.
- Cobertura permite guardar una consulta del mapa en una oportunidad `OPP-COVERAGE-<código>`. `POST /api/v1/coverage/consultations` valida las revisiones y capas seleccionadas, calcula MW/FO con el mismo motor de CX y guarda la evidencia, coordenadas y usuario autenticado. La reserva por usuario y `requestId` evita duplicados. El expediente muestra el resumen histórico y los resultados por proveedor; no los recalcula con mapas nuevos.
- `POST /api/v1/opportunities/:id/proposals` crea una sola propuesta en preparación (`PRP-<código>`), registra al usuario y mantiene precio, SLA y entrega pendientes. Guardar consulta y generar propuesta son acciones separadas; generar desde Cobertura guarda primero la consulta. Sólo administradores, gestores de proveedores, compras y preventa pueden ejecutarlas.
- Sin coberturas o geometrías utilizables, o ante error del motor, queda pendiente. CX muestra un resumen anónimo: número de rutas prefactibles, tecnología y distancia al PoP más cercano sin nombre. La API pública excluye proveedores, PoPs, referencias, coordenadas de infraestructura, archivos y versiones también en recuperación histórica, cuenta y correo; Link Partner interno conserva todo el detalle.
- Validación de escritura: normalización básica de abreviaturas y espacios, búsqueda geográfica y confirmación humana del resultado. No se promete corregir automáticamente cualquier error ortográfico ni se acepta la primera coincidencia sin confirmación.
- Google es el proveedor predeterminado para mapas y todas las rutas de direcciones. OpenStreetMap sólo se activa expresamente con `ADDRESS_SEARCH_PROVIDER=photon`: Photon atiende autocompletado y Nominatim validación explícita/coordenadas, con User-Agent y separación de llamadas de >=1 segundo. Debe cumplirse la [política de Nominatim](https://operations.osmfoundation.org/policies/nominatim/). Para mayor volumen o múltiples réplicas, configura instancias propias/comerciales y cuotas compartidas.
- Producción requiere `GEOCODING_SIGNING_SECRET` persistente de al menos 32 caracteres en el almacén de secretos del deployment. Sin ese valor, la validación responde 503; el resto del API sigue operativo. Desarrollo usa una llave efímera y los candidatos previos requieren revalidación tras reiniciar.
- Contrato de integración: `docs/openapi-cx.json`.
- Pricing pendiente: importe y margen son `null`; tampoco se inventan proveedor, nivel, SLA o fecha. Estados: `PRICING_PENDING`, `FEASIBILITY_PENDING`, `NO_COVERAGE`, `VALIDATION_PENDING`.
- El seguimiento inicial sólo confirma recepción y validación. Vinculación de cuenta, permisos y tarifas Wholesale, multisede, checkout, notificaciones y traducción de eventos reales de Delivery quedan para siguientes entregas.
- La consulta anónima no queda asignada a un socio por seleccionar Wholesale. El acceso externo a oportunidades requiere un `participantId` válido; registros sin propietario quedan restringidos a usuarios internos.
- El límite local es 30 llamadas/minuto por IP en una instancia; un despliegue con múltiples réplicas requiere cuotas compartidas en el gateway. El almacenamiento de desarrollo es efímero.

Ejemplo para `POST /api/v1/locations/validate`:

```json
{
  "address": "Av. Paseo de la Reforma 222",
  "city": "Ciudad de México"
}
```

Confirma un candidato de esa respuesta y envía sus valores de `address`, `city`, `latitude`, `longitude` y `token` (como `locationToken`) a `POST /api/v1/prefeasibility`, junto con `channel`, `product`, `capacityMbps` e `Idempotency-Key`. No se acepta una dirección escrita sin la confirmación firmada del API.

Ejecuta `npm test` para validar cobertura, duplicados concurrentes, conflicto de clave, recuperación privada, registro ante error de cobertura y persistencia tras reinicio. Para probar en otro origen local, agrégalo a `CORS_ORIGINS` al iniciar el API.

## Contenedor CX en Mac Studio

- Mac Studio corresponde al host SSH `ai-stg-node02` (nombre del equipo: Mac Studio de gustavo.ferrer). El contexto Docker `macstudio` actual apunta a un nombre que no resuelve; el despliegue usa ese host SSH.
- `deploy/docker-compose.cx.yml` crea un frontend CX independiente en la red Docker `app-hub-staging_default`, con puerto 5174 en loopback del Mac Studio. Su proxy envía exclusivamente las rutas digitales a `http://link-partner-api:3000`, el API de staging; no hay otra base de proveedores ni una réplica de KMZ.
- El build CX usa `VITE_APP_SURFACE=cx`, `VITE_DATA_MODE=api`, `VITE_API_URL=/api/v1` y `VITE_OPERATIONS_URL=https://ai-stg-node02.serv.net.mx:3446`.
- Acceso HTTPS desde otro equipo o celular: `https://ai-stg-node02.serv.net.mx:8081/cx`. El servicio `link-partner-cx-edge` publica el puerto 8081 y transporta TLS al servicio `link-partner-cx-https`, que usa Caddy y reutiliza el almacenamiento de certificados del Hub. Su configuración está en `deploy/Caddyfile.cx`.
- El acceso local por túnel sigue disponible: `ssh -N -L 5175:127.0.0.1:5174 ai-stg-node02`, luego `http://127.0.0.1:5175/cx`.
- `deploy/docker-compose.api-cx.override.yml` actualiza API y operaciones conservando el volumen `link-partner-staging_data`. El secreto de firma se guarda fuera del repo en un archivo de entorno de permisos 0600.
- Las consultas nuevas usan códigos de **6 caracteres totales**, sin prefijo, con alfabeto sin 0, O, 1 ni I. Las nuevas consultas se recuperan con código y email. La UUID de idempotencia sigue independiente del código; las consultas anteriores conservan recuperación por llave privada. La reserva es atómica y una colisión genera otro código; una misma clave de idempotencia conserva el original. Archivo y Firestore conservan reservas permanentes para evitar reutilización. Los códigos anteriores de 8 caracteres y los códigos largos existentes siguen recuperables.
- La garantía de no reutilización depende de conservar la base y su registro de reservas: no se deben borrar ni reinicializar los volúmenes. En memoria de desarrollo no hay garantía entre reinicios.
- Para integraciones de proveedores, usar el contrato versionado `docs/openapi-cx.json` y el API de Link Partner, no el contenedor de presentación CX.

CX sugiere direcciones desde tres caracteres tras 350 ms sin cambios, a través de `POST /api/v1/locations/suggest`, usando el proveedor configurado y cancelando respuestas obsoletas. Seleccionar una sugerencia completa ciudad y confirma coordenadas con un token firmado; modificar la dirección invalida esa selección. En el modo alternativo OpenStreetMap, Photon ofrece caché y autocompletado; su servicio público admite uso moderado sin garantía de disponibilidad y para más tráfico debe configurarse una instancia propia.

Link Partner y CX comparten `AddressAutocomplete`: lista de direcciones completas anclada debajo del campo, cancelación al editar, selección con toque o flechas/Enter y cierre con Escape. El mapa conserva la consulta explícita por coordenadas. La cuota de sugerencias es independiente de la cuota de consultas de cobertura.

## Google Maps Places

Configurar `ADDRESS_SEARCH_PROVIDER=google`, `GOOGLE_MAPS_API_KEY` (clave privada de servidor, Places API New, restricción por IP) y `GOOGLE_MAPS_BROWSER_KEY` (clave pública de navegador, Maps JavaScript API, restricción por referrers). Las claves se guardan únicamente en el archivo privado del deployment, nunca en Git. La clave de Places no se devuelve al navegador.

`POST /locations/suggest` utiliza Autocomplete New con una sesión UUID, resultados en español y restringidos a México. `POST /locations/resolve` obtiene Place Details únicamente tras seleccionar una sugerencia y emite el token de ubicación firmado. No se almacenan listas de predicciones Google ni se solicitan detalles de todas las opciones. La ruta compatible `/locations/validate` también utiliza Google cuando está activo; las coordenadas usan el mismo proveedor y conservan el punto ingresado.

Link Partner y CX comparten una consulta de `/locations/config` por sesión de página. Esperan esa respuesta antes de montar el mapa o buscar direcciones: con Google sólo cargan Google Maps; con Photon sólo cargan Leaflet/OpenStreetMap. Ante errores de configuración o de Google muestran el error y no activan OpenStreetMap como sustituto. Si falta la clave pública, informan que el mapa está pendiente de activación. Cambiar el proveedor requiere reiniciar el API y recargar la página. Las librerías del proveedor alternativo permanecen en un módulo de carga diferida; sus teselas y servicios no se consultan en modo Google. El motor de cobertura sigue evaluando los mismos GeoJSON/KMZ y sus versiones, independientemente del mapa base.

El servidor necesita salida HTTPS TCP 443 hacia places.googleapis.com y DNS UDP/TCP 53 hacia su DNS configurado. Los navegadores necesitan acceso a maps.googleapis.com y los recursos de Google Maps. El puerto de entrada de CX permanece en 8081.

### Consultas CX dentro de Oportunidades

Abre `/opportunities?view=consultas` en Link Partner. La sección muestra todas las consultas persistidas, con búsqueda por código, contacto, email, empresa, referencia o ubicación; filtros por estado/canal, orden por fecha y paginación de 25 registros. Se actualiza cada 30 segundos y al usar Actualizar. Cada registro abre el expediente de su misma oportunidad DIGITAL, incluyendo el resultado de cobertura guardado, dirección confirmada, servicio y próximos pasos. No se generan oportunidades duplicadas para mostrar el expediente.

`GET /api/v1/digital-consultations` y `GET /api/v1/digital-consultations/{code}` requieren sesión y rol interno. Los registros antiguos sin datos de contacto siguen visibles como Sin capturar. No hay tope de 100 consultas en este listado. Los endpoints internos no se exponen en el proxy público de CX y no devuelven hashes ni llaves privadas. Memoria, archivo y Firestore soportan el mismo acceso; en staging el volumen persistente conserva todos los registros tras reiniciar.

### Sustitución y activación de mapas

En Proveedores → Cobertura, cada archivo debe indicar qué mapa vigente sustituye (aunque cambie el nombre) o elegir **Agregar mapa independiente**. La sustitución conserva el identificador, reemplaza toda su geometría y registra la revisión anterior en la bitácora. Los demás archivos del proveedor, incluidos FO/MW independientes, siguen activos.

El API exige `coverageId` y `expectedRevisionId` para sustituir; una revisión anterior devuelve 409 y una precondición ausente 428. Antes de activar valida geometrías compatibles con el motor; una carga inválida conserva el mapa vigente. La escritura del mapa y su bitácora es atómica. La respuesta confirma `activation.verified`, revisión activa y huella. Las vistas abiertas consultan el manifiesto ligero `/supplier-coverages/versions` cada 10 segundos y descargan geometrías cuando cambian. `/coverage/check` exige `revisionId` en selecciones de capas y rechaza índices/revisiones anteriores. Nuevas consultas CX usan mapas activos del API; resultados históricos e intentos con la misma clave de idempotencia conservan su resultado original. Cada archivo de una carga múltiple se activa por separado.

### Propuestas con redundancia de carrier

Una nueva consulta CX con dos o más proveedores distintos prefactibles marca automáticamente **Solicitar propuestas con redundancia de carrier**. Se cuentan identificadores de proveedor únicos con una tecnología dentro de área OnNet/NearNet del mapa; FO y MW del mismo carrier cuentan una vez. Las redes fuera del mapa o sin geometría evaluable no habilitan la opción. El cliente puede cambiar la preferencia y se conserva al recuperar su consulta, en su historial y en la oportunidad de Link Partner (Consultas CX). Los resultados históricos mantienen su evidencia y versiones de mapa. Las consultas anteriores sin preferencia no se marcan retroactivamente.

`PATCH /api/v1/consultations/{code}/proposal-options` guarda la preferencia con código+email, llave privada o sesión del propietario. Las escrituras validan el origen y el CSRF de sesión. La marca registra una solicitud para preparar ofertas; la independencia de rutas, capacidad y disponibilidad se validan comercial y técnicamente. No activa un envío de correo ni un motor de precios.

### Consultas CX de varias localidades

Enterprise y Wholesale comienzan con una dirección y permiten agregar o quitar hasta 10. Cada dirección se confirma por separado con Google Maps; el contacto es común; las nuevas consultas usan servicio y capacidad por dirección o enlace. El API `/prefeasibility` acepta `locations` de 1 a 10 objetos `{ address, city, latitude, longitude, locationToken }`, además de los campos comunes, y conserva el formato individual anterior. Rechaza puntos duplicados y verifica todos los tokens antes de guardar.

La consulta genera un solo código y una oportunidad. Persiste la evidencia MW/FO, proveedores y versiones de mapa por localidad, obtenidas de una misma lectura de mapas activos. El historial, recuperación, correo y expediente conservan estos resultados; el selector de localidad muestra su pin y detalle. El estado global es disponible si todas son prefactibles, sin cobertura si todas carecen de ella, y pendiente para resultados mixtos. La redundancia se ofrece sólo en localidades con dos carriers distintos factibles.

### Internet dedicado y Lan to Lan (L2L)

El formulario CX abre Internet dedicado por defecto y permite alternar a Lan to Lan conservando los borradores. Internet tiene una dirección por servicio; L2L tiene punta A y punta B y una capacidad común para ese enlace. Cada servicio tiene capacidad capturada entre 50 y 1000 Mbps, entera. El límite total sigue siendo 10 direcciones: hasta 10 servicios Internet o 5 enlaces L2L.

El API recibe `{ product, services: [{ capacityMbps, locations: [direccionesConfirmadas] }], channel, fullName, email, company }`. Usa los tokens Google existentes; valida todos antes de persistir. Guarda `services` con `locationIndexes` hacia los resultados individuales, además de la evidencia por punto, en consulta y oportunidad. Recuperación, historial, correo y expediente muestran las capacidades individuales. Los formatos antiguos individuales/multisede siguen aceptados dentro del nuevo rango; los resultados históricos no se modifican.

L2L evalúa la cobertura MW/FO de ambos extremos con la misma versión de mapas; no garantiza transporte entre A y B por contener ambos puntos. El enlace queda pendiente de validación de transporte, capacidad y compatibilidad técnica. Sólo ofrece redundancia si dos carriers distintos tienen cobertura en ambas puntas del mismo enlace. Distintos enlaces pueden compartir una punta; los dos extremos de un mismo enlace deben ser distintos.

### Autorización de personal desde Application Hub

Configura `HUB_API_URL` con la base `/api/v1` interna, `HUB_APPLICATION_SLUG`, `HUB_DEPLOYMENT_ID` y `HUB_INTERNAL_TENANT_SLUG`. Link Partner valida el JWT y consulta `/applications/{slug}/access` con la instancia explícita. Una concesión activa de la organización interna permite consultar los datos como `viewer`; ser administrador del Hub no concede administración de Link Partner. Los perfiles locales existentes y las cuentas bootstrap conservan sus roles explícitos. La comprobación se reutiliza por hasta cinco segundos para descargar mapas; revocaciones, instancias distintas, organizaciones externas y fallos del Hub no permiten acceso. CX conserva sus cuentas y autenticación independientes. La interfaz valida `/session` antes de cargar las vistas y muestra la causa si el acceso falla.
