# Evaluación continua y gestión de proveedores

El expediente operativo se administra en Proveedores. El cuestionario es complementario: la falta de respuesta no bloquea la evaluación con evidencia interna. La clasificación histórica P2/P3 se conserva separada del estado autorizado para nuevas contrataciones; esta implementación no adjudica ni cancela contratos automáticamente.

## Responsabilidades

- Service Delivery Office (SDO), mediante Delivery Manager: entregas, aceptación y calidad.
- NOC: disponibilidad, incidentes, respuesta y evidencia de atención.
- Gestor de proveedores (`supplier_manager`): requisitos, agenda, contratos, acciones correctivas y seguimiento.
- Gerencia de Operaciones (`operations_manager`) y administración autorizada (`internal_admin`): autorización de estado. El gestor sin estos roles no puede autorizar.

Los roles se asignan en el expediente de usuario del backend de identidad de Link Partner; crear el rol no concede permisos automáticamente a cuentas existentes.

## Cálculo

Ventana móvil de 90 días, recalculada por la API al consultar y actualizada en la pantalla cada minuto mientras está abierta. No requiere un proceso nocturno ni una automatización externa.

| Indicador | Peso | Unidad |
| --- | --- | --- |
| Disponibilidad | 25% | Enlace-mes con cumplimiento del SLA |
| Resolución | 25% | Incidente dentro del SLA |
| Entrega | 15% | Proyecto contra compromiso original |
| Calidad | 15% | Instalación aceptada a la primera |
| Respuesta | 10% | Solicitud respondida dentro del plazo |
| Compromisos | 10% | Acción o reporte cumplido al vencimiento |

Puntos por indicador: casos que cumplen / casos evaluables × 100. El resultado general pondera las proporciones sin redondear y se redondea al final. Los pesos sin casos evaluables se excluyen del denominador, mostrando la cobertura de evidencia. Ausencia de historial produce `null`, nunca 0 ni 100.

Regla inicial de suficiencia para el piloto: cobertura de al menos 70% y al menos cinco casos en cada indicador con datos. Una puntuación alta con menos evidencia solo recomienda habilitación provisional.

La entrega se obtiene de los proyectos con proveedor coincidente exactamente por nombre, fechas originales y fecha real; se excluyen cancelados y proyectos simulados. Un proyecto abierto con fecha original vencida cuenta como incumplimiento. No se infiere calidad a partir de una entrega. El plazo vence al finalizar el día en la zona de Ciudad de México.

Para el resto se capturan referencias verificables por caso. No hay aún integración automática con monitoreo/tickets de NOC. Casos pendientes vencidos cuentan como incumplimiento; se pueden resolver después, preservando referencia y evidencia. La referencia se deduplica por indicador. Registrar la misma referencia que un proyecto no vuelve a sumar esa entrega.

Los tiempos detallados del SLA y la atribución de causas deben comprobarse en la evidencia del ticket. Las fechas de captura no sustituyen esa comprobación. Antes de autorizar restricciones, Gerencia debe revisar afectaciones externas, pausas autorizadas y diferencias de capacidad/servicio; el promedio no emite por sí mismo una decisión.

## Estados y controles

- En validación inicial: requisitos por completar.
- Habilitado provisional: requisitos completos, historial limitado o inexistente.
- Habilitado: requisitos vigentes, evidencia suficiente y puntaje de al menos 85.
- Condicionado: propuesta inicial para puntajes de 70 a 84.
- Restringido para nuevas contrataciones: propuesta para puntajes menores de 70 o hallazgo crítico abierto.

Los requisitos obligatorios son contacto/escalamiento, servicios/capacidad, SLA/condiciones y documentación indispensable. Marcar cumplimiento exige evidencia; la vigencia vencida invalida el requisito. Los hallazgos críticos abren una acción correctiva y permanecen activos hasta su cierre con evidencia, incluso después de salir de la ventana de 90 días.

Solo Gerencia o administración autorizada cambian el estado, con motivo y trazabilidad. Una recomendación diferente al estado autorizado genera alerta; no cambia automáticamente la autorización. Los servicios activos continúan atendiéndose. Se conserva la clasificación histórica de cada proveedor.

## Agenda

Validación inicial: diez días hábiles, excluyendo fines de semana (sin calendario de festivos configurado). Proveedores anteriores sin expediente usan la fecha de adopción del modelo, 13 de octubre de 2026; las fechas no se desplazan con cada consulta. Nuevos proveedores usan su fecha de registro.

El gestor configura responsable, vencimiento de validación, revisión mensual y revisión trimestral de capacidad. La bandeja muestra asignaciones pendientes, vencimientos, revisiones, críticos y cambios de recomendación. Contratos: alerta dentro de 60 días y después del vencimiento. No se envían correos ni se crean recordatorios externos.

Las revisiones no se completan automáticamente: el gestor actualiza la agenda al terminar y el historial registra el cambio. Acciones correctivas siempre tienen responsable y vencimiento; el cierre exige evidencia.

## Persistencia y piloto

El expediente y su historial se guardan dentro del proveedor en Memory, File y Firestore. El archivo conserva escrituras serializadas con rollback; Firestore usa una transacción. Cada edición exige versión esperada: ante edición simultánea, la API devuelve 409 y el usuario carga la versión actual.

Recomendación de despliegue: piloto de 30 días, revisar pesos 50/30/20, bandas 85/70 y suficiencia con el historial real antes de aplicar decisiones generalizadas. La implementación se publicó en staging con almacenamiento de archivo; las pruebas contra Firestore real siguen pendientes.

## Gestor responsable heredado de Application Hub

El gestor se selecciona por `authUid` entre los usuarios activos asignados a la organización y a esta instancia de Link Partner en Hub. La API consulta y revalida el directorio antes de guardar; el formulario no acepta nombres libres. Se conserva nombre/correo como fotografía de la asignación, sin crear otra cuenta ni conceder permisos de gestión por el solo hecho de asignarla.

Contrato del directorio en Hub: `GET /applications/:id/users?deploymentId=...&tenantSlug=...`, con el mismo Bearer de la sesión. Devuelve aplicación, instancia, organización y usuarios `{authUid,email,displayName}`. El backend de Hub incluido en el workspace filtra asignaciones vigentes, acceso activo por usuario, cuenta habilitada y organización; solo el superadministrador puede consultar una organización diferente a la propia. Este endpoint se desplegó en Hub junto con el cambio de Link Partner en staging.

Cuando Hub no responde o rechaza el alcance, la asignación no se guarda. Los responsables anteriores escritos como texto se conservan como referencia y deben vincularse a una cuenta; no se intenta adivinar identidades por nombre. En modo de desarrollo se usa exclusivamente la identidad de prueba, identificada explícitamente como desarrollo; producción no utiliza esta alternativa.

## Despliegue de staging del 13 de octubre de 2026

Publicado en `https://ai-stg-node02.serv.net.mx:3446/suppliers`.

- Hub: `app-hub-api:suppliers-20261013`.
- Link Partner API: `link-partner-api:suppliers-20261013`.
- Link Partner web: `link-partner-web:suppliers-20261013`.
- Release remoto: `/Users/gustavo.ferrer/link-partner-releases/suppliers-20261013`.

El Hub activo usa una firma distinta de `verifyRole` y entrega la identidad en `req.user`. La imagen de release conserva sus rutas completas y agrega el directorio usando su firma vigente. El controlador valida de nuevo la cuenta habilitada a partir del `sub` de la sesión. No se reemplazaron sus otras rutas ni modelos.

Verificación: tres contenedores saludables, HTTPS válido, nuevos endpoints privados devuelven 401 sin sesión. La consulta del controlador contra MongoDB de staging devolvió siete cuentas activas asignadas y rechazó otra organización con 403. Esta comprobación de datos no sustituye una prueba de extremo a extremo con sesión SSO en el navegador.

El archivo de datos es idéntico al respaldo previo por comparación SHA-256: 23 proveedores y 14 archivos de cobertura. No se crearon proveedores de prueba en staging.

Los manifests de Compose se obtuvieron de la configuración efectiva de los contenedores, conservando variables, red, volúmenes, nombres y opciones de ejecución. Contienen configuración privada; permanecen fuera del repositorio con permisos 0600 dentro de un directorio 0700. Los demás servicios se conservaron.

Reversión, desde el directorio de release en el host remoto:

```sh
docker compose -p app-hub-staging -f hub-rollback.json up -d --no-deps --no-build --wait api
docker compose -p link-partner-staging -f linkpartner-rollback.json up -d --no-deps --no-build --wait link-partner-api link-partner-web
```

La reversión de imágenes conserva los datos actuales. El respaldo de datos previo está en `/app/data/backups/pre-suppliers-20261013.json` dentro del volumen de Link Partner; no debe restaurarse automáticamente sobre escrituras posteriores.

## Guardado conjunto entre pestañas

Los formularios de la ficha se mantienen montados al cambiar de pestaña. Un único botón fijo `Guardar cambios` envía todas las secciones modificadas en una solicitud con `actions` y una versión esperada. La API valida permisos, datos e identidad antes de escribir; los cambios se aplican sobre una copia y se persisten juntos en una única versión. Cualquier error cancela el guardado completo y deja disponibles los borradores.

Al cerrar, abrir cobertura o salir del navegador con cambios pendientes se muestra una protección. Las revisiones externas de la ficha no reemplazan los campos que se están editando; si hay conflicto de versión, el usuario decide si descarta sus borradores y carga la versión actual.

Corrección publicada en staging con las imágenes `link-partner-api:suppliers-tabs-20261013` y `link-partner-web:suppliers-tabs-20261013`. Release: `/Users/gustavo.ferrer/link-partner-releases/suppliers-tabs-20261013`; reversión: `docker compose -p link-partner-staging -f rollback.json up -d --no-deps --no-build --wait link-partner-api link-partner-web`. Datos respaldados en `/app/data/backups/pre-tabs-20261013.json`.

Validación: 61 pruebas de API aprobadas, tipos y compilación correctos. Se verificó en el navegador local el guardado de requisitos, fechas, contrato y acciones desde tres pestañas, su persistencia al reabrir, el rechazo de formularios incompletos sin guardados parciales y la protección al cerrar. Los datos de staging permanecieron idénticos al respaldo durante la actualización.
