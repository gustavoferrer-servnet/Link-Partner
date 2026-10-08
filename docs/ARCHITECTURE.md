# Arquitectura inicial de Link Partner

## Límite de responsabilidad

Application Hub administra identidad y acceso base. Link Partner administra su dominio y sus permisos internos. El único identificador compartido es `authUid`, equivalente al claim `sub` del access token.

```text
Application Hub
  └─ valida acceso al catálogo y abre la launch URL
      └─ Link Partner web
          └─ Authorization: Bearer <access token>
              └─ Link Partner API
                  ├─ valida firma, issuer y audience con JWKS de Keycloak
                  ├─ carga usuario interno por authUid
                  ├─ aplica rol y aislamiento por participantId
                  └─ accede al repositorio configurado (volumen persistente en staging o Firestore)
```

## Decisiones

- La SPA no accede directamente a Firestore. Las reglas niegan todo acceso cliente.
- El backend filtra datos externos por `participantId`; las vistas internas requieren roles internos.
- `AUTH_MODE=development` y `DATA_BACKEND=memory` solo sirven para desarrollo. El staging actual usa `DATA_BACKEND=file` sobre el volumen `link-partner-staging_data`; producción puede usar Firestore.
- Los KML/KMZ se convierten en el navegador a GeoJSON normalizado. Durante la conversión se conserva la ruta `Document > Folder > Placemark` como metadato de cada geometría, permitiendo encender o apagar carpetas y subcapas por proveedor. Si el archivo no incluye carpetas, el importador intenta agrupar por atributos comunes (`capa`, `categoría`, `tipo`, `red`, `tecnología`) y finalmente por tipo de geometría o `Cobertura general`.
- Un `Placemark` que contiene `MultiGeometry`, `MultiTrack` o varias geometrías directas se considera una capa lógica y su nombre se agrega a la ruta. Esto preserva archivos exportados por Google Earth donde capas como microonda o fibra son colecciones, no carpetas.
- Los `GroundOverlay` y las regiones de `NetworkLink` se excluyen de la cobertura vectorial: sus cajas geográficas son metadatos auxiliares o límites de una imagen/enlace, no polígonos de servicio. También se omiten elementos KML con `visibility=0`.
- La API admite varias coberturas por `supplierId`; cada archivo conserva un registro independiente. Volver a cargar el mismo `sourceFileName` actualiza ese archivo y un nombre distinto agrega otra cobertura. Cada registro persiste `sourceFileName`, `updatedAt` y `updatedBy`. Para recuperar nombres jerárquicos en una cobertura importada antes de esta funcionalidad es necesario volver a cargar su KML/KMZ original.
- El árbol agrupa las coberturas como `Proveedor > archivo KML/KMZ > carpetas y capas`, por lo que cada archivo y cada objeto mantienen un control de visibilidad dentro del mismo proveedor.
- El árbol de cobertura ordena siempre `Red Servnet` primero. Cada proveedor puede colapsarse sin modificar su estado de visibilidad y mantiene controles separados para encender o apagar el proveedor completo, sus carpetas y cada capa individual.
- `BOOTSTRAP_ADMIN_EMAILS` permite el primer acceso administrativo sin crear permisos globales en Application Hub; debe vaciarse cuando exista el primer usuario interno persistido.
- Los secretos solo se entregan al contenedor API mediante el entorno o identidad de carga de trabajo.

## Colecciones del MVP

Se conservan los nombres de la especificación: `participants`, `users`, `invitations`, `deals`, `proposals`, `contracts`, `pmo_deliveries`, `delivery_milestones`, `delivery_updates`, `sla_records`, `commission_records`, `suppliers`, `supplier_contracts`, `internal_ola`, `internal_costs`, `price_points`, `services`, `supplier_scorecards`, `supplier_incidents`, `coverage_layers` y `site_checks`.

La versión 0.1 implementa la frontera segura, el repositorio, el alta de proveedores, `supplier_coverages` y las primeras consultas de `users`, `deals`, `suppliers` y `pmo_deliveries`. Los siguientes verticales deben agregar comandos de adjudicación con bitácora inmutable.
