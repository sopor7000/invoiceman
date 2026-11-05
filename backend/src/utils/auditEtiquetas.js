// Texto legible (español de Colombia) de cada acción que registra audit() en el backend.
// Las acciones SUPER_* no se incluyen: el visor de auditoría de la empresa nunca las muestra.
const ETIQUETAS = {
  // Sesión y cuenta
  LOGIN: 'Inicio de sesión',
  LOGIN_FALLIDO: 'Intento de inicio de sesión fallido',
  CAMBIO_CLAVE: 'Cambio de contraseña',
  ACEPTA_DATOS: 'Aceptación del tratamiento de datos',
  RECUPERACION_SOLICITADA: 'Solicitud de recuperación de contraseña',
  CLAVE_RESTABLECIDA: 'Contraseña restablecida por enlace',

  // Usuarios
  USUARIO_CREADO: 'Usuario creado',
  USUARIO_EDITADO: 'Usuario editado',
  USUARIO_RESET_CLAVE: 'Contraseña de usuario restablecida',
  USUARIOS_CARGA_MASIVA: 'Carga masiva de usuarios',

  // Configuración
  CONCEPTO_CREADO: 'Concepto creado',
  CONCEPTO_EDITADO: 'Concepto editado',
  AYUDA_CREADA: 'Contenido de ayuda creado',
  AYUDA_EDITADA: 'Contenido de ayuda editado',
  AYUDA_ELIMINADA: 'Contenido de ayuda eliminado',
  DIAN_CARGA: 'Carga de la base DIAN',
  INFO_ACTUALIZADA: 'Página de información actualizada',
  DISCLAIMER_VIATICOS_ACTUALIZADO: 'Aviso de viáticos actualizado',
  TOPE_VIATICOS_ACTUALIZADO: 'Tope de viáticos actualizado',

  // Legalizaciones
  LEGALIZACION_ELECTRONICA_APROBADA: 'Factura electrónica legalizada (aprobada)',
  LEGALIZACION_ELECTRONICA_DUPLICADA: 'Factura electrónica duplicada',
  LEGALIZACION_ELECTRONICA_NO_ENCONTRADA: 'Factura electrónica no encontrada en la base DIAN',
  LEGALIZACION_ELECTRONICA_NIT_NO_COINCIDE: 'Factura electrónica a nombre de otra compañía',
  LEGALIZACION_ELECTRONICA_CUFE_INVALIDO: 'Factura electrónica con CUFE inválido',
  LEGALIZACION_ELECTRONICA_CONCEPTO_INVALIDO: 'Factura electrónica con concepto inválido',
  LEGALIZACION_MANUAL_CREADA: 'Legalización manual creada',
  LEGALIZACION_EXTRANJERA_CREADA: 'Legalización de factura extranjera creada',
  LEGALIZACION_APROBADA: 'Legalización aprobada',
  LEGALIZACION_RECHAZADA: 'Legalización rechazada',
  SOPORTE_DESCARGADO: 'Soporte descargado',
  ESTADISTICAS_EXPORT: 'Exportación de estadísticas',

  // Viáticos
  VIATICO_CREADO: 'Solicitud de viáticos creada',
  VIATICO_APROBADO: 'Solicitud de viáticos aprobada',
  VIATICO_RECHAZADO: 'Solicitud de viáticos rechazada',
  VIATICO_PDF_DESCARGADO: 'Confirmación de viáticos descargada',

  // Plan
  PLAN_TRAMO_CAMBIADO: 'Cambio de tramo del plan',
  PLAN_COTIZACION_SOLICITADA: 'Solicitud de cotización (más de 500 usuarios)',
};

// Para acciones antiguas sin etiqueta: "ALGO_ASI" -> "Algo asi"
function etiqueta(accion) {
  if (ETIQUETAS[accion]) return ETIQUETAS[accion];
  const texto = String(accion || '').replace(/_/g, ' ').toLowerCase();
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

// Quita del detalle cualquier clave sensible (password, token, secret), en cualquier nivel
const SENSIBLE = /password|token|secret/i;
function sinSecretos(v) {
  if (Array.isArray(v)) return v.map(sinSecretos);
  if (v && typeof v === 'object') {
    return Object.fromEntries(
      Object.entries(v).filter(([k]) => !SENSIBLE.test(k)).map(([k, x]) => [k, sinSecretos(x)])
    );
  }
  return v;
}

module.exports = { ETIQUETAS, etiqueta, sinSecretos };
