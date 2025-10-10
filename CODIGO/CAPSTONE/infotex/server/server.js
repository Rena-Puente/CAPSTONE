// server.js
import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import oracledb from 'oracledb';
import dotenv from 'dotenv';
dotenv.config();

// ==========================
// 🔧 Constantes
// ==========================
const REFRESH_COOKIE_NAME = 'refreshToken';
const REFRESH_COOKIE_OPTS = {
  httpOnly: true,
  sameSite: 'lax', // en prod: 'none' + secure:true (https)
  secure: false,   // en prod: true
  path: '/',       // ¡clave! debe coincidir al borrar
};

// ==========================
// 🔗 Conexión a Oracle
// ==========================
let pool;
async function initOracle() {
  try {
    pool = await oracledb.createPool({
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      connectString: process.env.DB_CONNECT_ALIAS,
      configDir: process.env.DB_WALLET_DIR,
      walletLocation: process.env.DB_WALLET_DIR,
      walletPassword: process.env.DB_WALLET_PASSWORD,
      poolMin: 1,
      poolMax: 5,
      poolIncrement: 1,
    });
    console.log('✅ Pool Oracle inicializado correctamente');
  } catch (err) {
    console.error('❌ Error al inicializar pool Oracle:', err);
  }
}
initOracle();

async function getConn() {
  return pool.getConnection();
}

// ==========================
// ⚙️ Express y CORS
// ==========================
const app = express();
app.use(express.json());
app.use(cookieParser());
app.use(
  cors({
    origin: ['http://localhost:4200'], // evita 127.0.0.1 si no lo usas
    credentials: true,
    allowedHeaders: ['Content-Type', 'Authorization'],
  })
);

// ==========================
// 🔒 Middleware: validar access token
// ==========================
async function authMiddleware(req, res, next) {
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  console.log('🧠 Authorization recibido:', auth);

  if (!token) {
    console.warn('⚠️ No se encontró token en Authorization header');
    return res.status(401).json({ error: 'Token requerido' });
  }

  let conn;
  try {
    conn = await getConn();
    const result = await conn.execute(
      `SELECT fn_validar_access(:t) AS OK FROM dual`,
      { t: token },
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );
    const ok = result.rows?.[0]?.OK;
    console.log('🔍 Resultado validación token:', ok);

    if (ok !== 1) return res.status(401).json({ error: 'Token inválido o expirado' });
    req.accessToken = token;
    next();
  } catch (e) {
    console.error('❌ Error validando token:', e);
    res.status(500).json({ error: 'Error validando token' });
  } finally {
    await conn?.close();
  }
}

// ==========================
// 🔐 LOGIN
// ==========================
app.post('/api/auth/login', async (req, res) => {
  // Sanea entradas (evita espacios invisibles)
  const rawEmail = (req.body?.email ?? '').toString();
  const rawPass = (req.body?.password ?? '').toString();
  const email = rawEmail.trim();
  const password = rawPass.trim();
  console.log('📥 Intento de login:', `"${email}"`, '(len:', email.length, ')');

  let conn;
  try {
    conn = await getConn();

    // 1) Valida usuario (TRIM por seguridad)
    const r = await conn.execute(
      `SELECT fn_login(TRIM(:correo), TRIM(:pw)) AS ID FROM dual`,
      { correo: email, pw: password },
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );
    const idUsuario = r.rows?.[0]?.ID ?? null;
    console.log('🔑 ID usuario obtenido:', idUsuario);

    if (!idUsuario) {
      console.warn('⚠️ Usuario o contraseña inválidos');
      return res.status(401).json({ error: 'Credenciales inválidas' });
    }

    // 2) Genera tokens con sp_emitir_sesion — bind por POSICIÓN
    // Firma:
    // (p_id_usuario, p_minutos_access, p_dias_refresh, p_ip, p_ua,
    //  o_access_token OUT, o_refresh_token OUT, o_expira_access OUT, o_expira_refresh OUT)
    const sqlEmitir = `BEGIN sp_emitir_sesion(:1,:2,:3,:4,:5,:6,:7,:8,:9); END;`;
    const bindsEmitir = [
      idUsuario, // :1
      15,        // :2 minutos access
      30,        // :3 días refresh
      null,      // :4 ip
      null,      // :5 ua
      { dir: oracledb.BIND_OUT, type: oracledb.STRING, maxSize: 4000 }, // :6 access
      { dir: oracledb.BIND_OUT, type: oracledb.STRING, maxSize: 4000 }, // :7 refresh
      { dir: oracledb.BIND_OUT, type: oracledb.DATE },                  // :8 expira access
      { dir: oracledb.BIND_OUT, type: oracledb.DATE },                  // :9 expira refresh
    ];
    const exec = await conn.execute(sqlEmitir, bindsEmitir);

    // outBinds trae SOLO los OUT en orden: access, refresh, expira_access, expira_refresh
    const accessToken = exec.outBinds[0];
    const refreshToken = exec.outBinds[1];
    const expiraAccess = exec.outBinds[2];
    const expiraRefresh = exec.outBinds[3];

    console.log('🪪 Tokens generados:', {
      access: accessToken ? accessToken.substring(0, 12) + '...' : accessToken,
      refresh: refreshToken ? refreshToken.substring(0, 12) + '...' : refreshToken,
    });

    if (!accessToken || !refreshToken) {
      console.error('❌ OUT inesperados desde sp_emitir_sesion:', exec.outBinds);
      return res.status(500).json({ error: 'No se recibieron tokens desde Oracle' });
    }

    // 3) Set cookie de refresh (usar las MISMAS opciones al borrar)
    res.cookie(REFRESH_COOKIE_NAME, refreshToken, { ...REFRESH_COOKIE_OPTS });

    // 4) Respuesta (el front usará el access en Authorization)
    return res.json({ ok: true, accessToken, expira: expiraAccess });
  } catch (err) {
    console.error('❌ Error en /api/auth/login:', err);
    return res.status(500).json({ error: 'Error en login' });
  } finally {
    await conn?.close();
  }
});

// ==========================
// 🔄 REFRESH TOKEN
// ==========================
app.post('/api/auth/refresh', async (req, res) => {
  const refreshToken = req.cookies?.[REFRESH_COOKIE_NAME];
  console.log('🧩 refreshToken recibido:', refreshToken);

  if (!refreshToken) return res.status(401).json({ error: 'Sin refresh token' });

  let conn;
  try {
    conn = await getConn();
    const out = {
      o_access_token: { dir: oracledb.BIND_OUT, type: oracledb.STRING, maxSize: 4000 },
      o_expira_access: { dir: oracledb.BIND_OUT, type: oracledb.DATE },
    };

    await conn.execute(
      `BEGIN sp_refrescar_access(:rt, :o_access_token, :o_expira_access); END;`,
      { rt: refreshToken, ...out }
    );

    console.log(
      '🔁 Nuevo access token generado:',
      out.o_access_token.val?.substring(0, 12) + '...'
    );

    return res.json({
      accessToken: out.o_access_token.val,
      expiraAccess: out.o_expira_access.val,
    });
  } catch (err) {
    console.error('❌ Error en /api/auth/refresh:', err);
    return res.status(401).json({ error: 'Refresh inválido' });
  } finally {
    await conn?.close();
  }
});

// ==========================
// 🧍 /ME (protegida)
// ==========================
app.get('/api/auth/me', authMiddleware, async (req, res) => {
  console.log('✅ Usuario autenticado con token válido');
  res.json({ ok: true, token: req.accessToken });
});

// ==========================
// 🚪 LOGOUT
// ==========================
app.post('/api/auth/logout', authMiddleware, async (req, res) => {
  console.log('🚪 Cierre de sesión iniciado');

  let conn;
  try {
    conn = await getConn();

    // Revocar access actual
    await conn.execute(`BEGIN sp_revocar_access(:t); END;`, { t: req.accessToken });

    // Revocar refresh (si existe)
    const rt = req.cookies?.[REFRESH_COOKIE_NAME];
    console.log('🧹 Revocando refresh token:', rt ? rt.substring(0, 12) + '...' : '(vacío)');
    if (rt) {
      await conn.execute(`BEGIN sp_revocar_refresh(:rt); END;`, { rt });
    }

    // Borrado de cookie (todas las variantes posibles)
    res.clearCookie(REFRESH_COOKIE_NAME, { ...REFRESH_COOKIE_OPTS }); // path '/'
    res.clearCookie(REFRESH_COOKIE_NAME, { ...REFRESH_COOKIE_OPTS, path: '/api' }); // por si quedó vieja

    // Refuerzo: set con expiración pasada
    res.cookie(REFRESH_COOKIE_NAME, '', { ...REFRESH_COOKIE_OPTS, expires: new Date(0) });
    res.cookie(REFRESH_COOKIE_NAME, '', {
      ...REFRESH_COOKIE_OPTS,
      path: '/api',
      expires: new Date(0),
    });

    return res.json({ ok: true });
  } catch (err) {
    console.error('❌ Error en /api/auth/logout:', err);
    return res.status(500).json({ error: 'Error en logout' });
  } finally {
    await conn?.close();
  }
});

// ==========================
// 🧭 Arranque del servidor
// ==========================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 API en http://localhost:${PORT}`));
