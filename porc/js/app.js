// CIFEAFARM · granja de porcino CIFEAPORC (integrada). Una sola granja real para los dos
// cursos (C.granjaPorcino); el acceso y la salida son los de CIFEAFARM.
(function () {
  'use strict';
  const L = window.Logica;
  const C = window.CONFIG;
  const sb = window.supabase.createClient(C.supabaseUrl, C.supabaseKey);

  // ---------------------------------------------------------------- estado
  const S = {
    sesion: null, perfil: null, granja: null, granjas: [],
    cerdas: [], verracos: [], eventos: [], porCerda: {}, cargado: null,
    perfiles: null, borrador: {}, nombres: {}, medicamentos: [], sanidad: [], extracciones: [], faltaSQL05: false, recuentos: [], faltaSQL06: false, movGrupos: [], censoMov: [], faltaSQL07: false, correcciones: [], faltaCorr: false, ultimaCopia: (() => { try { const x = localStorage.getItem('cife-ultima-copia'); return x ? new Date(x) : null; } catch (_) { return null; } })(),
  };
  const $app = document.getElementById('app');

  // ---------------------------------------------------------------- utilidades
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const fmt = (iso) => (iso ? iso.split('-').reverse().join('/') : '—');
  const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  const DIAS_SEM = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
  const corta = (iso) => (iso ? `${Number(iso.slice(8))} ${MESES[Number(iso.slice(5, 7)) - 1]}` : '—');
  const dos = (x) => String(x).padStart(2, '0');
  const fechaHora = (d) => `${dos(d.getDate())}/${dos(d.getMonth() + 1)}/${d.getFullYear()} · ${dos(d.getHours())}:${dos(d.getMinutes())}`;
  const hoy = () => L.hoyISO();
  const esProf = () => S.perfil && ['profesor', 'veterinario'].includes(S.perfil.rol); // profesor o veterinaria
  const esAdmin = () => S.perfil && S.perfil.rol === 'profesor';                       // solo el profesor
  const rolNombre = () => (S.perfil.rol === 'veterinario' ? 'Veterinaria' : S.perfil.rol === 'profesor' ? 'Profesor' : 'Alumno');
  const nombreGranja = (id) => (S.granjas.find((g) => g.id === id) || {}).nombre || `Granja ${id}`;
  const cerdaPorId = (id) => S.cerdas.find((c) => c.id === id);
  const verracoPorId = (id) => S.verracos.find((v) => v.id === id);
  const nombreVerraco = (d) => { const v = verracoPorId(d && d.verraco); return v ? v.crotal : (d && d.verraco_crotal) || 'no anotado'; };
  // "Juan G. (A07)" si hay nombre; si no, el alias.
  // La veterinaria no ve a los alumnos: «un alumno de 2.º» en lugar de su alias.
  const esVet = () => S.perfil && S.perfil.rol === 'veterinario';
  const aliasPersonal = () => new Set(Object.values(S.nombres).filter((p) => p.rol !== 'alumno' && p.alias).map((p) => p.alias).concat(S.perfil ? [S.perfil.alias] : []));
  const verAlias = (alias, cursoN) => (!esVet() || !alias || aliasPersonal().has(alias) ? alias : `un alumno${cursoN ? ` de ${cursoN}.º` : ''}`);
  const quienEs = (userId, alias) => { const p = S.nombres[userId];
    if (esVet() && (!p || p.rol === 'alumno')) return verAlias(alias, p && p.granja_id) || '?';
    return p && p.nombre ? `${p.nombre} (${p.alias})` : (alias || (p && p.alias) || '?'); };
  const yo = () => (S.perfil.nombre ? `${S.perfil.nombre} (${S.perfil.alias})` : S.perfil.alias);
  const faseNombre = (id) => (L.FASES.find((f) => f.id === id) || {}).nombre || id;

  function toast(msg) {
    const t = document.createElement('div');
    t.className = 'toast'; t.setAttribute('role', 'status'); t.textContent = msg;
    document.body.appendChild(t); setTimeout(() => t.remove(), 3200);
  }
  function traducirError(e) {
    const m = (e && (e.message || e.error_description)) || String(e);
    if (/Invalid login credentials/i.test(m)) return 'Alias, granja o PIN incorrectos.';
    if (/Failed to fetch|NetworkError|network/i.test(m)) return 'No hay conexión. Revisa la cobertura e inténtalo de nuevo.';
    if (/row-level security|permission denied/i.test(m)) return 'No tienes permiso para hacer esto (o han pasado más de 24 horas desde el registro).';
    if (/nombre/i.test(m) && /column|schema cache/i.test(m)) return 'Falta ejecutar en Supabase el archivo 04_nombres_alumnos.sql.';
    if (/duplicate key/i.test(m)) return 'Ya existe un registro con ese crotal o alias.';
    if (/already registered|already been registered|User already/i.test(m)) return 'Ese alias ya existe en ese curso.';
    if (/Email not confirmed/i.test(m)) return 'La cuenta no está confirmada: en Supabase hay que desactivar "Confirm email" (ver guía).';
    if (/email rate limit/i.test(m)) return 'Supabase está intentando enviar correos de confirmación: desactiva "Confirm email" en Authentication → Sign In / Providers → Email y vuelve a probar. (' + m + ')';
    if (/rate limit|too many/i.test(m)) return 'Demasiados intentos seguidos. Espera unos minutos y vuelve a probar. (' + m + ')';
    if (/Signups not allowed/i.test(m)) return 'El alta de usuarios está desactivada en Supabase (ver guía de puesta en marcha).';
    if (/Password should be/i.test(m)) return 'El PIN debe tener 6 cifras.';
    return m;
  }

  const ICONOS = {
    inicio: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 11l8-6 8 6v8H4z"/></svg>',
    cerdas: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 4h12v16H6zM9 9h6M9 13h6M9 17h3"/></svg>',
    verracos: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 3h6v4l3 3v11H6V10l3-3z"/></svg>',
    cuenta: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6"/></svg>',
    plano: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" aria-hidden="true"><path d="M3 4h18v16H3zM3 11h8M11 4v16M15 11h6"/></svg>',
    sanidad: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" aria-hidden="true"><path d="M9 3h6v6h6v6h-6v6H9v-6H3V9h6z"/></svg>',
    admin: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h10"/></svg>',
    mas: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>',
    atras: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg>',
  };

  // ---------------------------------------------------------------- datos
  async function cargarPerfil() {
    const uid = S.sesion.user.id;
    const { data, error } = await sb.from('perfiles').select('*').eq('user_id', uid).maybeSingle();
    if (error) throw error;
    S.perfil = data && data.activo ? data : null;
    if (!S.perfil) return;
    S.granja = C.granjaPorcino; // una sola granja real; el curso del alumno queda en su perfil
    if (S.perfil.rol === 'alumno') {
      const g = await sb.from('granjas').select('*').eq('id', S.perfil.granja_id).maybeSingle();
      if (!g.error && (!g.data || g.data.acceso === false)) { S.perfil = null; location.replace('../'); } // curso cerrado: el aviso lo da CIFEAFARM
    }
  }

  async function cargarDatos() {
    const [g, c, v, e] = await Promise.all([
      sb.from('granjas').select('*').order('id'),
      sb.from('cerdas').select('*').order('crotal'),
      sb.from('verracos').select('*').order('crotal'),
      sb.from('eventos').select('*').eq('granja_id', S.granja).order('fecha').order('creado'),
    ]);
    for (const r of [g, c, v, e]) if (r.error) throw r.error;
    S.granjas = g.data; S.cerdas = c.data; S.verracos = v.data; S.eventos = e.data;
    S.porCerda = {};
    for (const ev of S.eventos) (S.porCerda[ev.cerda_id] = S.porCerda[ev.cerda_id] || []).push(ev);
    // Sanidad, medicamentos y extracciones (SQL 05). Si aún no existen, la app sigue funcionando.
    S.faltaSQL05 = false;
    const opc = async (q) => { const r = await q; if (r.error) { if (/does not exist|schema cache|PGRST205|42P01/i.test(`${r.error.message} ${r.error.code}`)) { S.faltaSQL05 = true; return []; } throw r.error; } return r.data; };
    [S.medicamentos, S.sanidad, S.extracciones] = await Promise.all([
      opc(sb.from('medicamentos').select('*').order('nombre')),
      opc(sb.from('sanidad').select('*').eq('granja_id', S.granja).order('fecha').order('creado')),
      opc(sb.from('extracciones').select('*').eq('granja_id', S.granja).order('fecha').order('creado')),
    ]);
    // Catálogo común a todas las especies (se edita en la ficha de producto de CIFEAFARM).
    { const r = await sb.from('recuentos').select('*').eq('granja_id', S.granja).order('fecha').order('creado');
      S.faltaSQL06 = !!r.error; S.recuentos = r.error ? [] : r.data; }
    { const [m, h] = await Promise.all([
        sb.from('mov_grupos').select('*').eq('granja_id', S.granja).order('fecha').order('creado'),
        sb.from('censo_mov').select('*').order('creado', { ascending: false }).limit(60)]);
      S.faltaSQL07 = !!(m.error || h.error); S.movGrupos = m.error ? [] : m.data; S.censoMov = h.error ? [] : h.data; }
    if (esAdmin()) { const r = await sb.from('correcciones').select('*').order('creado', { ascending: false }).limit(300); S.faltaCorr = !!r.error; S.correcciones = r.error ? [] : r.data.filter((c) => !c.tabla.startsWith('rum_')); } // las de rumiantes, en CIFEARUMI
    // Nombres visibles (los de la propia granja y los profesores). Si la función
    // aún no existe en Supabase, la app sigue funcionando solo con alias.
    const nv = await sb.rpc('nombres_visibles');
    S.nombres = {};
    if (!nv.error && Array.isArray(nv.data)) for (const p of nv.data) S.nombres[p.user_id] = p;
    S.cargado = new Date();
  }

  async function cargarTodo() {
    await cargarPerfil();
    if (S.perfil) await cargarDatos();
  }

  async function refrescar(mostrar) {
    try { await cargarDatos(); render(); if (mostrar) toast('Datos actualizados'); }
    catch (e) { toast(traducirError(e)); }
  }

  const estadoDe = (id) => L.estadoCerda(S.porCerda[id] || []);
  const cerdasActivas = () => S.cerdas.filter((c) => !c.fecha_baja);
  const verracosActivos = () => S.verracos.filter((v) => !v.fecha_baja);

  // ---------------------------------------------------------------- maquetación
  function cabecera(o = {}) {
    const quien = esProf() ? `${rolNombre()} · ${esc(yo())}` : `${S.perfil.granja_id}.º curso · ${esc(yo())}`;
    const horas = `<div class="horas"><span>Consulta: <span id="hora-consulta">${fechaHora(new Date())}</span></span><span>Datos actualizados: ${S.cargado ? fechaHora(S.cargado) : '—'}</span></div>`;
    if (o.volver) {
      return `<header class="cab ${o.prof ? 'prof' : ''}">
        <div class="fila"><a class="volver" href="${o.volver}">${ICONOS.atras}${esc(o.textoVolver || 'Volver')}</a>
        <a href="../#/granjas" style="margin-left:auto;line-height:0" aria-label="Granjas del centro"><img class="logo" src="img/logo-mini.jpg" alt=""></a></div>
        <h1>${esc(o.titulo)}</h1>${o.sub ? `<div class="sub">${o.sub}</div>` : ''}
        <div class="quien peq" style="margin-top:4px">${quien}</div>${horas}</header>`;
    }
    return `<header class="cab ${o.prof ? 'prof' : ''}">
      <div class="fila"><a href="../#/granjas" style="line-height:0" aria-label="Granjas del centro"><img class="logo" src="img/logo-mini.jpg" alt=""></a>
        <div><div class="marca">CIFEAPORC</div><div class="quien">${quien}</div></div>
        <button class="refrescar" type="button" data-accion="refrescar" aria-label="Actualizar datos">Actualizar</button></div>
      ${horas}</header>`;
  }

  function navegacion(activa) {
    const items = [['inicio', 'Inicio'], ['cerdas', 'Cerdas'], ['verracos', 'Verracos'], ['sanidad', 'Sanidad']];
    if (esProf()) items.push(['admin', 'Gestión']);
    items.push(['cuenta', 'Cuenta']);
    return `<nav class="nav" aria-label="Secciones"><div class="dentro">${items.map(([id, t]) =>
      `<a href="#/${id}" class="${activa === id ? 'activo' : ''}" ${activa === id ? 'aria-current="page"' : ''}>${ICONOS[id]}${t}</a>`).join('')}</div></nav>`;
  }

  function pintar(html) { $app.className = ''; $app.innerHTML = html; window.scrollTo(0, 0); }

  // ---------------------------------------------------------------- acceso
  // El acceso es el de CIFEAFARM (misma sesión: mismo sitio y mismo proyecto de Supabase).
  function vistaAcceso() { location.replace('../'); }

  function vistaSinPerfil() {
    pintar(`<main class="acceso">
      <div class="foto logo"><img src="img/logo.jpg" alt="CIFEAPORC"></div>
      <div class="aviso-caja"><strong>Tu cuenta no tiene acceso.</strong><br>Puede que esté desactivada o que aún no tenga un perfil. Habla con tu profesor.</div>
      <button class="btn sec" type="button" data-accion="salir">Salir</button></main>`);
  }

  // ---------------------------------------------------------------- inicio
  function vistaInicio() {
    const h = hoy();
    const d = new Date();
    const lista = L.avisos(cerdasActivas(), S.porCerda, h);
    const recuento = {};
    for (const c of cerdasActivas()) { const f = estadoDe(c.id).fase; recuento[f] = (recuento[f] || 0) + 1; }
    const avSan = S.sanidad.length ? L.avisosSanidad(S.sanidad, h, destinoSan) : [];
    const avDosis = [];
    for (const x of S.extracciones) {
      const e = estadoExtraccion(x); const v = verracoPorId(x.verraco_id);
      if (e.estado === 'usar') avDosis.push({ v, x, titulo: `Dosis en día ${e.dia}`, detalle: `${v ? v.crotal : '?'} · extracción del ${corta(x.fecha)} · quedan ${e.restantes}`, nivel: 'urgente' });
      else if (e.estado === 'caducada' && e.restantes > 0 && e.dia <= L.REF.dosisCaduca + 2) avDosis.push({ v, x, titulo: 'Dosis caducadas: desechar', detalle: `${v ? v.crotal : '?'} · extracción del ${corta(x.fecha)} · ${e.restantes} sin usar`, nivel: 'urgente' });
    }
    // Lechones destetados que siguen en su paridera
    const Gp = L.cuentaGrupos(S.recuentos, movsGrupos());
    for (const [est, g] of Object.entries(Gp)) {
      if (!est.startsWith('Paridera') || g.n <= 0) continue;
      const desde = g.movs.filter((m) => m.destino === est).map((m) => m.fecha).sort().pop();
      avDosis.push({ enlace: `#/corral/parideras/${est.split(' ')[1]}`, etiqueta: 'Lechones', titulo: 'Destetados en la paridera', detalle: `${est.replace('Paridera ', 'Sala ').replace('-', ' · paridera ')}: ${g.n} lechones${desde ? ` desde hace ${L.dias(desde, h)} días` : ''} · pasar a lechonera`, nivel: 'proximo' });
    }
    // Correcciones de alumnos pendientes de revisar (solo el profesor)
    if (esAdmin() && S.correcciones.length) {
      const n = S.correcciones.filter((x) => !x.revisada).length;
      if (n) avDosis.unshift({ enlace: '#/correcciones', etiqueta: 'Profesor', titulo: `${n} ${n === 1 ? 'corrección' : 'correcciones'} de alumnos sin revisar`, detalle: 'Un alumno ha cambiado registros de otros', nivel: 'urgente' });
    }
    const tarjetasExtra = avSan.map((a) => `<a class="tarjeta enlace" href="#/sanidad/realizar/${a.sanidadId}"><div class="entre"><strong>${esc(a.titulo)}</strong><span class="chip ${a.nivel === 'urgente' ? 'nar' : ''}">${a.nivel === 'urgente' ? 'Hoy' : corta(a.fecha)}</span></div><div class="suave">${esc(a.detalle)}</div></a>`).join('')
      + avDosis.map((a) => `<a class="tarjeta enlace" href="${a.enlace || `#/verraco/${a.v ? a.v.id : ''}`}"><div class="entre"><strong>${esc(a.titulo)}</strong><span class="chip ${a.nivel === 'proximo' ? '' : 'nar'}">${a.etiqueta || 'Verraco'}</span></div><div class="suave">${esc(a.detalle)}</div></a>`).join('');
    const tarjetas = lista.map((a) => `
      <a class="tarjeta enlace" href="#/cerda/${a.cerdaId}">
        <div class="entre"><strong>${esc(a.titulo)}</strong><span class="chip ${a.nivel === 'urgente' ? 'nar' : ''}">${a.nivel === 'urgente' ? 'Hoy' : corta(a.fecha)}</span></div>
        <div class="suave">${esc(a.crotal)} · ${esc(a.detalle)}</div></a>`).join('');
    pintar(`${cabecera()}
      <main class="cuerpo">
        <div class="foto logo"><img src="img/logo.jpg" alt="Logotipo CIFEAPORC, chato murciano"></div>
        <div class="entre"><h1 style="font-size:22px">Hoy, ${DIAS_SEM[d.getDay()]} ${d.getDate()} ${MESES[d.getMonth()]}</h1>
          <span class="suave">${lista.length + avSan.length + avDosis.length} ${lista.length + avSan.length + avDosis.length === 1 ? 'aviso' : 'avisos'}</span></div>
        ${esProf() && (!S.ultimaCopia || Date.now() - S.ultimaCopia > 30 * 864e5) ? `<a class="tarjeta enlace" href="#/admin/granja" style="border-color:var(--naranja-borde)"><div class="entre"><strong>Haz una copia de seguridad</strong><span class="chip nar">Profesor</span></div><div class="suave">${S.ultimaCopia ? `La última es del ${fechaHora(S.ultimaCopia)}` : 'Aún no has descargado ninguna desde este dispositivo'} · Gestión → Granja</div></a>` : ''}
        ${tarjetasExtra}${tarjetas || (tarjetasExtra ? '' : '<div class="vacio">No hay avisos para hoy.</div>')}
        <div class="tarjeta"><h2>Cerdas por fase</h2>
          <div class="opciones">${L.FASES.map((f) => `<span class="chip ${recuento[f.id] ? '' : 'gris'}">${f.nombre}: ${recuento[f.id] || 0}</span>`).join('')}</div>
          ${S.cerdas.length === 0 ? `<div class="suave">Aún no hay cerdas en el censo.${esProf() ? ' Dalas de alta en Gestión.' : ''}</div>` : ''}</div>
        <a class="btn" href="#/cerdas">${ICONOS.mas}Registrar evento</a>
        <a class="btn sec" href="#/plano">${ICONOS.plano}Plano de la granja</a>
      </main>${navegacion('inicio')}`);
  }

  // ---------------------------------------------------------------- cerdas
  function vistaCerdas() {
    const filtro = S.borrador.filtro || '';
    const lista = cerdasActivas().filter((c) => !filtro ||
      [c.crotal, ...(c.otros_crotales || [])].some((x) => String(x).toLowerCase().includes(filtro.toLowerCase())));
    pintar(`${cabecera()}
      <main class="cuerpo">
        <div class="entre"><h1 style="font-size:22px">Cerdas</h1><span class="suave">${cerdasActivas().length} en el censo</span></div>
        <div class="botones"><a class="btn sec peq" href="#/plano">${ICONOS.plano}Ver en el plano</a><a class="btn sec peq" href="#/censo/cerda/nueva">${ICONOS.mas}Alta de cerda</a><a class="btn sec peq" href="#/censo/historial">Altas y bajas</a></div>
        <div class="campo"><input id="buscar" type="text" inputmode="search" aria-label="Buscar por crotal" placeholder="Buscar por crotal…" value="${esc(filtro)}"></div>
        <div class="lista">${lista.map((c) => {
          const e = estadoDe(c.id);
          return `<a class="cerda-fila" href="#/cerda/${c.id}"><div><strong>${esc(c.crotal)}</strong>
            <div class="suave">${esc(e.ubicacion || 'Sin ubicación')} · ${e.partos} ${e.partos === 1 ? 'parto' : 'partos'}</div></div>
            <span class="chip ${['inseminada', 'paridera'].includes(e.fase) ? 'nar' : ''}">${faseNombre(e.fase)}</span></a>`;
        }).join('') || '<div class="vacio">No hay cerdas que coincidan.</div>'}</div>
      </main>${navegacion('cerdas')}`);
    const b = document.getElementById('buscar');
    b.addEventListener('input', () => {
      S.borrador.filtro = b.value; const pos = b.selectionStart; vistaCerdas();
      const nb = document.getElementById('buscar'); nb.focus(); nb.setSelectionRange(pos, pos);
    });
  }

  // ---------------------------------------------------------------- ficha
  const ACCIONES = {
    vacia: ['ia', 'traslado', 'nota'],
    destetada: ['ia', 'traslado', 'nota'],
    inseminada: ['eco', 'ia', 'aborto', 'traslado', 'nota'],
    gestante: ['paridera', 'eco', 'parto', 'aborto', 'traslado', 'nota'],
    paridera: ['parto', 'aborto', 'traslado', 'nota'],
    lactante: ['destete', 'adopcion', 'baja_lechones', 'traslado', 'nota'],
  };

  // Cualquiera corrige cualquier registro (si es de otro alumno, el profesor lo ve en Correcciones).
  // Borrar: lo suyo durante 24 h; lo demás, el profesor.
  function puedeEditar(e) {
    if (esProf()) return true;
    return e.autor === S.sesion.user.id && (Date.now() - new Date(e.creado).getTime()) < 864e5;
  }
  const puedeCorregir = () => true;
  const esAjeno = (r) => !esProf() && r && r.autor !== S.sesion.user.id;
  const avisoAjeno = (r) => (esAjeno(r) ? `<div class="aviso-caja"><strong>Vas a corregir un registro de ${esc(quienEs(r.autor, r.autor_alias))}.</strong> Quedará tu nombre y el profesor verá lo que cambias.</div>` : '');

  function resumenEvento(e) {
    const d = e.datos || {};
    const T = TIPOS[e.tipo];
    switch (e.tipo) {
      case 'ia': { const x = d.extraccion && S.extracciones.find((e) => e.id === d.extraccion); return `Verraco ${esc(nombreVerraco(d))}${x ? ` · dosis del ${corta(x.fecha)}` : ''}`; }
      case 'eco': return `Resultado: ${esc(d.resultado)}`;
      case 'paridera': return `Sala ${esc(d.sala)} · paridera ${esc(d.plaza)}`;
      case 'parto': { const ss = d.vivos_ss !== undefined; return `Vivos ${(+d.vivos_h || 0) + (+d.vivos_m || 0) + (+d.vivos_ss || 0)}${ss ? '' : ` (${+d.vivos_h || 0} H, ${+d.vivos_m || 0} M)`} · muertos ${(+d.muertos_h || 0) + (+d.muertos_m || 0) + (+d.muertos_ss || 0)}${ss ? '' : ` · momias ${+d.momificados || 0}`}`; }
      case 'adopcion': return `${d.sentido === 'entra' ? 'Recibe' : 'Cede'} ${esc(d.numero)} lechones ${d.sentido === 'entra' ? 'de' : 'a'} ${esc(d.otra_crotal || '?')}`;
      case 'baja_lechones': return `${esc(d.numero)} lechones · ${esc(d.causa === 'Otros' ? d.causa_otra || 'Otros' : d.causa)}`;
      case 'destete': return d.destetados_ss !== undefined ? `Destetados ${+d.destetados_ss || 0}` : `Destetados ${(+d.destetados_h || 0) + (+d.destetados_m || 0)} (${+d.destetados_h || 0} H, ${+d.destetados_m || 0} M) · lechonera ${esc(d.lechonera)}`;
      case 'traslado': return esc(d.ubicacion || '');
      case 'aborto': return 'Fin de la gestación sin parto';
      case 'nota': return esc(d.texto || '');
      default: return T ? T.nombre : e.tipo;
    }
  }

  function vistaFicha(id) {
    const c = cerdaPorId(id);
    if (!c) return vistaNoEncontrado();
    const est = estadoDe(id);
    const cur = est.actual;
    const f = L.fechasCiclo(cur);
    const h = hoy();
    const idx = L.FASES.findIndex((x) => x.id === est.fase);

    let fechas = '';
    const sinEco = est.fase === 'inseminada' && f.ia && cur.ecos.length === 0 && L.dias(f.ia, h) >= L.REF.sinEcoDias;
    if (sinEco) fechas = `<div class="aviso-caja"><strong>Sin ecografía registrada</strong> · día ${L.dias(f.ia, h)} tras la IA. Registra la ecografía o, si ha repetido, una nueva inseminación.</div>` + datoPar('Entrada en paridera', corta(f.paridera), `IA + ${L.REF.paridera} días`, true, 'Parto probable', corta(f.parto), 'IA + 114 días');
    else if (est.fase === 'inseminada' && f.ia) fechas = datoPar('Ecografía', corta(f.ecoIdeal), `Desde el día 19 (${corta(f.ecoDesde)})`, true, 'Parto probable', corta(f.parto), 'IA + 114 días');
    else if (est.fase === 'gestante' && f.ia) fechas = datoPar('Entrada en paridera', corta(f.paridera), `IA + ${L.REF.paridera} días`, true, 'Parto probable', corta(f.parto), 'IA + 114 días');
    else if (est.fase === 'paridera' && f.ia) fechas = datoPar('Parto probable', corta(f.parto), (() => { const x = L.dias(h, f.parto); return x > 1 ? `Faltan ${x} días` : x === 1 ? 'Mañana' : x === 0 ? 'Hoy' : `Pasado ${-x} ${x === -1 ? 'día' : 'días'}`; })(), true, 'Ubicación', esc(est.ubicacion || '—').replace('Partos · ', ''), '');
    else if (est.fase === 'lactante' && cur && cur.parto) {
      const cm = L.camada(cur);
      fechas = datoPar('Destete previsto', corta(L.sumarDias(cur.parto.fecha, L.REF.lactacion)), `${L.dias(cur.parto.fecha, h)} días de lactación`, true, 'Lechones ahora', String(cm.actuales), `${cm.vivos} vivos${cm.entran ? ` +${cm.entran}` : ''}${cm.salen ? ` −${cm.salen}` : ''}${cm.bajas ? ` −${cm.bajas} bajas` : ''}`);
    } else if (est.fase === 'destetada' && est.ultimoDestete) {
      const dd = L.dias(est.ultimoDestete.fecha, h);
      fechas = `<div class="${dd > L.REF.idcMax ? 'aviso-caja' : 'ok-caja'}">Destetada hace ${dd} días · cubrición de referencia a los ${L.REF.idcMin}–${L.REF.idcMax} días.</div>`;
    } else fechas = '<div class="vacio">Pendiente de detectar celo.</div>';

    const acciones = (ACCIONES[est.fase] || ACCIONES.vacia);
    const [principal, ...resto] = acciones;

    const eventos = (S.porCerda[id] || []).slice().reverse();
    const tarjetaEvento = (e) => `
      <div class="evento"><div class="entre"><strong>${esc(TIPOS[e.tipo] ? TIPOS[e.tipo].nombre : e.tipo)}</strong><span class="suave">${fmt(e.fecha)}</span></div>
        <div>${resumenEvento(e)}</div>
        ${e.datos && e.datos.obs ? `<div class="suave">${esc(e.datos.obs)}</div>` : ''}
        <div class="suave peq">${e.datos && e.datos.origen === 'historico' ? 'Importado de las fichas anteriores' : `Por ${esc(quienEs(e.autor, e.autor_alias))}`}${e.modificado ? ` · corregido por ${esc(verAlias(e.modificado_por) || '?')}` : ''}</div>
        ${e.tipo !== 'adopcion' || puedeEditar(e) ? `<div class="acciones">${e.tipo !== 'adopcion' ? `<a class="btn sec peq" href="#/registrar/${id}/${e.tipo}/${e.id}">Corregir</a>` : ''}
          ${puedeEditar(e) ? `<button class="btn peligro peq" type="button" data-borrar="${e.id}">Borrar</button>` : ''}</div>` : ''}
      </div>`;
    const historial = eventos.slice(0, 8).map(tarjetaEvento).join('') + (eventos.length > 8
      ? `<details><summary class="suave" style="min-height:44px;display:flex;align-items:center">Ver ${eventos.length - 8} registros anteriores</summary>${eventos.slice(8).map(tarjetaEvento).join('')}</details>` : '');

    const conParto = est.ciclos.filter((x) => x.parto).reverse();
    const partos = conParto.map((x) => {
      const cm = L.camada(x); const ix = L.indicesCiclo(x);
      const dest = cm.destetados;
      return `<tr><td><strong>${x.numParto}.º</strong></td><td>${x.parto.fecha.slice(8)}/${x.parto.fecha.slice(5, 7)}/${x.parto.fecha.slice(2, 4)}</td><td>${cm.vivos} / ${cm.muertos} / ${cm.momias}</td>
        <td>${dest === null ? '—' : `<span class="chip ${dest < L.REF.destetadosMin || dest > L.REF.destetadosMax ? 'nar' : ''}">${dest}</span>`}</td>
        <td>${ix.gestacion ?? '—'}</td><td>${ix.lactacion ?? '—'}</td></tr>`;
    }).join('');
    const repeticiones = est.ciclos.filter((x) => x.cierre === 'repeticion' || x.cierre === 'eco_negativa').length;
    const abortos = est.ciclos.filter((x) => x.cierre === 'aborto').length;

    pintar(`${cabecera({ volver: '#/cerdas', textoVolver: 'Cerdas', titulo: c.crotal, sub: `${esc(c.raza)} · ${est.partos} ${est.partos === 1 ? 'parto' : 'partos'} · <strong>${faseNombre(est.fase)}${est.ubicacion ? ` · ${esc(est.ubicacion)}` : ''}</strong>` })}
      <main class="cuerpo">
        <div class="foto"><img src="img/hembra.jpg" alt="Cerda chata murciana"></div>
        <section class="tarjeta" aria-label="Fase del ciclo"><div class="suave peq" style="font-weight:700">FASE DEL CICLO</div>
          <div class="ciclo">${L.FASES.map((x, i) => `<div class="${i < idx ? 'hecho' : i === idx ? 'ahora' : ''}"><i></i>${x.nombre.replace('Inseminada', 'Insemi\u00ADnada')}</div>`).join('')}</div></section>
        ${fechas}
        <a class="btn" href="#/registrar/${id}/${principal}">${ICONOS.mas}${esc(TIPOS[principal].nombre)}</a>
        <div class="botones">${resto.map((t) => `<a class="btn sec peq" href="#/registrar/${id}/${t}">${esc(TIPOS[t].nombre)}</a>`).join('')}<a class="btn sec peq" href="#/sanidad/nuevo/cerda/${id}">${ICONOS.sanidad}Sanidad / manejo</a><a class="btn sec peq" href="#/censo/cerda/${id}">${esProf() ? 'Datos / baja' : 'Dar de baja'}</a></div>
        ${(() => { const sup = enSupresion((r) => r.cerda_id === id); return sup.length ? `<div class="aviso-caja"><strong>En periodo de supresión</strong> hasta el ${fmt(sup.map((r) => r.supresion_hasta).sort().pop())} (${esc(sup.map((r) => `${r.producto} · ${destinoSan(r)}`).join('; '))})</div>` : ''; })()}
        ${cur && cur.ia ? `<section class="tarjeta"><h2>Ciclo actual</h2><div class="filas">
          <div><span>Inseminación</span><span>${fmt(cur.ia.fecha)} · ${esc(nombreVerraco(cur.ia.datos))}</span></div>
          ${cur.ecos.map((e) => `<div><span>Ecografía</span><span>${fmt(e.fecha)} · ${esc(e.datos.resultado)}</span></div>`).join('')}
          ${cur.paridera ? `<div><span>Entrada en paridera</span><span>${fmt(cur.paridera.fecha)}</span></div>` : ''}
          ${cur.parto ? `<div><span>Parto</span><span>${fmt(cur.parto.fecha)}</span></div>` : ''}</div></section>` : ''}
        <section class="tarjeta"><h2>Partos</h2>
          ${partos ? `<table class="tabla"><thead><tr><th>N.º</th><th>Fecha</th><th>Vivos / muertos / momias</th><th>Destet.</th><th>Gest.</th><th>Lact.</th></tr></thead><tbody>${partos}</tbody></table>
            <div class="suave peq">Referencia: ${L.REF.destetadosMin}–${L.REF.destetadosMax} destetados por camada · gestación ${L.REF.gestacion} d · lactación ${L.REF.lactacion} d${repeticiones ? ` · ${repeticiones} ${repeticiones === 1 ? 'repetición' : 'repeticiones'}` : ''}${abortos ? ` · ${abortos} ${abortos === 1 ? 'aborto' : 'abortos'}` : ''}</div>`
            : '<div class="suave">Sin partos registrados.</div>'}</section>
        ${seccionSanidad((r) => r.cerda_id === id, `#/sanidad/nuevo/cerda/${id}`)}
        <section class="tarjeta"><h2>Historial</h2>${historial || '<div class="suave">Sin eventos registrados.</div>'}</section>
        <section class="tarjeta"><h2>Datos fijos</h2><div class="filas">
          <div><span>Crotales</span><span>${esc([c.crotal, ...(c.otros_crotales || [])].join(' · '))}</span></div>
          <div><span>Raza</span><span>${esc(c.raza)}</span></div>
          <div><span>Nacimiento</span><span>${fmt(c.fecha_nacimiento)}</span></div>
          <div><span>Entrada en granja</span><span>${fmt(c.fecha_entrada)}</span></div>
          ${c.origen ? `<div><span>Procedencia</span><span>${esc(c.origen)}</span></div>` : ''}</div></section>
      </main>${navegacion('cerdas')}`);

    $app.querySelectorAll('[data-borrar]').forEach((b) => b.addEventListener('click', () => confirmarBorrado(b, id)));
  }

  function datoPar(et1, v1, n1, nar, et2, v2, n2) {
    return `<div class="dos"><div class="dato ${nar ? 'nar' : ''}"><span class="et">${et1}</span><span class="val">${v1}</span><span class="nota">${n1}</span></div>
      <div class="dato"><span class="et">${et2}</span><span class="val">${v2}</span><span class="nota">${n2}</span></div></div>`;
  }

  function confirmarBorrado(boton, cerdaId) {
    if (boton.dataset.confirmar !== '1') {
      boton.dataset.confirmar = '1'; boton.textContent = '¿Seguro? Pulsa otra vez'; return;
    }
    const e = S.eventos.find((x) => x.id === boton.dataset.borrar);
    boton.disabled = true;
    (async () => {
      let q = sb.from('eventos').delete();
      q = e && e.tipo === 'adopcion' && e.datos.vinculo ? q.eq('granja_id', S.granja).eq('datos->>vinculo', e.datos.vinculo) : q.eq('id', boton.dataset.borrar);
      const { error } = await q;
      if (error) { toast(traducirError(error)); boton.disabled = false; return; }
      toast('Registro borrado');
      await refrescar(); location.hash = `#/cerda/${cerdaId}`;
    })();
  }

  // ---------------------------------------------------------------- formularios de eventos
  const rango = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => String(a + i));
  const F = {
    fecha: { n: 'fecha', t: 'date', l: 'Fecha' },
    obs: { n: 'obs', t: 'textarea', l: 'Observaciones', opcional: true },
  };
  const TIPOS = {
    ia: {
      nombre: 'Inseminación',
      ayuda: 'Fecha de la 1.ª inseminación (la de detección del celo). La 2.ª dosis se da por hecha al día siguiente con el mismo verraco.',
      campos: [F.fecha, { n: 'jaula', t: 'select', l: 'Jaula de implantación', op: [['', 'Sin indicar'], ...rango(1, 10)] }, { n: 'verraco', t: 'verraco', l: 'Verraco' }, { n: 'extraccion', t: 'extraccion', l: 'Dosis de la extracción', si: (v) => !!v.verraco }, F.obs],
      ubicacion: (v) => (v.jaula ? `Implantación · jaula ${v.jaula}` : 'Implantación'),
    },
    eco: {
      nombre: 'Ecografía',
      ayuda: 'A partir del día 19 tras la IA; mejor el día 21. Si es dudosa, se repite al día siguiente. Con positiva puede quedarse unos días en implantación y repetir la ecografía; después, Traslado a gestación.',
      campos: [F.fecha,
        { n: 'resultado', t: 'radio', l: 'Resultado', op: [['positiva', 'Positiva +'], ['negativa', 'Negativa −'], ['dudosa', 'Dudosa ?']] },
        { n: 'parque', t: 'select', l: 'La cerda', op: [...rango(1, 4).map((k) => [k, `Pasa al parque de gestación ${k}`]), ['', 'Se queda donde está (de momento)']], si: (v) => v.resultado === 'positiva' },
        { n: 'parque_v', t: 'select', l: 'Vuelve al parque de vacías', op: rango(1, 2), si: (v) => v.resultado === 'negativa' },
        F.obs],
      ubicacion: (v) => (v.resultado === 'positiva' ? (v.parque ? `Gestación · parque ${v.parque}` : null) : v.resultado === 'negativa' ? `Vacías · parque ${v.parque_v}` : null),
    },
    paridera: {
      nombre: 'Entrada en paridera',
      ayuda: `Prevista a los ${L.REF.paridera} días de la IA. Indica la sala y la paridera reales.`,
      campos: [F.fecha, { n: 'sala', t: 'select', l: 'Sala de partos', op: rango(1, 3) }, { n: 'plaza', t: 'select', l: 'Paridera', op: rango(1, 6) }, F.obs],
      ubicacion: (v) => `Partos · sala ${v.sala} · paridera ${v.plaza}`,
    },
    parto: {
      nombre: 'Parto',
      campos: [F.fecha,
        { grupo: 'Nacidos vivos', campos: [{ n: 'vivos_h', t: 'contador', l: 'Hembras' }, { n: 'vivos_m', t: 'contador', l: 'Machos' }] },
        { grupo: 'Nacidos muertos', campos: [{ n: 'muertos_h', t: 'contador', l: 'Hembras' }, { n: 'muertos_m', t: 'contador', l: 'Machos' }, { n: 'momificados', t: 'contador', l: 'Momificados' }] },
        F.obs],
      ubicacion: () => null,
    },
    adopcion: {
      nombre: 'Adopción',
      ayuda: 'Se anota a la vez en todas las cerdas implicadas. Puede recibir y ceder lechones el mismo día; deja a 0 lo que no ocurra.',
      campos: [F.fecha,
        { grupo: 'Recibe lechones', campos: [{ n: 'recibe_num', t: 'contador', l: 'Número' }, { n: 'recibe_de', t: 'lactante', l: 'De la cerda', si: (v) => +v.recibe_num > 0 }] },
        { grupo: 'Cede lechones', campos: [{ n: 'cede_num', t: 'contador', l: 'Número' }, { n: 'cede_a', t: 'lactante', l: 'A la cerda', si: (v) => +v.cede_num > 0 }] },
        F.obs],
      ubicacion: () => null,
    },
    baja_lechones: {
      nombre: 'Baja de lechones',
      campos: [F.fecha, { n: 'numero', t: 'contador', l: 'Número de lechones' },
        { n: 'causa', t: 'select', l: 'Causa', op: [['', 'Elige…'], ...L.CAUSAS_BAJA.map((x) => [x, x])] },
        { n: 'causa_otra', t: 'text', l: 'Escribe la causa', si: (v) => v.causa === 'Otros' }, F.obs],
      ubicacion: () => null,
    },
    destete: {
      nombre: 'Destete',
      ayuda: 'Referencia: 30 días de lactación y 7–9 destetados por camada. Los lechones pueden quedarse unos días en la paridera y pasar después a la lechonera desde el plano.',
      campos: [F.fecha,
        { grupo: 'Lechones destetados', campos: [{ n: 'destetados_h', t: 'contador', l: 'Hembras' }, { n: 'destetados_m', t: 'contador', l: 'Machos' }] },
        { n: 'lechonera', t: 'select', l: 'Los lechones van a', op: [...rango(1, 4).map((k) => [k, `Lechonera ${k}`]), ['paridera', 'Se quedan en la paridera (de momento)']] },
        { n: 'parque_v', t: 'select', l: 'La madre pasa al parque de vacías', op: rango(1, 2) },
        F.obs],
      ubicacion: (v) => `Vacías · parque ${v.parque_v}`,
    },
    traslado: {
      nombre: 'Traslado',
      campos: [F.fecha,
        { n: 'zona', t: 'select', l: 'Zona', op: [['Vacías', 'Parque de vacías'], ['Implantación', 'Sala de implantación'], ['Gestación', 'Parque de gestación'], ['Partos', 'Sala de partos']] },
        { n: 'sala', t: 'select', l: 'Sala de partos', op: rango(1, 3), si: (v) => v.zona === 'Partos' },
        { n: 'plaza', t: 'select', l: 'Paridera', op: rango(1, 6), si: (v) => v.zona === 'Partos' },
        { n: 'parque', t: 'select', l: 'Parque', op: rango(1, 2), si: (v) => v.zona === 'Vacías' },
        { n: 'parque_g', t: 'select', l: 'Parque', op: rango(1, 4), si: (v) => v.zona === 'Gestación' },
        { n: 'jaula', t: 'select', l: 'Jaula', op: [['', 'Sin indicar'], ...rango(1, 10)], si: (v) => v.zona === 'Implantación' },
        F.obs],
      ubicacion: (v) => (v.zona === 'Vacías' ? `Vacías · parque ${v.parque}` : v.zona === 'Gestación' ? `Gestación · parque ${v.parque_g}` : v.zona === 'Partos' ? `Partos · sala ${v.sala} · paridera ${v.plaza}` : v.jaula ? `Implantación · jaula ${v.jaula}` : 'Implantación'),
    },
    aborto: {
      nombre: 'Aborto',
      ayuda: 'Cierra la gestación sin parto. La cerda vuelve a vacías hasta detectar celo.',
      campos: [F.fecha, { n: 'parque_v', t: 'select', l: 'Pasa al parque de vacías', op: rango(1, 2) }, F.obs],
      ubicacion: (v) => `Vacías · parque ${v.parque_v}`,
    },
    nota: { nombre: 'Nota', campos: [F.fecha, { n: 'texto', t: 'textarea', l: 'Nota' }], ubicacion: () => null },
  };

  function valoresIniciales(tipo, evento) {
    const v = { fecha: hoy() };
    const recorrer = (cs) => cs.forEach((c) => {
      if (c.grupo) return recorrer(c.campos);
      if (c.t === 'contador') v[c.n] = '0';
      else if (c.t === 'select') v[c.n] = Array.isArray(c.op[0]) ? c.op[0][0] : c.op[0];
      else if (c.t === 'radio') v[c.n] = c.defecto ?? '';
      else if (c.t !== 'date') v[c.n] = '';
    });
    recorrer(TIPOS[tipo].campos);
    if (evento) { Object.assign(v, evento.datos || {}); v.fecha = evento.fecha; }
    return v;
  }

  function campoHTML(c, v, cerdaId) {
    if (c.grupo) return `<fieldset><legend>${esc(c.grupo)}</legend>${c.campos.map((x) => campoHTML(x, v, cerdaId)).join('')}</fieldset>`;
    if (c.si && !c.si(v)) return '';
    const id = `c-${c.n}`;
    const val = v[c.n] ?? '';
    switch (c.t) {
      case 'date': return `<div class="campo"><label for="${id}">${c.l}</label><input id="${id}" name="${c.n}" type="date" value="${esc(val)}" max="${L.sumarDias(hoy(), 1)}" required></div>`;
      case 'text': return `<div class="campo"><label for="${id}">${c.l}</label><input id="${id}" name="${c.n}" type="text" value="${esc(val)}"></div>`;
      case 'textarea': return `<div class="campo"><label for="${id}">${c.l}${c.opcional ? ' <span class="suave">(opcional)</span>' : ''}</label><textarea id="${id}" name="${c.n}">${esc(val)}</textarea></div>`;
      case 'select': return `<div class="campo"><label for="${id}">${c.l}</label><select id="${id}" name="${c.n}">${c.op.map((o) => {
        const [k, t] = Array.isArray(o) ? o : [o, o];
        return `<option value="${esc(k)}" ${String(val) === String(k) ? 'selected' : ''}>${esc(t)}</option>`;
      }).join('')}</select></div>`;
      case 'radio': return `<div class="campo"><span class="et" id="et-${id}">${c.l}</span><div class="opciones" role="radiogroup" aria-labelledby="et-${id}">${c.op.map(([k, t]) =>
        `<label><input type="radio" name="${c.n}" value="${esc(k)}" ${val === k ? 'checked' : ''}> ${esc(t)}</label>`).join('')}</div></div>`;
      case 'contador': return `<div class="contador"><label for="${id}">${c.l}</label><div class="ctl">
        <button type="button" data-paso="-1" data-campo="${c.n}" aria-label="Restar ${esc(c.l)}">−</button>
        <input id="${id}" name="${c.n}" type="number" inputmode="numeric" min="0" step="1" value="${esc(val)}">
        <button type="button" data-paso="1" data-campo="${c.n}" aria-label="Sumar ${esc(c.l)}">+</button></div></div>`;
      case 'verraco': {
        const vs = verracosActivos();
        if (!vs.length) return '<div class="aviso-caja">No hay verracos en el censo. El profesor debe darlos de alta en Gestión.</div>';
        return `<div class="campo"><label for="${id}">${c.l}</label><select id="${id}" name="${c.n}"><option value="">Elige…</option>${vs.map((x) =>
          `<option value="${x.id}" ${val === x.id ? 'selected' : ''}>${esc(x.crotal)}${x.verraquera ? ` · verraquera ${x.verraquera}` : ''}</option>`).join('')}</select></div>`;
      }
      case 'extraccion': {
        const exts = S.extracciones.filter((x) => x.verraco_id === v.verraco).slice().reverse()
          .map((x) => ({ x, e: estadoExtraccion(x) })).filter(({ x, e }) => x.id === val || (e.estado !== 'caducada' && e.estado !== 'agotada'));
        return `<div class="campo"><label for="${id}">${c.l} <span class="suave">(opcional)</span></label><select id="${id}" name="${c.n}"><option value="">Sin indicar</option>${exts.map(({ x, e }) =>
          `<option value="${x.id}" ${val === x.id ? 'selected' : ''}>${corta(x.fecha)} · día ${e.dia} · quedan ${e.restantes}${e.estado === 'usar' ? ' · usar ya' : ''}</option>`).join('')}</select>
          ${exts.length ? '' : '<span class="ayuda">No hay extracciones válidas de este verraco registradas.</span>'}</div>`;
      }
      case 'lactante': {
        const otras = cerdasActivas().filter((x) => x.id !== cerdaId && estadoDe(x.id).fase === 'lactante');
        if (!otras.length) return '<div class="aviso-caja">No hay otra cerda lactante con la que hacer la adopción.</div>';
        return `<div class="campo"><label for="${id}">${c.l}</label><select id="${id}" name="${c.n}"><option value="">Elige…</option>${otras.map((x) =>
          `<option value="${x.id}" ${val === x.id ? 'selected' : ''}>${esc(x.crotal)} · ${L.camada(estadoDe(x.id).actual).actuales} lechones</option>`).join('')}</select></div>`;
      }
      default: return '';
    }
  }

  function leerFormulario(form, v) {
    const fd = new FormData(form);
    for (const [k, val] of fd.entries()) v[k] = typeof val === 'string' ? val.trim() : val;
    return v;
  }

  function vistaRegistrar(cerdaId, tipo, eventoId) {
    const c = cerdaPorId(cerdaId);
    const T = TIPOS[tipo];
    if (!c || !T) return vistaNoEncontrado();
    const evento = eventoId ? S.eventos.find((e) => e.id === eventoId) : null;
    if (eventoId && (!evento || tipo === 'adopcion')) return vistaNoEncontrado('No puedes corregir este registro.');
    const clave = `${cerdaId}/${tipo}/${eventoId || ''}`;
    if (S.borrador.clave !== clave) S.borrador = { clave, v: valoresIniciales(tipo, evento), confirmado: false, filtro: S.borrador.filtro };
    const v = S.borrador.v;
    const foto = tipo === 'parto' || tipo === 'destete' || tipo === 'adopcion' || tipo === 'baja_lechones' ? 'madre' : tipo === 'ia' ? 'verraco' : 'hembra';

    pintar(`${cabecera({ volver: `#/cerda/${cerdaId}`, textoVolver: 'Cancelar', titulo: `${eventoId ? 'Corregir' : 'Registrar'}: ${T.nombre.toLowerCase()}`, sub: `${esc(c.crotal)} · ${faseNombre(estadoDe(cerdaId).fase)}` })}
      <main class="cuerpo">
        <div class="foto"><img src="img/${foto}.jpg" alt=""></div>
        ${avisoAjeno(evento)}
        ${T.ayuda ? `<div class="suave">${esc(T.ayuda)}</div>` : ''}
        <form class="formu" id="f-evento" novalidate>
          ${T.campos.map((x) => campoHTML(x, v, cerdaId)).join('')}
          <div id="resumen"></div>
          <div id="mensajes" aria-live="polite"></div>
          <div class="suave peq">${eventoId ? `Registrado por ${esc(quienEs(evento.autor, evento.autor_alias))}` : `Lo registras como ${esc(yo())}`}${esProf() ? '' : ' · podrás corregirlo durante 24 horas'}</div>
          <button class="btn" type="submit">${eventoId ? 'Guardar corrección' : 'Guardar'}</button>
        </form>
      </main>`);

    const form = document.getElementById('f-evento');
    const pintarResumen = () => {
      const r = document.getElementById('resumen');
      if (tipo === 'parto') {
        const viv = (+v.vivos_h || 0) + (+v.vivos_m || 0);
        const tot = viv + (+v.muertos_h || 0) + (+v.muertos_m || 0) + (+v.momificados || 0);
        r.innerHTML = `<div class="ok-caja entre"><span>Total nacidos</span><strong>${tot} · ${viv} vivos</strong></div>`;
      } else if (tipo === 'destete') {
        const cm = L.camada(estadoDe(cerdaId).actual);
        const d = (+v.destetados_h || 0) + (+v.destetados_m || 0);
        if (cm) r.innerHTML = `<div class="ok-caja entre"><span>Destetados / lechones según registros</span><strong>${d} / ${cm.actuales}</strong></div>`;
      }
    };
    pintarResumen();
    form.addEventListener('click', (ev) => {
      const b = ev.target.closest('[data-paso]'); if (!b) return;
      const inp = form.querySelector(`[name="${b.dataset.campo}"]`);
      inp.value = Math.max(0, (parseInt(inp.value, 10) || 0) + Number(b.dataset.paso));
      leerFormulario(form, v); S.borrador.confirmado = false; pintarResumen();
      if (['recibe_num', 'cede_num'].includes(b.dataset.campo) && (inp.value === '0' || inp.value === '1')) vistaRegistrar(cerdaId, tipo, eventoId);
    });
    form.addEventListener('input', () => { leerFormulario(form, v); S.borrador.confirmado = false; pintarResumen(); });
    form.addEventListener('change', (ev) => {
      leerFormulario(form, v); S.borrador.confirmado = false;
      if (ev.target.name === 'verraco') v.extraccion = '';
      if (ev.target.type === 'radio' || ['zona', 'causa', 'recibe_num', 'cede_num', 'verraco'].includes(ev.target.name)) vistaRegistrar(cerdaId, tipo, eventoId);
    });
    form.addEventListener('submit', (ev) => { ev.preventDefault(); leerFormulario(form, v); guardarEvento(c, tipo, evento); });
  }

  async function guardarEvento(c, tipo, evento) {
    const T = TIPOS[tipo];
    const v = S.borrador.v;
    const propios = (S.porCerda[c.id] || []).filter((e) => !evento || e.id !== evento.id);
    const est = L.estadoCerda(propios);
    const destino = T.ubicacion(v);
    const porCerdaSin = Object.assign({}, S.porCerda, { [c.id]: propios });
    const comp = L.comprobar(tipo, v, est, { hoy: hoy(), destino, ocupacion: L.ocupacion(cerdasActivas(), porCerdaSin), cerdaId: c.id, dosis: (id) => { const x = S.extracciones.find((e) => e.id === id); return x ? { ext: x, usadas: usosExtraccion(x.id, evento && evento.id) } : null; }, camadaDe: (id) => { const cm = L.camada(estadoDe(id).actual); return cm ? cm.actuales : 0; } });
    const msj = document.getElementById('mensajes');
    if (comp.errores.length) {
      msj.innerHTML = `<div class="error-caja" role="alert"><strong>Revisa:</strong><br>${comp.errores.map(esc).join('<br>')}</div>`;
      return;
    }
    if (comp.avisos.length && !S.borrador.confirmado) {
      S.borrador.confirmado = true;
      msj.innerHTML = `<div class="aviso-caja" role="alert"><strong>Comprueba antes de guardar:</strong><br>${comp.avisos.map(esc).join('<br>')}<br><br>Si es correcto, pulsa otra vez <strong>Guardar</strong>.</div>`;
      return;
    }

    // Solo se guardan los campos visibles del formulario.
    const datos = {};
    const recorrer = (cs) => cs.forEach((x) => { if (x.grupo) return recorrer(x.campos); if (x.n !== 'fecha' && (!x.si || x.si(v))) datos[x.n] = x.t === 'contador' ? Math.max(0, parseInt(v[x.n], 10) || 0) : v[x.n]; });
    recorrer(T.campos);
    if (destino) datos.ubicacion = destino;
    if (tipo === 'destete' && datos.lechonera === 'paridera') {
      const s = L.sitioPlano(est.ubicacion);
      if (!s || s.zona !== 'partos') { document.getElementById('mensajes').innerHTML = '<div class="error-caja" role="alert">La cerda no figura en una paridera: elige una lechonera o registra antes su traslado a la sala de partos.</div>'; return; }
      datos.lechones_en = `Paridera ${s.sala}-${s.n}`;
    }

    const boton = document.querySelector('#f-evento button[type=submit]');
    boton.disabled = true; boton.textContent = 'Guardando…';
    let error;
    if (evento) {
      ({ error } = await sb.from('eventos').update({ fecha: v.fecha, datos }).eq('id', evento.id));
    } else if (tipo === 'adopcion') {
      // Cada movimiento se guarda en las dos cerdas; todos comparten «vinculo» para borrarlos juntos.
      const vinculo = (crypto.randomUUID && crypto.randomUUID()) || String(Date.now());
      const filas = [];
      const mov = (numero, otraId, sentido) => {
        const otra = cerdaPorId(otraId);
        const base = { numero, vinculo, ...(v.obs ? { obs: v.obs } : {}) };
        filas.push({ granja_id: S.granja, cerda_id: c.id, tipo, fecha: v.fecha, datos: { ...base, sentido, otra_cerda: otra.id, otra_crotal: otra.crotal } });
        filas.push({ granja_id: S.granja, cerda_id: otra.id, tipo, fecha: v.fecha, datos: { ...base, sentido: sentido === 'entra' ? 'sale' : 'entra', otra_cerda: c.id, otra_crotal: c.crotal } });
      };
      if (+v.recibe_num > 0) mov(+v.recibe_num, v.recibe_de, 'entra');
      if (+v.cede_num > 0) mov(+v.cede_num, v.cede_a, 'sale');
      ({ error } = await sb.from('eventos').insert(filas));
    } else {
      ({ error } = await sb.from('eventos').insert({ granja_id: S.granja, cerda_id: c.id, tipo, fecha: v.fecha, datos }));
    }
    if (error) { boton.disabled = false; boton.textContent = 'Guardar'; msj.innerHTML = `<div class="error-caja" role="alert">${esc(traducirError(error))}</div>`; return; }
    S.borrador = { filtro: S.borrador.filtro };
    toast(evento ? 'Corrección guardada' : `Guardado: ${T.nombre.toLowerCase()}`);
    await refrescar();
    location.hash = `#/cerda/${c.id}`;
  }

  // ---------------------------------------------------------------- verracos
  function vistaVerracos() {
    const stats = {};
    for (const c of S.cerdas) {
      for (const ci of estadoDe(c.id).ciclos) {
        if (!ci.ia) continue;
        const id = ci.ia.datos.verraco; const s = (stats[id] = stats[id] || { ia: 0, ecos: 0, pos: 0, partos: 0, vivos: 0 });
        s.ia += 1;
        const ultima = ci.ecos.filter((e) => e.datos.resultado !== 'dudosa').pop();
        if (ultima) { s.ecos += 1; if (ultima.datos.resultado === 'positiva') s.pos += 1; }
        if (ci.parto) { s.partos += 1; s.vivos += L.camada(ci).vivos; }
      }
    }
    pintar(`${cabecera()}
      <main class="cuerpo">
        <div class="foto"><img src="img/verraco.jpg" alt="Verraco chato murciano"></div>
        <div class="entre"><h1 style="font-size:22px">Verracos</h1><span class="suave">${verracosActivos().length} en el censo</span></div>
        <div class="botones"><a class="btn sec peq" href="#/censo/verraco/nuevo">${ICONOS.mas}Alta de verraco</a><a class="btn sec peq" href="#/censo/historial">Altas y bajas</a></div>
        <section class="tarjeta"><h2>Resultados</h2>
          ${verracosActivos().length ? `<table class="tabla"><thead><tr><th>Verraco</th><th>Verraquera</th><th>IA</th><th>Eco +</th><th>Vivos/parto</th></tr></thead><tbody>
          ${verracosActivos().map((x) => { const s = stats[x.id] || { ia: 0, ecos: 0, pos: 0, partos: 0, vivos: 0 };
            return `<tr><td><a href="#/verraco/${x.id}"><strong>${esc(x.crotal)}</strong></a></td><td>${x.verraquera || '—'}</td><td>${s.ia}</td><td>${s.ecos ? Math.round((100 * s.pos) / s.ecos) + ' %' : '—'}</td><td>${s.partos ? (s.vivos / s.partos).toFixed(1).replace('.', ',') : '—'}</td></tr>`; }).join('')}
          </tbody></table>` : '<div class="suave">No hay verracos en el censo.</div>'}</section>
        <section class="tarjeta"><h2>Dosis disponibles</h2>${(() => {
          const filas = S.extracciones.map((x) => ({ x, e: estadoExtraccion(x) })).filter(({ e }) => e.estado === 'valida' || e.estado === 'usar').reverse();
          return filas.length ? filas.map(({ x, e }) => `<a class="cerda-fila" href="#/verraco/${x.verraco_id}"><div><strong>${esc((verracoPorId(x.verraco_id) || {}).crotal || '?')}</strong><div class="suave">Extracción del ${corta(x.fecha)} · día ${e.dia}</div></div><span class="chip ${e.estado === 'usar' ? 'nar' : ''}">${e.restantes} dosis${e.estado === 'usar' ? ' · usar ya' : ''}</span></a>`).join('')
            : '<div class="suave">No hay dosis válidas registradas. Registra las extracciones desde la ficha de cada verraco (toca su crotal).</div>'; })()}</section>
      </main>${navegacion('verracos')}`);
  }

  // ---------------------------------------------------------------- plano de la granja
  const COLOR_FASE = { vacia: '#7D8781', inseminada: '#1F5FAF', gestante: '#2F6B4F', paridera: '#C8641E', lactante: '#7A3E9D', destetada: '#A88A1E' };
  // Cerdito chato murciano: piel oscura, hocico corto, orejas hacia delante
  const DEFS_CERDO = `<svg width="0" height="0" style="position:absolute" aria-hidden="true"><defs>
    <symbol id="cerdito" viewBox="0 0 64 40">
      <path d="M9 18c-5-1-6-6-3-7 2-1 3 1 2 3" fill="none" stroke="#2A272C" stroke-width="2" stroke-linecap="round"/>
      <rect x="15" y="27" width="6" height="10" rx="2" fill="#1E1C20"/><rect x="22" y="28" width="5" height="9" rx="2" fill="#2A272C"/>
      <rect x="38" y="27" width="6" height="10" rx="2" fill="#1E1C20"/><rect x="45" y="28" width="5" height="9" rx="2" fill="#2A272C"/>
      <ellipse cx="30" cy="21" rx="21" ry="12" fill="#332F35"/>
      <path d="M14 14c6-5 22-6 30-2" fill="none" stroke="#4A454C" stroke-width="2" stroke-linecap="round"/>
      <ellipse cx="49" cy="19" rx="9.5" ry="9" fill="#332F35"/>
      <ellipse cx="58" cy="21" rx="3.2" ry="4.2" fill="#5A4E54"/>
      <circle cx="58.6" cy="19.7" r=".9" fill="#1E1C20"/><circle cx="58.6" cy="22.4" r=".9" fill="#1E1C20"/>
      <path d="M45 11l9-4-2 9z" fill="#262328"/>
      <circle cx="51.5" cy="16.5" r="1.2" fill="#E6E0D6"/>
    </symbol></defs></svg>`;

  function datosPlano() {
    const D = { implantacion: {}, implSin: [], vacias: { 1: [], 2: [] }, gestacion: { 1: [], 2: [], 3: [], 4: [] }, partos: {}, verraqueras: { 1: [], 2: [], 3: [], 4: [], 5: [] }, sinUbicar: [], verracosSin: [], recuento: {} };
    for (const c of cerdasActivas().slice().sort((a, b) => (a.crotal < b.crotal ? -1 : 1))) {
      const e = estadoDe(c.id); const s = L.sitioPlano(e.ubicacion);
      const cm = e.fase === 'lactante' ? L.camada(e.actual) : null;
      const item = { c, fase: e.fase, lechones: cm ? cm.actuales : null };
      if (!s) D.sinUbicar.push(item);
      else if (s.zona === 'implantacion') { if (s.n && s.n <= 10) (D.implantacion[s.n] = D.implantacion[s.n] || []).push(item); else D.implSin.push(item); }
      else if (s.zona === 'partos') (D.partos[`${s.sala}-${s.n}`] = D.partos[`${s.sala}-${s.n}`] || []).push(item);
      else if (D[s.zona] && D[s.zona][s.n]) D[s.zona][s.n].push(item);
      else D.sinUbicar.push(item);
    }
    for (const v of verracosActivos()) { if (D.verraqueras[v.verraquera]) D.verraqueras[v.verraquera].push(v); else D.verracosSin.push(v); }
    D.grupos = L.cuentaGrupos(S.recuentos, movsGrupos());
    for (const [est, g] of Object.entries(D.grupos)) {
      if (!g.recuento && !g.movs.length) continue;
      const fechas = [g.recuento && g.recuento.fecha, ...g.movs.map((m) => m.fecha)].filter(Boolean).sort();
      D.recuento[est] = { estancia: est, n: g.n, fecha: fechas.pop(), contado: !!g.recuento };
    }
    D.lactantes = cerdasActivas().reduce((a, c) => { const e = estadoDe(c.id); return a + (e.fase === 'lactante' ? (L.camada(e.actual) || { actuales: 0 }).actuales : 0); }, 0);
    return D;
  }

  // Coloca n cerditos dentro de un rectángulo del plano (unidades del dibujo)
  function cerdosSVG(items, x, y, w, h, enlaces, etiqueta = (it) => it.c.crotal, color = (it) => COLOR_FASE[it.fase]) {
    if (!items.length) return '';
    const n = items.length;
    let cols = Math.max(1, Math.round(Math.sqrt((n * w) / (h * 1.3))));
    cols = Math.min(cols, n); const filas = Math.ceil(n / cols);
    const cw = w / cols, ch = h / filas;
    const pw = Math.min(cw * 0.86, (ch - 18) * 1.6, 72), ph = pw / 1.6;
    return items.map((it, i) => {
      const cx = x + cw * (i % cols) + cw / 2, cy = y + ch * Math.floor(i / cols) + (ch - ph - 16) / 2;
      const id = it.c ? it.c.id : it.id;
      const dentro = `<ellipse cx="${cx}" cy="${cy + ph * 0.95}" rx="${pw * 0.48}" ry="${ph * 0.16}" fill="${color(it)}"/>
        <use href="#cerdito" x="${cx - pw / 2}" y="${cy}" width="${pw}" height="${ph}"/>
        <text x="${cx}" y="${cy + ph + 15}" text-anchor="middle" class="crotal">${esc(etiqueta(it))}</text>`;
      return enlaces ? `<a href="${it.c ? `#/cerda/${id}` : `#/verraco/${id}`}" aria-label="${esc(etiqueta(it))}">${dentro}</a>` : `<g>${dentro}</g>`;
    }).join('');
  }

  function vistaPlano() {
    const D = datosPlano();
    const ancho = window.matchMedia('(min-width: 760px)').matches; // en el móvil, los cerditos no son enlaces (se toca la zona)
    const zona = (z, x, y, w, h, titulo, cont) => `<a href="#/plano/${z}" class="zona-plano" aria-label="${esc(titulo)}"><rect x="${x}" y="${y}" width="${w}" height="${h}" rx="6"/></a>${cont}`;
    const caja = (x, y, w, h, extra = '') => `<rect class="corral ${extra}" x="${x}" y="${y}" width="${w}" height="${h}"/>`;
    const num = (x, y, t, cls = 'num') => `<text x="${x}" y="${y}" class="${cls}" text-anchor="middle">${t}</text>`;
    const circulo = (x, y, t) => `<circle cx="${x}" cy="${y}" r="15" class="circ"/>${num(x, y + 6, t)}`;
    let g = '';
    // Sala de implantación (10 jaulas, la 10 arriba)
    let t = '';
    for (let j = 10; j >= 1; j--) {
      const yy = 50 + (10 - j) * 27; const it = D.implantacion[j] || [];
      t += caja(180, yy, 120, 27, it.length ? '' : 'libre') + num(194, yy + 19, j, 'num peq');
      if (it.length) {
        const dib = `<ellipse cx="226" cy="${yy + 23}" rx="17" ry="3.5" fill="${COLOR_FASE[it[0].fase]}"/><use href="#cerdito" x="210" y="${yy + 3}" width="33" height="21"/><text x="247" y="${yy + 19}" class="crotal izq">${esc(it.map((x) => x.c.crotal).join(','))}</text>`;
        t += ancho ? `<a href="#/cerda/${it[0].c.id}">${dib}</a>` : `<g>${dib}</g>`;
      }
    }
    g += zona('implantacion', 180, 50, 120, 270, 'Sala de implantación', t) + num(240, 345, 'IMPLANTACIÓN', 'rotulo');
    // Parques de vacías (2 a la izquierda, 1 a la derecha)
    t = '';
    [[2, 330], [1, 470]].forEach(([p, x]) => { const it = D.vacias[p]; t += caja(x, 50, 140, 270) + circulo(x + 70, 75, p) + cerdosSVG(it, x + 4, 95, 132, 220, ancho) + num(x + 70, 312, `${it.length}/10`, 'num peq'); });
    g += zona('vacias', 330, 50, 280, 270, 'Parques de vacías', t) + num(470, 345, 'PARQUE VACÍAS', 'rotulo');
    // Parideras: 3 salas; en cada una, plazas 1-3, pasillo, plazas 4-6
    t = '';
    // Cada sala es un local cerrado (pared gruesa) con su pasillo central; entre salas, separación
    for (let s = 1; s <= 3; s++) {
      const x0 = 640 + (s - 1) * 165;
      t += `<rect class="pasillo-plano" x="${x0 + 57}" y="62" width="36" height="257"/>` + circulo(x0 + 75, 30, s);
      for (let k = 1; k <= 6; k++) {
        const x = k <= 3 ? x0 : x0 + 93, y = 62 + ((k - 1) % 3) * 85.6; const it = D.partos[`${s}-${k}`] || [];
        t += caja(x, y, 57, 85.6, it.length ? '' : 'libre') + num(x + 10, y + 16, k, 'num peq');
        t += cerdosSVG(it, x + 2, y + 18, 53, 52, ancho);
        if (it[0] && it[0].lechones != null) t += num(x + 28, y + 82, `+${it[0].lechones}`, 'num lech');
        { const dg = D.grupos[`Paridera ${s}-${k}`]; if (dg && dg.n > 0) t += num(x + 28, it.length ? y + 30 : y + 52, `${dg.n} dest.`, 'num lech'); }
      }
      t += `<rect class="pared" x="${x0}" y="62" width="150" height="257"/>` + num(x0 + 75, 200, 'pasillo', 'num vertical');
    }
    g += zona('partos', 640, 50, 480, 270, 'Parideras', t) + num(880, 345, 'PARIDERAS · 3 SALAS', 'rotulo');
    // Parques de gestación: 3 y 4 arriba, 1 y 2 abajo
    t = '';
    [[3, 1150, 40], [4, 1380, 40], [1, 1150, 400], [2, 1380, 400]].forEach(([p, x, y]) => { const it = D.gestacion[p]; t += caja(x, y, 220, 270) + circulo(x + 110, y + 26, p) + cerdosSVG(it, x + 6, y + 48, 208, 200, ancho) + num(x + 110, y + 262, `${it.length}/8`, 'num peq'); });
    g += `<a href="#/plano/gestacion" class="zona-plano" aria-label="Parques de gestación"><rect x="1150" y="40" width="450" height="270" rx="6"/></a>`;
    g += `<a href="#/plano/gestacion" class="zona-plano" aria-label="Parques de gestación"><rect x="1150" y="400" width="450" height="270" rx="6"/></a>` + t + num(1375, 360, 'PARQUES GESTACIÓN', 'rotulo');
    // Lechoneras 1-4
    t = '';
    for (let l = 1; l <= 4; l++) { const y = 420 + (l - 1) * 62; const r = D.recuento[`Lechonera ${l}`]; t += caja(930, y, 130, 62, r && r.n ? '' : 'libre') + num(948, y + 24, l, 'num peq') + (r ? num(1005, y + 38, r.n, `num grande ${r.n > 25 ? 'exceso' : ''}`) + num(1005, y + 56, corta(r.fecha), 'num mini') : num(1005, y + 40, '—', 'num')); }
    g += zona('lechoneras', 930, 420, 130, 248, 'Lechoneras', t) + `<text x="920" y="550" class="rotulo" text-anchor="end">LECHONERAS</text>`;
    // Verraqueras 5..1, salas de servicio
    t = '';
    [5, 4, 3, 2, 1].forEach((v, i) => { const x = 20 + i * 100 + (v === 1 ? 10 : 0); const it = D.verraqueras[v]; t += caja(x, 720, 95, 180, it.length ? '' : 'libre') + num(x + 47, 745, v) + cerdosSVG(it, x + 4, 760, 87, 120, ancho, (y) => y.crotal, () => '#5B6470'); });
    g += zona('verraqueras', 20, 720, 505, 180, 'Verraqueras', t) + num(260, 705, 'VERRAQUERAS', 'rotulo');
    g += caja(535, 720, 110, 130, 'servicio') + num(590, 780, 'Sala', 'num mini') + num(590, 798, 'extracción', 'num mini');
    g += caja(645, 720, 120, 130, 'servicio') + num(705, 790, 'Laboratorio', 'num mini');
    g += caja(765, 720, 200, 130, 'servicio') + num(865, 780, 'Despacho', 'num mini') + num(865, 798, 'almacén', 'num mini');
    g += `<path d="M1010 905v-20M1100 905v-20" class="puerta"/>` + num(1055, 905, 'ENTRADA', 'rotulo');
    // Cebadero: pares arriba, impares abajo
    t = '';
    let totalCebo = 0;
    for (let k = 1; k <= 24; k++) {
      const col = Math.ceil(k / 2) - 1, x = 1140 + col * 38, y = k % 2 === 0 ? 720 : 812; const r = D.recuento[`Cebadero ${k}`]; if (r) totalCebo += r.n;
      t += caja(x, y, 38, 80, r && r.n ? '' : 'libre') + num(x + 19, y + 18, k, 'num mini') + num(x + 19, y + 54, r ? r.n : '·', 'num');
    }
    g += zona('cebadero', 1140, 720, 456, 172, 'Cebadero', t) + num(1368, 915, `CEBADERO${totalCebo ? ` · ${totalCebo} cerdos` : ''}`, 'rotulo');

    const lista = (arr, fn) => arr.map(fn).join(', ');
    pintar(`${cabecera({ volver: '#/inicio', textoVolver: 'Inicio', titulo: 'Plano de la granja' })}
      ${DEFS_CERDO}
      <main class="cuerpo">
        ${S.faltaSQL06 ? `<div class="aviso-caja"><strong>Lechoneras y cebadero sin recuentos:</strong> ${esProf() ? 'ejecuta en Supabase el archivo 06_recuentos.sql.' : 'avisa al profesor.'}</div>` : ''}
        ${(() => { const lech = Object.values(D.recuento).filter((r) => r.estancia.startsWith('Lechonera')).reduce((a, r) => a + r.n, 0);
          const cer = cerdasActivas().length, ver = verracosActivos().length, tot = cer + ver + D.lactantes + lech + totalCebo;
          return `<div class="totales"><div class="dato"><span class="et">Cerdas reproductoras</span><span class="val">${cer}</span></div>
            <div class="dato"><span class="et">Verracos</span><span class="val">${ver}</span></div>
            <div class="dato"><span class="et">Lechones lactantes</span><span class="val">${D.lactantes}</span></div>
            <div class="dato"><span class="et">Lechoneras</span><span class="val">${lech}</span></div>
            <div class="dato"><span class="et">Cebo</span><span class="val">${totalCebo}</span></div>
            <div class="dato nar"><span class="et">Total en la granja</span><span class="val">${tot}</span></div></div>`; })()}
        <div class="plano-caja"><svg class="plano" viewBox="0 0 1610 925" role="img" aria-label="Plano de la granja con la posición de cada animal">${g}</svg></div>
        <div class="zonas-botones">${[['implantacion', 'Implantación', Object.values(D.implantacion).flat().length + D.implSin.length], ['vacias', 'Vacías', D.vacias[1].length + D.vacias[2].length], ['partos', 'Parideras', Object.values(D.partos).flat().length], ['gestacion', 'Gestación', Object.values(D.gestacion).flat().length], ['verraqueras', 'Verraqueras', Object.values(D.verraqueras).flat().length], ['lechoneras', 'Lechoneras', Object.values(D.recuento).filter((r) => r.estancia.startsWith('Lechonera')).reduce((a, r) => a + r.n, 0)], ['cebadero', 'Cebadero', totalCebo]].map(([z, t, n]) => `<a href="#/plano/${z}"><span>${t}</span><strong>${n}</strong></a>`).join('')}</div>
        <div class="suave peq">${ancho ? 'Toca un animal para abrir su ficha o una zona para verla en grande.' : 'Toca una zona para verla en grande.'}</div>
        <div class="leyenda">${L.FASES.map((f) => `<span><i style="background:${COLOR_FASE[f.id]}"></i>${f.nombre}</span>`).join('')}<span><i style="background:#5B6470"></i>Verraco</span></div>
        ${D.sinUbicar.length || D.implSin.length || D.verracosSin.length ? `<section class="tarjeta"><h2>Sin sitio en el plano</h2>
          ${D.sinUbicar.length ? `<div>Cerdas sin ubicación: ${lista(D.sinUbicar, (x) => `<a href="#/cerda/${x.c.id}">${esc(x.c.crotal)}</a>`)}. <span class="suave">Registra un traslado desde su ficha.</span></div>` : ''}
          ${D.implSin.length ? `<div>En implantación sin jaula: ${lista(D.implSin, (x) => `<a href="#/cerda/${x.c.id}">${esc(x.c.crotal)}</a>`)}. <span class="suave">Corrige su inseminación o registra un traslado indicando la jaula.</span></div>` : ''}
          ${D.verracosSin.length ? `<div>Verracos sin verraquera: ${lista(D.verracosSin, (x) => `<a href="#/verraco/${x.id}">${esc(x.crotal)}</a>`)}. <span class="suave">${esProf() ? 'Asígnala en Gestión → Censo.' : 'Avisa al profesor.'}</span></div>` : ''}</section>` : ''}
        <div class="suave peq">El plano muestra dónde dicen los registros que está cada animal. Si no coincide con la nave, falta registrar un movimiento.</div>
      </main>${navegacion('cerdas')}`);
    $app.className = 'ancho';
  }

  // ---- Una zona en grande
  function fichaCerdo(it, tipo = 'cerda') {
    const crotal = tipo === 'cerda' ? it.c.crotal : it.crotal;
    const color = tipo === 'cerda' ? COLOR_FASE[it.fase] : '#5B6470';
    return `<a class="cerdo" href="${tipo === 'cerda' ? `#/cerda/${it.c.id}` : `#/verraco/${it.id}`}">
      <svg viewBox="0 0 64 46" aria-hidden="true"><ellipse cx="32" cy="40" rx="27" ry="5" fill="${color}"/><use href="#cerdito" x="0" y="2" width="64" height="40"/></svg>
      <strong>${esc(crotal)}</strong><span class="peq" style="color:${color}">${tipo === 'cerda' ? faseNombre(it.fase) : 'Verraco'}${it.lechones != null ? ` · ${it.lechones} lech.` : ''}</span></a>`;
  }
  function vistaZona(z) {
    const D = datosPlano();
    const libre = '<span class="suave peq">Libre</span>';
    const corral = (titulo, items, tipo, pie = '') => `<div class="corral-g"><div class="entre"><strong>${titulo}</strong>${pie}</div><div class="cerdos">${items.length ? items.map((i) => fichaCerdo(i, tipo)).join('') : libre}</div></div>`;
    // Paridera: la cerda y, si los hay, los lechones ya destetados que se han quedado en ella
    const corralP = (s, k) => { const it = D.partos[`${s}-${k}`] || []; const dg = D.grupos[`Paridera ${s}-${k}`];
      const dest = dg && dg.n > 0 ? `<a class="destetados" href="#/corral/parideras/${s}-${k}"><strong>${dg.n} lechones destetados</strong><span class="peq">Pasar a lechonera ›</span></a>` : '';
      return `<div class="corral-g"><div class="entre"><strong>Paridera ${k}</strong></div><div class="cerdos">${it.length ? it.map((i) => fichaCerdo(i, 'cerda')).join('') : dest ? '' : libre}</div>${dest}</div>`; };
    let titulo = '', cuerpo = '';
    if (z === 'implantacion') {
      titulo = 'Sala de implantación';
      cuerpo = `<div class="pila">${[10, 9, 8, 7, 6, 5, 4, 3, 2, 1].map((j) => corral(`Jaula ${j}`, D.implantacion[j] || [], 'cerda', (D.implantacion[j] || []).length > 1 ? '<span class="chip rojo">¡Más de una!</span>' : '')).join('')}</div>
        ${D.implSin.length ? corral('Sin jaula indicada', D.implSin, 'cerda') : ''}`;
    } else if (z === 'vacias') {
      titulo = 'Parques de vacías';
      cuerpo = `<div class="dos">${[2, 1].map((p) => corral(`Parque ${p}`, D.vacias[p], 'cerda', `<span class="chip ${D.vacias[p].length > 10 ? 'rojo' : ''}">${D.vacias[p].length}/10</span>`)).join('')}</div>`;
    } else if (z === 'gestacion') {
      titulo = 'Parques de gestación';
      cuerpo = `<div class="dos">${[3, 4, 1, 2].map((p) => corral(`Parque ${p}`, D.gestacion[p], 'cerda', `<span class="chip ${D.gestacion[p].length > 8 ? 'rojo' : ''}">${D.gestacion[p].length}/8</span>`)).join('')}</div>`;
    } else if (z === 'partos') {
      titulo = 'Parideras';
      cuerpo = [1, 2, 3].map((s) => `<section class="tarjeta"><h2>Sala ${s}</h2><div class="sala-partos">
        <div class="pila">${[1, 2, 3].map((k) => corralP(s, k)).join('')}</div>
        <div class="pasillo" aria-hidden="true"></div>
        <div class="pila">${[4, 5, 6].map((k) => corralP(s, k)).join('')}</div></div></section>`).join('');
    } else if (z === 'verraqueras') {
      titulo = 'Verraqueras';
      cuerpo = `<div class="dos">${[5, 4, 3, 2, 1].map((v) => corral(`Verraquera ${v}`, D.verraqueras[v], 'verraco')).join('')}</div>`;
    } else if (z === 'lechoneras' || z === 'cebadero') {
      const lech = z === 'lechoneras';
      titulo = lech ? 'Lechoneras' : 'Cebadero';
      const celda = (k) => { const est = `${lech ? 'Lechonera' : 'Cebadero'} ${k}`; const r = D.recuento[est];
        return `<a class="recuento-celda ${r && r.n ? 'ocupado' : ''} ${(lech && r && r.n > 25) || (r && r.n < 0) ? 'exceso' : ''}" href="#/corral/${z}/${k}"><span class="peq">${lech ? 'Lechonera ' : ''}${k}</span><strong>${r ? r.n : '—'}</strong><span class="peq suave">${r ? corta(r.fecha) : 'sin contar'}</span></a>`; };
      const total = Object.values(D.recuento).filter((r) => r.estancia.startsWith(lech ? 'Lechonera' : 'Cebadero')).reduce((a, r) => a + r.n, 0);
      cuerpo = `${S.faltaSQL06 ? `<div class="aviso-caja">Falta ejecutar en Supabase el archivo 06_recuentos.sql.</div>` : `<div class="botones"><a class="btn" href="#/recuento/${z}">Recuento</a>${S.faltaSQL07 ? '' : `<a class="btn sec" href="#/movg/entrada/${z}">Entrada</a><a class="btn sec" href="#/movg/traslado/${z}">Traslado</a><a class="btn sec" href="#/movg/muerte/${z}">Muerte</a><a class="btn sec" href="#/movg/venta/${z}">Venta / matadero</a>`}</div>`}
        ${S.faltaSQL07 && !S.faltaSQL06 ? '<div class="aviso-caja">Para registrar entradas, traslados y bajas falta ejecutar en Supabase el archivo 07_censo_alumnos.sql.</div>' : ''}
        <div class="entre"><span>Total</span><strong>${total} ${lech ? 'lechones' : 'cerdos'}</strong></div>
        ${lech ? `<div class="pila">${[1, 2, 3, 4].map(celda).join('')}</div><div class="suave peq">Capacidad: 25 lechones por lechonera.</div>`
          : `<div class="cebadero"><div>${[2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22, 24].map(celda).join('')}</div><div class="pasillo-h" aria-hidden="true"></div><div>${[1, 3, 5, 7, 9, 11, 13, 15, 17, 19, 21, 23].map(celda).join('')}</div></div>`}
        <div class="suave peq">Cada número es el último recuento más las entradas y salidas registradas después. Toca un ${lech ? 'lechonera' : 'corral'} para ver su historial.</div>`;
    } else return vistaNoEncontrado();
    pintar(`${cabecera({ volver: '#/plano', textoVolver: 'Plano', titulo })}${DEFS_CERDO}
      <main class="cuerpo">${cuerpo}
        ${['lechoneras', 'cebadero'].includes(z) ? '' : `<div class="leyenda">${L.FASES.map((f) => `<span><i style="background:${COLOR_FASE[f.id]}"></i>${f.nombre}</span>`).join('')}</div>`}
      </main>${navegacion('cerdas')}`);
  }

  // ---- Un corral o lechonera: número actual, historial y acciones
  // Movimientos de lechoneras y cebo + los destetes, que suman solos en su lechonera
  function movsGrupos() {
    const dest = S.eventos.filter((e) => e.tipo === 'destete' && e.datos && e.datos.lechonera).map((e) => {
      const d = e.datos; const n = (+d.destetados_h || 0) + (+d.destetados_m || 0) + (+d.destetados_ss || 0);
      return { id: `d-${e.id}`, virtual: true, cerda_id: e.cerda_id, tipo: 'entrada', destino: d.lechonera === 'paridera' ? d.lechones_en : `Lechonera ${d.lechonera}`, origen: null, n, fecha: e.fecha, creado: e.creado,
        procedencia: `Destete de ${(cerdaPorId(e.cerda_id) || {}).crotal || '?'}`, autor: e.autor, autor_alias: e.autor_alias };
    }).filter((m) => m.n > 0 && m.destino);
    return [...S.movGrupos, ...dest];
  }
  const estanciaDe = (z, k) => `${z === 'lechoneras' ? 'Lechonera' : z === 'parideras' ? 'Paridera' : 'Cebadero'} ${k}`;
  const zonaVolver = (z) => (z === 'parideras' ? 'partos' : z);
  const TIPOS_MOVG = { entrada: 'Entrada', traslado: 'Traslado', muerte: 'Muerte', venta: 'Venta', matadero: 'Matadero' };
  function vistaCorral(z, k) {
    if (!['lechoneras', 'cebadero', 'parideras'].includes(z)) return vistaNoEncontrado();
    const est = estanciaDe(z, k); const G = L.cuentaGrupos(S.recuentos, movsGrupos())[est];
    if (!G) return vistaNoEncontrado();
    const hist = [...S.recuentos.filter((r) => r.estancia === est).map((r) => ({ ...r, _t: 'recuento' })), ...G.movs.map((m) => ({ ...m, _t: 'mov' }))]
      .sort((a, b) => (a.fecha === b.fecha ? (String(a.creado) < String(b.creado) ? 1 : -1) : a.fecha < b.fecha ? 1 : -1));
    const puede = (r) => esProf() || (r.autor === S.sesion.user.id && Date.now() - new Date(r.creado).getTime() < 864e5);
    const linea = (r) => {
      let txt;
      if (r._t === 'recuento') txt = `<strong>Recuento: ${r.n}</strong>`;
      else if (r.tipo === 'entrada') txt = `<strong>Entrada +${r.n}</strong>${r.procedencia ? ` · ${esc(r.procedencia)}` : ''}`;
      else if (r.tipo === 'traslado') txt = r.destino === est ? `<strong>Llegan +${r.n}</strong> de ${esc(r.origen)}` : `<strong>Salen −${r.n}</strong> a ${esc(r.destino)}`;
      else txt = `<strong>${TIPOS_MOVG[r.tipo]} −${r.n}</strong>${r.causa ? ` · ${esc(r.causa)}` : ''}`;
      const cuenta = r._t === 'mov' && G.recuento && !(r.fecha > G.recuento.fecha || (r.fecha === G.recuento.fecha && String(r.creado) > String(G.recuento.creado)));
      return `<div class="evento"><div class="entre"><span>${txt}</span><span class="suave">${fmt(r.fecha)}</span></div>
        <div class="suave peq">Por ${esc(quienEs(r.autor, r.autor_alias))}${cuenta ? ' · anterior al último recuento (ya incluido en él)' : ''}${r.obs ? ` · ${esc(r.obs)}` : ''}</div>
        ${r.virtual ? `<div class="suave peq">Se suma solo con el destete. Para cambiarlo, corrige el destete en la <a href="#/cerda/${r.cerda_id}">ficha de la cerda</a>.</div>` : puede(r) ? `<div class="acciones"><button class="btn peligro peq" type="button" data-borrar-g="${r._t === 'recuento' ? 'recuentos' : 'mov_grupos'}:${r.id}">Borrar</button></div>` : ''}</div>`;
    };
    pintar(`${cabecera({ volver: `#/plano/${zonaVolver(z)}`, textoVolver: z === 'lechoneras' ? 'Lechoneras' : z === 'parideras' ? 'Parideras' : 'Cebadero', titulo: z === 'parideras' ? `Destetados en la paridera ${k.replace('-', ' · ')}` : est })}
      <main class="cuerpo">
        <div class="dos"><div class="dato ${G.n < 0 || (z === 'lechoneras' && G.n > 25) ? 'nar' : ''}"><span class="et">Animales ahora</span><span class="val">${G.n}</span><span class="nota">${z === 'lechoneras' ? 'capacidad 25' : 'según la app'}</span></div>
          <div class="dato"><span class="et">Último recuento</span><span class="val">${G.recuento ? G.recuento.n : '—'}</span><span class="nota">${G.recuento ? fmt(G.recuento.fecha) : 'sin contar'}</span></div></div>
        ${G.n < 0 ? '<div class="aviso-caja">Salen más animales de los que había: falta registrar una entrada o hacer un recuento.</div>' : ''}
        ${z === 'parideras' ? `<div class="botones"><a class="btn" href="#/movg/traslado/${z}/${k}">Pasar a lechonera</a><a class="btn sec" href="#/movg/muerte/${z}/${k}">Muerte</a></div><div class="suave peq">Sala ${k.split('-')[0]}, paridera ${k.split('-')[1]}. Puedes pasarlos todos o una parte.</div>` : `<div class="botones"><a class="btn" href="#/recuento/${z}/${k}">Contar</a>${S.faltaSQL07 ? '' : `<a class="btn sec" href="#/movg/entrada/${z}/${k}">Entrada</a><a class="btn sec" href="#/movg/traslado/${z}/${k}">Traslado</a><a class="btn sec" href="#/movg/muerte/${z}/${k}">Muerte</a><a class="btn sec" href="#/movg/venta/${z}/${k}">Venta / matadero</a>`}</div>`}
        <section class="tarjeta"><h2>Historial</h2>${hist.length ? hist.slice(0, 30).map(linea).join('') : '<div class="suave">Sin recuentos ni movimientos.</div>'}</section>
      </main>${navegacion('cerdas')}`);
    $app.querySelectorAll('[data-borrar-g]').forEach((b) => b.addEventListener('click', async () => {
      if (b.dataset.confirmar !== '1') { b.dataset.confirmar = '1'; b.textContent = '¿Seguro? Pulsa otra vez'; return; }
      const [tabla, id] = b.dataset.borrarG.split(':'); b.disabled = true;
      const { error } = await sb.from(tabla).delete().eq('id', id);
      if (error) { toast(traducirError(error)); b.disabled = false; return; }
      toast('Borrado'); await refrescar(); vistaCorral(z, k);
    }));
  }

  // ---- Entrada, traslado, muerte o venta/matadero de lechones o cerdos de cebo
  function vistaMovGrupo(tipo, z, k) {
    if (!TIPOS_MOVG[tipo] || S.faltaSQL07) return vistaZona(zonaVolver(z || 'cebadero'));
    const clave = `movg/${tipo}/${z}/${k || ''}`;
    if (S.borrador.clave !== clave) {
      const est = k ? estanciaDe(z, k) : '';
      S.borrador = { clave, v: { tipo: tipo === 'venta' ? 'venta' : tipo, fecha: hoy(), n: z === 'parideras' && k ? String(Math.max(0, L.cuentaGrupos(S.recuentos, movsGrupos())[est].n)) : '', origen: tipo === 'entrada' ? '' : est, destino: tipo === 'entrada' ? est : '', procedencia: tipo === 'entrada' ? 'Otra granja del centro' : '', causa: '', causa_otra: '', obs: '' }, confirmado: false, filtro: S.borrador.filtro };
    }
    const v = S.borrador.v;
    const G = L.cuentaGrupos(S.recuentos, movsGrupos());
    const opEst = (sel, filtro = () => true) => L.ESTANCIAS.filter((e) => filtro(e) && (!e.startsWith('Paridera') || e === sel || G[e].n > 0)).map((e) => `<option value="${e}" ${sel === e ? 'selected' : ''}>${e} (${G[e].n})</option>`).join('');
    const titulo = { entrada: 'Entrada de animales', traslado: 'Traslado', muerte: 'Muerte', venta: 'Venta o matadero' }[tipo];
    const volver = k ? `#/corral/${z}/${k}` : `#/plano/${zonaVolver(z || 'cebadero')}`;
    pintar(`${cabecera({ volver, textoVolver: 'Cancelar', titulo })}
      <main class="cuerpo"><form class="formu" id="f-movg" novalidate>
        <div class="campo"><label for="g-fecha">Fecha</label><input id="g-fecha" name="fecha" type="date" max="${hoy()}" value="${esc(v.fecha)}"></div>
        ${tipo === 'venta' ? `<div class="campo"><span class="et" id="et-gt">Salida</span><div class="opciones" role="radiogroup" aria-labelledby="et-gt">
          <label><input type="radio" name="tipo" value="venta" ${v.tipo === 'venta' ? 'checked' : ''}> Venta</label><label><input type="radio" name="tipo" value="matadero" ${v.tipo === 'matadero' ? 'checked' : ''}> Matadero</label></div></div>` : ''}
        ${tipo !== 'entrada' ? `<div class="campo"><label for="g-origen">${tipo === 'traslado' ? 'Salen de' : 'De'}</label><select id="g-origen" name="origen"><option value="">Elige…</option>${opEst(v.origen)}</select></div>` : ''}
        ${['entrada', 'traslado'].includes(tipo) ? `<div class="campo"><label for="g-destino">${tipo === 'traslado' ? 'Van a' : 'Entran en'}</label><select id="g-destino" name="destino"><option value="">Elige…</option>${opEst(v.destino, (e) => e !== v.origen && !e.startsWith('Paridera'))}</select></div>` : ''}
        <div class="campo"><label for="g-n">Número de animales</label><input id="g-n" name="n" type="number" inputmode="numeric" min="1" max="200" value="${esc(v.n)}"></div>
        ${tipo === 'entrada' ? `<div class="campo"><label for="g-proc">Procedencia</label><select id="g-proc" name="procedencia">${['Otra granja del centro', 'Compra', 'Otro'].map((o) => `<option ${v.procedencia === o ? 'selected' : ''}>${o}</option>`).join('')}</select><span class="ayuda">Los lechones destetados se suman solos a su lechonera al registrar el destete: no hace falta apuntarlos aquí.</span></div>` : ''}
        ${tipo === 'muerte' ? `<div class="campo"><label for="g-causa">Causa</label><select id="g-causa" name="causa"><option value="">Elige…</option>${L.CAUSAS_CEBO.map((c) => `<option ${v.causa === c ? 'selected' : ''}>${c}</option>`).join('')}</select></div>
          ${v.causa === 'Otros' ? `<div class="campo"><label for="g-co">Escribe la causa</label><input id="g-co" name="causa_otra" type="text" value="${esc(v.causa_otra)}"></div>` : ''}` : ''}
        <div class="campo"><label for="g-obs">Observaciones <span class="suave">(opcional)</span></label><textarea id="g-obs" name="obs">${esc(v.obs)}</textarea></div>
        <div id="mensajes" aria-live="polite"></div>
        <button class="btn" type="submit">Guardar</button>
      </form></main>`);
    const form = document.getElementById('f-movg');
    const leer = () => { for (const [a, b] of new FormData(form).entries()) v[a] = String(b).trim(); };
    form.addEventListener('input', () => { leer(); S.borrador.confirmado = false; });
    form.addEventListener('change', (ev) => { leer(); S.borrador.confirmado = false; if (['causa', 'origen'].includes(ev.target.name)) vistaMovGrupo(tipo, z, k); });
    form.addEventListener('submit', async (ev) => {
      ev.preventDefault(); leer(); const msj = document.getElementById('mensajes');
      const comp = L.comprobarMovGrupo(v, G, { hoy: hoy() });
      if (comp.errores.length) { msj.innerHTML = `<div class="error-caja" role="alert">${comp.errores.map(esc).join('<br>')}</div>`; return; }
      if (comp.avisos.length && !S.borrador.confirmado) { S.borrador.confirmado = true; msj.innerHTML = `<div class="aviso-caja" role="alert">${comp.avisos.map(esc).join('<br>')}<br><br>Si es correcto, pulsa otra vez <strong>Guardar</strong>.</div>`; return; }
      const fila = { granja_id: S.granja, fecha: v.fecha, tipo: v.tipo, n: parseInt(v.n, 10), origen: v.tipo === 'entrada' ? null : v.origen, destino: ['entrada', 'traslado'].includes(v.tipo) ? v.destino : null,
        procedencia: v.tipo === 'entrada' ? v.procedencia : null, causa: v.tipo === 'muerte' ? (v.causa === 'Otros' ? v.causa_otra : v.causa) : null, obs: v.obs || null };
      const { error } = await sb.from('mov_grupos').insert(fila);
      if (error) { msj.innerHTML = `<div class="error-caja" role="alert">${esc(traducirError(error))}</div>`; return; }
      S.borrador = { filtro: S.borrador.filtro };
      toast('Guardado'); await refrescar(); location.hash = volver;
    });
  }

  // ---- Historial de altas y bajas del censo (común a las dos granjas)
  function vistaHistorialCenso() {
    const bajasC = S.cerdas.filter((c) => c.fecha_baja), bajasV = S.verracos.filter((c) => c.fecha_baja);
    const nombreMov = { alta: ['Alta', ''], baja: ['Baja', 'rojo'], baja_anulada: ['Baja anulada', 'gris'] };
    pintar(`${cabecera({ volver: '#/cerdas', textoVolver: 'Cerdas', titulo: 'Altas y bajas' })}
      <main class="cuerpo">
        <div class="suave">El censo es común a 1.º y 2.º: lo que da de alta o de baja un curso lo ve también el otro.</div>
        ${S.faltaSQL07 ? `<div class="aviso-caja">${esProf() ? 'Ejecuta en Supabase el archivo 07_censo_alumnos.sql para ver quién da cada alta y baja.' : 'Avisa al profesor: falta preparar la base de datos.'}</div>` : ''}
        <div class="botones"><a class="btn sec peq" href="#/censo/cerda/nueva">${ICONOS.mas}Alta de cerda</a><a class="btn sec peq" href="#/censo/verraco/nuevo">${ICONOS.mas}Alta de verraco</a></div>
        <section class="tarjeta"><h2>Últimos movimientos</h2>${S.censoMov.length ? S.censoMov.map((m) => `<a class="cerda-fila" href="#/${m.animal}/${m.animal_id}"><div><strong>${esc(m.crotal)}</strong> <span class="suave">${m.animal === 'verraco' ? '(verraco)' : ''}</span>
            <div class="suave">${fmt(m.fecha)}${m.causa ? ` · ${esc(m.causa)}` : ''} · ${esc(verAlias(m.autor_alias, m.granja_id) || 'Profesor')}${m.granja_id && !esVet() ? ` (${m.granja_id}.º)` : ''}</div></div><span class="chip ${nombreMov[m.mov][1]}">${nombreMov[m.mov][0]}</span></a>`).join('') : '<div class="suave">Aún no hay movimientos registrados.</div>'}</section>
        <section class="tarjeta"><h2>Animales dados de baja (${bajasC.length + bajasV.length})</h2>${[...bajasC.map((c) => ['cerda', c]), ...bajasV.map((c) => ['verraco', c])].sort((a, b) => (a[1].fecha_baja < b[1].fecha_baja ? 1 : -1)).map(([t, c]) =>
          `<a class="cerda-fila" href="#/censo/${t}/${c.id}"><div><strong>${esc(c.crotal)}</strong> <span class="suave">${t === 'verraco' ? '(verraco)' : ''}</span><div class="suave">${fmt(c.fecha_baja)} · ${esc(c.causa_baja || '')}${c.baja_por ? ` · ${esc(c.baja_por)}` : ''}</div></div>${esProf() ? '<span class="chip gris">Anular</span>' : ''}</a>`).join('') || '<div class="suave">Ninguno.</div>'}</section>
      </main>${navegacion('cerdas')}`);
  }

  // ---- Recuento de lechoneras o cebadero (se guardan solo las casillas rellenas)
  function vistaRecuento(z, solo) {
    if (!['lechoneras', 'cebadero'].includes(z) || S.faltaSQL06) return vistaZona(z || 'cebadero');
    const lech = z === 'lechoneras';
    const nums = lech ? [1, 2, 3, 4] : Array.from({ length: 24 }, (_, i) => i + 1);
    const D = datosPlano();
    pintar(`${cabecera({ volver: `#/plano/${z}`, textoVolver: 'Cancelar', titulo: `Recuento · ${lech ? 'lechoneras' : 'cebadero'}` })}
      <main class="cuerpo"><form class="formu" id="f-rec" novalidate>
        <div class="campo"><label for="r-fecha">Fecha del recuento</label><input id="r-fecha" name="fecha" type="date" value="${hoy()}" max="${hoy()}"></div>
        <div class="suave">Escribe cuántos animales hay en cada ${lech ? 'lechonera' : 'corral'}. Deja en blanco los que no hayas contado; un corral vacío es 0.</div>
        <div class="rejilla-rec">${nums.map((k) => { const r = D.recuento[`${lech ? 'Lechonera' : 'Cebadero'} ${k}`];
          return `<div class="campo"><label for="r-${k}">${lech ? 'Lechonera' : 'Corral'} ${k}</label><input id="r-${k}" name="n${k}" type="number" inputmode="numeric" min="0" max="200" placeholder="${r ? `app: ${r.n}` : ''}"></div>`; }).join('')}</div>
        <div class="campo"><label for="r-obs">Observaciones <span class="suave">(opcional)</span></label><textarea id="r-obs" name="obs"></textarea></div>
        <div id="mensajes" aria-live="polite"></div>
        <button class="btn" type="submit">Guardar recuento</button>
      </form></main>`);
    if (solo) { const i = document.getElementById(`r-${solo}`); if (i) { i.focus(); i.scrollIntoView({ block: 'center' }); } }
    document.getElementById('f-rec').addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const d = Object.fromEntries(new FormData(ev.target).entries()); const msj = document.getElementById('mensajes');
      const filas = nums.filter((k) => d[`n${k}`] !== '').map((k) => ({ granja_id: S.granja, estancia: `${lech ? 'Lechonera' : 'Cebadero'} ${k}`, fecha: d.fecha, n: parseInt(d[`n${k}`], 10), obs: d.obs.trim() || null }));
      const err = [];
      if (!d.fecha) err.push('Falta la fecha.'); else if (d.fecha > hoy()) err.push('La fecha no puede ser futura.');
      if (!filas.length) err.push('No has escrito ningún número.');
      if (filas.some((f) => !Number.isFinite(f.n) || f.n < 0 || f.n > 200)) err.push('Los números deben estar entre 0 y 200.');
      if (err.length) { msj.innerHTML = `<div class="error-caja" role="alert">${err.map(esc).join('<br>')}</div>`; return; }
      const exceso = lech ? filas.filter((f) => f.n > 25) : [];
      if (exceso.length && !ev.target.dataset.confirmado) { ev.target.dataset.confirmado = '1'; msj.innerHTML = `<div class="aviso-caja" role="alert">${esc(exceso.map((f) => f.estancia).join(', '))} supera la capacidad de 25 lechones. Si es correcto, pulsa otra vez <strong>Guardar recuento</strong>.</div>`; return; }
      const { error } = await sb.from('recuentos').insert(filas);
      if (error) { msj.innerHTML = `<div class="error-caja" role="alert">${esc(traducirError(error))}</div>`; return; }
      toast(`Recuento guardado (${filas.length})`); await refrescar(); location.hash = solo ? `#/corral/${z}/${solo}` : `#/plano/${z}`;
    });
  }

  // ---------------------------------------------------------------- sanidad
  const TIPOS_MED = [['medicamento', 'Medicamento'], ['vacuna', 'Vacuna'], ['antiparasitario', 'Antiparasitario'], ['hierro', 'Hierro'], ['biocida', 'Biocida (desinfectante, insecticida, raticida)'], ['otro', 'Otro']];
  const medPorId = (id) => S.medicamentos.find((m) => m.id === id);
  const nombreSan = (t) => (L.SANIDAD[t] || {}).nombre || t;
  function destinoSan(r) {
    if (r.ambito === 'granja') return 'Toda la granja';
    if (r.ambito === 'zona') return r.zona || 'Zona';
    if (r.ambito === 'cerda') return `Cerda ${(cerdaPorId(r.cerda_id) || {}).crotal || '?'}`;
    if (r.ambito === 'camada') return `Lechones de ${(cerdaPorId(r.cerda_id) || {}).crotal || '?'}${r.n_animales ? ` (${r.n_animales})` : ''}`;
    if (r.ambito === 'verraco') return `Verraco ${(verracoPorId(r.verraco_id) || {}).crotal || '?'}`;
    return '';
  }
  const enSupresion = (filtro) => S.sanidad.filter((r) => r.estado === 'realizado' && r.supresion_hasta && r.supresion_hasta >= hoy() && filtro(r));
  const puedeEditarSan = (r) => esProf() || (r.autor === S.sesion.user.id && Date.now() - new Date(r.creado).getTime() < 864e5);
  const avisoSQL05 = () => (S.faltaSQL05 ? `<div class="aviso-caja"><strong>Falta preparar la base de datos.</strong> ${esProf() ? 'Ejecuta en Supabase el archivo 05_sanidad_verracos.sql (SQL Editor → New query → Run).' : 'Avisa al profesor.'}</div>` : '');

  function tarjetaSan(r) {
    const h = hoy();
    const estado = r.estado === 'realizado' ? ['Realizado', ''] : r.fecha < h ? ['Retrasado', 'rojo'] : ['Previsto', 'nar'];
    const med = medPorId(r.medicamento_id);
    return `<div class="evento"><div class="entre"><strong>${esc(nombreSan(r.tipo))}</strong><span class="chip ${estado[1]}">${estado[0]} · ${fmt(r.fecha)}</span></div>
      <div>${esc(destinoSan(r))}${r.producto ? ` · ${esc(r.producto)}` : ''}${r.dosis ? ` · ${esc(r.dosis)}` : ''}${r.via ? ` · ${esc(r.via)}` : ''}</div>
      ${r.motivo ? `<div class="suave">Motivo: ${esc(r.motivo)}</div>` : ''}${r.obs ? `<div class="suave">${esc(r.obs)}</div>` : ''}
      ${r.supresion_hasta && r.estado === 'realizado' ? `<div class="suave">Supresión hasta el ${fmt(r.supresion_hasta)}</div>` : ''}
      <div class="suave peq">${r.estado === 'realizado' ? `Realizado por ${esc(verAlias(r.realizado_por) || quienEs(r.autor, r.autor_alias))}` : `Programado por ${esc(quienEs(r.autor, r.autor_alias))}`}${r.repetir_dias ? ` · se repite cada ${r.repetir_dias} días` : ''}${med && med.ficha_url ? ` · <a href="${esc(med.ficha_url)}" target="_blank" rel="noopener">Ficha técnica</a>` : ''}</div>
      <div class="acciones">${r.estado === 'previsto' ? `<a class="btn peq" href="#/sanidad/realizar/${r.id}">Marcar como hecho</a>` : ''}
        <a class="btn sec peq" href="#/sanidad/editar/${r.id}">Corregir</a>${puedeEditarSan(r) ? `<button class="btn peligro peq" type="button" data-borrar-san="${r.id}">Borrar</button>` : ''}</div>
      ${r.modificado ? `<div class="suave peq">Corregido por ${esc(verAlias(r.modificado_por) || '?')}</div>` : ''}</div>`;
  }

  function seccionSanidad(filtro, enlace) {
    const regs = S.sanidad.filter(filtro).slice().sort((a, b) => (a.fecha < b.fecha ? 1 : -1));
    return `<section class="tarjeta"><div class="entre"><h2>Sanidad y manejos</h2><a class="btn sec peq" href="${enlace}">${ICONOS.mas}Añadir</a></div>
      ${regs.length ? regs.slice(0, 6).map(tarjetaSan).join('') + (regs.length > 6 ? `<details><summary class="suave" style="min-height:44px;display:flex;align-items:center">Ver ${regs.length - 6} más</summary>${regs.slice(6).map(tarjetaSan).join('')}</details>` : '') : '<div class="suave">Sin registros de sanidad.</div>'}</section>`;
  }

  function enlazarBorrarSan(volver) {
    $app.querySelectorAll('[data-borrar-san]').forEach((b) => b.addEventListener('click', async () => {
      if (b.dataset.confirmar !== '1') { b.dataset.confirmar = '1'; b.textContent = '¿Seguro? Pulsa otra vez'; return; }
      b.disabled = true;
      const { error } = await sb.from('sanidad').delete().eq('id', b.dataset.borrarSan);
      if (error) { toast(traducirError(error)); b.disabled = false; return; }
      toast('Registro borrado'); await refrescar(); if (volver) volver();
    }));
  }

  function calendarioHTML() {
    const h = hoy();
    const mes = S.borrador.mes || h.slice(0, 7);
    const [a, m] = mes.split('-').map(Number);
    const diasMes = new Date(Date.UTC(a, m, 0)).getUTCDate();
    const hueco = (new Date(Date.UTC(a, m - 1, 1)).getUTCDay() + 6) % 7;
    const porDia = {};
    for (const r of S.sanidad) if (r.fecha.startsWith(mes)) (porDia[r.fecha] = porDia[r.fecha] || []).push(r);
    const NOMBRES_MES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
    const celdas = [];
    for (let i = 0; i < hueco; i++) celdas.push('<span></span>');
    for (let d = 1; d <= diasMes; d++) {
      const iso = `${mes}-${dos(d)}`; const it = porDia[iso] || [];
      const puntos = it.map((r) => `<i style="background:${r.estado === 'realizado' ? 'var(--verde)' : r.fecha < h ? 'var(--rojo)' : 'var(--naranja)'}"></i>`).join('');
      celdas.push(`<button type="button" data-dia="${iso}" class="dia ${iso === h ? 'hoy' : ''} ${S.borrador.dia === iso ? 'sel' : ''}" aria-label="${d} de ${NOMBRES_MES[m - 1]}: ${it.length} registros"><span>${d}</span><span class="puntos">${puntos}</span></button>`);
    }
    const lista = (S.borrador.dia && S.borrador.dia.startsWith(mes) ? (porDia[S.borrador.dia] || []) : Object.keys(porDia).sort().flatMap((k) => porDia[k]));
    const ant = m === 1 ? `${a - 1}-12` : `${a}-${dos(m - 1)}`, sig = m === 12 ? `${a + 1}-01` : `${a}-${dos(m + 1)}`;
    return `<section class="tarjeta"><div class="entre"><button class="btn sec peq" type="button" data-mes="${ant}" aria-label="Mes anterior">‹</button><h2>${NOMBRES_MES[m - 1]} ${a}</h2><button class="btn sec peq" type="button" data-mes="${sig}" aria-label="Mes siguiente">›</button></div>
      <div class="calendario"><b>L</b><b>M</b><b>X</b><b>J</b><b>V</b><b>S</b><b>D</b>${celdas.join('')}</div>
      <div class="opciones peq"><span class="chip">● Realizado</span><span class="chip nar">● Previsto</span><span class="chip rojo">● Retrasado</span></div></section>
      <section class="tarjeta"><div class="entre"><h2>${S.borrador.dia && S.borrador.dia.startsWith(mes) ? `Día ${fmt(S.borrador.dia)}` : 'Este mes'}</h2>${S.borrador.dia ? '<button class="btn sec peq" type="button" data-dia="">Ver todo el mes</button>' : ''}</div>
      ${lista.length ? lista.map(tarjetaSan).join('') : '<div class="suave">Nada registrado ni previsto.</div>'}</section>`;
  }

  function registroHTML() {
    const filtro = S.borrador.filtroSan || '';
    const filas = S.sanidad.filter((r) => r.estado === 'realizado' && (!filtro || r.tipo === filtro)).slice().sort((a, b) => (a.fecha < b.fecha ? 1 : -1));
    const sup = enSupresion(() => true);
    return `${sup.length ? `<section class="aviso-caja"><strong>En periodo de supresión (no vender ni enviar a matadero)</strong>${sup.map((r) => `<div class="entre"><span>${esc(destinoSan(r))} · ${esc(r.producto || '')}</span><strong>hasta ${fmt(r.supresion_hasta)}</strong></div>`).join('')}</section>` : ''}
      <div class="campo"><label for="f-tipo-san">Mostrar</label><select id="f-tipo-san"><option value="">Todo</option>${Object.entries(L.SANIDAD).map(([k, t]) => `<option value="${k}" ${filtro === k ? 'selected' : ''}>${esc(t.nombre)}</option>`).join('')}</select></div>
      <div class="tabla-scroll"><table class="tabla ancha"><thead><tr><th>Fecha</th><th>Qué</th><th>Animales / zona</th><th>Producto</th><th>Materia activa</th><th>Dosis</th><th>Vía</th><th>Lote</th><th>Caducidad</th><th>Supresión hasta</th><th>Por</th></tr></thead><tbody>
      ${filas.map((r) => { const med = medPorId(r.medicamento_id); return `<tr><td>${fmt(r.fecha)}</td><td><a href="#/sanidad/editar/${r.id}">${esc(nombreSan(r.tipo))}</a></td><td>${esc(destinoSan(r))}</td><td>${med && med.ficha_url ? `<a href="${esc(med.ficha_url)}" target="_blank" rel="noopener">${esc(r.producto || '')}</a>` : esc(r.producto || '—')}</td><td>${esc((med || {}).materia_activa || '—')}</td><td>${esc(r.dosis || '—')}</td><td>${esc(r.via || '—')}</td><td>${esc(r.lote || '—')}</td><td>${fmt(r.caducidad)}</td><td>${r.supresion_hasta ? `<span class="chip ${r.supresion_hasta >= hoy() ? 'nar' : ''}">${fmt(r.supresion_hasta)}</span>` : '—'}</td><td>${esc(r.realizado_por || quienEs(r.autor, r.autor_alias))}</td></tr>`; }).join('') || '<tr><td colspan="11">Sin tratamientos realizados.</td></tr>'}
      </tbody></table></div>`;
  }

  function medicamentosHTML() {
    const usos = {}; for (const r of S.sanidad) if (r.medicamento_id && r.estado === 'realizado') { const u = (usos[r.medicamento_id] = usos[r.medicamento_id] || { n: 0, ultimo: '' }); u.n += 1; if (r.fecha > u.ultimo) u.ultimo = r.fecha; }
    const h = hoy(); const meds = S.medicamentos.filter((m) => m.activo || S.borrador.verInactivos);
    return `<a class="btn" href="../#/medicamento/nuevo/porc">${ICONOS.mas}Añadir medicamento o producto</a>
      <div class="suave peq">Toca el nombre de un producto para ver su ficha, añadir el enlace a la ficha técnica o completar sus datos.</div>
      <div class="suave">Catálogo común a todas las especies (también lo usa CIFEARUMI). La especie se elige al aplicarlo.</div>
      <div class="tabla-scroll"><table class="tabla ancha"><thead><tr><th>Nombre comercial</th><th>Ficha técnica</th><th>Materia activa</th><th>Clase</th><th>Dosificación</th><th>Vía</th><th>Lote</th><th>Caducidad</th><th>Supresión</th><th>Usos</th></tr></thead><tbody>
      ${meds.map((m) => { const cad = m.caducidad ? (m.caducidad < h ? 'rojo' : L.dias(h, m.caducidad) <= 30 ? 'nar' : '') : ''; const u = usos[m.id];
        return `<tr><td><a href="../#/medicamento/${m.id}/porc"><strong>${esc(m.nombre)}</strong></a>${m.activo ? '' : ' <span class="chip gris">Retirado</span>'}</td><td>${m.ficha_url ? `<a href="${esc(m.ficha_url)}" target="_blank" rel="noopener">Abrir</a>` : `<a class="suave" href="../#/medicamento/${m.id}/porc">Añadir</a>`}</td><td>${esc(m.materia_activa || '—')}</td><td>${esc((m.clases || []).length ? m.clases.map((c) => (L.CLASES_MED || {})[c] || (c.charAt(0).toUpperCase() + c.slice(1))).join(', ') : (TIPOS_MED.find((t) => t[0] === m.tipo) || ['', m.tipo])[1].split(' (')[0])}</td><td>${esc(m.dosis || '—')}</td><td>${esc(m.via || '—')}</td><td>${esc(m.lote || '—')}</td><td>${m.caducidad ? `<span class="chip ${cad}">${fmt(m.caducidad)}</span>` : '—'}</td><td>${m.supresion_dias ?? '—'}${m.supresion_dias != null ? ' d' : ''}</td><td>${u ? `${u.n} · ${corta(u.ultimo)}` : '—'}</td></tr>`; }).join('') || '<tr><td colspan="10">Aún no hay productos en el catálogo.</td></tr>'}
      </tbody></table></div>
      ${S.medicamentos.some((m) => !m.activo) ? `<label class="opciones"><input type="checkbox" id="ver-inactivos" ${S.borrador.verInactivos ? 'checked' : ''}> Ver también los retirados</label>` : ''}
      <div class="suave peq">Caducidad en naranja: caduca en menos de 30 días; en rojo: caducado.</div>`;
  }

  function vistaSanidad(sec) {
    const pest = `<div class="pestanas" role="tablist">${[['calendario', 'Calendario'], ['registro', 'Registro'], ['medicamentos', 'Medicamentos']].map(([k, t]) => `<a role="tab" href="#/sanidad/${k}" class="${sec === k ? 'activo' : ''}" aria-selected="${sec === k}">${t}</a>`).join('')}</div>`;
    const cuerpo = sec === 'registro' ? registroHTML() : sec === 'medicamentos' ? medicamentosHTML() : calendarioHTML();
    pintar(`${cabecera()}
      <main class="cuerpo">
        <div class="foto"><img src="img/salud.jpg" alt="Ganadero y veterinaria tratando a los lechones"></div>
        <div class="entre"><h1 style="font-size:22px;display:flex;align-items:center;gap:8px"><span style="color:var(--azul-vet);display:inline-flex;width:26px">${ICONOS.sanidad}</span>Sanidad</h1></div>
        ${avisoSQL05()}
        <div class="botones"><a class="btn" href="#/sanidad/nuevo">${ICONOS.mas}Registrar</a><a class="btn sec" href="#/sanidad/programar">Programar</a></div>
        ${pest}${cuerpo}
      </main>${navegacion('sanidad')}`);
    $app.querySelectorAll('[data-mes]').forEach((b) => b.addEventListener('click', () => { S.borrador.mes = b.dataset.mes; S.borrador.dia = null; vistaSanidad('calendario'); }));
    $app.querySelectorAll('[data-dia]').forEach((b) => b.addEventListener('click', () => { S.borrador.dia = b.dataset.dia || null; vistaSanidad('calendario'); }));
    const ft = document.getElementById('f-tipo-san'); if (ft) ft.addEventListener('change', () => { S.borrador.filtroSan = ft.value; vistaSanidad('registro'); });
    const vi = document.getElementById('ver-inactivos'); if (vi) vi.addEventListener('change', () => { S.borrador.verInactivos = vi.checked; vistaSanidad('medicamentos'); });
    enlazarBorrarSan(() => vistaSanidad(sec));
  }

  // ---- Formulario de sanidad (registrar, programar, corregir, marcar como hecho)
  function vistaSanidadForm(modo, id, pre = {}) {
    if (S.faltaSQL05) return vistaSanidad('calendario');
    const reg = id ? S.sanidad.find((r) => r.id === id) : null;
    if (id && !reg) return vistaNoEncontrado();
    const clave = `san/${modo}/${id || ''}/${pre.ambito || ''}/${pre.ref || ''}`;
    if (S.borrador.clave !== clave) {
      let v;
      if (reg) {
        v = { ...reg, n_animales: reg.n_animales ?? '', repetir_dias: reg.repetir_dias ?? '', edad: '' };
        if (modo === 'realizar') { v.estado = 'realizado'; v.fecha = hoy(); }
      } else {
        v = { estado: modo === 'programar' ? 'previsto' : 'realizado', tipo: '', fecha: hoy(), ambito: 'granja', cerda_id: '', verraco_id: '', zona: '', n_animales: '', medicamento_id: '', producto: '', dosis: '', via: '', lote: '', caducidad: '', motivo: '', obs: '', repetir_dias: '', edad: '' };
        if (pre.ambito === 'cerda' && cerdaPorId(pre.ref)) { v.cerda_id = pre.ref; v.ambito = estadoDe(pre.ref).fase === 'lactante' ? 'camada' : 'cerda'; }
        if (pre.ambito === 'verraco' && verracoPorId(pre.ref)) { v.verraco_id = pre.ref; v.ambito = 'verraco'; }
      }
      S.borrador = { clave, v, confirmado: false, filtro: S.borrador.filtro, mes: S.borrador.mes, pre };
    }
    const v = S.borrador.v;
    const T = L.SANIDAD[v.tipo];
    const grupo = T ? T.grupo : null;
    if (grupo === 'lechones') v.ambito = 'camada';
    if (grupo === 'higiene' && !['zona', 'granja'].includes(v.ambito)) v.ambito = 'zona';
    const lact = cerdasActivas().filter((c) => estadoDe(c.id).fase === 'lactante');
    const listaCerdas = (grupo === 'lechones' || v.ambito === 'camada') ? (lact.some((c) => c.id === v.cerda_id) || !v.cerda_id ? lact : [cerdaPorId(v.cerda_id), ...lact]) : cerdasActivas();
    const opt = (k, t, sel) => `<option value="${esc(k)}" ${String(sel) === String(k) ? 'selected' : ''}>${esc(t)}</option>`;
    const campo = (n, l, html, extra = '') => `<div class="campo"><label for="s-${n}">${l}${extra}</label>${html}</div>`;
    const inp = (n, tipo = 'text', attrs = '') => `<input id="s-${n}" name="${n}" type="${tipo}" value="${esc(v[n] ?? '')}" ${attrs}>`;
    const grupos = [['lechones', 'Lechones (camada)'], ['medicamento', 'Medicamentos y vacunas'], ['higiene', 'Higiene de instalaciones']];
    const titulo = modo === 'realizar' ? 'Marcar como hecho' : modo === 'editar' ? 'Corregir registro de sanidad' : modo === 'programar' ? 'Programar tratamiento' : 'Registrar sanidad o manejo';
    const volver = pre.ambito === 'cerda' && pre.ref ? `#/cerda/${pre.ref}` : pre.ambito === 'verraco' && pre.ref ? `#/verraco/${pre.ref}` : '#/sanidad';
    const meds = S.medicamentos.filter((m) => m.activo || m.id === v.medicamento_id);
    pintar(`${cabecera({ volver, textoVolver: 'Cancelar', titulo })}
      <main class="cuerpo">
        ${modo === 'editar' ? avisoAjeno(reg) : ''}
        <form class="formu" id="f-san" novalidate>
          ${modo === 'realizar' ? '' : `<div class="campo"><span class="et" id="et-est">Estado</span><div class="opciones" role="radiogroup" aria-labelledby="et-est">
            <label><input type="radio" name="estado" value="realizado" ${v.estado === 'realizado' ? 'checked' : ''}> Realizado</label>
            <label><input type="radio" name="estado" value="previsto" ${v.estado === 'previsto' ? 'checked' : ''}> Previsto</label></div></div>`}
          ${campo('tipo', '¿Qué se hace?', `<select id="s-tipo" name="tipo"><option value="">Elige…</option>${grupos.map(([g, gt]) => `<optgroup label="${gt}">${Object.entries(L.SANIDAD).filter(([k, t]) => t.grupo === g && (!t.oculto || k === v.tipo)).map(([k, t]) => opt(k, t.nombre, v.tipo)).join('')}</optgroup>`).join('')}</select>`)}
          ${campo('fecha', v.estado === 'previsto' ? 'Fecha prevista' : 'Fecha en que se realiza', inp('fecha', 'date', v.estado === 'realizado' ? `max="${L.sumarDias(hoy(), 1)}"` : ''))}
          ${T ? `
            ${grupo === 'lechones' ? '' : campo('ambito', '¿A quién o dónde?', `<select id="s-ambito" name="ambito">${(grupo === 'higiene' ? [['zona', 'Una zona'], ['granja', 'Toda la granja']] : [['granja', 'Toda la granja'], ['zona', 'Una zona'], ['cerda', 'Una cerda'], ['camada', 'Los lechones de una cerda'], ['verraco', 'Un verraco']]).map(([k, t]) => opt(k, t, v.ambito)).join('')}</select>`)}
            ${['cerda', 'camada'].includes(v.ambito) ? campo('cerda_id', v.ambito === 'camada' ? 'Camada de la cerda' : 'Cerda', `<select id="s-cerda_id" name="cerda_id"><option value="">Elige…</option>${listaCerdas.filter(Boolean).map((c) => { const cm = L.camada(estadoDe(c.id).actual); return opt(c.id, `${c.crotal} · ${faseNombre(estadoDe(c.id).fase)}${v.ambito === 'camada' && cm ? ` · ${cm.actuales} lechones` : ''}`, v.cerda_id); }).join('')}</select>${v.ambito === 'camada' && !lact.length ? '<span class="ayuda">No hay cerdas lactantes ahora mismo.</span>' : ''}`) : ''}
            ${v.ambito === 'verraco' ? campo('verraco_id', 'Verraco', `<select id="s-verraco_id" name="verraco_id"><option value="">Elige…</option>${verracosActivos().map((x) => opt(x.id, x.crotal, v.verraco_id)).join('')}</select>`) : ''}
            ${v.ambito === 'zona' ? campo('zona', 'Zona', `<select id="s-zona" name="zona"><option value="">Elige…</option>${L.ZONAS.map((z) => opt(z, z, v.zona)).join('')}</select>`) : ''}
            ${['camada', 'zona', 'granja'].includes(v.ambito) && grupo !== 'higiene' ? campo('n_animales', 'Número de animales', inp('n_animales', 'number', 'inputmode="numeric" min="0"'), ' <span class="suave">(opcional)</span>') : ''}
            ${T.edad ? campo('edad', 'Edad de los lechones (días)', inp('edad', 'number', 'inputmode="numeric" min="0"')) : ''}
            ${L.usaProducto(v.tipo) ? `<fieldset><legend>Producto</legend>
              ${campo('medicamento_id', 'Del catálogo', `<select id="s-medicamento_id" name="medicamento_id"><option value="">Otro (escribir abajo)</option>${meds.map((m) => opt(m.id, `${m.nombre}${m.materia_activa ? ` (${m.materia_activa})` : ''}`, v.medicamento_id)).join('')}</select>${meds.length ? '' : '<span class="ayuda">El catálogo está vacío: el profesor puede añadir productos en Sanidad → Medicamentos.</span>'}`)}
              ${v.medicamento_id ? (() => { const m = medPorId(v.medicamento_id); return m ? `<div class="suave peq">${esc([m.materia_activa, m.presentacion, m.supresion_dias != null ? `supresión ${m.supresion_dias} días` : null].filter(Boolean).join(' · '))}${m.ficha_url ? ` · <a href="${esc(m.ficha_url)}" target="_blank" rel="noopener">Ficha técnica</a>` : ''}</div>` : ''; })() : campo('producto', 'Nombre del producto', inp('producto'))}
              <div class="dos">${campo('dosis', 'Dosis', inp('dosis', 'text', 'placeholder="p. ej. 2 ml"'))}${campo('via', 'Vía / modo de aplicación', inp('via', 'text', 'placeholder="IM, oral, pulverizado…"'))}</div>
              ${v.estado === 'realizado' ? `<div class="dos">${campo('lote', 'Lote', inp('lote'))}${campo('caducidad', 'Caducidad', inp('caducidad', 'date'))}</div>` : ''}
            </fieldset>` : ''}
            ${T.motivo || v.tipo === 'otro' ? campo('motivo', v.tipo === 'raboteo' ? 'Motivo (caudofagia detectada)' : 'Motivo', inp('motivo'), v.estado === 'previsto' ? ' <span class="suave">(opcional)</span>' : '') : ''}
            ${campo('repetir_dias', 'Repetir cada (días)', inp('repetir_dias', 'number', 'inputmode="numeric" min="1" placeholder="Vacío si no se repite"'), ' <span class="suave">(opcional)</span>')}
            ${campo('obs', 'Observaciones', `<textarea id="s-obs" name="obs">${esc(v.obs || '')}</textarea>`, ' <span class="suave">(opcional)</span>')}
          ` : '<div class="suave">Elige qué se hace para ver el resto de campos.</div>'}
          <div id="mensajes" aria-live="polite"></div>
          <button class="btn" type="submit" ${T ? '' : 'disabled'}>${modo === 'realizar' ? 'Guardar como hecho' : 'Guardar'}</button>
        </form>
      </main>`);
    const form = document.getElementById('f-san');
    const leer = () => { const fd = new FormData(form); for (const [k, val] of fd.entries()) v[k] = typeof val === 'string' ? val.trim() : val; };
    form.addEventListener('input', () => { leer(); S.borrador.confirmado = false; });
    form.addEventListener('change', (ev) => {
      leer(); S.borrador.confirmado = false;
      if (ev.target.name === 'medicamento_id') {
        const m = medPorId(v.medicamento_id);
        if (m) { v.dosis = v.dosis || m.dosis || ''; v.via = v.via || m.via || ''; v.lote = m.lote || v.lote; v.caducidad = m.caducidad || v.caducidad; }
      }
      const aCamada = v.ambito === 'camada' || (L.SANIDAD[v.tipo] || {}).grupo === 'lechones';
      if (['cerda_id', 'tipo', 'ambito'].includes(ev.target.name) && aCamada && v.cerda_id && !v.n_animales) { const cm = L.camada(estadoDe(v.cerda_id).actual); if (cm) v.n_animales = String(cm.actuales); }
      if (['estado', 'tipo', 'ambito', 'medicamento_id', 'cerda_id'].includes(ev.target.name)) vistaSanidadForm(modo, id, pre);
    });
    form.addEventListener('submit', (ev) => { ev.preventDefault(); leer(); guardarSanidad(modo, reg); });
  }

  async function guardarSanidad(modo, reg) {
    const v = S.borrador.v; const msj = document.getElementById('mensajes');
    const comp = L.comprobarSanidad(v, { hoy: hoy() });
    if (comp.errores.length) { msj.innerHTML = `<div class="error-caja" role="alert"><strong>Revisa:</strong><br>${comp.errores.map(esc).join('<br>')}</div>`; return; }
    if (comp.avisos.length && !S.borrador.confirmado) { S.borrador.confirmado = true; msj.innerHTML = `<div class="aviso-caja" role="alert"><strong>Comprueba antes de guardar:</strong><br>${comp.avisos.map(esc).join('<br>')}<br><br>Si es correcto, pulsa otra vez <strong>Guardar</strong>.</div>`; return; }
    const T = L.SANIDAD[v.tipo]; const m = medPorId(v.medicamento_id); const usa = L.usaProducto(v.tipo);
    const num = (x) => (x === '' || x == null ? null : Math.max(0, parseInt(x, 10) || 0));
    const fila = {
      estado: v.estado, tipo: v.tipo, fecha: v.fecha, ambito: v.ambito,
      cerda_id: ['cerda', 'camada'].includes(v.ambito) ? v.cerda_id || null : null,
      verraco_id: v.ambito === 'verraco' ? v.verraco_id || null : null,
      zona: v.ambito === 'zona' ? v.zona || null : null,
      n_animales: ['camada', 'zona', 'granja'].includes(v.ambito) ? num(v.n_animales) : null,
      medicamento_id: usa && m ? m.id : null,
      producto: usa ? (m ? m.nombre : v.producto || null) : null,
      dosis: usa ? v.dosis || null : null, via: usa ? v.via || null : null,
      lote: usa && v.estado === 'realizado' ? v.lote || null : null,
      caducidad: usa && v.estado === 'realizado' ? v.caducidad || null : null,
      supresion_hasta: v.estado === 'realizado' && m && m.supresion_dias != null && m.supresion_dias > 0 ? L.sumarDias(v.fecha, m.supresion_dias) : null,
      motivo: [v.motivo, T.edad && v.edad ? `${v.edad} días de edad` : ''].filter(Boolean).join(' · ') || null,
      obs: v.obs || null, repetir_dias: num(v.repetir_dias) || null,
    };
    const boton = document.querySelector('#f-san button[type=submit]'); boton.disabled = true; boton.textContent = 'Guardando…';
    let error;
    if (reg) ({ error } = await sb.from('sanidad').update(fila).eq('id', reg.id));
    else ({ error } = await sb.from('sanidad').insert({ ...fila, granja_id: S.granja }));
    // Si se ha hecho y se repite, se programa el siguiente
    let siguiente = null;
    if (!error && fila.estado === 'realizado' && fila.repetir_dias && (!reg || reg.estado === 'previsto' || modo !== 'editar')) {
      siguiente = L.sumarDias(fila.fecha, fila.repetir_dias);
      const prox = { ...fila, estado: 'previsto', fecha: siguiente, lote: null, caducidad: null, supresion_hasta: null, granja_id: S.granja };
      ({ error } = await sb.from('sanidad').insert(prox));
    }
    if (error) { boton.disabled = false; boton.textContent = 'Guardar'; msj.innerHTML = `<div class="error-caja" role="alert">${esc(traducirError(error))}</div>`; return; }
    const pre = S.borrador.pre || {};
    S.borrador = { filtro: S.borrador.filtro, mes: S.borrador.mes };
    toast(siguiente ? `Guardado. Siguiente programado para el ${fmt(siguiente)}` : 'Guardado');
    await refrescar();
    location.hash = pre.ambito === 'cerda' && pre.ref ? `#/cerda/${pre.ref}` : pre.ambito === 'verraco' && pre.ref ? `#/verraco/${pre.ref}` : '#/sanidad';
  }

  // ---- Catálogo: alta y edición de un medicamento (profesor)
  function vistaMedicamento(id) {
    const m = id === 'nuevo' ? {} : medPorId(id);
    if (!m) return vistaNoEncontrado();
    const nuevo = !m.id;
    const f = (n, l, tipo = 'text', extra = '') => `<div class="campo"><label for="m-${n}">${l}</label><input id="m-${n}" name="${n}" type="${tipo}" value="${esc(m[n] ?? '')}" ${extra}></div>`;
    pintar(`${cabecera({ volver: '#/sanidad/medicamentos', textoVolver: 'Medicamentos', titulo: nuevo ? 'Añadir al catálogo' : m.nombre })}
      <main class="cuerpo">
        ${m.ficha_url ? `<a class="btn" href="${esc(m.ficha_url)}" target="_blank" rel="noopener">Abrir la ficha técnica</a>` : ''}
        ${!nuevo && (m.autor_alias || m.modificado_por) ? `<div class="suave peq">${m.autor_alias ? `Añadido por ${esc(verAlias(m.autor_alias))}` : ''}${m.autor_alias && m.modificado_por ? ' · ' : ''}${m.modificado_por ? `última modificación de ${esc(verAlias(m.modificado_por))}` : ''}</div>` : ''}
        ${!nuevo && !esProf() ? '<div class="suave">Puedes completar o corregir los datos del producto. El profesor verá los cambios.</div>' : ''}
        <form class="formu" id="f-med" novalidate>
        ${f('ficha_url', 'Enlace a la ficha técnica', 'url', 'placeholder="https://…" inputmode="url"')}
        <div class="suave peq">Copia aquí el enlace de la ficha técnica del producto (por ejemplo, la de la AEMPS) y rellena los datos principales.</div>
        ${f('nombre', 'Nombre comercial')}
        ${f('materia_activa', 'Materia activa')}
        <div class="campo"><label for="m-tipo">Tipo</label><select id="m-tipo" name="tipo">${TIPOS_MED.map(([k, t]) => `<option value="${k}" ${(m.tipo || 'medicamento') === k ? 'selected' : ''}>${t}</option>`).join('')}</select></div>
        ${f('presentacion', 'Presentación', 'text', 'placeholder="Frasco 100 ml…"')}
        <div class="dos">${f('dosis', 'Dosificación', 'text', 'placeholder="1 ml / 10 kg"')}${f('via', 'Vía / modo de aplicación', 'text', 'placeholder="IM, SC, oral…"')}</div>
        ${f('supresion_dias', 'Periodo de supresión en carne (días)', 'number', 'inputmode="numeric" min="0"')}
        <div class="dos">${f('lote', 'Lote')}${f('caducidad', 'Caducidad', 'date')}</div>
        <div class="campo"><label for="m-notas">Notas</label><textarea id="m-notas" name="notas">${esc(m.notas || '')}</textarea></div>
        ${nuevo || !esProf() ? '' : `<label class="opciones"><input type="checkbox" name="activo" ${m.activo ? 'checked' : ''}> En uso (desmárcalo para retirarlo del catálogo sin perder su historial)</label>`}
        <div id="mensajes" aria-live="polite"></div>
        <button class="btn" type="submit">${nuevo ? 'Añadir' : 'Guardar cambios'}</button>
      </form></main>`);
    document.getElementById('f-med').addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const d = Object.fromEntries(new FormData(ev.target).entries());
      const msj = document.getElementById('mensajes');
      const fila = { nombre: String(d.nombre || '').trim(), materia_activa: d.materia_activa?.trim() || null, tipo: d.tipo, presentacion: d.presentacion?.trim() || null, dosis: d.dosis?.trim() || null, via: d.via?.trim() || null, supresion_dias: d.supresion_dias === '' ? null : Math.max(0, parseInt(d.supresion_dias, 10) || 0), lote: d.lote?.trim() || null, caducidad: d.caducidad || null, ficha_url: d.ficha_url?.trim() || null, notas: d.notas?.trim() || null };
      if (!nuevo && esProf()) fila.activo = d.activo === 'on';
      if (!fila.nombre) { msj.innerHTML = '<div class="error-caja" role="alert">Falta el nombre comercial.</div>'; return; }
      if (fila.ficha_url && !/^https?:\/\//i.test(fila.ficha_url)) { msj.innerHTML = '<div class="error-caja" role="alert">El enlace debe empezar por https://</div>'; return; }
      const { error } = nuevo ? await sb.from('medicamentos').insert(fila) : await sb.from('medicamentos').update(fila).eq('id', m.id);
      if (error) { msj.innerHTML = `<div class="error-caja" role="alert">${esc(/row-level|permission/i.test(error.message || '') && !esProf() ? 'Falta que el profesor ejecute en Supabase el archivo 06_porcino_correcciones.sql para que los alumnos puedan añadir productos.' : traducirError(error))}</div>`; return; }
      toast(nuevo ? 'Añadido al catálogo' : 'Cambios guardados'); await refrescar(); location.hash = '#/sanidad/medicamentos';
    });
  }

  // ---------------------------------------------------------------- correcciones de alumnos (profesor)
  const TABLAS_CORR = { eventos: 'Registro de cerda', sanidad: 'Sanidad', extracciones: 'Extracción', recuentos: 'Recuento', mov_grupos: 'Lechoneras y cebo', medicamentos: 'Catálogo de productos' };
  const META = ['id', 'autor', 'autor_alias', 'creado', 'modificado', 'modificado_por', 'granja_id', 'realizado_por', 'alta_autor'];
  const etiquetaCampo = (() => { const m = { fecha: 'Fecha', cerda_id: 'Cerda', verraco_id: 'Verraco', n: 'Número', estado: 'Estado', tipo: 'Tipo', n_dosis: 'N.º de dosis', motilidad: 'Motilidad', volumen: 'Volumen', fecha_verificacion: 'Verificación', ficha_url: 'Ficha técnica', nombre: 'Nombre', materia_activa: 'Materia activa', supresion_dias: 'Supresión', ubicacion: 'Ubicación', parque: 'Parque de gestación', parque_v: 'Parque de vacías', parque_g: 'Parque de gestación', lechonera: 'Lechones van a', lechones_en: 'Lechones en' };
    for (const T of Object.values(TIPOS)) (function rec(cs) { cs.forEach((c) => { if (c.grupo) rec(c.campos); else if (c.n && c.l && !m[c.n]) m[c.n] = c.l; }); })(T.campos);
    return (k) => m[k] || k.replace(/_/g, ' '); })();
  function cambiosCorr(a, d) {
    const out = []; const ver = (x) => (x == null || x === '' ? '—' : typeof x === 'object' ? JSON.stringify(x) : /^\d{4}-\d{2}-\d{2}$/.test(String(x)) ? fmt(x) : String(x));
    const valor = (k, x) => (k === 'cerda_id' ? (cerdaPorId(x) || {}).crotal || ver(x) : k === 'verraco_id' || k === 'verraco' ? (verracoPorId(x) || {}).crotal || ver(x) : ver(x));
    for (const k of new Set([...Object.keys(a || {}), ...Object.keys(d || {})])) {
      if (META.includes(k)) continue;
      if (k === 'datos') { const da = a.datos || {}, dd = d.datos || {}; for (const j of new Set([...Object.keys(da), ...Object.keys(dd)])) if (JSON.stringify(da[j]) !== JSON.stringify(dd[j]) && j !== 'ubicacion') out.push([etiquetaCampo(j), valor(j, da[j]), valor(j, dd[j])]); continue; }
      if (JSON.stringify(a[k]) !== JSON.stringify(d[k])) out.push([etiquetaCampo(k), valor(k, a[k]), valor(k, d[k])]);
    }
    return out;
  }
  function queEsCorr(c) {
    const d = c.despues || {};
    if (c.tabla === 'eventos') return `${(TIPOS[d.tipo] || {}).nombre || d.tipo} de ${(cerdaPorId(d.cerda_id) || {}).crotal || '?'} · ${fmt(d.fecha)}`;
    if (c.tabla === 'sanidad') return `${nombreSan(d.tipo)} · ${destinoSan(d)} · ${fmt(d.fecha)}`;
    if (c.tabla === 'extracciones') return `Extracción de ${(verracoPorId(d.verraco_id) || {}).crotal || '?'} · ${fmt(d.fecha)}`;
    if (c.tabla === 'recuentos') return `${d.estancia} · ${fmt(d.fecha)}`;
    if (c.tabla === 'mov_grupos') return `${d.tipo} · ${[d.origen, d.destino].filter(Boolean).join(' → ')} · ${fmt(d.fecha)}`;
    if (c.tabla === 'medicamentos') return d.nombre || 'Producto';
    return c.tabla;
  }
  const enlaceCorr = (c) => { const d = c.despues || {}; return c.tabla === 'eventos' ? `#/cerda/${d.cerda_id}` : c.tabla === 'sanidad' ? `#/sanidad/editar/${d.id}` : c.tabla === 'extracciones' ? `#/verraco/${d.verraco_id}` : c.tabla === 'medicamentos' ? `#/medicamento/${d.id}` : ''; };

  function vistaCorrecciones(sec) {
    if (!esAdmin()) return vistaNoEncontrado();
    const lista = S.correcciones.filter((c) => (sec === 'todas' ? true : !c.revisada));
    const tarjeta = (c) => { const cam = cambiosCorr(c.antes, c.despues); const enl = enlaceCorr(c);
      return `<div class="evento"><div class="entre"><strong>${esc(TABLAS_CORR[c.tabla] || c.tabla)}</strong><span class="chip ${c.deshecha ? 'gris' : c.revisada ? '' : 'nar'}">${c.deshecha ? 'Deshecha' : c.revisada ? 'Revisada' : 'Sin revisar'}</span></div>
        <div>${enl ? `<a href="${enl}">${esc(queEsCorr(c))}</a>` : esc(queEsCorr(c))}</div>
        <div class="suave peq">Corrige <strong>${esc(quienEs(c.autor, c.autor_alias))}</strong>${c.curso ? ` (${c.curso}.º)` : ''} · ${fechaHora(new Date(c.creado))} · registro original de ${esc(quienEs(c.antes.autor, c.antes.autor_alias))}</div>
        ${cam.length ? `<table class="tabla"><thead><tr><th>Dato</th><th>Antes</th><th>Ahora</th></tr></thead><tbody>${cam.map(([k, x, y]) => `<tr><td>${esc(k)}</td><td>${esc(x)}</td><td><strong>${esc(y)}</strong></td></tr>`).join('')}</tbody></table>` : '<div class="suave">Sin cambios visibles.</div>'}
        ${c.deshecha ? '' : `<div class="acciones">${c.revisada ? '' : `<button class="btn peq" type="button" data-rev="${c.id}">Correcta</button>`}<button class="btn peligro peq" type="button" data-deshacer="${c.id}">Deshacer</button></div>`}</div>`; };
    pintar(`${cabecera({ volver: '#/inicio', textoVolver: 'Inicio', titulo: 'Correcciones de alumnos' })}
      <main class="cuerpo">
        <div class="suave">Aquí aparece cada vez que un alumno cambia un registro que hizo otra persona. «Correcta» la da por revisada; «Deshacer» devuelve el registro a como estaba.</div>
        ${S.faltaCorr ? '<div class="aviso-caja">Falta ejecutar en Supabase el archivo 06_porcino_correcciones.sql.</div>' : ''}
        <div class="pestanas" role="tablist"><a role="tab" href="#/correcciones/pendientes" class="${sec !== 'todas' ? 'activo' : ''}">Sin revisar (${S.correcciones.filter((c) => !c.revisada).length})</a><a role="tab" href="#/correcciones/todas" class="${sec === 'todas' ? 'activo' : ''}">Todas</a></div>
        ${sec !== 'todas' && lista.length > 1 ? '<button class="btn sec" type="button" id="rev-todas">Marcar todas como correctas</button>' : ''}
        ${lista.length ? lista.map(tarjeta).join('') : '<div class="vacio">No hay correcciones pendientes.</div>'}
      </main>${navegacion('inicio')}`);
    const marcar = async (ids) => { const { error } = await sb.from('correcciones').update({ revisada: true, revisada_en: new Date().toISOString() }).in('id', ids); if (error) { toast(traducirError(error)); return false; } return true; };
    $app.querySelectorAll('[data-rev]').forEach((b) => b.addEventListener('click', async () => { b.disabled = true; if (await marcar([b.dataset.rev])) { await refrescar(); } else b.disabled = false; }));
    const rt = document.getElementById('rev-todas'); if (rt) rt.addEventListener('click', async () => { rt.disabled = true; if (await marcar(lista.map((c) => c.id))) { toast('Revisadas'); await refrescar(); } });
    $app.querySelectorAll('[data-deshacer]').forEach((b) => b.addEventListener('click', async () => {
      if (b.dataset.confirmar !== '1') { b.dataset.confirmar = '1'; b.textContent = '¿Volver a como estaba? Pulsa otra vez'; return; }
      const c = S.correcciones.find((x) => x.id === b.dataset.deshacer); b.disabled = true;
      const fila = {}; for (const [k, x] of Object.entries(c.antes)) if (!META.includes(k)) fila[k] = x;
      const { error } = await sb.from(c.tabla).update(fila).eq('id', c.registro_id);
      if (error) { toast(traducirError(error)); b.disabled = false; return; }
      await sb.from('correcciones').update({ revisada: true, deshecha: true, revisada_en: new Date().toISOString() }).eq('id', c.id);
      toast('Corrección deshecha'); await refrescar();
    }));
  }

  // ---------------------------------------------------------------- ficha del verraco y extracciones
  function usosExtraccion(extId, excluirEvento) { return S.eventos.filter((e) => e.tipo === 'ia' && e.datos && e.datos.extraccion === extId && e.id !== excluirEvento).length; }
  function estadoExtraccion(x, excluirEvento) { return L.estadoDosis(x, usosExtraccion(x.id, excluirEvento), hoy()); }

  function vistaVerraco(id) {
    const x = verracoPorId(id);
    if (!x) return vistaNoEncontrado();
    const s = { ia: 0, ecos: 0, pos: 0, partos: 0, vivos: 0, ultimas: [] };
    for (const c of S.cerdas) for (const ci of estadoDe(c.id).ciclos) {
      if (!ci.ia || ci.ia.datos.verraco !== id) continue;
      s.ia += 1; s.ultimas.push({ c, ci });
      const ult = ci.ecos.filter((e) => e.datos.resultado !== 'dudosa').pop();
      if (ult) { s.ecos += 1; if (ult.datos.resultado === 'positiva') s.pos += 1; }
      if (ci.parto) { s.partos += 1; s.vivos += L.camada(ci).vivos; }
    }
    s.ultimas.sort((a, b) => (a.ci.ia.fecha < b.ci.ia.fecha ? 1 : -1));
    const exts = S.extracciones.filter((e) => e.verraco_id === id).slice().reverse();
    const tarjetaExt = (e) => { const st = estadoExtraccion(e); const chip = { valida: ['Válidas', ''], usar: ['Usar ya', 'nar'], caducada: ['Caducada', 'gris'], agotada: ['Agotada', 'gris'] }[st.estado];
      const puede = esProf() || (e.autor === S.sesion.user.id && Date.now() - new Date(e.creado).getTime() < 864e5);
      return `<div class="evento"><div class="entre"><strong>Extracción del ${fmt(e.fecha)}</strong><span class="chip ${chip[1]}">${chip[0]}</span></div>
        <div class="dos peq"><span>Día ${st.dia} · quedan <strong>${st.restantes}</strong> de ${e.n_dosis} dosis</span><span>Motilidad ${e.motilidad ?? '—'} % · ${e.volumen ?? '—'} c.c.</span></div>
        <div class="suave peq">${e.fecha_verificacion ? `Verificación ${fmt(e.fecha_verificacion)} · ` : ''}${usosExtraccion(e.id)} IA con esta extracción · por ${esc(quienEs(e.autor, e.autor_alias))}</div>
        ${e.obs ? `<div class="suave">${esc(e.obs)}</div>` : ''}
        <div class="acciones"><a class="btn sec peq" href="#/extraccion/${id}/${e.id}">Corregir</a>${puede ? `<button class="btn peligro peq" type="button" data-borrar-ext="${e.id}">Borrar</button>` : ''}</div>
        ${e.modificado ? `<div class="suave peq">Corregida por ${esc(verAlias(e.modificado_por) || '?')}</div>` : ''}</div>`; };
    pintar(`${cabecera({ volver: '#/verracos', textoVolver: 'Verracos', titulo: x.crotal, sub: `${esc(x.raza)}${x.verraquera ? ` · verraquera ${x.verraquera}` : ''}${x.fecha_baja ? ` · <strong>baja ${fmt(x.fecha_baja)}</strong>` : ''}` })}
      <main class="cuerpo">
        <div class="foto"><img src="img/verraco.jpg" alt="Verraco chato murciano"></div>
        ${avisoSQL05()}
        <div class="dos"><div class="dato"><span class="et">Inseminaciones</span><span class="val">${s.ia}</span><span class="nota">registradas</span></div>
          <div class="dato"><span class="et">Ecografías +</span><span class="val">${s.ecos ? Math.round((100 * s.pos) / s.ecos) + ' %' : '—'}</span><span class="nota">${s.pos} de ${s.ecos}</span></div></div>
        <div class="dos"><div class="dato"><span class="et">Partos</span><span class="val">${s.partos}</span><span class="nota">de sus cubriciones</span></div>
          <div class="dato"><span class="et">Vivos por parto</span><span class="val">${s.partos ? (s.vivos / s.partos).toFixed(1).replace('.', ',') : '—'}</span><span class="nota">media</span></div></div>
        <div class="botones"><a class="btn" href="#/extraccion/${id}/nueva">${ICONOS.mas}Registrar extracción</a>${x.fecha_baja ? '' : `<a class="btn sec" href="#/trasladoverraco/${id}">Traslado</a>`}</div>
        <section class="tarjeta"><h2>Extracciones y dosis</h2>${exts.length ? exts.slice(0, 6).map(tarjetaExt).join('') + (exts.length > 6 ? `<details><summary class="suave" style="min-height:44px;display:flex;align-items:center">Ver ${exts.length - 6} anteriores</summary>${exts.slice(6).map(tarjetaExt).join('')}</details>` : '') : '<div class="suave">Sin extracciones registradas.</div>'}
          <div class="suave peq">Día 0 = extracción · aviso el día ${L.REF.dosisAviso} · caducan después del día ${L.REF.dosisCaduca} · cada inseminación usa 2 dosis.</div></section>
        <section class="tarjeta"><h2>Últimas cubriciones</h2>${s.ultimas.length ? s.ultimas.slice(0, 8).map(({ c, ci }) => `<a class="cerda-fila" href="#/cerda/${c.id}"><div><strong>${esc(c.crotal)}</strong><div class="suave">IA ${fmt(ci.ia.fecha)}</div></div><span class="chip ${ci.parto ? '' : ci.cierre ? 'gris' : 'nar'}">${ci.parto ? `${L.camada(ci).vivos} vivos` : ci.cierre === 'aborto' ? 'Aborto' : ci.cierre ? 'Repetición' : 'En curso'}</span></a>`).join('') : '<div class="suave">Sin inseminaciones registradas.</div>'}</section>
        ${seccionSanidad((r) => r.verraco_id === id, `#/sanidad/nuevo/verraco/${id}`)}
        <section class="tarjeta"><h2>Datos</h2><div class="filas">
          <div><span>Crotal</span><span>${esc(x.crotal)}</span></div>${(x.otros_crotales || []).length ? `<div><span>Otros crotales</span><span>${esc(x.otros_crotales.join(' · '))}</span></div>` : ''}<div><span>Raza</span><span>${esc(x.raza)}</span></div>
          <div><span>Nacimiento</span><span>${fmt(x.fecha_nacimiento)}</span></div><div><span>Entrada</span><span>${fmt(x.fecha_entrada)}</span></div>
          <div><span>Verraquera</span><span>${x.verraquera || '—'}</span></div>
          ${x.fecha_baja ? `<div><span>Baja</span><span>${fmt(x.fecha_baja)} · ${esc(x.causa_baja || '')}</span></div>` : ''}</div>
          <a class="btn sec peq" href="#/censo/verraco/${id}">${x.fecha_baja ? 'Ver la baja' : esProf() ? 'Editar datos o dar de baja' : 'Dar de baja'}</a></section>
      </main>${navegacion('verracos')}`);
    enlazarBorrarSan(() => vistaVerraco(id));
    $app.querySelectorAll('[data-borrar-ext]').forEach((b) => b.addEventListener('click', async () => {
      if (b.dataset.confirmar !== '1') { b.dataset.confirmar = '1'; b.textContent = '¿Seguro? Pulsa otra vez'; return; }
      b.disabled = true; const { error } = await sb.from('extracciones').delete().eq('id', b.dataset.borrarExt);
      if (error) { toast(traducirError(error)); b.disabled = false; return; }
      toast('Extracción borrada'); await refrescar(); vistaVerraco(id);
    }));
  }

  function vistaTrasladoVerraco(id) {
    const x = verracoPorId(id);
    if (!x || x.fecha_baja) return vistaNoEncontrado();
    const ocup = (k) => verracosActivos().filter((v) => v.id !== id && String(v.verraquera) === String(k)).map((v) => v.crotal);
    pintar(`${cabecera({ volver: `#/verraco/${id}`, textoVolver: 'Cancelar', titulo: `Traslado de ${x.crotal}`, sub: `Ahora en ${x.verraquera ? `la verraquera ${x.verraquera}` : 'ninguna verraquera'}` })}
      <main class="cuerpo"><form class="formu" id="f-tv" novalidate>
        <div class="campo"><span class="et" id="et-vq">Pasa a la verraquera</span><div class="opciones" role="radiogroup" aria-labelledby="et-vq">
          ${rango(1, 5).map((k) => { const o = ocup(k); return `<label><input type="radio" name="verraquera" value="${k}" ${String(x.verraquera) === k ? 'checked' : ''}> ${k}${o.length ? ` <span class="suave">(${esc(o.join(', '))})</span>` : ''}</label>`; }).join('')}</div></div>
        
        <div id="mensajes" aria-live="polite"></div>
        <button class="btn" type="submit">Guardar traslado</button>
      </form></main>`);
    let confirmado = false;
    document.getElementById('f-tv').addEventListener('submit', async (ev) => {
      ev.preventDefault(); const msj = document.getElementById('mensajes');
      const k = new FormData(ev.target).get('verraquera');
      if (!k) { msj.innerHTML = '<div class="error-caja" role="alert">Elige la verraquera.</div>'; return; }
      if (String(k) === String(x.verraquera)) { msj.innerHTML = '<div class="error-caja" role="alert">Ya está en esa verraquera.</div>'; return; }
      if (ocup(k).length && !confirmado) { confirmado = true; msj.innerHTML = `<div class="aviso-caja" role="alert">La verraquera ${k} ya tiene a ${esc(ocup(k).join(', '))}. Si van a compartirla, pulsa otra vez <strong>Guardar traslado</strong>.</div>`; return; }
      const { error } = await sb.from('verracos').update({ verraquera: Number(k) }).eq('id', id);
      if (error) { msj.innerHTML = `<div class="error-caja" role="alert">${esc(/Solo el profesor/.test(error.message || '') ? 'Falta volver a ejecutar en Supabase el archivo 07_censo_alumnos.sql para que los alumnos puedan trasladar verracos.' : traducirError(error))}</div>`; return; }
      toast(`${x.crotal} pasa a la verraquera ${k}`); await refrescar(); location.hash = `#/verraco/${id}`;
    });
  }

  function vistaExtraccion(verracoId, extId) {
    const x = verracoPorId(verracoId);
    if (!x || S.faltaSQL05) return x ? vistaVerraco(verracoId) : vistaNoEncontrado();
    const e = extId && extId !== 'nueva' ? S.extracciones.find((y) => y.id === extId) : null;
    if (extId && extId !== 'nueva' && !e) return vistaNoEncontrado();
    const v = e || { fecha: hoy(), fecha_verificacion: '', n_dosis: '', motilidad: '', volumen: '', obs: '' };
    const f = (n, l, tipo, extra = '') => `<div class="campo"><label for="x-${n}">${l}</label><input id="x-${n}" name="${n}" type="${tipo}" value="${esc(v[n] ?? '')}" ${extra}></div>`;
    pintar(`${cabecera({ volver: `#/verraco/${verracoId}`, textoVolver: 'Cancelar', titulo: `${e ? 'Corregir' : 'Registrar'} extracción`, sub: `Verraco ${esc(x.crotal)}` })}
      <main class="cuerpo"><div class="foto"><img src="img/verraco.jpg" alt=""></div>
        ${avisoAjeno(e)}
        <form class="formu" id="f-ext" novalidate>
          <div class="dos">${f('fecha', 'Fecha de extracción', 'date', `max="${L.sumarDias(hoy(), 1)}"`)}${f('fecha_verificacion', 'Fecha de verificación', 'date')}</div>
          <div class="suave peq">La verificación es la comprobación de la dosis conservada (opcional).</div>
          ${f('n_dosis', 'N.º de dosis obtenidas', 'number', 'inputmode="numeric" min="0"')}
          <div class="dos">${f('motilidad', 'Motilidad (%)', 'number', 'inputmode="numeric" min="0" max="100"')}${f('volumen', 'Volumen del eyaculado (c.c.)', 'number', 'inputmode="numeric" min="0"')}</div>
          <div class="campo"><label for="x-obs">Observaciones</label><textarea id="x-obs" name="obs">${esc(v.obs || '')}</textarea></div>
          <div id="mensajes" aria-live="polite"></div>
          <button class="btn" type="submit">${e ? 'Guardar corrección' : 'Guardar'}</button>
        </form></main>`);
    document.getElementById('f-ext').addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const d = Object.fromEntries(new FormData(ev.target).entries()); const msj = document.getElementById('mensajes');
      const n = (k) => (d[k] === '' ? null : parseInt(d[k], 10));
      const fila = { verraco_id: verracoId, fecha: d.fecha, fecha_verificacion: d.fecha_verificacion || null, n_dosis: n('n_dosis'), motilidad: n('motilidad'), volumen: n('volumen'), obs: d.obs.trim() || null };
      const err = [];
      if (!fila.fecha) err.push('Falta la fecha de extracción.'); else if (fila.fecha > L.sumarDias(hoy(), 1)) err.push('La fecha no puede ser futura.');
      if (fila.n_dosis == null || fila.n_dosis < 0) err.push('Indica el número de dosis.');
      if (fila.motilidad != null && (fila.motilidad < 0 || fila.motilidad > 100)) err.push('La motilidad va de 0 a 100 %.');
      if (fila.fecha_verificacion && fila.fecha && fila.fecha_verificacion < fila.fecha) err.push('La verificación no puede ser anterior a la extracción.');
      if (err.length) { msj.innerHTML = `<div class="error-caja" role="alert">${err.map(esc).join('<br>')}</div>`; return; }
      const { error } = e ? await sb.from('extracciones').update(fila).eq('id', e.id) : await sb.from('extracciones').insert({ ...fila, granja_id: S.granja });
      if (error) { msj.innerHTML = `<div class="error-caja" role="alert">${esc(traducirError(error))}</div>`; return; }
      toast('Extracción guardada'); await refrescar(); location.hash = `#/verraco/${verracoId}`;
    });
  }

  // ---------------------------------------------------------------- cuenta
  function vistaCuenta(mensaje) {
    pintar(`${cabecera()}
      <main class="cuerpo">
        <h1 style="font-size:22px">Tu cuenta</h1>
        <section class="tarjeta"><div class="filas">
          ${S.perfil.nombre ? `<div><span>Nombre</span><span>${esc(S.perfil.nombre)}</span></div>` : ''}
          <div><span>Alias</span><span>${esc(S.perfil.alias)}</span></div>
          <div><span>Rol</span><span>${rolNombre()}</span></div>
          ${esProf() ? '' : `<div><span>Curso</span><span>${S.perfil.granja_id}.º</span></div>`}</div></section>
        <a class="btn sec" href="../#/granjas">Granjas del centro</a>
        ${mensaje || ''}
        <form class="formu tarjeta" id="f-clave" novalidate>
          <h2>${esProf() ? 'Cambiar contraseña' : 'Cambiar PIN'}</h2>
          <div class="campo"><label for="n1">${esProf() ? 'Nueva contraseña (mínimo 8 caracteres)' : 'Nuevo PIN (6 cifras)'}</label>
            <input id="n1" name="n1" type="password" ${esProf() ? '' : 'inputmode="numeric" maxlength="6"'} autocomplete="new-password"></div>
          <div class="campo"><label for="n2">Repítelo</label>
            <input id="n2" name="n2" type="password" ${esProf() ? '' : 'inputmode="numeric" maxlength="6"'} autocomplete="new-password"></div>
          <button class="btn" type="submit">Guardar</button>
        </form>
        <section class="tarjeta"><h2>Instalar en el móvil</h2>
          <div class="suave">Android: en Chrome, menú ⋮ → <strong>Instalar aplicación</strong>.<br>iPhone: en Safari, botón Compartir → <strong>Añadir a pantalla de inicio</strong>.</div></section>
        <button class="btn sec" type="button" data-accion="salir">Salir</button>
        <div class="suave peq" style="text-align:center">CIFEAPORC · versión ${esc(C.version)}</div>
      </main>${navegacion('cuenta')}`);
    document.getElementById('f-clave').addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const f = new FormData(ev.target); const a = String(f.get('n1')); const b = String(f.get('n2'));
      const ok = esProf() ? a.length >= 8 : /^\d{6}$/.test(a);
      const err = (t) => vistaCuenta(`<div class="error-caja" role="alert">${esc(t)}</div>`);
      if (!ok) return err(esProf() ? 'La contraseña debe tener al menos 8 caracteres.' : 'El PIN debe tener 6 cifras.');
      if (a !== b) return err('No coinciden.');
      const { error } = await sb.auth.updateUser({ password: a });
      if (error) return err(traducirError(error));
      vistaCuenta(`<div class="ok-caja" role="status">${esProf() ? 'Contraseña cambiada.' : 'PIN cambiado.'}</div>`);
    });
  }

  // ---------------------------------------------------------------- gestión (profesor)
  async function cargarPerfiles() {
    const { data, error } = await sb.from('perfiles').select('*').order('alias');
    if (error) throw error;
    S.perfiles = data;
  }

  function vistaAdmin(seccion = 'censo', extra) {
    if (!esProf()) return vistaNoEncontrado();
    if (!esAdmin() && seccion === 'alumnos') seccion = 'censo';
    const pest = `<div class="pestanas" role="tablist">${(esAdmin() ? [['censo', 'Censo'], ['alumnos', 'Alumnos'], ['granja', 'Granja']] : [['censo', 'Censo'], ['granja', 'Granja']]).map(([id, t]) =>
      `<a role="tab" href="#/admin/${id}" class="${seccion === id ? 'activo' : ''}" aria-selected="${seccion === id}">${t}</a>`).join('')}</div>`;
    let cuerpo = '';
    if (seccion === 'censo') cuerpo = adminCenso(extra);
    if (seccion === 'alumnos') {
      if (!S.perfiles) { cargarPerfiles().then(() => vistaAdmin('alumnos', extra)).catch((e) => toast(traducirError(e))); cuerpo = '<div class="suave">Cargando alumnos…</div>'; }
      else cuerpo = adminAlumnos(extra);
    }
    if (seccion === 'granja') cuerpo = adminGranja(extra);
    pintar(`${cabecera({ prof: true })}<main class="cuerpo"><h1 style="font-size:22px">Gestión${esAdmin() ? ' del profesor' : ' de la granja'}</h1>${pest}${cuerpo}</main>${navegacion('admin')}`);
    enlazarAdmin(seccion);
  }

  function adminCenso(msg) {
    const fila = (x, tipo) => `<a class="cerda-fila" href="#/admin/${tipo}/${x.id}"><div><strong>${esc(x.crotal)}</strong>
      <div class="suave">${x.fecha_baja ? `Baja ${fmt(x.fecha_baja)} · ${esc(x.causa_baja || '')}` : tipo === 'verraco' ? `Verraquera ${x.verraquera || '—'}` : esc(x.origen ? `Procede de ${x.origen}` : x.raza)}</div></div>
      <span class="chip ${x.fecha_baja ? 'gris' : ''}">${x.fecha_baja ? 'Baja' : 'Editar'}</span></a>`;
    const activas = S.cerdas.filter((x) => !x.fecha_baja), bajas = S.cerdas.filter((x) => x.fecha_baja);
    return `${msg || ''}
      <section class="tarjeta"><div class="entre"><h2>Cerdas (${activas.length})</h2><a class="btn peq" href="#/admin/cerda/nueva">${ICONOS.mas}Alta</a></div>
        <div class="lista">${activas.map((x) => fila(x, 'cerda')).join('') || '<div class="suave">Sin cerdas.</div>'}</div>
        ${bajas.length ? `<details><summary class="suave">Ver ${bajas.length} cerdas dadas de baja</summary><div class="lista" style="margin-top:8px">${bajas.map((x) => fila(x, 'cerda')).join('')}</div></details>` : ''}</section>
      <section class="tarjeta"><div class="entre"><h2>Verracos (${verracosActivos().length})</h2><a class="btn peq" href="#/admin/verraco/nuevo">${ICONOS.mas}Alta</a></div>
        <div class="lista">${S.verracos.map((x) => fila(x, 'verraco')).join('') || '<div class="suave">Sin verracos.</div>'}</div></section>`;
  }

  function vistaAnimal(tipo, id, desde = 'admin') {
    if (!['cerda', 'verraco'].includes(tipo)) return vistaNoEncontrado();
    if (desde === 'admin' && !esProf()) return vistaNoEncontrado();
    const lista = tipo === 'cerda' ? S.cerdas : S.verracos;
    const x = lista.find((a) => a.id === id) || {};
    const nuevo = !x.id;
    const t = tipo === 'cerda' ? 'cerda' : 'verraco';
    // Un alumno solo cambia los datos de un animal que dio de alta él hace menos de 24 h; dar de baja, cualquiera
    const editaDatos = nuevo || esProf() || (x.alta_autor === S.sesion.user.id && Date.now() - new Date(x.creado).getTime() < 864e5);
    const editaBaja = !nuevo && (esProf() || !x.fecha_baja || editaDatos);
    const volver = desde === 'admin' ? '#/admin/censo' : nuevo ? (tipo === 'cerda' ? '#/cerdas' : '#/verracos') : `#/${tipo}/${x.id}`;
    pintar(`${cabecera({ prof: desde === 'admin', volver, textoVolver: desde === 'admin' ? 'Censo' : 'Volver', titulo: nuevo ? `Alta de ${t}` : `${tipo === 'cerda' ? 'Cerda' : 'Verraco'} ${x.crotal}` })}
      <main class="cuerpo">
        ${S.faltaSQL07 && !esProf() ? '<div class="aviso-caja">Para que los alumnos den altas y bajas, el profesor tiene que ejecutar en Supabase el archivo 07_censo_alumnos.sql.</div>' : ''}
        ${!nuevo && (x.alta_por || x.baja_por) ? `<div class="suave peq">${x.alta_por ? `Alta registrada por ${esc(quienEs(x.alta_autor, x.alta_por))}` : ''}${x.alta_por && x.baja_por ? ' · ' : ''}${x.baja_por ? `Baja registrada por ${esc(x.baja_por)}` : ''}</div>` : ''}
        ${!editaDatos ? '<div class="suave">Los datos del animal solo los cambia el profesor. Tú puedes darlo de baja.</div>' : ''}
        <form class="formu" id="f-animal" novalidate><fieldset class="sin-borde" ${editaDatos ? '' : 'disabled'}>
        <div class="campo"><label for="a-crotal">Crotal principal</label><input id="a-crotal" name="crotal" type="text" value="${esc(x.crotal)}" required></div>
        ${tipo === 'cerda' || tipo === 'verraco' ? `<div class="campo"><label for="a-otros">Otros crotales <span class="suave">(opcional, separados por comas)</span></label><input id="a-otros" name="otros" type="text" value="${esc((x.otros_crotales || []).join(', '))}"></div>` : ''}
        <div class="campo"><label for="a-raza">Raza</label><input id="a-raza" name="raza" type="text" value="${esc(x.raza || 'Chato murciano')}"></div>
        <div class="dos"><div class="campo"><label for="a-nac">Nacimiento</label><input id="a-nac" name="fecha_nacimiento" type="date" value="${esc(x.fecha_nacimiento || '')}"></div>
          <div class="campo"><label for="a-ent">Entrada en granja</label><input id="a-ent" name="fecha_entrada" type="date" value="${esc(x.fecha_entrada || '')}"></div></div>
        ${tipo === 'cerda' ? `<div class="campo"><label for="a-ori">Explotación de procedencia <span class="suave">(reposición)</span></label><input id="a-ori" name="origen" type="text" value="${esc(x.origen || '')}"></div>`
          : `<div class="campo"><label for="a-vq">Verraquera</label><select id="a-vq" name="verraquera"><option value="">—</option>${rango(1, 5).map((k) => `<option ${String(x.verraquera) === k ? 'selected' : ''}>${k}</option>`).join('')}</select></div>`}
        </fieldset>
        ${nuevo ? '' : `<fieldset ${editaBaja ? '' : 'disabled'}><legend>Baja</legend><div class="campo"><label for="a-fb">Fecha de baja</label><input id="a-fb" name="fecha_baja" type="date" max="${hoy()}" value="${esc(x.fecha_baja || (desde === 'censo' && !editaDatos ? hoy() : ''))}"></div>
          ${(() => { const enLista = L.CAUSAS_ADULTO.includes(x.causa_baja); const sel = x.causa_baja ? (enLista ? x.causa_baja : 'Otros') : '';
            return `<div class="campo"><label for="a-cb">Causa</label><select id="a-cb" name="causa_sel"><option value="">Elige…</option>${L.CAUSAS_ADULTO.map((k) => `<option ${sel === k ? 'selected' : ''}>${k}</option>`).join('')}</select></div>
            <div class="campo" id="a-otra" ${sel === 'Otros' ? '' : 'hidden'}><label for="a-co">Escribe la causa</label><input id="a-co" name="causa_otra" type="text" value="${esc(enLista ? '' : x.causa_baja || '')}"></div>`; })()}
          <div class="suave peq">Al dar de baja, el animal deja de aparecer en el censo, pero su historial se conserva.${esProf() ? ' Para anularla, vacía la fecha.' : ' Si te equivocas, avisa al profesor para anularla.'}</div></fieldset>`}
        <div id="mensajes" aria-live="polite"></div>
        ${editaDatos || editaBaja ? `<button class="btn" type="submit">${nuevo ? 'Dar de alta' : editaDatos ? 'Guardar cambios' : 'Dar de baja'}</button>` : ''}
      </form></main>`);
    const selCausa = document.getElementById('a-cb');
    if (selCausa) selCausa.addEventListener('change', () => { document.getElementById('a-otra').hidden = selCausa.value !== 'Otros'; });
    document.getElementById('f-animal').addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const f = Object.fromEntries(new FormData(ev.target).entries());
      const reg = { crotal: String(f.crotal || '').trim(), raza: String(f.raza || '').trim() || 'Chato murciano', fecha_nacimiento: f.fecha_nacimiento || null, fecha_entrada: f.fecha_entrada || null };
      reg.otros_crotales = String(f.otros || '').split(',').map((s) => s.trim()).filter(Boolean);
      if (tipo === 'cerda') reg.origen = String(f.origen || '').trim() || null;
      else reg.verraquera = f.verraquera ? Number(f.verraquera) : null;
      if (tipo === 'verraco' && S.verracos.length && !('otros_crotales' in S.verracos[0])) delete reg.otros_crotales; // aún sin el SQL 06
      if (!nuevo) { reg.fecha_baja = f.fecha_baja || null; reg.causa_baja = (f.causa_sel === 'Otros' ? String(f.causa_otra || '').trim() : f.causa_sel) || null; }
      const msj = document.getElementById('mensajes');
      if (!editaDatos) { // alumno dando de baja: solo se envían la fecha y la causa
        if (!reg.fecha_baja) { msj.innerHTML = '<div class="error-caja" role="alert">Indica la fecha de la baja.</div>'; return; }
        for (const k of Object.keys(reg)) if (!['fecha_baja', 'causa_baja'].includes(k)) delete reg[k];
        reg.crotal = x.crotal;
      }
      if (reg.fecha_baja && reg.fecha_baja > hoy()) { msj.innerHTML = '<div class="error-caja" role="alert">La fecha de baja no puede ser futura.</div>'; return; }
      if (!reg.crotal) { msj.innerHTML = '<div class="error-caja" role="alert">Falta el crotal.</div>'; return; }
      if (reg.fecha_baja && !reg.causa_baja) { msj.innerHTML = '<div class="error-caja" role="alert">Indica la causa de la baja.</div>'; return; }
      const tabla = tipo === 'cerda' ? 'cerdas' : 'verracos';
      if (!editaDatos) delete reg.crotal;
      const { data: hecho, error } = nuevo ? await sb.from(tabla).insert(reg).select('id').maybeSingle() : await sb.from(tabla).update(reg).eq('id', x.id).select('id').maybeSingle();
      if (error) { msj.innerHTML = `<div class="error-caja" role="alert">${esc(traducirError(error))}</div>`; return; }
      toast(nuevo ? 'Alta guardada' : reg.fecha_baja && !x.fecha_baja ? 'Baja guardada' : 'Cambios guardados');
      await refrescar(); location.hash = desde === 'admin' ? '#/admin/censo' : nuevo ? (hecho ? `#/${tipo}/${hecho.id}` : volver) : reg.fecha_baja ? (tipo === 'cerda' ? '#/cerdas' : '#/verracos') : `#/${tipo}/${x.id}`;
    });
  }

  const pinAzar = () => String(Math.floor(100000 + Math.random() * 900000));
  const espera = (ms) => new Promise((r) => setTimeout(r, ms));
  // Crea la cuenta de un alumno (alias + PIN) y su perfil. Devuelve null si va bien o el texto del error.
  async function crearAcceso(alias, pin, granja, nombre) {
    // Cliente aparte para no cerrar la sesión del profesor.
    const sb2 = window.supabase.createClient(C.supabaseUrl, C.supabaseKey, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false, storageKey: 'cife-alta' } });
    const { data, error } = await sb2.auth.signUp({ email: `${alias.toLowerCase()}.g${granja}@${C.dominioAlumnos}`, password: pin });
    if (error) return traducirError(error);
    if (!data.user || (data.user.identities && data.user.identities.length === 0)) return 'Ese alias ya existe en ese curso.';
    const r = await sb.from('perfiles').insert({ user_id: data.user.id, alias, rol: 'alumno', granja_id: granja, ...(nombre ? { nombre } : {}) });
    return r.error ? traducirError(r.error) : null;
  }
  // "LÓPEZ GARCÍA, JUAN" o "Juan López García" → "Juan L." (se puede corregir antes de crear)
  const capital = (t) => t.toLocaleLowerCase('es').replace(/(^|[\s-])(\p{L})/gu, (m, a, b) => a + b.toLocaleUpperCase('es'));
  function acortarNombre(linea, acortar) {
    const t = linea.replace(/\t+/g, ' ').replace(/\s+/g, ' ').trim();
    if (!t) return '';
    let nombre, apellido;
    if (t.includes(',')) { const [a, n] = t.split(','); apellido = a.trim(); nombre = (n || '').trim(); }
    else {
      // Desde el final: hasta dos apellidos, cada uno con sus partículas (de, del, la…).
      const w = t.split(' '); if (w.length === 1) return capital(w[0]);
      const part = /^(de|del|la|las|los|y|san)$/i; let i = w.length; const grupos = [];
      while (grupos.length < 2 && i > 1) { let j = i - 1; while (j > 1 && part.test(w[j - 1])) j -= 1; grupos.unshift(w.slice(j, i).join(' ')); i = j; }
      nombre = w.slice(0, i).join(' '); apellido = grupos.join(' ');
    }
    if (!nombre) return capital(apellido).slice(0, 40);
    const minus = (x) => x.replace(/ (De|Del|La|Las|Los|Y|San) /g, (m) => m.toLocaleLowerCase('es'));
    if (!acortar) return minus(capital(`${nombre} ${apellido}`)).slice(0, 40);
    const ini = (apellido.split(' ').find((x) => !/^(de|del|la|las|los|y)$/i.test(x)) || '')[0];
    return `${capital(nombre)}${ini ? ` ${ini.toLocaleUpperCase('es')}.` : ''}`.slice(0, 40);
  }
  function siguienteAlias(prefijo, granja, usados) {
    let maxN = 0;
    for (const a of usados) { const m = a.match(new RegExp(`^${prefijo}(\\d+)$`)); if (m) maxN = Math.max(maxN, Number(m[1])); }
    return () => { maxN += 1; return `${prefijo}${String(maxN).padStart(2, '0')}`; };
  }

  function bloqueVarios() {
    const L = S.borrador.lote;
    if (S.borrador.resultado) {
      const R = S.borrador.resultado;
      const filas = R.map((r) => `<tr><td>${esc(r.nombre || '—')}</td><td><strong>${esc(r.alias)}</strong></td><td>${r.error ? `<span class="chip rojo">${esc(r.error)}</span>` : `<strong>${esc(r.pin)}</strong>`}</td></tr>`).join('');
      return `<section class="tarjeta"><h2>Accesos creados (${R.filter((r) => !r.error).length} de ${R.length})</h2>
        <div class="aviso-caja"><strong>Copia o imprime esta lista ahora:</strong> los PIN no se vuelven a mostrar. Entrégale a cada alumno su alias y su PIN.</div>
        <table class="tabla"><thead><tr><th>Nombre</th><th>Alias</th><th>PIN</th></tr></thead><tbody>${filas}</tbody></table>
        <div class="botones"><button class="btn sec peq" type="button" data-accion="copiar-lista">Copiar lista</button><button class="btn sec peq" type="button" data-accion="imprimir">Imprimir</button><button class="btn peq" type="button" data-accion="cerrar-lista">Hecho</button></div></section>`;
    }
    if (L) {
      return `<form class="formu tarjeta" id="f-lote" novalidate><h2>Revisa la lista · ${esc(nombreGranja(L.granja))}</h2>
        <div class="suave peq">Corrige los nombres o los alias si hace falta. Al pulsar Crear se generan los accesos uno a uno (tarda unos segundos por alumno).</div>
        <table class="tabla"><thead><tr><th>Nombre</th><th>Alias</th></tr></thead><tbody>${L.filas.map((f, i) => `<tr>
          <td><input type="text" name="n${i}" aria-label="Nombre ${i + 1}" maxlength="40" value="${esc(f.nombre)}"></td>
          <td style="width:96px"><input type="text" name="a${i}" aria-label="Alias ${i + 1}" maxlength="10" value="${esc(f.alias)}"></td></tr>`).join('')}</tbody></table>
        <div id="progreso" aria-live="polite"></div>
        <div class="botones"><button class="btn sec" type="button" data-accion="cancelar-lote">Cancelar</button><button class="btn" type="submit">Crear ${L.filas.length} accesos</button></div></form>`;
    }
    return `<details class="tarjeta"><summary style="min-height:44px;display:flex;align-items:center;font-weight:700">Añadir varios alumnos a la vez</summary>
      <form class="formu" id="f-varios" novalidate style="margin-top:10px">
        <div class="campo"><span class="et" id="et-gv">Curso</span><div class="opciones" role="radiogroup" aria-labelledby="et-gv">
          <label><input type="radio" name="granja" value="1" checked> 1.º curso</label><label><input type="radio" name="granja" value="2"> 2.º curso</label></div></div>
        <div class="campo"><label for="v-lista">Pega la lista (un alumno por línea)</label>
          <textarea id="v-lista" name="lista" rows="8" placeholder="LÓPEZ GARCÍA, JUAN\nMartínez Ruiz, Eva\nAna Pérez Sánchez"></textarea>
          <span class="ayuda">Vale copiar la columna de nombres de un Excel o de la lista de clase.</span></div>
        <div class="opciones"><label><input type="checkbox" name="acortar" checked> Guardar solo nombre e inicial del apellido (recomendado)</label></div>
        <div class="campo"><label for="v-pref">Letra de los alias</label><input id="v-pref" name="prefijo" type="text" maxlength="2" autocapitalize="characters" placeholder="A para 1.º, B para 2.º"></div>
        <button class="btn" type="submit">Revisar lista</button></form></details>`;
  }

  function adminAlumnos(msg) {
    const alumnos = S.perfiles.filter((p) => p.rol === 'alumno');
    const profes = S.perfiles.filter((p) => p.rol === 'profesor');
    const pin = pinAzar();
    const porGranja = (g) => alumnos.filter((a) => a.granja_id === g).map((a) => `
      <div class="evento"><div class="entre"><strong>${esc(a.alias)}${a.nombre ? ` · ${esc(a.nombre)}` : ''}</strong><span class="chip ${a.activo ? '' : 'gris'}">${a.activo ? 'Activo' : 'Desactivado'}</span></div>
        ${S.borrador.editNombre === a.user_id ? `<form class="entre" data-form-nombre="${a.user_id}" novalidate style="gap:8px"><input name="nombre" type="text" aria-label="Nombre de ${esc(a.alias)}" maxlength="40" value="${esc(a.nombre || '')}" placeholder="Nombre e inicial (Juan G.)"><button class="btn peq" type="submit">Guardar</button></form>` : ''}
        <div class="acciones"><button class="btn sec peq" type="button" data-nombre="${a.user_id}">${a.nombre ? 'Cambiar nombre' : 'Poner nombre'}</button>
        <button class="btn sec peq" type="button" data-pin="${a.user_id}" data-alias="${esc(a.alias)}">Nuevo PIN</button>
        <button class="btn sec peq" type="button" data-activo="${a.user_id}" data-valor="${a.activo ? '0' : '1'}">${a.activo ? 'Desactivar' : 'Activar'}</button></div></div>`).join('') || '<div class="suave">Sin alumnos.</div>';
    if (S.borrador.resultado) return `${msg || ''}${bloqueVarios()}`;
    return `${msg || ''}
      <form class="formu tarjeta" id="f-alumno" novalidate><h2>Añadir alumno</h2>
        <div class="campo"><span class="et" id="et-ga">Curso</span><div class="opciones" role="radiogroup" aria-labelledby="et-ga">
          <label><input type="radio" name="granja" value="1" checked> 1.º curso</label><label><input type="radio" name="granja" value="2"> 2.º curso</label></div></div>
        <div class="dos"><div class="campo"><label for="al-alias">Alias</label><input id="al-alias" name="alias" type="text" autocapitalize="characters" placeholder="A07"></div>
          <div class="campo"><label for="al-pin">PIN</label><input id="al-pin" name="pin" type="text" inputmode="numeric" maxlength="6" value="${pin}"></div></div>
        <div class="campo"><label for="al-nombre">Nombre <span class="suave">(opcional: nombre e inicial del apellido)</span></label><input id="al-nombre" name="nombre" type="text" maxlength="40" placeholder="Juan G."></div>
        <div class="suave peq">El nombre solo lo ven los compañeros de su curso y el profesor. Se borra al cerrar el curso. Para entrar se usa siempre el alias y el PIN.</div>
        <button class="btn" type="submit">Crear acceso</button></form>
      ${bloqueVarios()}
      <section class="tarjeta"><h2>Alumnos · 1.º curso</h2>${porGranja(1)}</section>
      <section class="tarjeta"><h2>Alumnos · 2.º curso</h2>${porGranja(2)}</section>
      <section class="tarjeta"><h2>Profesores</h2>${profes.map((p) => `<div>${esc(p.alias)}</div>`).join('')}
        <div class="suave peq">Para añadir otro profesor, sigue la guía de puesta en marcha (paso del profesor).</div></section>
      <section class="aviso-caja"><strong>Cambio de curso escolar</strong><br>Desactiva a todos los alumnos y <strong>borra sus nombres</strong>. Sus registros se conservan con el alias. Después crea los alias del curso nuevo.
        <div style="margin-top:10px"><button class="btn peligro peq" type="button" data-accion="fin-curso">Cerrar el curso</button></div></section>`;
  }

  // ---------------------------------------------------------------- copia de seguridad
  async function leerTodo() {
    const tablas = {};
    for (const [t, orden] of [['granjas', 'id'], ['cerdas', 'crotal'], ['verracos', 'crotal'], ['perfiles', 'alias']]) {
      const { data, error } = await sb.from(t).select('*').order(orden);
      if (error) throw error;
      tablas[t] = data;
    }
    for (const t of ['medicamentos', 'sanidad', 'extracciones', 'recuentos', 'mov_grupos', 'censo_mov']) {
      const { data, error } = await sb.from(t).select('*');
      tablas[t] = error ? [] : data;
    }
    // Eventos de las dos granjas, por páginas de 1000
    tablas.eventos = [];
    for (let desde = 0; ; desde += 1000) {
      const { data, error } = await sb.from('eventos').select('*').order('granja_id').order('fecha').order('creado').range(desde, desde + 999);
      if (error) throw error;
      tablas.eventos.push(...data);
      if (data.length < 1000) break;
    }
    return tablas;
  }
  const cargarScript = (src) => new Promise((ok, mal) => { const sc = document.createElement('script'); sc.src = src; sc.onload = ok; sc.onerror = () => mal(new Error('No se pudo cargar el generador de Excel. Revisa la conexión.')); document.head.appendChild(sc); });
  function descargar(nombre, contenido, tipo) {
    const url = URL.createObjectURL(contenido instanceof Blob ? contenido : new Blob([contenido], { type: tipo }));
    const a = document.createElement('a'); a.href = url; a.download = nombre; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }
  async function descargarCopia(formato, boton) {
    const estado = document.getElementById('estado-copia');
    boton.disabled = true; estado.innerHTML = '<div class="ok-caja">Preparando la copia…</div>';
    try {
      const T = await leerTodo();
      if (esVet()) {
        T.perfiles = T.perfiles.filter((p) => p.rol !== 'alumno');
        for (const filas of Object.values(T)) if (Array.isArray(filas)) for (const r of filas) for (const k of ['autor_alias', 'realizado_por', 'alta_por', 'baja_por', 'modificado_por']) if (r && r[k]) r[k] = verAlias(r[k], k === 'autor_alias' ? r.granja_id : null);
      }
      const sello = new Date(); const fichero = `CIFEAPORC_copia_${sello.getFullYear()}-${dos(sello.getMonth() + 1)}-${dos(sello.getDate())}_${dos(sello.getHours())}${dos(sello.getMinutes())}`;
      // Nunca se exportan contraseñas ni PIN (no están en estas tablas).
      const perfiles = T.perfiles.map(({ user_id, alias, nombre, rol, granja_id, activo, creado }) => ({ user_id, alias, nombre: nombre ?? null, rol, granja_id, activo, creado }));
      if (formato === 'json') {
        const copia = { app: 'CIFEAPORC', version: C.version, fecha: sello.toISOString(), granjas: T.granjas, cerdas: T.cerdas, verracos: T.verracos, perfiles, eventos: T.eventos, medicamentos: T.medicamentos, sanidad: T.sanidad, extracciones: T.extracciones, recuentos: T.recuentos, mov_grupos: T.mov_grupos, censo_mov: T.censo_mov };
        descargar(`${fichero}.json`, JSON.stringify(copia, null, 1), 'application/json');
      } else {
        if (!window.XLSX) await cargarScript('https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js');
        const crotalDe = Object.fromEntries(T.cerdas.map((c) => [c.id, c.crotal]));
        const aliasDe = Object.fromEntries(perfiles.map((p) => [p.user_id, p.nombre ? `${p.nombre} (${p.alias})` : p.alias]));
        const verracoDe = Object.fromEntries(T.verracos.map((v) => [v.id, v.crotal]));
        const fila = (e) => {
          const d = e.datos || {};
          const resumen = e.tipo === 'ia' ? `Verraco ${verracoDe[d.verraco] || d.verraco_crotal || 'no anotado'}` : resumenTexto(e);
          return { Granja: e.granja_id === 1 ? '1.º' : '2.º', Cerda: crotalDe[e.cerda_id] || '?', Fecha: e.fecha, Evento: TIPOS[e.tipo] ? TIPOS[e.tipo].nombre : e.tipo, Detalle: resumen, Ubicación: d.ubicacion || '', Observaciones: d.obs || d.texto || '', 'Registrado por': d.origen === 'historico' ? 'Fichas anteriores' : (aliasDe[e.autor] || e.autor_alias || ''), 'Registrado el': e.creado ? e.creado.slice(0, 16).replace('T', ' ') : '', 'Corregido por': e.modificado_por || '', 'Datos completos': JSON.stringify(d) };
        };
        const X = window.XLSX; const libro = X.utils.book_new();
        const hoja = (nombre, filas) => { const h = X.utils.json_to_sheet(filas.length ? filas : [{ '': 'Sin datos' }]); X.utils.book_append_sheet(libro, h, nombre); };
        hoja('Cerdas', T.cerdas.map((c) => ({ Crotal: c.crotal, 'Otros crotales': (c.otros_crotales || []).join(', '), Raza: c.raza, Nacimiento: c.fecha_nacimiento || '', Entrada: c.fecha_entrada || '', Procedencia: c.origen || '', 'Fecha de baja': c.fecha_baja || '', 'Causa de baja': c.causa_baja || '' })));
        hoja('Verracos', T.verracos.map((v) => ({ Crotal: v.crotal, 'Otros crotales': (v.otros_crotales || []).join(', '), Raza: v.raza, Nacimiento: v.fecha_nacimiento || '', Entrada: v.fecha_entrada || '', Verraquera: v.verraquera || '', 'Fecha de baja': v.fecha_baja || '', 'Causa de baja': v.causa_baja || '' })));
        hoja('Eventos', T.eventos.filter((e) => e.granja_id === C.granjaPorcino).map(fila));
        const medDe = Object.fromEntries(T.medicamentos.map((m) => [m.id, m]));
        hoja('Sanidad', T.sanidad.map((r) => ({ Granja: r.granja_id === 1 ? '1.º' : '2.º', Estado: r.estado === 'previsto' ? 'Previsto' : 'Realizado', Fecha: r.fecha, Qué: nombreSan(r.tipo), Destino: r.ambito === 'zona' ? r.zona : r.ambito === 'granja' ? 'Toda la granja' : r.ambito === 'verraco' ? `Verraco ${verracoDe[r.verraco_id] || '?'}` : `${r.ambito === 'camada' ? 'Lechones de ' : 'Cerda '}${crotalDe[r.cerda_id] || '?'}`, 'Nº animales': r.n_animales ?? '', Producto: r.producto || '', 'Materia activa': (medDe[r.medicamento_id] || {}).materia_activa || '', Dosis: r.dosis || '', Vía: r.via || '', Lote: r.lote || '', Caducidad: r.caducidad || '', 'Supresión hasta': r.supresion_hasta || '', Motivo: r.motivo || '', Observaciones: r.obs || '', 'Registrado por': aliasDe[r.autor] || r.autor_alias || '', 'Realizado por': r.realizado_por || '' })));
        hoja('Medicamentos', T.medicamentos.map((m) => ({ 'Nombre comercial': m.nombre, 'Materia activa': m.materia_activa || '', Tipo: m.tipo, Presentación: m.presentacion || '', Dosificación: m.dosis || '', Vía: m.via || '', 'Supresión (días)': m.supresion_dias ?? '', Lote: m.lote || '', Caducidad: m.caducidad || '', 'Ficha técnica': m.ficha_url || '', Activo: m.activo ? 'Sí' : 'No' })));
        hoja('Extracciones', T.extracciones.map((x) => ({ Granja: x.granja_id === 1 ? '1.º' : '2.º', Verraco: verracoDe[x.verraco_id] || '?', Extracción: x.fecha, Verificación: x.fecha_verificacion || '', 'Nº dosis': x.n_dosis, 'Motilidad %': x.motilidad ?? '', 'Volumen c.c.': x.volumen ?? '', Observaciones: x.obs || '', 'Registrado por': aliasDe[x.autor] || x.autor_alias || '' })));
        hoja('Recuentos', T.recuentos.map((x) => ({ Granja: x.granja_id === 1 ? '1.º' : '2.º', Estancia: x.estancia, Fecha: x.fecha, Animales: x.n, Observaciones: x.obs || '', 'Registrado por': aliasDe[x.autor] || x.autor_alias || '' })));
        hoja('Movimientos lechoneras-cebo', T.mov_grupos.map((x) => ({ Granja: x.granja_id === 1 ? '1.º' : '2.º', Fecha: x.fecha, Tipo: x.tipo, Origen: x.origen || '', Destino: x.destino || '', Animales: x.n, Procedencia: x.procedencia || '', Causa: x.causa || '', Observaciones: x.obs || '', 'Registrado por': aliasDe[x.autor] || x.autor_alias || '' })));
        hoja('Altas y bajas', T.censo_mov.map((x) => ({ Animal: x.animal, Crotal: x.crotal, Movimiento: x.mov === 'baja_anulada' ? 'Baja anulada' : x.mov, Fecha: x.fecha, Causa: x.causa || '', Curso: x.granja_id ? `${x.granja_id}.º` : 'Profesor', 'Hecho por': x.autor_alias || '' })));
        hoja('Alumnos', perfiles.map((p) => ({ Alias: p.alias, Nombre: p.nombre || '', Rol: p.rol, Granja: p.granja_id ? (p.granja_id === 1 ? '1.º' : '2.º') : 'Las dos', Activo: p.activo ? 'Sí' : 'No' })));
        hoja('Información', [{ App: 'CIFEAPORC', Versión: C.version, 'Copia del': fechaHora(sello), Cerdas: T.cerdas.length, Verracos: T.verracos.length, Eventos: T.eventos.length, Nota: 'Las contraseñas y los PIN no se exportan.' }]);
        X.writeFile(libro, `${fichero}.xlsx`);
      }
      S.ultimaCopia = sello;
      try { localStorage.setItem('cife-ultima-copia', sello.toISOString()); } catch (_) { /* sin almacenamiento */ }
      estado.innerHTML = `<div class="ok-caja" role="status">Copia descargada: ${T.cerdas.length} cerdas, ${T.verracos.length} verracos y ${T.eventos.length} eventos. Búscala en la carpeta de Descargas.</div>`;
    } catch (e) {
      estado.innerHTML = `<div class="error-caja" role="alert">${esc(traducirError(e))}</div>`;
    }
    boton.disabled = false;
  }
  // Resumen de un evento en texto plano (para el Excel)
  function resumenTexto(e) {
    const div = document.createElement('div'); div.innerHTML = resumenEvento(e); return div.textContent;
  }

  function adminGranja() {
    return `<section class="tarjeta"><h2>Copia de seguridad</h2>
        <div class="suave">${esVet() ? 'Descarga los datos de la granja de porcino: censo e historial completo (los alumnos aparecen sin alias).' : 'Descarga todos los datos de la granja de porcino: censo, historial completo y alumnos (sin PIN).'} Guárdala en tu ordenador o en OneDrive. Recomendado: al final de cada mes y de cada trimestre.</div>
        ${S.ultimaCopia ? `<div class="ok-caja">Última copia descargada: ${fechaHora(S.ultimaCopia)}</div>` : ''}
        <div class="botones"><button class="btn" type="button" data-accion="copia-excel">Descargar Excel</button>${esVet() ? '' : '<button class="btn sec" type="button" data-accion="copia-json">Archivo para restaurar</button>'}</div>
        <div class="suave peq">El Excel sirve para consultar y trabajar con los datos. El «archivo para restaurar» (.json) contiene lo mismo en un formato que permite volver a cargarlo si algún día se pierde la base de datos.</div>
        <div id="estado-copia" aria-live="polite"></div></section>
      <div class="foto"><img src="img/granja.jpg" alt="Vista aérea de la granja porcina"></div>
      <div class="vacio">El plano de la granja, los lotes, la sanidad y la comparación entre granjas llegan en las siguientes fases.</div>`;
  }

  function enlazarAdmin(seccion) {
    if (seccion === 'granja') {
      $app.querySelectorAll('[data-accion="copia-excel"], [data-accion="copia-json"]').forEach((b) => b.addEventListener('click', () => descargarCopia(b.dataset.accion === 'copia-excel' ? 'xlsx' : 'json', b)));
      $app.querySelectorAll('[data-granja]').forEach((b) => b.addEventListener('click', async () => {
        S.granja = Number(b.dataset.granja);
        try { localStorage.setItem('cife-granja', String(S.granja)); } catch (_) { /* sin almacenamiento */ }
        await refrescar(); toast(`Viendo ${nombreGranja(S.granja)}`); vistaAdmin('granja');
      }));
    }
    if (seccion !== 'alumnos' || !S.perfiles) return;
    const fa = document.getElementById('f-alumno');
    if (fa) fa.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const f = Object.fromEntries(new FormData(fa).entries());
      const alias = String(f.alias || '').trim().toUpperCase();
      const pin = String(f.pin || '').trim();
      const granja = Number(f.granja);
      const nombre = String(f.nombre || '').trim().replace(/\s+/g, ' ').slice(0, 40) || null;
      const err = (t) => vistaAdmin('alumnos', `<div class="error-caja" role="alert">${esc(t)}</div>`);
      if (!/^[A-Z0-9]{1,10}$/.test(alias)) return err('El alias solo puede tener letras y números (máximo 10), sin espacios.');
      if (!/^\d{6}$/.test(pin)) return err('El PIN debe tener 6 cifras.');
      if (S.perfiles.some((p) => p.alias.toUpperCase() === alias && p.granja_id === granja)) return err('Ese alias ya existe en ese curso.');
      const fallo = await crearAcceso(alias, pin, granja, nombre);
      if (fallo) return err(fallo);
      await cargarPerfiles();
      vistaAdmin('alumnos', `<div class="ok-caja" role="status"><strong>Acceso creado.</strong><br>${esc(nombreGranja(granja))} · alias <strong>${esc(alias)}</strong>${nombre ? ` (${esc(nombre)})` : ''} · PIN <strong>${esc(pin)}</strong><br>Apúntalo ahora: el PIN no se vuelve a mostrar.</div>`);
    });
    const fv = document.getElementById('f-varios');
    if (fv) fv.addEventListener('submit', (ev) => {
      ev.preventDefault();
      const f = new FormData(fv);
      const granja = Number(f.get('granja'));
      const acortar = f.get('acortar') === 'on';
      const prefijo = (String(f.get('prefijo') || '').trim().toUpperCase().replace(/[^A-Z]/g, '') || (granja === 1 ? 'A' : 'B')).slice(0, 2);
      const nombres = String(f.get('lista') || '').split(/\r?\n/).map((l) => acortarNombre(l, acortar)).filter(Boolean);
      if (!nombres.length) return vistaAdmin('alumnos', '<div class="error-caja" role="alert">Pega al menos un nombre.</div>');
      if (nombres.length > 40) return vistaAdmin('alumnos', '<div class="error-caja" role="alert">Máximo 40 alumnos por lista.</div>');
      const sig = siguienteAlias(prefijo, granja, S.perfiles.filter((p) => p.granja_id === granja).map((p) => p.alias.toUpperCase()));
      S.borrador.lote = { granja, filas: nombres.map((nombre) => ({ nombre, alias: sig() })) };
      vistaAdmin('alumnos');
    });
    const fl = document.getElementById('f-lote');
    if (fl) fl.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const L = S.borrador.lote; const f = new FormData(fl);
      const filas = L.filas.map((x, i) => ({ nombre: String(f.get(`n${i}`) || '').trim().replace(/\s+/g, ' ').slice(0, 40) || null, alias: String(f.get(`a${i}`) || '').trim().toUpperCase() }));
      const usados = new Set(S.perfiles.filter((p) => p.granja_id === L.granja).map((p) => p.alias.toUpperCase()));
      const prog = document.getElementById('progreso');
      for (const x of filas) {
        if (!/^[A-Z0-9]{1,10}$/.test(x.alias)) { prog.innerHTML = `<div class="error-caja" role="alert">Alias no válido: «${esc(x.alias)}». Solo letras y números, sin espacios.</div>`; return; }
        if (usados.has(x.alias)) { prog.innerHTML = `<div class="error-caja" role="alert">El alias ${esc(x.alias)} está repetido o ya existe en ese curso.</div>`; return; }
        usados.add(x.alias);
      }
      fl.querySelectorAll('input, button').forEach((el) => { el.disabled = true; });
      const resultado = [];
      for (let i = 0; i < filas.length; i++) {
        const x = filas[i]; const pin = pinAzar();
        prog.innerHTML = `<div class="ok-caja">Creando ${i + 1} de ${filas.length}: ${esc(x.alias)}…</div>`;
        const fallo = await crearAcceso(x.alias, pin, L.granja, x.nombre);
        resultado.push({ ...x, pin, error: fallo });
        if (fallo && /Demasiados|rate limit/i.test(fallo)) {
          for (const y of filas.slice(i + 1)) resultado.push({ ...y, pin: '', error: 'No creado: espera unos minutos y vuelve a añadirlo' });
          break;
        }
        await espera(1200);
      }
      S.borrador.lote = null; S.borrador.resultado = resultado;
      await cargarPerfiles(); vistaAdmin('alumnos');
    });
    const cl = $app.querySelector('[data-accion="cancelar-lote"]');
    if (cl) cl.addEventListener('click', () => { S.borrador.lote = null; vistaAdmin('alumnos'); });
    const cp = $app.querySelector('[data-accion="copiar-lista"]');
    if (cp) cp.addEventListener('click', async () => {
      const texto = ['Nombre\tAlias\tPIN', ...S.borrador.resultado.filter((r) => !r.error).map((r) => `${r.nombre || ''}\t${r.alias}\t${r.pin}`)].join('\n');
      try { await navigator.clipboard.writeText(texto); toast('Lista copiada: pégala en un Excel o documento'); } catch (_) { toast('No se pudo copiar. Usa Imprimir.'); }
    });
    const im = $app.querySelector('[data-accion="imprimir"]');
    if (im) im.addEventListener('click', () => window.print());
    const ce = $app.querySelector('[data-accion="cerrar-lista"]');
    if (ce) ce.addEventListener('click', () => { S.borrador.resultado = null; vistaAdmin('alumnos'); });
    $app.querySelectorAll('[data-pin]').forEach((b) => b.addEventListener('click', async () => {
      const pin = pinAzar();
      const { error } = await sb.rpc('restablecer_pin', { p_user: b.dataset.pin, p_pin: pin });
      if (error) return vistaAdmin('alumnos', `<div class="error-caja" role="alert">${esc(traducirError(error))}</div>`);
      vistaAdmin('alumnos', `<div class="ok-caja" role="status">Nuevo PIN para <strong>${esc(b.dataset.alias)}</strong>: <strong>${pin}</strong>. Apúntalo ahora.</div>`);
    }));
    $app.querySelectorAll('[data-nombre]').forEach((b) => b.addEventListener('click', () => {
      S.borrador.editNombre = S.borrador.editNombre === b.dataset.nombre ? null : b.dataset.nombre; vistaAdmin('alumnos');
      const i = $app.querySelector('[data-form-nombre] input'); if (i) i.focus();
    }));
    $app.querySelectorAll('[data-form-nombre]').forEach((f) => f.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const nombre = String(new FormData(f).get('nombre') || '').trim().replace(/\s+/g, ' ').slice(0, 40) || null;
      const { error } = await sb.from('perfiles').update({ nombre }).eq('user_id', f.dataset.formNombre);
      if (error) return vistaAdmin('alumnos', `<div class="error-caja" role="alert">${esc(traducirError(error))}</div>`);
      S.borrador.editNombre = null; await cargarPerfiles(); await refrescar(); location.hash = '#/admin/alumnos'; vistaAdmin('alumnos');
    }));
    $app.querySelectorAll('[data-activo]').forEach((b) => b.addEventListener('click', async () => {
      const { error } = await sb.from('perfiles').update({ activo: b.dataset.valor === '1' }).eq('user_id', b.dataset.activo);
      if (error) return toast(traducirError(error));
      await cargarPerfiles(); vistaAdmin('alumnos');
    }));
    const fin = $app.querySelector('[data-accion="fin-curso"]');
    if (fin) fin.addEventListener('click', async () => {
      if (fin.dataset.confirmar !== '1') { fin.dataset.confirmar = '1'; fin.textContent = '¿Seguro? Pulsa otra vez para desactivar a todos y borrar sus nombres'; return; }
      const { data, error } = await sb.rpc('cerrar_curso');
      if (error) return vistaAdmin('alumnos', `<div class="error-caja" role="alert">${esc(/cerrar_curso/.test(error.message) ? 'Falta ejecutar en Supabase el archivo 04_nombres_alumnos.sql.' : traducirError(error))}</div>`);
      await cargarPerfiles(); await refrescar(); location.hash = '#/admin/alumnos';
      vistaAdmin('alumnos', `<div class="ok-caja" role="status">Curso cerrado: ${data ?? 0} alumnos desactivados y sus nombres borrados.</div>`);
    });
  }

  function vistaNoEncontrado(texto) {
    pintar(`${cabecera()}<main class="cuerpo"><div class="vacio">${esc(texto || 'No se ha encontrado lo que buscabas.')}</div>
      <a class="btn sec" href="#/inicio">Volver al inicio</a></main>${navegacion('')}`);
  }

  // ---------------------------------------------------------------- enrutado
  function render() {
    if (!S.sesion) return vistaAcceso();
    if (!S.perfil) return vistaSinPerfil();
    const [ruta, a, b, c] = location.hash.replace(/^#\/?/, '').split('/');
    switch (ruta || 'inicio') {
      case 'inicio': return vistaInicio();
      case 'cerdas': return vistaCerdas();
      case 'cerda': return vistaFicha(a);
      case 'registrar': return vistaRegistrar(a, b, c);
      case 'verracos': return vistaVerracos();
      case 'verraco': return vistaVerraco(a);
      case 'plano': return a ? vistaZona(a) : vistaPlano();
      case 'recuento': return vistaRecuento(a, b);
      case 'corral': return vistaCorral(a, b);
      case 'movg': return vistaMovGrupo(a, b, c);
      case 'censo': return a === 'historial' ? vistaHistorialCenso() : vistaAnimal(a, b, 'censo');
      case 'extraccion': return vistaExtraccion(a, b);
      case 'trasladoverraco': return vistaTrasladoVerraco(a);
      case 'sanidad':
        if (['nuevo', 'programar'].includes(a)) return vistaSanidadForm(a, null, { ambito: b, ref: c });
        if (['editar', 'realizar'].includes(a)) return vistaSanidadForm(a, b);
        return vistaSanidad(a || 'calendario');
      case 'medicamento': location.replace(`../#/medicamento/${a}/porc`); return; // una sola ficha de producto (CIFEAFARM)
      case 'correcciones': return vistaCorrecciones(a || 'pendientes');
      case 'cuenta': return vistaCuenta();
      case 'admin':
        if (a === 'cerda' || a === 'verraco') return vistaAnimal(a, b);
        return vistaAdmin(a || 'censo');
      default: return vistaNoEncontrado();
    }
  }

  // Botones comunes (actualizar, salir)
  document.addEventListener('click', async (ev) => {
    const b = ev.target.closest('[data-accion]');
    if (!b) return;
    if (b.dataset.accion === 'refrescar') refrescar(true);
    if (b.dataset.accion === 'salir') {
      await sb.auth.signOut();
      Object.assign(S, { sesion: null, perfil: null, perfiles: null, eventos: [], porCerda: {}, borrador: {} });
      location.replace('../');
    }
  });

  window.addEventListener('hashchange', () => { if (S.perfiles && !location.hash.startsWith('#/admin')) S.perfiles = null; render(); });

  // Hora de consulta en vivo y recarga al volver a la app
  setInterval(() => { const h = document.getElementById('hora-consulta'); if (h) h.textContent = fechaHora(new Date()); }, 20000);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && S.perfil && (!S.cargado || Date.now() - S.cargado > 120000) && !location.hash.startsWith('#/registrar')) refrescar();
  });

  async function iniciar() {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('../sw.js', { scope: '../', updateViaCache: 'none' }).then((r) => r.update()).catch(() => {});
      // Cuando se instala una versión nueva, recarga una vez para usarla.
      let recargado = !navigator.serviceWorker.controller; // la primera instalación no recarga
      navigator.serviceWorker.addEventListener('controllerchange', () => { if (!recargado && !location.hash.startsWith('#/registrar')) { recargado = true; location.reload(); } });
    }
    try {
      const { data } = await sb.auth.getSession();
      S.sesion = data.session;
      if (S.sesion) await cargarTodo();
    } catch (e) {
      if (S.sesion) { pintar(`<main class="acceso"><div class="error-caja" role="alert">${esc(traducirError(e))}</div><button class="btn" type="button" onclick="location.reload()">Reintentar</button></main>`); return; }
    }
    sb.auth.onAuthStateChange((evento, sesion) => { S.sesion = sesion; if (evento === 'SIGNED_OUT') { S.perfil = null; render(); } });
    render();
  }
  iniciar();
})();
