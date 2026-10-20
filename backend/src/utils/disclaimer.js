const supabase = require('./supabase');

const TEXTO_POR_DEFECTO = `Declaro que la información registrada en esta solicitud es veraz y completa, y que los viáticos solicitados se destinarán exclusivamente a los gastos de la comisión o actividad autorizada por la compañía.

Me comprometo a legalizar los gastos con soportes válidos dentro de los plazos establecidos en la política de la compañía y a reintegrar los valores que no sean legalizados, conforme a dicha política y a la ley.

Entiendo que el uso indebido de los recursos entregados puede dar lugar a las acciones previstas en las políticas internas de la compañía.`;

// Devuelve el disclaimer vigente de la compañía (personalizado o el modelo por defecto)
async function obtenerDisclaimer(tenantId) {
  const { data, error } = await supabase
    .from('tenant_settings')
    .select('disclaimer_viaticos')
    .eq('tenant_id', tenantId)
    .maybeSingle();
  if (error) throw error;
  const t = data?.disclaimer_viaticos?.trim();
  return { texto: t || TEXTO_POR_DEFECTO, personalizado: !!t };
}

module.exports = { obtenerDisclaimer, TEXTO_POR_DEFECTO };