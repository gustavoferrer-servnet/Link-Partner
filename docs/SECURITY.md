# Estado de seguridad de dependencias

Fecha de revisión: 5 de octubre de 2026.

`npm audit --omit=dev` reporta dos hallazgos moderados sobre `uuid@9.0.1`, introducido por `gaxios@6.7.1` dentro de `@google-cloud/storage`, dependencia transitiva de `firebase-admin@14.5.0`.

El advisory afecta las variantes UUID v3, v5 y v6 cuando reciben un buffer. La ruta instalada de `gaxios` solo usa `uuid.v4()` para generar el boundary multipart. No hay uso de las variantes afectadas en Link Partner. `npm audit fix` no puede elevar esa rama sin que Google publique una versión compatible nueva.

Acción: revisar este hallazgo al actualizar `firebase-admin` o `@google-cloud/storage`. No se aplicó un override forzado porque podría romper una dependencia de producción y el vector afectado no se usa.

No se detectaron vulnerabilidades críticas o altas en dependencias de producción.
