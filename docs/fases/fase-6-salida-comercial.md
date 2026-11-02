# Fase 6 (manual): salida comercial

Lista de tareas para ti, con tu asesor jurídico y tu contador. El agente puede ayudarte a redactar borradores o a generar archivos, pero las decisiones y los trámites son tuyos.

## 6.1 Dominio, HTTPS y correo

> Estado actual: se usa un dominio gratuito `.io` ya publicado en el VPS. Sirve para las pruebas y los primeros clientes, pero **antes de vender de forma seria** conviene un dominio propio: el correo con SPF/DKIM y el APK dependen de él. Cambiar de dominio obliga a generar otro APK y actualizar `APP_URL`.

- [ ] Compra el dominio y apunta los registros DNS a tu VPS.
- [ ] Configura el proxy del servidor para el dominio nuevo con certificado HTTPS (la cámara y el APK dependen de HTTPS).
- [ ] Actualiza las variables del servidor: `APP_URL` y, si usas pagos, `WOMPI_*`.
- [ ] **Correo transaccional:** elige proveedor, verifica el dominio (registros SPF y DKIM), configura `SMTP_*` y `MAIL_FROM`. Pide un enlace de recuperación con tu propio correo y comprueba que no llegue a spam.
- [ ] Actualiza el monitoreo de UptimeRobot con la nueva URL.

## 6.2 APK nuevo

La aplicación Android abre una dirección fija. Con el dominio nuevo hay que generar otro APK:

- [ ] Verifica que `/manifest.webmanifest`, `/sw.js` y `/.well-known/assetlinks.json` responden en el dominio nuevo.
- [ ] Genera el paquete con PWABuilder usando la **misma llave de firma** de la versión anterior (si no la guardaste, hay que empezar de nuevo con otra llave y reinstalar).
- [ ] Actualiza `assetlinks.json` con la huella de la llave y vuelve a desplegar.
- [ ] Prueba en un celular real: pantalla completa, cámara, descarga de PDF y subida de fotos.
- [ ] Guarda el APK y la llave de firma **fuera** del repositorio (respaldo privado).

## 6.3 Documentos legales (con tu asesor jurídico)

- [ ] Términos y condiciones del servicio (alcance, precio, renovación, suspensión por vencimiento, reembolsos).
- [ ] Política de tratamiento de datos personales y aviso de privacidad. Actualiza el texto de autorización de `Onboarding.jsx`.
- [ ] Contrato de transmisión de datos con cada cliente (el cliente es el responsable del tratamiento y tú el encargado). Pregunta si aplican obligaciones de registro de bases de datos.
- [ ] Qué ocurre con los datos al terminar el contrato (exportación y borrado) y por cuánto tiempo conservas la información.
- [ ] Alcance del servicio: InvoiceMan legaliza el gasto internamente y **no** emite documentos ante la DIAN.
- [ ] Texto del disclaimer de viáticos por defecto revisado.

## 6.4 Facturación a tus clientes (con tu contador)

- [ ] Confirma si estás obligado a facturar electrónicamente y cómo lo harás (facturador gratuito de la DIAN, proveedor tecnológico o propio). Mientras tanto, usa el registro de pagos de la fase 3B.
- [x] Decidido: los precios incluyen IVA (19 %). Confirma con tu contador el tratamiento en tu caso.
- [ ] Define el proceso: cobro por transferencia, registro del pago en el panel del superadmin, emisión de la factura y registro de su número.
- [ ] Datos de facturación de cada cliente (razón social, NIT, correo de facturación, dirección).

## 6.5 Operación

- [ ] Canal de soporte (correo o WhatsApp) y tiempos de respuesta.
- [ ] Guía de incorporación para un cliente nuevo: crear la empresa, primer administrador, cargar usuarios con la plantilla, cargar la base de la DIAN, configurar conceptos, topes y disclaimer.
- [ ] Plan de respaldo probado y alertas de monitoreo funcionando (fase 1).
- [ ] Procedimiento de incidentes: quién avisa a los clientes y cómo.

## 6.6 Demostración al cliente

Guion sugerido (20 a 30 minutos):

1. Inicio de sesión desde el celular con el APK.
2. Factura electrónica con cámara: aprobada automáticamente.
3. La misma factura por segunda vez: rechazo por duplicada.
4. Factura no encontrada: pantalla de ayuda cargada por el administrador.
5. Factura manual y del extranjero con aprobación en la bandeja.
6. Viáticos con topes, disclaimer y PDF de confirmación.
7. Estadísticas y descarga del Excel.
8. Configuración: usuarios masivos, conceptos, topes y políticas.

Prepara antes una empresa de demostración con datos ficticios, una base de la DIAN de ejemplo y los códigos QR correspondientes.

## 6.7 Lista final antes del primer cliente

- [ ] Todas las fases anteriores en producción y probadas.
- [ ] Contraseñas de prueba cambiadas.
- [ ] Empresa de prueba y datos ficticios retirados de producción (o desactivados).
- [ ] Contratos y documentos legales firmados.
- [ ] Respaldo restaurado con éxito al menos una vez.
