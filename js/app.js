// CIFEAFARM · app: acceso común y granja de rumiantes CIFEARUMI (V1: censo, fichas,
// corralinas, traslados, altas, bajas, importación y copia de seguridad).
(function () {
  'use strict';
  const L = window.Logica;
  const C = window.CONFIG;
  const sb = window.supabase.createClient(C.supabaseUrl, C.supabaseKey);

  // ---------------------------------------------------------------- estado
  const S = {
    sesion: null, perfil: null, nombres: {}, corralinas: [], animales: [], eventos: [], porAnimal: {},
    cargado: null, faltaSQL: false, borrador: {}, importacion: null,
    ultimaCopia: (() => { try { const x = localStorage.getItem('farm-ultima-copia'); return x ? new Date(x) : null; } catch (_) { return null; } })(),
  };
  const $app = document.getElementById('app');

  // ---------------------------------------------------------------- utilidades
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const fmt = (iso) => (iso ? iso.slice(0, 10).split('-').reverse().join('/') : '—');
  const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  const DIAS_SEM = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
  const dos = (x) => String(x).padStart(2, '0');
  const fechaHora = (d) => `${dos(d.getDate())}/${dos(d.getMonth() + 1)}/${d.getFullYear()} · ${dos(d.getHours())}:${dos(d.getMinutes())}`;
  const hoy = () => L.hoyISO();
  const esProf = () => S.perfil && S.perfil.rol === 'profesor';
  const uid = () => S.sesion && S.sesion.user.id;
  const yo = () => (S.perfil.nombre ? `${S.perfil.nombre} (${S.perfil.alias})` : S.perfil.alias);
  const quienEs = (userId, alias) => { const p = S.nombres[userId]; return p && p.nombre ? `${p.nombre} (${p.alias})` : (alias || (p && p.alias) || '?'); };
  const curso = (g) => (g ? `${g}.º` : 'profesor');
  const animal = (id) => S.animales.find((a) => a.id === id);
  const activos = () => S.animales.filter((a) => !a.fecha_baja);
  const corralina = (id) => S.corralinas.find((c) => c.id === Number(id));
  const nombreCorr = (id) => { const c = corralina(id); return c ? `${c.nave} · ${c.numero}` : 'Sin ubicar'; };
  const nombreCorrCorto = (id) => { const c = corralina(id); return c ? `${c.nave} ${c.numero}` : 'Sin ubicar'; };
  const ubic = (a) => L.ubicacion(a, S.porAnimal[a.id], null);
  const nombreA = (a) => (a ? L.nombreAnimal(a) : '?');
  const catNombre = (k) => (L.CAT[k] || {}).nombre || k;

  function toast(msg) {
    const t = document.createElement('div');
    t.className = 'toast'; t.setAttribute('role', 'status'); t.textContent = msg;
    document.body.appendChild(t); setTimeout(() => t.remove(), 3200);
  }
  function traducirError(e) {
    const m = (e && (e.message || e.error_description)) || String(e);
    if (/Invalid login credentials/i.test(m)) return 'Alias, curso o PIN incorrectos.';
    if (/Failed to fetch|NetworkError|network/i.test(m)) return 'No hay conexión. Revisa la cobertura e inténtalo de nuevo.';
    if (/rum_animales_manejo/i.test(m)) return 'Ese nº de collar ya lo lleva otro animal vivo de la misma especie.';
    if (/rum_animales_crotal/i.test(m)) return 'Ya hay un animal con ese crotal.';
    if (/row-level security|permission denied/i.test(m)) return 'No tienes permiso para hacer esto (o han pasado más de 24 horas desde el registro).';
    if (/rum_animales_check/i.test(m)) return 'Los datos no son coherentes (especie, categoría, sexo, capa o madre). Revísalos.';
    if (/does not exist|schema cache|PGRST205|42P01/i.test(m)) return 'Falta ejecutar en Supabase el archivo sql/01_rumiantes.sql (ver guía).';
    if (/Email not confirmed/i.test(m)) return 'La cuenta no está confirmada (ver guía de CIFEAPORC).';
    if (/rate limit|too many/i.test(m)) return 'Demasiados intentos seguidos. Espera unos minutos.';
    if (/Password should be/i.test(m)) return 'El PIN debe tener 6 cifras.';
    return m;
  }

  const SVG = (d, w = 2) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
  const ICONOS = {
    inicio: SVG('<path d="M4 11l8-6 8 6v8H4z"/>'),
    mapa: SVG('<path d="M3 4h18v16H3zM3 11h8M11 4v16M15 11h6"/>'),
    animales: SVG('<path d="M6 4h12v16H6zM9 9h6M9 13h6M9 17h3"/>'),
    censo: SVG('<path d="M5 20V10M10 20V4M15 20v-7M20 20v-4"/>'),
    gestion: SVG('<path d="M4 6h16M4 12h16M4 18h10"/>'),
    cuenta: SVG('<circle cx="12" cy="8" r="4"/><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6"/>'),
    mas: SVG('<path d="M12 5v14M5 12h14"/>', 2.4),
    atras: SVG('<path d="M15 5l-7 7 7 7"/>', 2.2),
    flecha: SVG('<path d="M5 12h14M13 6l6 6-6 6"/>'),
  };

  // ---------------------------------------------------------------- datos
  async function cargarPerfil() {
    const { data, error } = await sb.from('perfiles').select('*').eq('user_id', uid()).maybeSingle();
    if (error) throw error;
    S.perfil = data && data.activo ? data : null;
  }
  async function todasLasFilas(tabla, orden) {
    const out = [];
    for (let desde = 0; ; desde += 1000) {
      let q = sb.from(tabla).select('*');
      for (const o of orden) q = q.order(o);
      const { data, error } = await q.range(desde, desde + 999);
      if (error) throw error;
      out.push(...data);
      if (data.length < 1000) break;
    }
    return out;
  }
  async function cargarDatos() {
    try {
      const [c, a, e] = await Promise.all([
        todasLasFilas('rum_corralinas', ['id']), todasLasFilas('rum_animales', ['creado']), todasLasFilas('rum_eventos', ['fecha', 'creado'])]);
      S.corralinas = c; S.animales = a; S.eventos = e; S.faltaSQL = false;
    } catch (err) {
      if (/does not exist|schema cache|PGRST205|42P01/i.test(`${err.message} ${err.code}`)) { S.faltaSQL = true; S.corralinas = []; S.animales = []; S.eventos = []; }
      else throw err;
    }
    S.porAnimal = {};
    for (const ev of S.eventos) (S.porAnimal[ev.animal_id] = S.porAnimal[ev.animal_id] || []).push(ev);
    const nv = await sb.rpc('nombres_visibles');
    S.nombres = {};
    if (!nv.error && Array.isArray(nv.data)) for (const p of nv.data) S.nombres[p.user_id] = p;
    S.cargado = new Date();
  }
  async function cargarTodo() { await cargarPerfil(); if (S.perfil) await cargarDatos(); }
  async function refrescar(mostrar) {
    try { await cargarDatos(); render(); if (mostrar) toast('Datos actualizados'); } catch (e) { toast(traducirError(e)); }
  }

  // ---------------------------------------------------------------- maquetación
  function cabecera(o = {}) {
    const quien = esProf() ? `Profesor · ${esc(yo())}` : `${curso(S.perfil.granja_id)} curso · ${esc(yo())}`;
    const horas = `<div class="horas"><span>Consulta: <span id="hora-consulta">${fechaHora(new Date())}</span></span><span>Datos: ${S.cargado ? fechaHora(S.cargado) : '—'}</span></div>`;
    if (o.volver) {
      return `<header class="cab ${esProf() ? 'prof' : ''}">
        <div class="fila"><a class="volver" href="${o.volver}">${ICONOS.atras}${esc(o.textoVolver || 'Volver')}</a>
        <span class="granja-tag">CIFEARUMI</span></div>
        <h1>${esc(o.titulo)}</h1>${o.sub ? `<div class="sub">${o.sub}</div>` : ''}
        <div class="quien peq" style="margin-top:4px">${quien}</div></header>`;
    }
    return `<header class="cab ${esProf() ? 'prof' : ''}">
      <div class="fila"><a class="logo-enlace" href="#/granjas" aria-label="Cambiar de granja"><img class="logo" src="img/rumi.jpg" alt=""></a>
        <div><div class="marca">CIFEARUMI</div><div class="quien">${quien}</div></div>
        <button class="refrescar" type="button" data-accion="refrescar" aria-label="Actualizar datos">Actualizar</button></div>
      ${horas}</header>`;
  }
  function navegacion(activa) {
    const items = [['inicio', 'Hoy'], ['mapa', 'Mapa'], ['animales', 'Animales'], ['censo', 'Censo']];
    items.push(esProf() ? ['gestion', 'Gestión'] : ['cuenta', 'Cuenta']);
    return `<nav class="nav" aria-label="Secciones"><div class="dentro">${items.map(([id, t]) =>
      `<a href="#/${id}" class="${activa === id ? 'activo' : ''}" ${activa === id ? 'aria-current="page"' : ''}>${ICONOS[id]}${t}</a>`).join('')}</div></nav>`;
  }
  function pintar(html) { $app.className = ''; $app.innerHTML = html; window.scrollTo(0, 0); }
  const faltaSQLCaja = () => (S.faltaSQL ? `<div class="error-caja" role="alert"><strong>Falta preparar la base de datos.</strong> ${esProf() ? 'Ejecuta en Supabase el archivo <code>sql/01_rumiantes.sql</code> (ver GUIA.md).' : 'Avisa a tu profesor.'}</div>` : '');
  const chipCat = (a) => `<span class="chip ${a.especie === 'ovino' ? 'ovi' : ''}">${esc(catNombre(a.categoria))}</span>`;

  // ---------------------------------------------------------------- acceso
  function vistaAcceso(modo = 'alumno', mensaje = '') {
    pintar(`<main class="acceso">
      <div class="logo-acceso"><img src="img/logo.jpg" alt="CIFEAFARM"></div>
      <h1 style="text-align:center">Entrar en CIFEAFARM</h1>
      <p class="suave" style="text-align:center;margin:0">Granjas del centro · cabras, ovejas y cerdos</p>
      <div class="pestanas" role="tablist">
        <button type="button" role="tab" aria-selected="${modo === 'alumno'}" class="${modo === 'alumno' ? 'activo' : ''}" data-modo="alumno">Alumno</button>
        <button type="button" role="tab" aria-selected="${modo === 'profesor'}" class="${modo === 'profesor' ? 'activo' : ''}" data-modo="profesor">Profesor</button>
      </div>
      ${mensaje ? `<div class="error-caja" role="alert">${esc(mensaje)}</div>` : ''}
      <form class="formu" id="f-acceso" novalidate>
        ${modo === 'alumno' ? `
          <div class="campo"><span class="et" id="et-curso">Curso</span>
            <div class="opciones" role="radiogroup" aria-labelledby="et-curso">
              <label><input type="radio" name="curso" value="1" checked> 1.º curso</label>
              <label><input type="radio" name="curso" value="2"> 2.º curso</label></div></div>
          <div class="campo"><label for="alias">Alias</label>
            <input id="alias" name="alias" type="text" autocomplete="username" autocapitalize="characters" placeholder="El mismo que en CIFEAPORC" required></div>
          <div class="campo"><label for="pin">PIN</label>
            <input id="pin" name="pin" type="password" inputmode="numeric" pattern="[0-9]*" maxlength="6" autocomplete="current-password" placeholder="6 cifras" required></div>`
        : `
          <div class="campo"><label for="correo">Correo</label><input id="correo" name="correo" type="email" autocomplete="username" required></div>
          <div class="campo"><label for="clave">Contraseña</label><input id="clave" name="clave" type="password" autocomplete="current-password" required></div>`}
        <button class="btn" type="submit">Entrar</button>
      </form>
      <p class="suave" style="text-align:center">Se entra con el mismo alias y PIN que en CIFEAPORC. Si lo has olvidado, pide uno nuevo a tu profesor.</p>
    </main>`);
    $app.querySelectorAll('[data-modo]').forEach((b) => b.addEventListener('click', () => vistaAcceso(b.dataset.modo)));
    document.getElementById('f-acceso').addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const f = new FormData(ev.target);
      const boton = ev.target.querySelector('button[type=submit]');
      let email, password;
      if (modo === 'alumno') {
        const alias = String(f.get('alias') || '').trim().toUpperCase();
        email = `${alias.toLowerCase()}.g${f.get('curso')}@${C.dominioAlumnos}`;
        password = String(f.get('pin') || '').trim();
        if (!alias || !/^\d{6}$/.test(password)) { vistaAcceso(modo, 'Escribe tu alias y un PIN de 6 cifras.'); return; }
      } else { email = String(f.get('correo') || '').trim(); password = String(f.get('clave') || ''); }
      boton.disabled = true; boton.textContent = 'Entrando…';
      const { data, error } = await sb.auth.signInWithPassword({ email, password });
      if (error) { vistaAcceso(modo, traducirError(error)); return; }
      S.sesion = data.session;
      try { await cargarTodo(); } catch (e) { vistaAcceso(modo, traducirError(e)); return; }
      location.hash = '#/inicio'; render();
    });
  }
  function vistaSinPerfil() {
    pintar(`<main class="acceso"><div class="logo-acceso"><img src="img/logo.jpg" alt="CIFEAFARM"></div>
      <div class="aviso-caja"><strong>Tu cuenta no tiene acceso.</strong><br>Puede que esté desactivada. Habla con tu profesor.</div>
      <button class="btn sec" type="button" data-accion="salir">Salir</button></main>`);
  }

  // ---------------------------------------------------------------- granjas
  function vistaGranjas() {
    pintar(`<header class="cab ${esProf() ? 'prof' : ''}"><div class="fila"><img class="logo" src="img/logo-mini.jpg" alt="">
        <div><div class="marca">CIFEAFARM</div><div class="quien">${esProf() ? `Profesor · ${esc(yo())}` : `${curso(S.perfil.granja_id)} curso · ${esc(yo())}`}</div></div></div></header>
      <main class="cuerpo">
        <h1 style="font-size:22px">Granjas del centro</h1>
        <a class="granja-card" href="#/inicio"><img src="img/rumi.jpg" alt=""><div><strong>CIFEARUMI</strong>
          <div class="suave">Cabras murciano-granadinas y ovejas segureñas · ${activos().length} animales</div></div>${ICONOS.flecha}</a>
        <a class="granja-card" href="${esc(C.urlPorcino)}"><img src="img/porc.png" alt=""><div><strong>CIFEAPORC</strong>
          <div class="suave">Porcino de ciclo cerrado, chato murciano · se abre aparte hasta que se integre</div></div>${ICONOS.flecha}</a>
        <button class="btn sec" type="button" data-accion="salir">Salir</button>
        <div class="suave peq" style="text-align:center">CIFEAFARM · versión ${esc(C.version)}</div>
      </main>`);
  }

  // ---------------------------------------------------------------- hoy
  function contar(lista) {
    const r = { caprino: 0, ovino: 0 }; const cat = {};
    for (const a of lista) { r[a.especie]++; cat[a.categoria] = (cat[a.categoria] || 0) + 1; }
    return { ...r, cat };
  }
  function vistaInicio() {
    const d = new Date(); const act = activos(); const n = contar(act);
    const porRevisar = esProf() ? act.filter((a) => L.revisar(a).length) : [];
    const recientes = S.eventos.filter((e) => !(e.datos && e.datos.importado)).sort((x, y) => String(y.creado).localeCompare(String(x.creado))).slice(0, 8);
    pintar(`${cabecera()}
      <main class="cuerpo">
        ${faltaSQLCaja()}
        <div class="foto logo"><img src="img/rumi-logo.jpg" alt="Logotipo de CIFEARUMI: cabra murciano-granadina y oveja segureña"></div>
        <div class="entre"><h1 style="font-size:22px">Hoy, ${DIAS_SEM[d.getDay()]} ${d.getDate()} ${MESES[d.getMonth()]}</h1></div>
        <div class="dos">
          <a class="dato enlace" href="#/animales/caprino"><span class="et">Caprino</span><span class="val">${n.caprino}</span><span class="nota">${n.cat.cabra || 0} cabras · ${n.cat.chiva || 0} chivas · ${n.cat.macho_cabrio || 0} machos${n.cat.cabrito ? ` · ${n.cat.cabrito} cabritos` : ''}</span></a>
          <a class="dato ovi enlace" href="#/animales/ovino"><span class="et">Ovino</span><span class="val">${n.ovino}</span><span class="nota">${n.cat.oveja || 0} ovejas · ${n.cat.cordera || 0} corderas · ${n.cat.morueco || 0} moruecos${n.cat.cordero ? ` · ${n.cat.cordero} corderos` : ''}</span></a>
        </div>
        ${porRevisar.length ? `<a class="tarjeta enlace" href="#/animales/revisar" style="border-color:var(--naranja-borde)"><div class="entre"><strong>Datos por completar</strong><span class="chip nar">${porRevisar.length}</span></div>
          <div class="suave">Crotales de 14 cifras, animales sin collar o cabras sin capa. Corrígelos desde la ficha de cada animal.</div></a>` : ''}
        ${esProf() && (!S.ultimaCopia || Date.now() - S.ultimaCopia > 30 * 864e5) && act.length ? `<a class="tarjeta enlace" href="#/gestion" style="border-color:var(--naranja-borde)"><div class="entre"><strong>Haz una copia de seguridad</strong><span class="chip nar">Profesor</span></div><div class="suave">${S.ultimaCopia ? `La última es del ${fechaHora(S.ultimaCopia)}` : 'Aún no has descargado ninguna desde este dispositivo'} · Gestión</div></a>` : ''}
        ${act.length === 0 && !S.faltaSQL ? `<div class="vacio">Aún no hay animales en el censo.${esProf() ? ' Impórtalos desde <a href="#/gestion">Gestión → Importar censo</a> o da de alta uno a uno.' : ''}</div>` : ''}
        <div class="botones"><a class="btn" href="#/animales">${ICONOS.animales}Buscar animal</a><a class="btn sec" href="#/mapa">${ICONOS.mapa}Mapa</a></div>
        <section class="tarjeta"><h2>Últimos registros</h2>
          ${recientes.map((e) => { const a = animal(e.animal_id); return `<a class="evento enlace" href="#/animal/${e.animal_id}"><div class="entre"><strong>${esc(nombreA(a))} · ${esc(nombreEvento(e))}</strong><span class="suave">${fmt(e.fecha)}</span></div><div class="suave peq">${resumenEvento(e)} · ${esc(quienEs(e.autor, e.autor_alias))}</div></a>`; }).join('') || '<div class="suave">Todavía no hay registros.</div>'}
        </section>
        <a class="btn sec" href="#/alta">${ICONOS.mas}Alta de un animal</a>
      </main>${navegacion('inicio')}`);
  }

  // ---------------------------------------------------------------- mapa
  function vistaMapa() {
    const act = activos(); const n = contar(act);
    const en = {}; for (const a of act) { const u = ubic(a) || 0; (en[u] = en[u] || []).push(a); }
    const naves = [...new Set(S.corralinas.map((c) => c.nave))];
    const tile = (c) => {
      const l = en[c.id] || []; const k = contar(l);
      const desglose = Object.entries(k.cat).sort((x, y) => Object.keys(L.CAT).indexOf(x[0]) - Object.keys(L.CAT).indexOf(y[0])).map(([cat, x]) => `${x} ${L.CAT[cat].plural.toLowerCase()}`).join(' · ');
      return `<a class="corral-tile ${l.length ? 'ocupado' : ''} ${c.activa ? '' : 'inactiva'}" href="#/corralina/${c.id}">
        <span class="num">${c.numero}</span><strong>${l.length}</strong>
        <span class="uso">${esc(c.uso || '')}</span><span class="peq suave">${desglose || 'Vacía'}</span></a>`;
    };
    pintar(`${cabecera()}
      <main class="cuerpo">${faltaSQLCaja()}
        <h1 style="font-size:22px">Mapa de la granja</h1>
        <div class="totales3"><div class="dato"><span class="et">Caprino</span><span class="val">${n.caprino}</span></div>
          <div class="dato ovi"><span class="et">Ovino</span><span class="val">${n.ovino}</span></div>
          <div class="dato gris"><span class="et">Total</span><span class="val">${act.length}</span></div></div>
        ${naves.map((nv) => `<section class="nave"><h2>Nave ${esc(nv)}</h2>
          <div class="nave-grid">${S.corralinas.filter((c) => c.nave === nv).sort((x, y) => x.numero - y.numero).map(tile).join('')}</div>
          ${nv === 'Cría y Ordeño' ? '<div class="sala-ordeno">Sala de ordeño</div>' : ''}</section>`).join('')}
        ${en[0] && en[0].length ? `<a class="tarjeta enlace" href="#/corralina/0"><div class="entre"><strong>Sin ubicar</strong><span class="chip nar">${en[0].length}</span></div><div class="suave">Animales sin corralina asignada.</div></a>` : ''}
      </main>${navegacion('mapa')}`);
  }

  // ---------------------------------------------------------------- corralina (lista y traslado en grupo)
  function vistaCorralina(id) {
    const cid = Number(id);
    const c = corralina(cid);
    if (cid && !c) return vistaNoEncontrado();
    const lista = activos().filter((a) => (ubic(a) || 0) === cid).sort((x, y) => (x.especie === y.especie ? L.ordenNatural(x, y) : x.especie.localeCompare(y.especie)));
    pintar(`${cabecera({ volver: '#/mapa', textoVolver: 'Mapa', titulo: c ? `Corralina ${c.numero}` : 'Sin ubicar', sub: c ? `Nave ${esc(c.nave)}${c.uso ? ` · ${esc(c.uso)}` : ''} · ${lista.length} animales` : `${lista.length} animales` })}
      <main class="cuerpo">
        ${lista.length ? `<form id="f-sel" class="formu">
          <div class="entre"><label class="check-todos"><input type="checkbox" id="todos"> Seleccionar todos</label><span class="suave" id="n-sel">0 seleccionados</span></div>
          <div class="lista">${lista.map((a) => `<label class="animal-fila check"><input type="checkbox" name="sel" value="${a.id}">
            <div><strong>${esc(nombreA(a))}</strong><div class="suave">${esc(catNombre(a.categoria))}${a.capa ? ` · ${esc(L.CAPAS[a.capa])}` : ''}${a.crotal ? ` · ${esc(a.crotal)}` : ''}</div></div>
            <a class="ver" href="#/animal/${a.id}" aria-label="Ver ficha de ${esc(nombreA(a))}">Ficha</a></label>`).join('')}</div>
          <button class="btn pegado" type="submit" id="b-trasladar" disabled>${ICONOS.flecha}Trasladar seleccionados</button></form>`
        : '<div class="vacio">No hay animales en esta corralina.</div>'}
        ${esProf() && c ? `<form class="formu tarjeta" id="f-uso"><h2>Uso de la corralina</h2>
          <div class="campo"><label for="uso">Texto libre (p. ej. «Chivas», «Machos»)</label><input id="uso" name="uso" type="text" value="${esc(c.uso || '')}"></div>
          <button class="btn sec" type="submit">Guardar</button></form>` : ''}
      </main>${navegacion('mapa')}`);
    const f = document.getElementById('f-sel');
    if (f) {
      const marcar = () => { const k = f.querySelectorAll('input[name=sel]:checked').length; document.getElementById('n-sel').textContent = `${k} ${k === 1 ? 'seleccionado' : 'seleccionados'}`; document.getElementById('b-trasladar').disabled = !k; };
      f.addEventListener('change', (ev) => { if (ev.target.id === 'todos') f.querySelectorAll('input[name=sel]').forEach((x) => { x.checked = ev.target.checked; }); marcar(); });
      f.addEventListener('submit', (ev) => { ev.preventDefault(); const ids = [...f.querySelectorAll('input[name=sel]:checked')].map((x) => x.value); S.borrador.traslado = { ids, volver: `#/corralina/${cid}` }; location.hash = '#/trasladar'; });
    }
    const fu = document.getElementById('f-uso');
    if (fu) fu.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const { error } = await sb.from('rum_corralinas').update({ uso: String(new FormData(fu).get('uso') || '').trim() || null }).eq('id', cid);
      if (error) return toast(traducirError(error));
      toast('Guardado'); refrescar();
    });
  }

  // ---------------------------------------------------------------- animales
  function vistaAnimales(filtroInicial) {
    if (filtroInicial !== undefined) { S.borrador.especie = ['caprino', 'ovino'].includes(filtroInicial) ? filtroInicial : ''; S.borrador.revisar = filtroInicial === 'revisar'; }
    const t = (S.borrador.buscar || '').trim().toUpperCase();
    const esp = S.borrador.especie || ''; const cat = S.borrador.cat || ''; const bajas = !!S.borrador.bajas; const rev = !!S.borrador.revisar;
    const lista = S.animales.filter((a) => (bajas ? true : !a.fecha_baja) && (!esp || a.especie === esp) && (!cat || a.categoria === cat)
      && (!rev || L.revisar(a).length)
      && (!t || [a.manejo, a.codigo_cria, a.crotal].some((x) => x && x.toUpperCase().includes(t)))).sort(L.ordenNatural);
    pintar(`${cabecera()}
      <main class="cuerpo">${faltaSQLCaja()}
        <div class="entre"><h1 style="font-size:22px">Animales</h1><a class="btn sec peq" href="#/alta">${ICONOS.mas}Alta</a></div>
        <div class="campo"><input id="buscar" type="text" inputmode="search" autocapitalize="characters" aria-label="Buscar por nº de collar, código o crotal" placeholder="Nº de collar, código de cría o crotal…" value="${esc(S.borrador.buscar || '')}"></div>
        <div class="pestanas">${[['', 'Todos'], ['caprino', 'Caprino'], ['ovino', 'Ovino']].map(([k, x]) => `<button type="button" data-esp="${k}" class="${esp === k ? 'activo' : ''}">${x}</button>`).join('')}</div>
        <div class="dos"><select id="f-cat" aria-label="Categoría"><option value="">Todas las categorías</option>${Object.entries(L.CAT).filter(([, v]) => !esp || v.especie === esp).map(([k, v]) => `<option value="${k}" ${cat === k ? 'selected' : ''}>${v.plural}</option>`).join('')}</select>
          <label class="check-todos"><input type="checkbox" id="f-bajas" ${bajas ? 'checked' : ''}> Ver bajas</label></div>
        ${esProf() ? `<label class="check-todos"><input type="checkbox" id="f-rev" ${rev ? 'checked' : ''}> Solo con datos por completar</label>` : ''}
        <div class="suave">${lista.length} ${lista.length === 1 ? 'animal' : 'animales'}</div>
        <div class="lista">${lista.map((a) => `<a class="animal-fila" href="#/animal/${a.id}"><div><strong>${esc(nombreA(a))}</strong>
          <div class="suave">${esc(catNombre(a.categoria))} · ${a.fecha_baja ? `Baja ${fmt(a.fecha_baja)}` : esc(nombreCorrCorto(ubic(a)))}${a.crotal ? ` · ${esc(a.crotal)}` : ''}</div></div>
          ${a.fecha_baja ? '<span class="chip gris">Baja</span>' : rev ? `<span class="chip nar">${L.revisar(a).length}</span>` : chipCat(a)}</a>`).join('') || '<div class="vacio">No hay animales que coincidan.</div>'}</div>
      </main>${navegacion('animales')}`);
    const b = document.getElementById('buscar');
    b.addEventListener('input', () => { S.borrador.buscar = b.value; const pos = b.selectionStart; vistaAnimales(); const nb = document.getElementById('buscar'); nb.focus(); nb.setSelectionRange(pos, pos); });
    $app.querySelectorAll('[data-esp]').forEach((x) => x.addEventListener('click', () => { S.borrador.especie = x.dataset.esp; S.borrador.cat = ''; vistaAnimales(); }));
    document.getElementById('f-cat').addEventListener('change', (ev) => { S.borrador.cat = ev.target.value; vistaAnimales(); });
    document.getElementById('f-bajas').addEventListener('change', (ev) => { S.borrador.bajas = ev.target.checked; vistaAnimales(); });
    const r = document.getElementById('f-rev'); if (r) r.addEventListener('change', (ev) => { S.borrador.revisar = ev.target.checked; vistaAnimales(); });
  }

  // ---------------------------------------------------------------- ficha
  const TIPOS = { alta: 'Alta', baja: 'Baja', baja_anulada: 'Baja anulada', datos: 'Datos corregidos', traslado: 'Traslado', nota: 'Nota' };
  const CAMPOS = { especie: 'Especie', categoria: 'Categoría', sexo: 'Sexo', crotal: 'Crotal', manejo: 'Nº de manejo', codigo_cria: 'Código de cría', capa: 'Capa', fecha_nacimiento: 'Nacimiento', anio_nacimiento: 'Año de nacimiento', madre_id: 'Madre', padre_id: 'Padre', madre_txt: 'Madre', padre_txt: 'Padre', origen: 'Origen', corralina_id: 'Corralina de entrada', fecha_alta: 'Fecha de alta', obs: 'Observaciones' };
  const nombreEvento = (e) => TIPOS[e.tipo] || e.tipo;
  function valorCampo(k, v) {
    if (v === null || v === undefined || v === '') return '—';
    if (k === 'categoria') return catNombre(v);
    if (k === 'capa') return L.CAPAS[v] || v;
    if (k === 'origen') return L.ORIGENES[v] || v;
    if (k === 'especie') return L.ESPECIES[v] ? L.ESPECIES[v].nombre : v;
    if (k === 'madre_id' || k === 'padre_id') return nombreA(animal(v));
    if (k === 'corralina_id') return nombreCorr(v);
    if (/fecha/.test(k)) return fmt(v);
    return String(v);
  }
  function resumenEvento(e) {
    const d = e.datos || {};
    switch (e.tipo) {
      case 'alta': return d.importado ? 'Censo inicial (importado)' : esc(d.motivo || 'Alta');
      case 'baja': return `${esc(d.causa || '')}${d.destino ? ` · ${esc(d.destino)}` : ''}`;
      case 'baja_anulada': return 'Vuelve al censo';
      case 'datos': return Object.entries(d.cambios || {}).map(([k, [a, b]]) => `${esc(CAMPOS[k] || k)}: ${esc(valorCampo(k, a))} → ${esc(valorCampo(k, b))}`).join(' · ');
      case 'traslado': return `${esc(nombreCorrCorto(d.de))} → <strong>${esc(nombreCorrCorto(d.a))}</strong>`;
      case 'nota': return esc(d.texto || '');
      default: return esc(e.tipo);
    }
  }
  const AUTO = ['alta', 'baja', 'baja_anulada', 'datos'];
  const puedeEditarEv = (e) => esProf() || (!AUTO.includes(e.tipo) && e.autor === uid() && Date.now() - new Date(e.creado).getTime() < 864e5);
  const puedeEditarAnimal = (a) => esProf() || (a.alta_autor === uid() && Date.now() - new Date(a.creado).getTime() < 864e5);

  function vistaFicha(id) {
    const a = animal(id);
    if (!a) return vistaNoEncontrado('No se ha encontrado ese animal.');
    const h = hoy(); const u = ubic(a);
    const madre = a.madre_id ? animal(a.madre_id) : null; const padre = a.padre_id ? animal(a.padre_id) : null;
    const crias = S.animales.filter((x) => x.madre_id === a.id || x.padre_id === a.id).sort((x, y) => String(y.fecha_nacimiento || y.fecha_alta).localeCompare(String(x.fecha_nacimiento || x.fecha_alta)));
    const rev = esProf() ? L.revisar(a) : [];
    const evs = (S.porAnimal[a.id] || []).slice().sort(L.porFecha).reverse();
    const tarjetaEv = (e) => `<div class="evento"><div class="entre"><strong>${esc(nombreEvento(e))}</strong><span class="suave">${fmt(e.fecha)}</span></div>
      <div>${resumenEvento(e)}</div>${e.datos && e.datos.obs ? `<div class="suave">${esc(e.datos.obs)}</div>` : ''}
      <div class="suave peq">${e.datos && e.datos.importado ? 'Importado del Excel' : `Por ${esc(quienEs(e.autor, e.autor_alias))} (${curso(e.curso)})`}${e.modificado ? ` · corregido por ${esc(e.modificado_por || '?')}` : ''}</div>
      ${puedeEditarEv(e) && !AUTO.includes(e.tipo) ? `<div class="acciones">${e.tipo === 'nota' ? `<a class="btn sec peq" href="#/nota/${a.id}/${e.id}">Corregir</a>` : ''}<button class="btn peligro peq" type="button" data-borrar="${e.id}">Borrar</button></div>` : ''}</div>`;
    const historial = evs.slice(0, 10).map(tarjetaEv).join('') + (evs.length > 10 ? `<details><summary class="suave" style="min-height:44px;display:flex;align-items:center">Ver ${evs.length - 10} registros anteriores</summary>${evs.slice(10).map(tarjetaEv).join('')}</details>` : '');
    const ident = [a.crotal ? `Crotal ${esc(a.crotal)}` : null, a.manejo && a.codigo_cria ? `antes ${esc(a.codigo_cria)}` : null].filter(Boolean).join(' · ');
    pintar(`${cabecera({ volver: '#/animales', textoVolver: 'Animales', titulo: nombreA(a), sub: `${esc(catNombre(a.categoria))} · ${esc(L.ESPECIES[a.especie].raza)}${ident ? ` · ${ident}` : ''}` })}
      <main class="cuerpo">
        ${a.fecha_baja ? `<div class="error-caja"><strong>Dado de baja el ${fmt(a.fecha_baja)}</strong> · ${esc(a.causa_baja)}${a.destino_baja ? ` · ${esc(a.destino_baja)}` : ''}${a.baja_por ? ` · por ${esc(a.baja_por)}` : ''}</div>` : ''}
        ${rev.length ? `<div class="aviso-caja"><strong>Por completar:</strong> ${esc(rev.join(' · '))}. <a href="#/editar/${a.id}">Corregir datos</a></div>` : ''}
        <div class="dos"><div class="dato ${a.especie === 'ovino' ? 'ovi' : ''}"><span class="et">Ubicación</span><span class="val peq-val">${esc(a.fecha_baja ? '—' : nombreCorrCorto(u))}</span><span class="nota">${a.fecha_baja ? '' : esc((corralina(u) || {}).uso || '')}</span></div>
          <div class="dato gris"><span class="et">Edad</span><span class="val peq-val">${esc(L.edad(a, h))}</span><span class="nota">${a.fecha_nacimiento ? `Nació el ${fmt(a.fecha_nacimiento)}` : a.anio_nacimiento ? `Año ${a.anio_nacimiento}` : 'Fecha sin anotar'}</span></div></div>
        ${a.fecha_baja ? '' : `<div class="botones"><a class="btn" href="#/trasladar/${a.id}">${ICONOS.flecha}Trasladar</a><a class="btn sec" href="#/nota/${a.id}">Nota</a></div>`}
        <div class="botones">${a.fecha_baja ? (esProf() ? '<button class="btn sec peq" type="button" id="b-anular">Anular la baja</button>' : '') : `<a class="btn sec peq" href="#/baja/${a.id}">Dar de baja</a>`}
          ${puedeEditarAnimal(a) ? `<a class="btn sec peq" href="#/editar/${a.id}">Corregir datos</a>` : ''}</div>
        <section class="tarjeta"><h2>Datos</h2><div class="filas">
          <div><span>Especie</span><span>${esc(L.ESPECIES[a.especie].nombre)}</span></div>
          <div><span>Categoría</span><span>${esc(catNombre(a.categoria))}</span></div>
          <div><span>Nº de manejo (collar)</span><span>${esc(a.manejo || '—')}</span></div>
          ${a.codigo_cria ? `<div><span>Código de cría</span><span>${esc(a.codigo_cria)}</span></div>` : ''}
          <div><span>Crotal</span><span>${esc(a.crotal || '—')}</span></div>
          <div><span>Sexo</span><span>${esc(a.sexo ? (a.sexo === 'hembra' ? 'Hembra' : 'Macho') : '—')}</span></div>
          ${a.especie === 'caprino' ? `<div><span>Capa</span><span>${esc(a.capa ? L.CAPAS[a.capa] : '—')}</span></div>` : ''}
          <div><span>Origen</span><span>${esc(a.origen ? L.ORIGENES[a.origen] : '—')}</span></div>
          <div><span>Alta en el censo</span><span>${fmt(a.fecha_alta)}${a.alta_por ? ` · ${esc(a.alta_por)}` : ''}</span></div>
          ${a.obs ? `<div><span>Observaciones</span><span>${esc(a.obs)}</span></div>` : ''}</div></section>
        <section class="tarjeta"><h2>Familia</h2><div class="filas">
          <div><span>Madre</span><span>${madre ? `<a href="#/animal/${madre.id}">${esc(nombreA(madre))}</a>` : esc(a.madre_txt || '—')}</span></div>
          <div><span>Padre</span><span>${padre ? `<a href="#/animal/${padre.id}">${esc(nombreA(padre))}</a>` : esc(a.padre_txt || '—')}</span></div></div>
          ${crias.length ? `<div class="suave peq" style="font-weight:700;margin-top:4px">CRÍAS (${crias.length})</div><div class="lista">${crias.map((x) => `<a class="animal-fila mini" href="#/animal/${x.id}"><div><strong>${esc(nombreA(x))}</strong><div class="suave">${esc(catNombre(x.categoria))} · ${fmt(x.fecha_nacimiento)}</div></div>${x.fecha_baja ? '<span class="chip gris">Baja</span>' : chipCat(x)}</a>`).join('')}</div>` : ''}</section>
        <section class="tarjeta"><h2>Historial</h2>${historial || '<div class="suave">Sin registros.</div>'}</section>
        ${esProf() ? '<details class="tarjeta"><summary class="suave">Borrar el animal (solo si es un error)</summary><p class="suave">Borra el animal y todo su historial. Para un animal vendido o muerto, usa «Dar de baja».</p><button class="btn peligro" type="button" id="b-borrar-animal">Borrar definitivamente</button></details>' : ''}
      </main>${navegacion('animales')}`);
    $app.querySelectorAll('[data-borrar]').forEach((b) => b.addEventListener('click', async () => {
      if (b.dataset.confirmar !== '1') { b.dataset.confirmar = '1'; b.textContent = '¿Seguro? Pulsa otra vez'; return; }
      const { error } = await sb.from('rum_eventos').delete().eq('id', b.dataset.borrar);
      if (error) return toast(traducirError(error));
      toast('Registro borrado'); refrescar();
    }));
    const an = document.getElementById('b-anular');
    if (an) an.addEventListener('click', async () => {
      if (an.dataset.confirmar !== '1') { an.dataset.confirmar = '1'; an.textContent = '¿Seguro? Pulsa otra vez'; return; }
      const { error } = await sb.from('rum_animales').update({ fecha_baja: null, causa_baja: null, destino_baja: null }).eq('id', a.id);
      if (error) return toast(traducirError(error));
      toast('Baja anulada'); refrescar();
    });
    const ba = document.getElementById('b-borrar-animal');
    if (ba) ba.addEventListener('click', async () => {
      if (ba.dataset.confirmar !== '1') { ba.dataset.confirmar = '1'; ba.textContent = '¿Seguro? Se borra todo su historial. Pulsa otra vez'; return; }
      const { error } = await sb.from('rum_animales').delete().eq('id', a.id);
      if (error) return toast(traducirError(error));
      toast('Animal borrado'); await refrescar(); location.hash = '#/animales';
    });
  }

  // ---------------------------------------------------------------- formularios
  const opcionesCorralinas = (sel, vacia) => `${vacia ? `<option value="">${vacia}</option>` : ''}${[...new Set(S.corralinas.map((c) => c.nave))].map((nv) => `<optgroup label="Nave ${esc(nv)}">${S.corralinas.filter((c) => c.nave === nv && c.activa).sort((x, y) => x.numero - y.numero).map((c) => `<option value="${c.id}" ${Number(sel) === c.id ? 'selected' : ''}>${esc(nv)} · ${c.numero}${c.uso ? ` (${esc(c.uso)})` : ''}</option>`).join('')}</optgroup>`).join('')}`;
  const errorCaja = (t) => `<div class="error-caja" role="alert">${esc(t)}</div>`;

  function vistaTrasladar(id) {
    const ids = id ? [id] : ((S.borrador.traslado || {}).ids || []);
    const lista = ids.map(animal).filter((a) => a && !a.fecha_baja);
    if (!lista.length) return vistaNoEncontrado('No hay animales seleccionados.');
    const volver = id ? `#/animal/${id}` : (S.borrador.traslado.volver || '#/mapa');
    const origenes = [...new Set(lista.map((a) => ubic(a)))];
    pintar(`${cabecera({ volver, titulo: 'Trasladar', sub: lista.length === 1 ? `${esc(nombreA(lista[0]))} · ahora en ${esc(nombreCorrCorto(origenes[0]))}` : `${lista.length} animales` })}
      <main class="cuerpo"><div id="msg"></div>
        ${lista.length > 1 ? `<div class="tarjeta"><div class="suave">${lista.map((a) => esc(nombreA(a))).join(', ')}</div></div>` : ''}
        <form class="formu" id="f-tras" novalidate>
          <div class="campo"><label for="destino">Corralina de destino</label><select id="destino" name="destino" required>${opcionesCorralinas(null, 'Elige…')}</select></div>
          <div class="campo"><label for="fecha">Fecha</label><input id="fecha" name="fecha" type="date" value="${hoy()}" max="${hoy()}" required></div>
          <div class="campo"><label for="obs">Observaciones (opcional)</label><textarea id="obs" name="obs"></textarea></div>
          <button class="btn" type="submit">Guardar traslado</button></form>
      </main>${navegacion('mapa')}`);
    document.getElementById('f-tras').addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const f = new FormData(ev.target); const destino = Number(f.get('destino')); const fecha = String(f.get('fecha'));
      if (!destino || !fecha) { document.getElementById('msg').innerHTML = errorCaja('Elige la corralina y la fecha.'); return; }
      const filas = lista.filter((a) => ubic(a) !== destino).map((a) => ({ animal_id: a.id, tipo: 'traslado', fecha, datos: { de: ubic(a), a: destino, ...(f.get('obs') ? { obs: String(f.get('obs')).trim() } : {}) } }));
      if (!filas.length) { document.getElementById('msg').innerHTML = errorCaja('Ya están en esa corralina.'); return; }
      ev.target.querySelector('button').disabled = true;
      const { error } = await sb.from('rum_eventos').insert(filas);
      if (error) { ev.target.querySelector('button').disabled = false; document.getElementById('msg').innerHTML = errorCaja(traducirError(error)); return; }
      toast(`${filas.length} ${filas.length === 1 ? 'animal trasladado' : 'animales trasladados'} a ${nombreCorrCorto(destino)}`);
      S.borrador.traslado = null; await refrescar(); location.hash = volver;
    });
  }

  function vistaNota(id, evId) {
    const a = animal(id); if (!a) return vistaNoEncontrado();
    const e = evId ? S.eventos.find((x) => x.id === evId) : null;
    pintar(`${cabecera({ volver: `#/animal/${id}`, titulo: e ? 'Corregir nota' : 'Nota', sub: esc(nombreA(a)) })}
      <main class="cuerpo"><div id="msg"></div>
        <form class="formu" id="f-nota" novalidate>
          <div class="campo"><label for="fecha">Fecha</label><input id="fecha" name="fecha" type="date" value="${e ? e.fecha : hoy()}" max="${hoy()}" required></div>
          <div class="campo"><label for="texto">Nota</label><textarea id="texto" name="texto" required>${esc(e ? e.datos.texto : '')}</textarea></div>
          <button class="btn" type="submit">Guardar</button></form>
      </main>${navegacion('animales')}`);
    document.getElementById('f-nota').addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const f = new FormData(ev.target); const texto = String(f.get('texto') || '').trim();
      if (!texto) { document.getElementById('msg').innerHTML = errorCaja('Escribe la nota.'); return; }
      const reg = { fecha: String(f.get('fecha')), datos: { texto } };
      const { error } = e ? await sb.from('rum_eventos').update(reg).eq('id', e.id) : await sb.from('rum_eventos').insert({ animal_id: a.id, tipo: 'nota', ...reg });
      if (error) { document.getElementById('msg').innerHTML = errorCaja(traducirError(error)); return; }
      toast('Nota guardada'); await refrescar(); location.hash = `#/animal/${a.id}`;
    });
  }

  function vistaBaja(id) {
    const a = animal(id); if (!a || a.fecha_baja) return vistaNoEncontrado();
    pintar(`${cabecera({ volver: `#/animal/${id}`, titulo: 'Dar de baja', sub: `${esc(nombreA(a))} · ${esc(catNombre(a.categoria))}` })}
      <main class="cuerpo"><div id="msg"></div>
        <form class="formu" id="f-baja" novalidate>
          <div class="campo"><label for="fecha">Fecha de la baja</label><input id="fecha" name="fecha" type="date" value="${hoy()}" max="${hoy()}" required></div>
          <div class="campo"><span class="et" id="et-causa">Causa</span><div class="opciones" role="radiogroup" aria-labelledby="et-causa">
            ${L.CAUSAS_BAJA.map((c) => `<label><input type="radio" name="causa" value="${esc(c)}"> ${esc(c)}</label>`).join('')}</div></div>
          <div class="campo"><label for="destino">Destino o detalle</label><input id="destino" name="destino" type="text" placeholder="Comprador, matadero, causa de la muerte…">
            <span class="ayuda">${a.manejo ? `El collar ${esc(a.manejo)} quedará libre para otro animal.` : ''}</span></div>
          <button class="btn peligro" type="submit">Dar de baja</button></form>
      </main>${navegacion('animales')}`);
    document.getElementById('f-baja').addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const f = new FormData(ev.target);
      if (!f.get('causa')) { document.getElementById('msg').innerHTML = errorCaja('Indica la causa de la baja.'); return; }
      if (String(f.get('fecha')) < a.fecha_alta) { document.getElementById('msg').innerHTML = errorCaja('La baja no puede ser anterior al alta.'); return; }
      const { error } = await sb.from('rum_animales').update({ fecha_baja: String(f.get('fecha')), causa_baja: String(f.get('causa')), destino_baja: String(f.get('destino') || '').trim() || null }).eq('id', a.id);
      if (error) { document.getElementById('msg').innerHTML = errorCaja(traducirError(error)); return; }
      toast(`${nombreA(a)} dado de baja`); await refrescar(); location.hash = `#/animal/${a.id}`;
    });
  }

  // Alta o corrección de datos de un animal.
  function vistaFormAnimal(id) {
    const a = id ? animal(id) : null;
    if (id && (!a || !puedeEditarAnimal(a))) return vistaNoEncontrado('No puedes corregir los datos de este animal: pídeselo al profesor.');
    const v = S.borrador.formAnimal && S.borrador.formAnimal.id === (id || null) ? S.borrador.formAnimal.v : (a ? { ...a } : { especie: 'caprino', fecha_alta: hoy(), origen: 'centro' });
    const esp = v.especie;
    const madres = activos().filter((x) => x.especie === esp && ['cabra', 'oveja', 'chiva', 'cordera'].includes(x.categoria) && x.id !== id).sort(L.ordenNatural);
    const padres = activos().filter((x) => x.especie === esp && ['macho_cabrio', 'morueco'].includes(x.categoria) && x.id !== id).sort(L.ordenNatural);
    const incluye = (lista, x) => (x && !lista.find((y) => y.id === x) && animal(x) ? [animal(x), ...lista] : lista);
    const opt = (lista, sel) => `<option value="">— Sin anotar —</option>${incluye(lista, sel).map((x) => `<option value="${x.id}" ${sel === x.id ? 'selected' : ''}>${esc(nombreA(x))}${x.fecha_baja ? ' (baja)' : ''}</option>`).join('')}`;
    pintar(`${cabecera({ volver: a ? `#/animal/${a.id}` : '#/animales', textoVolver: a ? 'Ficha' : 'Animales', titulo: a ? `Corregir ${nombreA(a)}` : 'Alta de un animal' })}
      <main class="cuerpo"><div id="msg"></div>
        <form class="formu" id="f-animal" novalidate>
          <div class="campo"><span class="et">Especie</span><div class="opciones">${Object.entries(L.ESPECIES).map(([k, x]) => `<label><input type="radio" name="especie" value="${k}" ${esp === k ? 'checked' : ''}> ${x.nombre}</label>`).join('')}</div></div>
          <div class="campo"><label for="categoria">Categoría</label><select id="categoria" name="categoria"><option value="">Elige…</option>${Object.entries(L.CAT).filter(([, x]) => x.especie === esp).map(([k, x]) => `<option value="${k}" ${v.categoria === k ? 'selected' : ''}>${x.nombre}</option>`).join('')}</select></div>
          <div class="campo"><span class="et">Sexo</span><div class="opciones"><label><input type="radio" name="sexo" value="hembra" ${v.sexo === 'hembra' ? 'checked' : ''}> Hembra</label><label><input type="radio" name="sexo" value="macho" ${v.sexo === 'macho' ? 'checked' : ''}> Macho</label></div></div>
          <div class="dos"><div class="campo"><label for="manejo">Nº de manejo (collar)</label><input id="manejo" name="manejo" type="text" autocapitalize="characters" value="${esc(v.manejo || '')}" placeholder="A12"></div>
            <div class="campo"><label for="crotal">Crotal</label><input id="crotal" name="crotal" type="text" inputmode="numeric" value="${esc(v.crotal || '')}" placeholder="724…"></div></div>
          <div class="ayuda suave">Las crías se registran sin crotal ni collar: la app les da un código con el nº de la madre (A12-1). Al acrotalarlas, pasan a chiva o cordera de reposición.</div>
          ${esp === 'caprino' ? `<div class="campo"><span class="et">Capa</span><div class="opciones"><label><input type="radio" name="capa" value="" ${!v.capa ? 'checked' : ''}> Sin anotar</label>${Object.entries(L.CAPAS).map(([k, x]) => `<label><input type="radio" name="capa" value="${k}" ${v.capa === k ? 'checked' : ''}> ${x}</label>`).join('')}</div></div>` : ''}
          <div class="dos"><div class="campo"><label for="fecha_nacimiento">Fecha de nacimiento</label><input id="fecha_nacimiento" name="fecha_nacimiento" type="date" max="${hoy()}" value="${esc(v.fecha_nacimiento || '')}"></div>
            <div class="campo"><label for="anio_nacimiento">o año aproximado</label><input id="anio_nacimiento" name="anio_nacimiento" type="number" min="1990" max="2100" value="${esc(v.anio_nacimiento || '')}"></div></div>
          <div class="dos"><div class="campo"><label for="madre_id">Madre</label><select id="madre_id" name="madre_id">${opt(madres, v.madre_id)}</select>${v.madre_txt ? `<span class="ayuda">Anotada como «${esc(v.madre_txt)}» (no está en el censo)</span>` : ''}</div>
            <div class="campo"><label for="padre_id">Padre</label><select id="padre_id" name="padre_id">${opt(padres, v.padre_id)}</select>${v.padre_txt ? `<span class="ayuda">Anotado como «${esc(v.padre_txt)}»</span>` : ''}</div></div>
          <div class="campo"><label for="origen">Origen</label><select id="origen" name="origen"><option value="">—</option>${Object.entries(L.ORIGENES).map(([k, x]) => `<option value="${k}" ${v.origen === k ? 'selected' : ''}>${x}</option>`).join('')}</select></div>
          ${a ? '' : `<div class="dos"><div class="campo"><label for="corralina_id">Corralina</label><select id="corralina_id" name="corralina_id">${opcionesCorralinas(v.corralina_id, 'Elige…')}</select></div>
            <div class="campo"><label for="fecha_alta">Fecha de alta</label><input id="fecha_alta" name="fecha_alta" type="date" max="${hoy()}" value="${esc(v.fecha_alta || hoy())}"></div></div>
            <div class="campo"><label for="motivo_alta">Motivo del alta</label><select id="motivo_alta" name="motivo_alta"><option>Nacimiento</option><option>Compra</option><option>Otro</option></select></div>`}
          <div class="campo"><label for="obs">Observaciones</label><textarea id="obs" name="obs">${esc(v.obs || '')}</textarea></div>
          <button class="btn" type="submit">${a ? 'Guardar cambios' : 'Dar de alta'}</button></form>
      </main>${navegacion('animales')}`);
    const form = document.getElementById('f-animal');
    const leer = () => {
      const f = new FormData(form); const o = {};
      for (const k of ['especie', 'categoria', 'sexo', 'manejo', 'crotal', 'capa', 'fecha_nacimiento', 'anio_nacimiento', 'madre_id', 'padre_id', 'origen', 'corralina_id', 'fecha_alta', 'motivo_alta', 'obs']) {
        const x = f.get(k); o[k] = x === null ? (k in v ? v[k] : null) : String(x).trim() || null;
      }
      o.madre_txt = o.madre_id ? null : v.madre_txt || null; o.padre_txt = o.padre_id ? null : v.padre_txt || null;
      if (o.especie !== 'caprino') o.capa = null;
      if (o.manejo) o.manejo = o.manejo.toUpperCase();
      if (o.crotal) o.crotal = o.crotal.replace(/\s/g, '').toUpperCase();
      o.anio_nacimiento = o.anio_nacimiento ? Number(o.anio_nacimiento) : null;
      o.corralina_id = o.corralina_id ? Number(o.corralina_id) : null;
      return o;
    };
    form.querySelectorAll('input[name=especie]').forEach((r) => r.addEventListener('change', () => { const o = leer(); o.categoria = null; o.madre_id = null; o.padre_id = null; S.borrador.formAnimal = { id: id || null, v: { ...v, ...o } }; vistaFormAnimal(id); }));
    form.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const o = leer(); const msg = (t) => { document.getElementById('msg').innerHTML = errorCaja(t); window.scrollTo(0, 0); };
      const cat = L.CAT[o.categoria];
      if (!cat) return msg('Elige la categoría.');
      if (cat.sexo && o.sexo && cat.sexo !== o.sexo) return msg('El sexo no cuadra con la categoría.');
      if (cat.sexo) o.sexo = cat.sexo;
      if (cat.cria && !o.madre_id && !o.madre_txt) return msg('Una cría necesita su madre.');
      if (!cat.cria && !o.manejo && !o.crotal) return msg('Anota el nº de collar o el crotal.');
      if (!a && !o.corralina_id) return msg('Elige la corralina.');
      if (o.anio_nacimiento && !(o.anio_nacimiento >= 1990 && o.anio_nacimiento <= 2100)) return msg('Año de nacimiento no válido.');
      const boton = form.querySelector('button[type=submit]'); boton.disabled = true;
      let res;
      if (a) {
        const cambios = {};
        for (const k of ['categoria', 'sexo', 'manejo', 'crotal', 'capa', 'fecha_nacimiento', 'anio_nacimiento', 'madre_id', 'padre_id', 'madre_txt', 'padre_txt', 'origen', 'obs', 'especie']) if ((o[k] ?? null) !== (a[k] ?? null)) cambios[k] = o[k];
        if (!Object.keys(cambios).length) { boton.disabled = false; location.hash = `#/animal/${a.id}`; return; }
        res = await sb.from('rum_animales').update(cambios).eq('id', a.id).select();
      } else {
        const { motivo_alta: motivo, ...resto } = o;
        res = await sb.from('rum_animales').insert({ ...resto, motivo_alta: motivo || 'Nacimiento' }).select();
      }
      if (res.error) { boton.disabled = false; return msg(traducirError(res.error)); }
      S.borrador.formAnimal = null;
      const nuevo = res.data && res.data[0];
      toast(a ? 'Cambios guardados' : `${nuevo ? nombreA(nuevo) : 'Animal'} dado de alta`);
      await refrescar(); location.hash = `#/animal/${a ? a.id : nuevo.id}`;
    });
  }

  // ---------------------------------------------------------------- censo
  function vistaCenso() {
    const f = S.borrador.fechaCenso || hoy();
    const vivos = S.animales.filter((a) => L.vivoEn(a, f));
    const en = (a) => L.ubicacion(a, S.porAnimal[a.id], f) || 0;
    const fila = (esp) => Object.entries(L.CAT).filter(([, x]) => x.especie === esp).map(([k, x]) => { const n = vivos.filter((a) => a.categoria === k).length; return `<tr><td>${x.plural}</td><td class="num">${n}</td></tr>`; }).join('');
    const tot = (esp) => vivos.filter((a) => a.especie === esp).length;
    const desde = S.borrador.desdeMov || `${hoy().slice(0, 4)}-01-01`;
    const movs = S.eventos.filter((e) => ['alta', 'baja', 'baja_anulada'].includes(e.tipo) && e.fecha >= desde && !(e.datos && e.datos.importado)).sort(L.porFecha).reverse();
    pintar(`${cabecera()}
      <main class="cuerpo">${faltaSQLCaja()}
        <h1 style="font-size:22px">Censo</h1>
        <div class="campo"><label for="f-fecha">A fecha de</label><input id="f-fecha" type="date" value="${f}" max="${hoy()}"></div>
        <div class="dos">
          <section class="tarjeta"><h2>Caprino · ${tot('caprino')}</h2><table class="tabla"><tbody>${fila('caprino')}</tbody></table></section>
          <section class="tarjeta"><h2>Ovino · ${tot('ovino')}</h2><table class="tabla"><tbody>${fila('ovino')}</tbody></table></section></div>
        <section class="tarjeta"><h2>Por corralina</h2><table class="tabla"><thead><tr><th>Corralina</th><th class="num">Caprino</th><th class="num">Ovino</th></tr></thead><tbody>
          ${S.corralinas.slice().sort((x, y) => x.nave.localeCompare(y.nave) || x.numero - y.numero).map((c) => { const l = vivos.filter((a) => en(a) === c.id); return l.length ? `<tr><td>${esc(c.nave)} · ${c.numero}</td><td class="num">${l.filter((a) => a.especie === 'caprino').length}</td><td class="num">${l.filter((a) => a.especie === 'ovino').length}</td></tr>` : ''; }).join('')}
          ${(() => { const l = vivos.filter((a) => !en(a)); return l.length ? `<tr><td>Sin ubicar</td><td class="num">${l.filter((a) => a.especie === 'caprino').length}</td><td class="num">${l.filter((a) => a.especie === 'ovino').length}</td></tr>` : ''; })()}
        </tbody></table></section>
        <button class="btn sec" type="button" id="b-excel">Descargar el censo en Excel</button><div id="estado-excel"></div>
        <section class="tarjeta"><div class="entre"><h2>Altas y bajas</h2><input id="f-desde" type="date" value="${desde}" aria-label="Desde" style="max-width:170px"></div>
          ${movs.map((e) => { const a = animal(e.animal_id); return `<a class="evento enlace" href="#/animal/${e.animal_id}"><div class="entre"><strong>${esc(nombreEvento(e))} · ${esc(nombreA(a))}</strong><span class="suave">${fmt(e.fecha)}</span></div><div class="suave peq">${esc(a ? catNombre(a.categoria) : '')} · ${resumenEvento(e)} · ${esc(quienEs(e.autor, e.autor_alias))}</div></a>`; }).join('') || '<div class="suave">Sin altas ni bajas desde esa fecha (no cuenta el censo importado).</div>'}</section>
      </main>${navegacion('censo')}`);
    document.getElementById('f-fecha').addEventListener('change', (ev) => { S.borrador.fechaCenso = ev.target.value || hoy(); vistaCenso(); });
    document.getElementById('f-desde').addEventListener('change', (ev) => { S.borrador.desdeMov = ev.target.value; vistaCenso(); });
    document.getElementById('b-excel').addEventListener('click', async (ev) => {
      const est = document.getElementById('estado-excel'); ev.target.disabled = true;
      try {
        await cargarXLSX(); const X = window.XLSX; const libro = X.utils.book_new();
        const filas = vivos.slice().sort((x, y) => x.especie.localeCompare(y.especie) || L.ordenNatural(x, y)).map((a) => filaExcel(a, en(a)));
        X.utils.book_append_sheet(libro, X.utils.json_to_sheet(filas.length ? filas : [{ '': 'Sin animales' }]), 'Censo');
        const res = []; for (const [k, x] of Object.entries(L.CAT)) res.push({ Especie: L.ESPECIES[x.especie].nombre, Categoría: x.plural, Animales: vivos.filter((a) => a.categoria === k).length });
        X.utils.book_append_sheet(libro, X.utils.json_to_sheet(res), 'Resumen');
        X.writeFile(libro, `CIFEARUMI_censo_${f}.xlsx`);
        est.innerHTML = '<div class="ok-caja" role="status">Excel descargado. Búscalo en Descargas.</div>';
      } catch (e) { est.innerHTML = errorCaja(traducirError(e)); }
      ev.target.disabled = false;
    });
  }
  const filaExcel = (a, u) => ({ Especie: L.ESPECIES[a.especie].nombre, 'Nº manejo': a.manejo || '', 'Código cría': a.codigo_cria || '', Crotal: a.crotal || '', Categoría: catNombre(a.categoria), Sexo: a.sexo || '', Capa: a.capa ? L.CAPAS[a.capa] : '', Nacimiento: a.fecha_nacimiento || a.anio_nacimiento || '', Madre: a.madre_id ? nombreA(animal(a.madre_id)) : a.madre_txt || '', Padre: a.padre_id ? nombreA(animal(a.padre_id)) : a.padre_txt || '', Origen: a.origen ? L.ORIGENES[a.origen] : '', Corralina: u ? nombreCorr(u) : '', Alta: a.fecha_alta, Baja: a.fecha_baja || '', 'Causa baja': a.causa_baja || '', Observaciones: a.obs || '' });
  const cargarScript = (src) => new Promise((ok, mal) => { const sc = document.createElement('script'); sc.src = src; sc.onload = ok; sc.onerror = () => mal(new Error('No se pudo cargar el lector de Excel. Revisa la conexión.')); document.head.appendChild(sc); });
  const cargarXLSX = async () => { if (!window.XLSX) await cargarScript('https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js'); };
  function descargar(nombre, contenido, tipo) {
    const url = URL.createObjectURL(new Blob([contenido], { type: tipo }));
    const x = document.createElement('a'); x.href = url; x.download = nombre; document.body.appendChild(x); x.click(); x.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }

  // ---------------------------------------------------------------- gestión (profesor)
  function vistaGestion() {
    if (!esProf()) return vistaCuenta();
    const imp = S.importacion;
    const buenas = imp ? imp.filas.filter((r) => !r.errores.length && !r.repetido) : [];
    pintar(`${cabecera()}
      <main class="cuerpo">${faltaSQLCaja()}
        <h1 style="font-size:22px">Gestión</h1>
        <section class="tarjeta"><h2>Importar el censo desde Excel</h2>
          <div class="suave">Usa la plantilla <strong>CIFEARUMI_censo</strong> (hoja «Censo»). Los animales cuyo crotal ya esté en la app se saltan, así que puedes importar el mismo archivo dos veces sin duplicar.</div>
          <input type="file" id="archivo" accept=".xlsx,.xls" aria-label="Elegir archivo Excel">
          <div id="estado-imp">${imp ? `<div class="${buenas.length ? 'ok-caja' : 'aviso-caja'}">${esc(imp.nombre)}: <strong>${buenas.length}</strong> animales listos para importar${imp.filas.length - buenas.length ? ` · ${imp.filas.length - buenas.length} se saltan` : ''}.</div>` : ''}</div>
          ${imp ? `${(() => { const malas = imp.filas.filter((r) => r.errores.length || r.repetido); return malas.length ? `<div class="aviso-caja"><strong>Se saltan ${malas.length} filas:</strong><ul class="saltan">${malas.map((r) => `<li>Fila ${r.n}${r.fila.manejo ? ` (${esc(r.fila.manejo)})` : ''}: ${esc(r.repetido ? 'ya está en la app' : r.errores.join('; '))}</li>`).join('')}</ul>Corrígelas en el Excel y vuelve a importarlo, o dalas de alta a mano.</div>` : ''; })()}
            <div class="campo"><label for="fecha-imp">Fecha de alta en el censo</label><input id="fecha-imp" type="date" value="${hoy()}" max="${hoy()}"><span class="ayuda">La fecha desde la que estos animales cuentan en el censo de la app.</span></div>
            <div class="botones"><button class="btn" type="button" id="b-importar" ${buenas.length ? '' : 'disabled'}>Importar ${buenas.length} animales</button><button class="btn sec" type="button" id="b-cancelar-imp">Cancelar</button></div>
            <details><summary class="suave" style="min-height:44px;display:flex;align-items:center">Ver todas las filas (${imp.filas.length})</summary><div class="tabla-scroll"><table class="tabla ancha"><thead><tr><th>Fila</th><th>Especie</th><th>Collar</th><th>Crotal</th><th>Categoría</th><th>Corralina</th><th>Estado</th></tr></thead><tbody>
            ${imp.filas.map((r) => `<tr class="${r.errores.length || r.repetido ? 'mal' : ''}"><td>${r.n}</td><td>${esc(r.fila.especie || '—')}</td><td>${esc(r.fila.manejo || (r.fila.madre ? `cría de ${r.fila.madre}` : '—'))}</td><td>${esc(r.fila.crotal || '—')}</td><td>${esc(r.fila.categoria ? catNombre(r.fila.categoria) : '—')}</td><td>${esc(r.fila.corralina_id ? nombreCorrCorto(r.fila.corralina_id) : '—')}</td>
              <td>${r.repetido ? 'Ya está en la app' : r.errores.length ? `<span class="rojo">${esc(r.errores.join('; '))}</span>` : `OK${r.avisos.length ? ` · <span class="suave">${esc(r.avisos.join('; '))}</span>` : ''}`}</td></tr>`).join('')}</tbody></table></div></details>` : ''}
        </section>
        <section class="tarjeta"><h2>Copia de seguridad</h2>
          <div class="suave">El plan gratuito de Supabase no hace copias automáticas. Descarga una cada mes: el Excel sirve para consultar y el archivo .json para restaurar.</div>
          <div class="botones"><button class="btn sec" type="button" data-copia="xlsx">Excel</button><button class="btn sec" type="button" data-copia="json">Archivo .json</button></div><div id="estado-copia"></div></section>
        <section class="tarjeta"><h2>Corralinas</h2><div class="suave">El uso de cada corralina se cambia desde el <a href="#/mapa">Mapa</a>, tocando la corralina.</div></section>
        <section class="tarjeta"><h2>Alumnos</h2><div class="suave">Las cuentas (alias y PIN) son las mismas que en CIFEAPORC. De momento se crean y se gestionan allí: <a href="${esc(C.urlPorcino)}">CIFEAPORC → Gestión → Alumnos</a>.</div></section>
        <a class="btn sec" href="#/cuenta">${ICONOS.cuenta}Tu cuenta</a>
      </main>${navegacion('gestion')}`);
    document.getElementById('archivo').addEventListener('change', (ev) => leerExcel(ev.target.files[0]));
    const bi = document.getElementById('b-importar'); if (bi) bi.addEventListener('click', () => importar(buenas));
    const bc = document.getElementById('b-cancelar-imp'); if (bc) bc.addEventListener('click', () => { S.importacion = null; vistaGestion(); });
    $app.querySelectorAll('[data-copia]').forEach((b) => b.addEventListener('click', () => descargarCopia(b.dataset.copia, b)));
  }
  async function leerExcel(file) {
    const est = document.getElementById('estado-imp');
    if (!file) return;
    est.innerHTML = '<div class="ok-caja">Leyendo el archivo…</div>';
    try {
      await cargarXLSX();
      const libro = window.XLSX.read(await file.arrayBuffer(), { type: 'array', cellDates: true });
      const hoja = libro.Sheets.Censo || libro.Sheets[libro.SheetNames.find((n) => /censo/i.test(n)) || libro.SheetNames[0]];
      const tabla = window.XLSX.utils.sheet_to_json(hoja, { header: 1, raw: true, defval: '' });
      const col = L.mapaColumnas(tabla[0] || []);
      if (col.especie === undefined || col.categoria === undefined) throw new Error('No encuentro las columnas «Especie» y «Categoría». ¿Es la plantilla del censo?');
      const crotales = new Set(S.animales.map((a) => a.crotal).filter(Boolean)); const vistos = new Set(); const collares = new Set();
      const vivosCollar = new Set(activos().filter((a) => a.manejo).map((a) => `${a.especie}|${a.manejo}`));
      const filas = [];
      tabla.slice(1).forEach((celdas, i) => {
        const vals = Object.values(col).map((k) => celdas[k]);
        if (!vals.some((x) => x !== '' && x !== null && x !== undefined)) return;
        const r = L.normalizarFila(celdas, col, S.corralinas); r.n = i + 2;
        if (r.fila.crotal && crotales.has(r.fila.crotal)) r.repetido = true;
        if (r.fila.crotal) { if (vistos.has(r.fila.crotal)) r.errores.push('Crotal repetido en el archivo'); vistos.add(r.fila.crotal); }
        if (r.fila.manejo && !r.repetido) {
          const k = `${r.fila.especie}|${r.fila.manejo}`;
          if (collares.has(k)) r.errores.push('Collar repetido en el archivo');
          if (vivosCollar.has(k)) r.errores.push('Ese collar ya lo lleva otro animal en la app');
          collares.add(k);
        }
        filas.push(r);
      });
      S.importacion = { nombre: file.name, filas };
      vistaGestion();
    } catch (e) { est.innerHTML = errorCaja(traducirError(e)); }
  }
  async function importar(buenas) {
    const b = document.getElementById('b-importar'); b.disabled = true; b.textContent = 'Importando…';
    const fecha = document.getElementById('fecha-imp').value || hoy();
    const { data, error } = await sb.rpc('rum_importar', { filas: buenas.map((r) => ({ ...r.fila, fecha_alta: fecha })) });
    if (error) { document.getElementById('estado-imp').innerHTML = errorCaja(traducirError(error)); b.disabled = false; b.textContent = 'Reintentar'; return; }
    S.importacion = null; toast(`${data} animales importados`); await refrescar(); location.hash = '#/mapa';
  }
  async function descargarCopia(formato, boton) {
    const estado = document.getElementById('estado-copia');
    boton.disabled = true; estado.innerHTML = '<div class="ok-caja">Preparando la copia…</div>';
    try {
      await cargarDatos();
      const sello = new Date(); const fichero = `CIFEARUMI_copia_${sello.getFullYear()}-${dos(sello.getMonth() + 1)}-${dos(sello.getDate())}_${dos(sello.getHours())}${dos(sello.getMinutes())}`;
      if (formato === 'json') {
        descargar(`${fichero}.json`, JSON.stringify({ app: 'CIFEAFARM', granja: 'CIFEARUMI', version: C.version, fecha: sello.toISOString(), rum_corralinas: S.corralinas, rum_animales: S.animales, rum_eventos: S.eventos }, null, 1), 'application/json');
      } else {
        await cargarXLSX(); const X = window.XLSX; const libro = X.utils.book_new();
        X.utils.book_append_sheet(libro, X.utils.json_to_sheet(S.animales.slice().sort((x, y) => x.especie.localeCompare(y.especie) || L.ordenNatural(x, y)).map((a) => filaExcel(a, a.fecha_baja ? null : ubic(a)))), 'Animales');
        X.utils.book_append_sheet(libro, X.utils.json_to_sheet(S.eventos.map((e) => { const a = animal(e.animal_id); return { Fecha: e.fecha, Animal: nombreA(a), Crotal: a ? a.crotal || '' : '', Registro: nombreEvento(e), Detalle: resumenEvento(e).replace(/<[^>]+>/g, ''), Observaciones: (e.datos && e.datos.obs) || '', Curso: curso(e.curso), 'Registrado por': quienEs(e.autor, e.autor_alias), 'Registrado el': String(e.creado || '').slice(0, 16).replace('T', ' '), 'Datos completos': JSON.stringify(e.datos || {}) }; }).concat([]) || [{}]), 'Historial');
        X.utils.book_append_sheet(libro, X.utils.json_to_sheet(S.corralinas.map((c) => ({ Nave: c.nave, Corralina: c.numero, Uso: c.uso || '', Activa: c.activa ? 'Sí' : 'No' }))), 'Corralinas');
        X.writeFile(libro, `${fichero}.xlsx`);
      }
      S.ultimaCopia = sello; try { localStorage.setItem('farm-ultima-copia', sello.toISOString()); } catch (_) { /* sin almacenamiento */ }
      estado.innerHTML = `<div class="ok-caja" role="status">Copia descargada: ${S.animales.length} animales y ${S.eventos.length} registros. Búscala en Descargas.</div>`;
    } catch (e) { estado.innerHTML = errorCaja(traducirError(e)); }
    boton.disabled = false;
  }

  // ---------------------------------------------------------------- cuenta
  function vistaCuenta(mensaje) {
    pintar(`${cabecera()}
      <main class="cuerpo">
        <h1 style="font-size:22px">Tu cuenta</h1>
        <section class="tarjeta"><div class="filas">
          ${S.perfil.nombre ? `<div><span>Nombre</span><span>${esc(S.perfil.nombre)}</span></div>` : ''}
          <div><span>Alias</span><span>${esc(S.perfil.alias)}</span></div>
          <div><span>Rol</span><span>${esProf() ? 'Profesor' : 'Alumno'}</span></div>
          ${esProf() ? '' : `<div><span>Curso</span><span>${curso(S.perfil.granja_id)}</span></div>`}</div></section>
        ${mensaje || ''}
        <form class="formu tarjeta" id="f-clave" novalidate>
          <h2>${esProf() ? 'Cambiar contraseña' : 'Cambiar PIN'}</h2>
          <div class="suave peq">Cambia también la de CIFEAPORC: es la misma cuenta.</div>
          <div class="campo"><label for="n1">${esProf() ? 'Nueva contraseña (mínimo 8 caracteres)' : 'Nuevo PIN (6 cifras)'}</label>
            <input id="n1" name="n1" type="password" ${esProf() ? '' : 'inputmode="numeric" maxlength="6"'} autocomplete="new-password"></div>
          <div class="campo"><label for="n2">Repítelo</label>
            <input id="n2" name="n2" type="password" ${esProf() ? '' : 'inputmode="numeric" maxlength="6"'} autocomplete="new-password"></div>
          <button class="btn" type="submit">Guardar</button></form>
        <section class="tarjeta"><h2>Instalar en el móvil</h2>
          <div class="suave">Android: en Chrome, menú ⋮ → <strong>Instalar aplicación</strong>.<br>iPhone: en Safari, botón Compartir → <strong>Añadir a pantalla de inicio</strong>.</div></section>
        <a class="btn sec" href="#/granjas">Granjas del centro</a>
        <button class="btn sec" type="button" data-accion="salir">Salir</button>
        <div class="suave peq" style="text-align:center">CIFEAFARM · versión ${esc(C.version)}</div>
      </main>${navegacion(esProf() ? 'gestion' : 'cuenta')}`);
    document.getElementById('f-clave').addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const f = new FormData(ev.target); const x = String(f.get('n1')); const y = String(f.get('n2'));
      const ok = esProf() ? x.length >= 8 : /^\d{6}$/.test(x);
      const err = (t) => vistaCuenta(errorCaja(t));
      if (!ok) return err(esProf() ? 'La contraseña debe tener al menos 8 caracteres.' : 'El PIN debe tener 6 cifras.');
      if (x !== y) return err('No coinciden.');
      const { error } = await sb.auth.updateUser({ password: x });
      if (error) return err(traducirError(error));
      vistaCuenta(`<div class="ok-caja" role="status">${esProf() ? 'Contraseña cambiada.' : 'PIN cambiado.'}</div>`);
    });
  }

  function vistaNoEncontrado(texto) {
    pintar(`${cabecera()}<main class="cuerpo"><div class="vacio">${esc(texto || 'No se ha encontrado lo que buscabas.')}</div>
      <a class="btn sec" href="#/inicio">Volver a Hoy</a></main>${navegacion('')}`);
  }

  // ---------------------------------------------------------------- enrutado
  function render() {
    if (!S.sesion) return vistaAcceso();
    if (!S.perfil) return vistaSinPerfil();
    const [ruta, a, b] = location.hash.replace(/^#\/?/, '').split('/');
    switch (ruta || 'inicio') {
      case 'granjas': return vistaGranjas();
      case 'inicio': return vistaInicio();
      case 'mapa': return vistaMapa();
      case 'corralina': return vistaCorralina(a);
      case 'animales': return vistaAnimales(a);
      case 'animal': return vistaFicha(a);
      case 'trasladar': return vistaTrasladar(a);
      case 'nota': return vistaNota(a, b);
      case 'baja': return vistaBaja(a);
      case 'alta': return vistaFormAnimal(null);
      case 'editar': return vistaFormAnimal(a);
      case 'censo': return vistaCenso();
      case 'gestion': return vistaGestion();
      case 'cuenta': return vistaCuenta();
      default: return vistaNoEncontrado();
    }
  }

  document.addEventListener('click', async (ev) => {
    const b = ev.target.closest('[data-accion]');
    if (!b) return;
    if (b.dataset.accion === 'refrescar') refrescar(true);
    if (b.dataset.accion === 'salir') {
      await sb.auth.signOut();
      Object.assign(S, { sesion: null, perfil: null, animales: [], eventos: [], porAnimal: {}, borrador: {}, importacion: null });
      location.hash = ''; vistaAcceso();
    }
  });
  window.addEventListener('hashchange', () => {
    const r = location.hash.replace(/^#\/?/, '').split('/')[0];
    if (!['alta', 'editar'].includes(r)) S.borrador.formAnimal = null;
    render();
  });
  setInterval(() => { const h = document.getElementById('hora-consulta'); if (h) h.textContent = fechaHora(new Date()); }, 20000);
  const escribiendo = () => /^#\/(alta|editar|trasladar|nota|baja)/.test(location.hash);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && S.perfil && (!S.cargado || Date.now() - S.cargado > 120000) && !escribiendo()) refrescar();
  });

  async function iniciar() {
    if ('serviceWorker' in navigator && location.protocol === 'https:') {
      navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).then((r) => r.update()).catch(() => {});
      let recargado = !navigator.serviceWorker.controller;
      navigator.serviceWorker.addEventListener('controllerchange', () => { if (!recargado && !escribiendo()) { recargado = true; location.reload(); } });
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
