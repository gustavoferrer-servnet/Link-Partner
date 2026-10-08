# Link Partner v1.1 — análisis de brechas e integración incremental

Fecha: 8 de octubre de 2026

## Resultado de la inspección

La versión previa ya resolvía autenticación OIDC con Application Hub, proveedores, carga persistente de múltiples KML/KMZ por proveedor, árbol de capas, consulta geográfica On Net/Near Net/Off Net y visualización de cobertura. La brecha crítica era Service Delivery: existía sólo como una tabla demostrativa sin persistencia, detalle, tareas, compromisos, auditoría ni cierres independientes.

## Integrado en v0.2.0

- ORG01–ORG04: identidad separada de Service Delivery y Customer Experience; autorización de escritura en backend para `internal_admin` y `delivery_manager`.
- DAT01–DAT04: proyecto, oportunidad/BO, línea de servicio, solicitud WSAS, objeto HubSpot y Servicio ID WSAS se almacenan por separado; el Servicio ID puede permanecer ausente.
- UI01–UI02: cartera filtrable por texto, flujo y calendario; detalle con Resumen, Actividades, Gantt, Desvíos, Documentos, Cierres, Auditoría y CFE condicional.
- FL01–FL05: actividades con código externo, etapa, área, responsable, estado operativo, cumplimiento, fechas, dependencias y evidencia. Cambiar una actividad no cambia automáticamente la etapa.
- SV01–SV02 y CFE01–CFE05: flujo Servnet separado; CFE sólo aparece cuando corresponde y admite múltiples rutas persistentes.
- CAL01–CAL04: línea base, compromiso vigente, pronóstico y entrega real separados. Toda reprogramación conserva fecha anterior, motivo, autor y momento.
- GAN01–GAN03: Gantt por actividad con línea base, estado de calendario, dependencias y responsables.
- DEV01–DEV03: múltiples riesgos, dependencias y bloqueos por proyecto, con impacto, acción, responsable, objetivo y estado.
- CL01–CL03: documentos por enlace seguro con tipo, autor y fecha; cierres técnico, monitoreo, facturación, administrativo, Customer Experience y tercero independientes.
- INT04–INT08: cola persistente de operaciones simuladas, reintento idempotente, preservación de avance local y auditoría. La UI identifica explícitamente que WSAS usa un adaptador simulado.
- RF-03: cobertura geoespacial ya implementada con múltiples KML/KMZ y clasificación por proveedor.
- RF-11 y RF-13: proyecto Delivery, tareas, dependencias, Gantt, baseline, bloqueos y bitácora persistente.
- AC01–AC12: el modelo y las acciones incluidas soportan identidad estable, separación de flujos, CFE condicional, historial de fechas, auditoría, cierres independientes, reintento sin duplicar y RBAC de escritura.

## Preparado pero pendiente de contratos externos

- INT01–INT03, INT05–INT07 y RF-02: requieren contrato real MCP de WSAS y autoridad de campos HubSpot/WSAS/Link Partner. No se anuncia sincronización productiva.
- RF-04–RF-08 y RF-12: RFP, portal carrier, extracción IA, benchmark, pricing y segunda ronda requieren reglas comerciales, formatos y permisos aprobados.
- RF-09–RF-10: API B2B y servidor MCP propio requieren identidad de partner, límites y contrato OpenAPI aprobados.
- Motor documental binario: la versión integrada admite enlaces y metadatos; almacenamiento de objetos, antivirus y retención están pendientes de decisión.
- Migración histórica: no se ejecuta sin alcance, conciliación e identificadores autorizados.

## Decisiones que continúan abiertas

Punto exacto de entrada desde WSAS, contrato MCP, flujo formal Servnet, equivalencias de la hoja histórica, calendarios y umbrales, traspaso a Customer Experience, propiedad de campos, definición final de KPIs, almacenamiento/retención, pricing, SLO y RPO/RTO.

Estas decisiones se muestran como configuración o estado pendiente; no se sustituyen por valores inventados.
