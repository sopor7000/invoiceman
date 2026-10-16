require('dotenv').config();

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const supabase = require('./utils/supabase');

const app = express();

// Necesario detrás de Render/Railway para que req.ip y el rate limit funcionen
app.set('trust proxy', 1);

const path = require('path');

app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        ...helmet.contentSecurityPolicy.getDefaultDirectives(),
        'img-src': ["'self'", 'data:', 'blob:'],
        'media-src': ["'self'", 'blob:', 'https://*.supabase.co'],
        'frame-src': ["'self'", 'https://*.supabase.co'],
        'worker-src': ["'self'", 'blob:'],
      },
    },
  })
);
app.use(
  cors({
    origin: (process.env.CORS_ORIGINS || '').split(',').map((s) => s.trim()),
    credentials: true,
  })
);
app.use(express.json({ limit: '1mb' }));
app.use(morgan('dev'));

// ---- Salud ----
app.get('/api/health', (_req, res) => {
  res.json({ ok: true, hora: new Date().toISOString() });
});

app.get('/api/health/db', async (_req, res) => {
  const { count, error } = await supabase
    .from('tenants')
    .select('*', { count: 'exact', head: true });
  if (error) return res.status(500).json({ ok: false, error: error.message });
  res.json({ ok: true, companias: count });
});

// ---- Rutas ----
app.use('/api/auth', require('./routes/auth'));
app.use('/api/super', require('./routes/super'));
app.use('/api/users', require('./routes/users'));
app.use('/api/concepts', require('./routes/concepts'));
app.use('/api/dian', require('./routes/dian'));
app.use('/api/help', require('./routes/help'));
app.use('/api/legalizations', require('./routes/legalizations'));
app.use('/api/notifications', require('./routes/notifications'));
app.use('/api/inbox', require('./routes/inbox'));
app.use('/api/viaticos', require('./routes/viaticos'));
app.use('/api/stats', require('./routes/stats'));
app.use('/api/settings', require('./routes/settings'));

// Rutas /api inexistentes
app.use('/api', (_req, res) => res.status(404).json({ error: 'Ruta no encontrada' }));

// Frontend compilado (React) servido por el mismo servidor
const dist = path.join(__dirname, '../../frontend/dist');
app.use(express.static(dist));
app.get(/^(?!\/api).*/, (_req, res) => res.sendFile(path.join(dist, 'index.html')));

app.use((err, _req, res, _next) => {
  let status = err.status || 500;
  let message = err.message || 'Error interno';
  let code = err.code;

  if (err.code === 'LIMIT_FILE_SIZE') {
    status = 413;
    message = 'El archivo supera el tamaño máximo permitido';
    code = 'ARCHIVO_GRANDE';
  } else if (err.name === 'MulterError') {
    status = 400;
    code = 'ARCHIVO_INVALIDO';
  }

  if (status >= 500) console.error(err);
  res.status(status).json({
    error: status >= 500 && process.env.NODE_ENV === 'production' ? 'Error interno' : message,
    code,
  });
});

const port = process.env.PORT || 4000;
app.listen(port, () => console.log(`API lista en http://localhost:${port}`));