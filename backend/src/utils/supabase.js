const { createClient } = require('@supabase/supabase-js');

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) {
  throw new Error('Faltan SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en el archivo .env');
}

// Cliente con privilegios totales: SOLO se usa en el backend
const supabase = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});

module.exports = supabase;