// CIFEAFARM · Control de piensos: silos, fichas de pienso, reposiciones y problemas digestivos.
// Lo usan las dos granjas: window.Piensos(ctx) devuelve { vista, cargar, fuentesAnalisis, medidasAnalisis, gruposAnalisis }.
// ctx: { sb, S, esc, fmt, hoy, toast, traducirError, pintar, cabecera, navegacion, navKey, esProf, esAdmin, verAlias, quienEs,
//        granja: 'rumi'|'porc', zonas: [...], bajasDiarrea: () => [{fecha, zona, n}], cargarXLSX }
(function () {
  'use strict';
  const TIPOS_INC = { diarrea: 'Diarrea', baja_ingesta: 'Comen menos', rechazo: 'Rechazan el pienso', vomitos: 'Vómitos', estrenimiento: 'Estreñimiento', timpanismo: 'Timpanismo (meteorismo)', otra: 'Otro problema' };
  const TRAMOS = [[7, '0–7 días'], [14, '8–14 días'], [28, '15–28 días'], [Infinity, 'Más de 28 días']];

  // ---- Lógica pura (se prueba sin navegador)
  const dias = (a, b) => Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 864e5);
  const porFecha = (a, b) => (a.fecha < b.fecha ? -1 : a.fecha > b.fecha ? 1 : String(a.creado || '').localeCompare(String(b.creado || '')));
  // Reposiciones de un silo con el consumo estimado hasta la siguiente y si hubo cambio de pienso.
  // Consumo = (kg repuestos + lo que quedaba al reponer − lo que quedaba al reponer la siguiente vez) / días entre las dos.
  function historialSilo(repos) {
    const l = repos.slice().sort(porFecha);
    return l.map((r, i) => {
      const sig = l[i + 1], ant = l[i - 1];
      const d = sig ? dias(r.fecha, sig.fecha) : null;
      const gastado = sig ? Number(r.kg) + Number(r.resto_kg || 0) - Number(sig.resto_kg || 0) : null;
      return { ...r, hasta: sig ? sig.fecha : null, diasHasta: d, kgDia: d && d > 0 && gastado >= 0 ? gastado / d : null,
        cambio: !!(ant && ant.pienso_id !== r.pienso_id), piensoAnterior: ant ? ant.pienso_id : null };
    });
  }
  // Qué pienso había en un silo un día y desde cuándo (último cambio de pienso)
  function piensoEn(hist, fecha) {
    let actual = null, desde = null;
    for (const r of hist) { if (r.fecha > fecha) break; if (!actual || actual !== r.pienso_id) { desde = r.fecha; } actual = r.pienso_id; }
    return actual ? { pienso_id: actual, desde, diasDesdeCambio: dias(desde, fecha), conocido: hist.length && hist[0].fecha < desde } : null;
  }
  const tramo = (d) => (d == null ? 'Sin cambio conocido' : TRAMOS.find(([m]) => d <= m)[1]);

  function Piensos(ctx) {
    const { sb, S, esc, fmt, hoy, toast, traducirError } = ctx;
    const G = ctx.granja;
    const M = { listo: false, falta: false, silos: [], piensos: [], repos: [], inc: [] };
    async function cargar() {
      const [si, pi, re, inc] = await Promise.all([
        sb.from('silos').select('*').eq('granja', G).order('orden').order('nombre'),
        sb.from('piensos').select('*').in('granja', [G, 'ambas']).order('nombre'),
        sb.from('pienso_reposiciones').select('*').eq('granja', G).order('fecha'),
        sb.from('pienso_incidencias').select('*').eq('granja', G).order('fecha', { ascending: false })]);
      const err = si.error || pi.error || re.error || inc.error;
      if (err) { if (/does not exist|schema cache|PGRST205|42P01/i.test(`${err.message} ${err.code}`)) { M.falta = true; M.listo = true; return; } throw err; }
      Object.assign(M, { silos: si.data, piensos: pi.data, repos: re.data, inc: inc.data, listo: true, falta: false });
    }
    const silo = (id) => M.silos.find((x) => x.id === id);
    const pienso = (id) => M.piensos.find((x) => x.id === id);
    const nomP = (id) => (pienso(id) || {}).nombre || '¿pienso borrado?';
    const hist = (siloId) => historialSilo(M.repos.filter((r) => r.silo_id === siloId));
    const siloDeZona = (z) => M.silos.find((s) => s.activo && (s.zonas || []).includes(z));
    const $ = (s) => document.querySelector(s);
    const msg = (t) => { const m = $('#msg'); if (m) { m.innerHTML = `<div class="aviso-caja">${esc(t)}</div>`; m.scrollIntoView({ block: 'center' }); } };
    const nd = (v, d = 1) => (v == null ? '—' : Number(v).toLocaleString('es-ES', { maximumFractionDigits: d }));
    const pantalla = (o, cuerpo) => ctx.pintar(`${ctx.cabecera(o)}<main class="cuerpo" id="pz">${cuerpo}</main>${ctx.navegacion(ctx.navKey)}`);
    const quien = (r) => (ctx.quienEs ? ctx.quienEs(r.autor, r.autor_alias) : ctx.verAlias(r.autor_alias, r.curso) || '?');
    const puedeCorregir = (r) => ctx.esProf() || (r.autor === (S.sesion && S.sesion.user.id) && Date.now() - Date.parse(r.creado) < 864e5);
    const faltaSQL = () => `<div class="aviso-caja">Para usar el control de piensos, ejecuta una vez en Supabase <strong>sql/17_piensos.sql</strong> (SQL Editor → New query → Run).</div>`;

    // Todo lo digestivo de la granja, con el pienso que se daba y los días desde el último cambio de pienso
    function digestivos() {
      const extra = ctx.bajasDiarrea ? ctx.bajasDiarrea() : [];
      const filas = M.inc.map((x) => ({ fecha: x.fecha, tipo: TIPOS_INC[x.tipo] || x.tipo, zona: x.zona || '', silo_id: x.silo_id || (siloDeZona(x.zona) || {}).id || null, animales: x.animales, origen: 'Anotado', nota: x.nota || '' }))
        .concat(extra.map((b) => ({ fecha: b.fecha, tipo: 'Muertes por diarrea', zona: b.zona || '', silo_id: (siloDeZona(b.zona) || {}).id || null, animales: b.n, origen: 'Bajas registradas', nota: '' })));
      return filas.map((f) => { const p = f.silo_id ? piensoEn(hist(f.silo_id), f.fecha) : null;
        return { ...f, silo: f.silo_id ? (silo(f.silo_id) || {}).nombre || '' : '', pienso: p ? nomP(p.pienso_id) : '', diasCambio: p && p.conocido ? p.diasDesdeCambio : null }; })
        .sort((a, b) => (a.fecha < b.fecha ? 1 : -1));
    }

    // ================================================================ pantalla principal
    function vistaInicio() {
      const h = hoy(), hace30 = new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10);
      const dig = digestivos().filter((x) => x.fecha >= hace30);
      const tarjSilo = (s) => { const hs = hist(s.id); const u = hs[hs.length - 1]; const p = u ? piensoEn(hs, h) : null;
        const cons = hs.filter((r) => r.kgDia != null).slice(-3); const media = cons.length ? cons.reduce((a, r) => a + r.kgDia, 0) / cons.length : null;
        const reciente = p && p.conocido && p.diasDesdeCambio <= 14;
        return `<a class="evento enlace" href="#/piensos/silo/${s.id}"><div class="entre"><strong>${esc(s.nombre)}</strong>${reciente ? `<span class="chip nar">Cambio de pienso hace ${p.diasDesdeCambio} d</span>` : ''}</div>
          <div class="peq">${u ? `${esc(nomP(u.pienso_id))} · última reposición ${esc(fmt(u.fecha))} (${nd(u.kg, 0)} kg)` : 'Sin reposiciones anotadas'}</div>
          <div class="suave peq">${media != null ? `Consumo estimado: ${nd(media)} kg/día` : 'Consumo: hacen falta dos reposiciones'}${(s.zonas || []).length ? ` · da de comer a: ${esc(s.zonas.join(', '))}` : ''}</div></a>`; };
      pantalla({ volver: ctx.volver || '#/inicio', textoVolver: ctx.textoVolver || 'Hoy', titulo: 'Piensos y consumo' }, `
        <div class="botones"><a class="btn" href="#/piensos/reposicion">Anotar reposición</a><a class="btn sec" href="#/piensos/incidencia">Anotar diarrea u otro problema</a></div>
        <section class="tarjeta"><h2>Silos</h2>${M.silos.filter((s) => s.activo).map(tarjSilo).join('') || `<div class="vacio">No hay silos.${ctx.esProf() ? ' Añádelos en «Silos».' : ''}</div>`}</section>
        <section class="tarjeta"><h2>Problemas digestivos · últimos 30 días (${dig.length})</h2>
          ${dig.length ? dig.slice(0, 15).map((x) => `<div class="evento"><div class="entre"><strong>${esc(x.tipo)}${x.animales ? ` · ${x.animales} animales` : ''}</strong><span class="suave">${esc(fmt(x.fecha))}</span></div>
            <div class="suave peq">${esc(x.zona || 'Sin zona')}${x.pienso ? ` · comían ${esc(x.pienso)}` : ''}${x.diasCambio != null ? ` · <strong>${x.diasCambio} días tras el cambio de pienso</strong>` : ''}${x.origen !== 'Anotado' ? ` · ${esc(x.origen)}` : ''}</div></div>`).join('') : '<div class="suave">Ninguno anotado.</div>'}
          <a class="btn sec peq" href="#/piensos/relacion">¿Tiene relación con el pienso?</a></section>
        <section class="tarjeta"><h2>Últimas reposiciones</h2>${M.repos.slice(-8).reverse().map((r) => filaRepo(r)).join('') || '<div class="suave">Ninguna.</div>'}</section>
        <div class="botones"><a class="btn sec peq" href="#/piensos/fichas">Fichas de pienso (${M.piensos.length})</a>${ctx.esProf() ? '<a class="btn sec peq" href="#/piensos/silos">Silos</a>' : ''}</div>`);
      enlazarBorrar();
    }
    const filaRepo = (r, conCons) => `<div class="evento"><div class="entre"><strong>${esc((silo(r.silo_id) || {}).nombre || 'Sin silo')} · ${nd(r.kg, 0)} kg</strong><span class="suave">${esc(fmt(r.fecha))}</span></div>
      <div class="peq">${esc(nomP(r.pienso_id))}${r.cambio ? ` <span class="chip nar">Cambio de pienso (antes ${esc(nomP(r.piensoAnterior))})</span>` : ''}</div>
      <div class="suave peq">${conCons && r.kgDia != null ? `Consumo hasta el ${esc(fmt(r.hasta))}: <strong>${nd(r.kgDia)} kg/día</strong> · ` : ''}${r.resto_kg != null ? `quedaban ${nd(r.resto_kg, 0)} kg · ` : ''}${r.lote ? `lote ${esc(r.lote)} · ` : ''}${r.albaran ? `albarán ${esc(r.albaran)} · ` : ''}por ${esc(quien(r))}</div>
      ${r.nota ? `<div class="suave peq">${esc(r.nota)}</div>` : ''}${puedeCorregir(r) ? `<div class="acciones"><button type="button" class="btn peligro peq" data-borrar-repo="${r.id}">Borrar</button></div>` : ''}</div>`;
    function enlazarBorrar(volver = vistaInicio) {
      document.querySelectorAll('[data-borrar-repo],[data-borrar-inc]').forEach((b) => b.addEventListener('click', async () => {
        if (!confirm('¿Borrar este registro?')) return;
        const [t, id] = b.dataset.borrarRepo ? ['pienso_reposiciones', b.dataset.borrarRepo] : ['pienso_incidencias', b.dataset.borrarInc];
        const r = await sb.from(t).delete().eq('id', id); if (r.error) return toast(traducirError(r.error));
        toast('Borrado'); await cargar(); volver();
      }));
    }

    // ================================================================ un silo
    function vistaSilo(id) {
      const s = silo(id) || M.silos.find((x) => x.nombre === decodeURIComponent(id || ''));
      if (!s) return pantalla({ volver: '#/piensos', textoVolver: 'Piensos', titulo: 'Silo' }, `<div class="vacio">No encuentro ese silo.${M.silos.length ? '' : ' ¿Has ejecutado 17_piensos.sql?'}</div>`);
      const hs = hist(s.id);
      const dig = digestivos().filter((x) => x.silo_id === s.id);
      const conCons = hs.filter((r) => r.kgDia != null);
      const max = Math.max(1, ...conCons.map((r) => r.kgDia));
      pantalla({ volver: '#/piensos', textoVolver: 'Piensos', titulo: s.nombre, sub: (s.zonas || []).length ? `Da de comer a: ${esc(s.zonas.join(', '))}` : '' }, `
        <a class="btn" href="#/piensos/reposicion/${s.id}">Anotar reposición en este silo</a>
        ${conCons.length ? `<section class="tarjeta"><h2>Consumo estimado (kg/día)</h2><div class="barras-cons">${conCons.slice(-12).map((r) => `<div><span class="peq">${esc(fmt(r.fecha).slice(0, 5))}</span><i style="width:${Math.round((100 * r.kgDia) / max)}%" class="${r.cambio ? 'cambio' : ''}"></i><span class="peq">${nd(r.kgDia)}</span></div>`).join('')}</div>
          <div class="suave peq">Naranja: reposición con cambio de pienso. El consumo se calcula entre una reposición y la siguiente; si anotas lo que quedaba en el silo al reponer, la cifra es más exacta.</div></section>` : ''}
        <section class="tarjeta"><h2>Reposiciones (${hs.length})</h2>${hs.slice().reverse().map((r) => filaRepo(r, true)).join('') || '<div class="suave">Ninguna.</div>'}</section>
        <section class="tarjeta"><h2>Problemas digestivos de sus zonas (${dig.length})</h2>${dig.slice(0, 20).map((x) => `<div class="evento"><div class="entre"><strong>${esc(x.tipo)}${x.animales ? ` · ${x.animales}` : ''}</strong><span class="suave">${esc(fmt(x.fecha))}</span></div><div class="suave peq">${esc(x.zona)}${x.pienso ? ` · ${esc(x.pienso)}` : ''}${x.diasCambio != null ? ` · ${x.diasCambio} días tras el cambio` : ''}</div></div>`).join('') || '<div class="suave">Ninguno.</div>'}</section>`);
      enlazarBorrar(() => vistaSilo(s.id));
    }

    // ================================================================ formularios
    function vistaReposicion(siloId) {
      const activos = M.silos.filter((s) => s.activo), ps = M.piensos.filter((p) => p.activo);
      if (!activos.length || !ps.length) return pantalla({ volver: '#/piensos', textoVolver: 'Piensos', titulo: 'Anotar reposición' }, `<div class="aviso-caja">Antes hay que dar de alta ${!activos.length ? 'algún silo' : ''}${!activos.length && !ps.length ? ' y ' : ''}${!ps.length ? 'alguna ficha de pienso' : ''}. ${ctx.esProf() ? `<a href="${!ps.length ? '#/piensos/ficha/nuevo' : '#/piensos/silos'}">Hazlo aquí</a>.` : 'Avisa al profesor.'}</div>`);
      const s0 = siloId && silo(siloId) ? siloId : activos.length === 1 ? activos[0].id : '';
      pantalla({ volver: '#/piensos', textoVolver: 'Piensos', titulo: 'Anotar reposición' }, `<div id="msg"></div>
        <form class="formu" id="f-repo" novalidate>
          <div class="campo"><label for="silo">Silo</label><select id="silo"><option value="">Elige…</option>${activos.map((s) => `<option value="${s.id}" ${s.id === s0 ? 'selected' : ''}>${esc(s.nombre)}</option>`).join('')}</select></div>
          <div class="campo"><label for="pienso">Pienso</label><select id="pienso"><option value="">Elige…</option>${ps.map((p) => `<option value="${p.id}">${esc(p.nombre)}${p.fabricante ? ` · ${esc(p.fabricante)}` : ''}${p.medicado ? ' (medicado)' : ''}</option>`).join('')}</select><div id="aviso-cambio"></div></div>
          <div class="dos"><div class="campo"><label for="fecha">Fecha</label><input id="fecha" type="date" value="${hoy()}" max="${hoy()}"></div>
            <div class="campo"><label for="kg">Kilos repuestos</label><input id="kg" type="number" inputmode="decimal" step="any" min="1"></div></div>
          <div class="campo"><label for="resto">Lo que quedaba en el silo antes de llenar (kg, aprox.) <span class="suave">(opcional)</span></label><input id="resto" type="number" inputmode="decimal" step="any" min="0"><span class="ayuda">Si lo anotas, el consumo diario sale más exacto. Si no lo sabes, déjalo en blanco.</span></div>
          <div class="dos"><div class="campo"><label for="lote">Lote <span class="suave">(opcional)</span></label><input id="lote" type="text"></div><div class="campo"><label for="albaran">Albarán <span class="suave">(opcional)</span></label><input id="albaran" type="text"></div></div>
          <div class="campo"><label for="nota">Observaciones</label><textarea id="nota" rows="2"></textarea></div>
          <button class="btn" type="submit">Guardar</button></form>`);
      const f = $('#f-repo');
      const ponPienso = () => { const hs = $('#silo').value ? hist($('#silo').value) : []; const u = hs[hs.length - 1];
        if (u && !$('#pienso').value) $('#pienso').value = u.pienso_id;
        const camb = u && $('#pienso').value && $('#pienso').value !== u.pienso_id;
        $('#aviso-cambio').innerHTML = u ? (camb ? `<div class="aviso-caja"><strong>Cambio de pienso:</strong> hasta ahora tenía ${esc(nomP(u.pienso_id))}. Vigila las heces y el consumo los próximos días.</div>` : `<span class="ayuda">Es el mismo pienso que la última vez (${esc(fmt(u.fecha))}).</span>`) : ''; };
      $('#silo').addEventListener('change', () => { $('#pienso').value = ''; ponPienso(); }); $('#pienso').addEventListener('change', ponPienso); ponPienso();
      f.addEventListener('submit', async (ev) => {
        ev.preventDefault();
        const r = { granja: G, silo_id: $('#silo').value || null, pienso_id: $('#pienso').value || null, fecha: $('#fecha').value, kg: Number($('#kg').value), resto_kg: $('#resto').value === '' ? null : Number($('#resto').value),
          lote: $('#lote').value.trim() || null, albaran: $('#albaran').value.trim() || null, nota: $('#nota').value.trim() || null };
        if (!r.silo_id) return msg('Elige el silo.'); if (!r.pienso_id) return msg('Elige el pienso.');
        if (!r.fecha) return msg('Falta la fecha.'); if (r.fecha > hoy()) return msg('La fecha no puede ser futura.');
        if (!(r.kg > 0)) return msg('Escribe los kilos repuestos.');
        const s = silo(r.silo_id); if (s.capacidad_kg && r.kg + (r.resto_kg || 0) > Number(s.capacidad_kg) * 1.05) return msg(`Son más kilos de los que caben en el silo (${nd(s.capacidad_kg, 0)} kg). Revisa la cifra.`);
        const b = f.querySelector('button[type=submit]'); b.disabled = true;
        const res = await sb.from('pienso_reposiciones').insert(r); if (res.error) { b.disabled = false; return msg(traducirError(res.error)); }
        toast('Reposición anotada'); await cargar(); location.hash = `#/piensos/silo/${r.silo_id}`;
      });
    }
    function vistaIncidencia() {
      pantalla({ volver: '#/piensos', textoVolver: 'Piensos', titulo: 'Problema digestivo' }, `<div id="msg"></div>
        <form class="formu" id="f-inc" novalidate>
          <div class="campo"><span class="et">Qué pasa</span><div class="opciones">${Object.entries(TIPOS_INC).filter(([k]) => G === 'rumi' || k !== 'timpanismo').map(([k, t]) => `<label><input type="radio" name="tipo" value="${k}" ${k === 'diarrea' ? 'checked' : ''}> ${t}</label>`).join('')}</div></div>
          <div class="dos"><div class="campo"><label for="fecha">Fecha</label><input id="fecha" type="date" value="${hoy()}" max="${hoy()}"></div>
            <div class="campo"><label for="animales">Animales afectados</label><input id="animales" type="number" inputmode="numeric" min="1" step="1"></div></div>
          <div class="campo"><label for="zona">Zona</label><select id="zona"><option value="">Elige…</option>${ctx.zonas().map((z) => `<option>${esc(z)}</option>`).join('')}</select></div>
          <div class="campo"><label for="silo">Comen del silo</label><select id="silo"><option value="">No lo sé / no comen de un silo</option>${M.silos.filter((s) => s.activo).map((s) => `<option value="${s.id}">${esc(s.nombre)}</option>`).join('')}</select><span class="ayuda" id="ay-silo"></span></div>
          <div class="campo"><label for="nota">Observaciones</label><textarea id="nota" rows="3" placeholder="Color y consistencia de las heces, si comen menos, si hay fiebre, qué animales…"></textarea></div>
          <button class="btn" type="submit">Guardar</button>
          <div class="ayuda">Si hay que tratar, anota también el tratamiento en Sanidad.${G === 'porc' ? ' Las muertes de lechones por diarrea que ya se registran como bajas se cuentan solas.' : ''}</div></form>`);
      const f = $('#f-inc');
      $('#zona').addEventListener('change', () => { const s = siloDeZona($('#zona').value); if (s) $('#silo').value = s.id;
        const hs = s ? hist(s.id) : []; const p = s ? piensoEn(hs, hoy()) : null;
        $('#ay-silo').textContent = p ? `Ahora tiene ${nomP(p.pienso_id)}${p.conocido ? `, desde hace ${p.diasDesdeCambio} días` : ''}.` : ''; });
      f.addEventListener('submit', async (ev) => {
        ev.preventDefault();
        const r = { granja: G, tipo: (f.querySelector('input[name=tipo]:checked') || {}).value, fecha: $('#fecha').value, zona: $('#zona').value || null, silo_id: $('#silo').value || null,
          animales: $('#animales').value === '' ? null : parseInt($('#animales').value, 10), nota: $('#nota').value.trim() || null };
        if (!r.fecha) return msg('Falta la fecha.'); if (r.fecha > hoy()) return msg('La fecha no puede ser futura.');
        if (!r.zona) return msg('Elige la zona.');
        if (r.animales != null && !(r.animales > 0)) return msg('Los animales afectados han de ser 1 o más (o déjalo en blanco).');
        const b = f.querySelector('button[type=submit]'); b.disabled = true;
        const res = await sb.from('pienso_incidencias').insert(r); if (res.error) { b.disabled = false; return msg(traducirError(res.error)); }
        toast('Anotado'); await cargar(); location.hash = '#/piensos';
      });
    }

    // ================================================================ ¿relación con el pienso?
    function vistaRelacion() {
      const dig = digestivos();
      const cuenta = {}; for (const [, t] of TRAMOS) cuenta[t] = { n: 0, animales: 0 }; cuenta['Sin cambio conocido'] = { n: 0, animales: 0 };
      for (const x of dig) { const c = cuenta[tramo(x.diasCambio)]; c.n += 1; c.animales += Number(x.animales || 0); }
      const porPienso = {}; for (const x of dig.filter((y) => y.pienso)) { const c = (porPienso[x.pienso] = porPienso[x.pienso] || { n: 0, animales: 0 }); c.n += 1; c.animales += Number(x.animales || 0); }
      // Días que cada pienso estuvo en cada silo, para comparar en proporción
      const diasPienso = {};
      for (const s of M.silos) { const hs = hist(s.id); hs.forEach((r, i) => { const fin = hs[i + 1] ? hs[i + 1].fecha : hoy(); diasPienso[nomP(r.pienso_id)] = (diasPienso[nomP(r.pienso_id)] || 0) + Math.max(0, dias(r.fecha, fin)); }); }
      // Cambios de pienso y lo que pasó en los 14 días siguientes en las zonas de ese silo
      const cambios = [];
      for (const s of M.silos) for (const r of hist(s.id).filter((x) => x.cambio)) {
        const fin = new Date(Date.parse(`${r.fecha}T12:00:00Z`) + 14 * 864e5).toISOString().slice(0, 10);
        const tras = dig.filter((x) => x.silo_id === s.id && x.fecha >= r.fecha && x.fecha <= fin);
        cambios.push({ fecha: r.fecha, silo: s.nombre, de: nomP(r.piensoAnterior), a: nomP(r.pienso_id), n: tras.length, animales: tras.reduce((a, x) => a + Number(x.animales || 0), 0) });
      }
      cambios.sort((a, b) => (a.fecha < b.fecha ? 1 : -1));
      pantalla({ volver: '#/piensos', textoVolver: 'Piensos', titulo: '¿Relación con el pienso?' }, `
        <div class="ok-caja">Aquí se cruzan los problemas digestivos con los cambios de pienso de cada silo. <strong>Que coincidan en el tiempo no prueba que el pienso sea la causa</strong>: también influyen el destete, el frío, las infecciones o el agua. Con pocos casos, cualquier diferencia puede ser casualidad.</div>
        <section class="tarjeta"><h2>Días desde el último cambio de pienso</h2>
          <table class="tabla"><thead><tr><th>Tras el cambio</th><th>Casos</th><th>Animales</th></tr></thead><tbody>${Object.entries(cuenta).map(([t, c]) => `<tr><td>${t}</td><td>${c.n}</td><td>${c.animales || '—'}</td></tr>`).join('')}</tbody></table>
          <div class="suave peq">Si el pienso influye, los casos se amontonan en los primeros 7–14 días tras el cambio. «Sin cambio conocido»: el silo no tiene un cambio de pienso anotado antes del caso o no se sabe de qué silo comían.</div></section>
        <section class="tarjeta"><h2>Por pienso</h2>${Object.keys(porPienso).length ? `<table class="tabla"><thead><tr><th>Pienso</th><th>Casos</th><th>Días en uso</th><th>Casos cada 30 días</th></tr></thead><tbody>${Object.entries(porPienso).map(([p, c]) => `<tr><td>${esc(p)}</td><td>${c.n}</td><td>${diasPienso[p] || '—'}</td><td>${diasPienso[p] ? nd((30 * c.n) / diasPienso[p]) : '—'}</td></tr>`).join('')}</tbody></table>
          <div class="suave peq">«Casos cada 30 días» compara piensos que se han usado durante tiempos distintos.</div>` : '<div class="suave">Aún no hay casos con el pienso identificado.</div>'}</section>
        <section class="tarjeta"><h2>Cambios de pienso y 14 días siguientes</h2>${cambios.length ? cambios.map((c) => `<div class="evento"><div class="entre"><strong>${esc(c.silo)}</strong><span class="suave">${esc(fmt(c.fecha))}</span></div><div class="peq">${esc(c.de)} → ${esc(c.a)}</div><div class="suave peq">${c.n ? `<strong>${c.n} caso${c.n > 1 ? 's' : ''}</strong>${c.animales ? ` (${c.animales} animales)` : ''} en los 14 días siguientes` : 'Sin problemas digestivos en los 14 días siguientes'}</div></div>`).join('') : '<div class="suave">No hay cambios de pienso anotados.</div>'}</section>
        <div class="botones"><a class="btn sec" href="#/comparar">Comparar y analizar con IA</a></div>
        <div class="suave peq">En «Comparar» tienes «Problemas digestivos», «Consumo de pienso» y «Kilos repuestos», agrupables por pienso, silo, semana o días tras el cambio, y el botón para copiarlo y analizarlo con Claude.</div>`);
    }

    // ================================================================ fichas de pienso y silos
    function vistaFichas() {
      pantalla({ volver: '#/piensos', textoVolver: 'Piensos', titulo: 'Fichas de pienso' }, `${ctx.esProf() ? '<a class="btn" href="#/piensos/ficha/nuevo">Nueva ficha de pienso</a>' : ''}
        <section class="tarjeta">${M.piensos.map((p) => `<a class="evento enlace" href="#/piensos/ficha/${p.id}"><div class="entre"><strong>${esc(p.nombre)}</strong>${p.medicado ? '<span class="chip nar">Medicado</span>' : ''}${p.activo ? '' : '<span class="chip gris">No se usa</span>'}</div>
          <div class="suave peq">${esc([p.tipo, p.fabricante].filter(Boolean).join(' · '))}${p.proteina != null ? ` · PB ${nd(p.proteina)} %` : ''}${p.fibra != null ? ` · FB ${nd(p.fibra)} %` : ''}${p.grasa != null ? ` · GB ${nd(p.grasa)} %` : ''}</div></a>`).join('') || '<div class="vacio">No hay fichas de pienso.</div>'}</section>`);
    }
    function vistaFicha(id) {
      const p = id && id !== 'nuevo' ? pienso(id) : null; const prof = ctx.esProf();
      if (id !== 'nuevo' && !p) return pantalla({ volver: '#/piensos/fichas', textoVolver: 'Fichas', titulo: 'Pienso' }, '<div class="vacio">No encuentro esa ficha.</div>');
      if (!prof) {
        const fila = (t, v) => (v != null && v !== '' ? `<div><span>${t}</span><span>${esc(v)}</span></div>` : '');
        const usos = M.repos.filter((r) => r.pienso_id === p.id);
        return pantalla({ volver: '#/piensos/fichas', textoVolver: 'Fichas', titulo: p.nombre, sub: esc([p.tipo, p.fabricante].filter(Boolean).join(' · ')) }, `
          <section class="tarjeta"><div class="filas">${fila('Proteína bruta', p.proteina != null ? `${nd(p.proteina)} %` : null)}${fila('Grasa bruta', p.grasa != null ? `${nd(p.grasa)} %` : null)}${fila('Fibra bruta', p.fibra != null ? `${nd(p.fibra)} %` : null)}${fila('Cenizas', p.cenizas != null ? `${nd(p.cenizas)} %` : null)}${fila('Energía', p.energia)}${fila('Medicado', p.medicado ? `Sí${p.aditivos ? ` · ${p.aditivos}` : ''}` : null)}${!p.medicado ? fila('Aditivos', p.aditivos) : ''}</div>
            ${p.composicion ? `<h3 class="peq">Composición</h3><p style="white-space:pre-wrap">${esc(p.composicion)}</p>` : ''}${p.notas ? `<p class="suave peq" style="white-space:pre-wrap">${esc(p.notas)}</p>` : ''}</section>
          <section class="tarjeta"><h2>Reposiciones con este pienso (${usos.length})</h2>${usos.slice(-10).reverse().map((r) => `<div class="suave peq">${esc(fmt(r.fecha))} · ${esc((silo(r.silo_id) || {}).nombre || '')} · ${nd(r.kg, 0)} kg${r.lote ? ` · lote ${esc(r.lote)}` : ''}</div>`).join('') || '<div class="suave">Ninguna.</div>'}</section>`);
      }
      const v = p || { granja: G, activo: true, medicado: false };
      const t = (k, l, tipo = 'text', extra = '') => `<div class="campo"><label for="${k}">${l}</label><input id="${k}" type="${tipo}" ${tipo === 'number' ? 'step="any" inputmode="decimal" min="0" max="100"' : ''} value="${esc(v[k] ?? '')}" ${extra}></div>`;
      pantalla({ volver: '#/piensos/fichas', textoVolver: 'Fichas', titulo: p ? 'Editar pienso' : 'Nueva ficha de pienso' }, `<div id="msg"></div>
        <form class="formu" id="f-pienso" novalidate>
          ${t('nombre', 'Nombre comercial')}
          <div class="dos">${t('tipo', 'Tipo', 'text', `list="l-tipos" placeholder="${G === 'porc' ? 'Gestación, lactación…' : 'Cabritos, lactación…'}"`)}${t('fabricante', 'Fabricante')}</div>
          <datalist id="l-tipos">${(G === 'porc' ? ['Gestación', 'Lactación', 'Preiniciador', 'Iniciador', 'Transición', 'Crecimiento', 'Cebo', 'Acabado', 'Verracos'] : ['Lactancia artificial', 'Cabritos y corderos', 'Recría', 'Gestación', 'Lactación', 'Mantenimiento', 'Machos', 'Forraje', 'Concentrado']).map((x) => `<option value="${x}">`).join('')}</datalist>
          <div class="campo"><label for="composicion">Composición (ingredientes, como en la etiqueta)</label><textarea id="composicion" rows="4">${esc(v.composicion || '')}</textarea></div>
          <div class="dos">${t('proteina', 'Proteína bruta (%)', 'number')}${t('grasa', 'Grasa bruta (%)', 'number')}</div>
          <div class="dos">${t('fibra', 'Fibra bruta (%)', 'number')}${t('cenizas', 'Cenizas (%)', 'number')}</div>
          ${t('energia', 'Energía', 'text', 'placeholder="2.300 kcal EN/kg"')}
          <label class="check-todos"><input type="checkbox" id="medicado" ${v.medicado ? 'checked' : ''}> Pienso medicado</label>
          <div class="campo"><label for="aditivos">Aditivos o medicamento que lleva</label><input id="aditivos" type="text" value="${esc(v.aditivos || '')}"></div>
          <div class="campo"><span class="et">Para</span><div class="opciones">${[['porc', 'Porcino'], ['rumi', 'Rumiantes'], ['ambas', 'Las dos granjas']].map(([k, x]) => `<label><input type="radio" name="granja" value="${k}" ${v.granja === k ? 'checked' : ''}> ${x}</label>`).join('')}</div></div>
          <div class="campo"><label for="notas">Notas</label><textarea id="notas" rows="2">${esc(v.notas || '')}</textarea></div>
          ${p ? `<label class="check-todos"><input type="checkbox" id="activo" ${v.activo ? 'checked' : ''}> Se sigue usando</label>` : ''}
          <button class="btn" type="submit">${p ? 'Guardar cambios' : 'Crear ficha'}</button></form>`);
      $('#f-pienso').addEventListener('submit', async (ev) => {
        ev.preventDefault(); const s = (k) => $(`#${k}`).value.trim() || null; const n = (k) => ($(`#${k}`).value === '' ? null : Number($(`#${k}`).value));
        const r = { nombre: s('nombre'), tipo: s('tipo'), fabricante: s('fabricante'), composicion: s('composicion'), proteina: n('proteina'), grasa: n('grasa'), fibra: n('fibra'), cenizas: n('cenizas'),
          energia: s('energia'), medicado: $('#medicado').checked, aditivos: s('aditivos'), notas: s('notas'), granja: (document.querySelector('input[name=granja]:checked') || {}).value || G };
        if (p) r.activo = $('#activo').checked;
        if (!r.nombre) return msg('Falta el nombre.');
        if (['proteina', 'grasa', 'fibra', 'cenizas'].some((k) => r[k] != null && (r[k] < 0 || r[k] > 100))) return msg('Los porcentajes han de estar entre 0 y 100.');
        if (r.medicado && !r.aditivos) return msg('Indica el medicamento que lleva el pienso medicado.');
        const res = p ? await sb.from('piensos').update(r).eq('id', p.id) : await sb.from('piensos').insert(r);
        if (res.error) return msg(traducirError(res.error));
        toast('Guardado'); await cargar(); location.hash = '#/piensos/fichas';
      });
    }
    function vistaSilos() {
      if (!ctx.esProf()) return vistaInicio();
      const filaSilo = (s) => `<form class="tarjeta formu" data-silo="${s ? s.id : ''}" novalidate><h2>${s ? esc(s.nombre) : 'Nuevo silo'}</h2>
        <div class="dos"><div class="campo"><label>Nombre</label><input name="nombre" type="text" value="${esc(s ? s.nombre : '')}" placeholder="${G === 'porc' ? 'Silo madres' : 'Tolva cabritos, comedero…'}"></div>
          <div class="campo"><label>Capacidad (kg)</label><input name="capacidad_kg" type="number" inputmode="decimal" step="any" min="0" value="${esc(s && s.capacidad_kg != null ? s.capacidad_kg : '')}"></div></div>
        <div class="campo"><span class="et">Da de comer a</span><div class="opciones">${ctx.zonas().map((z) => `<label><input type="checkbox" name="zonas" value="${esc(z)}" ${s && (s.zonas || []).includes(z) ? 'checked' : ''}> ${esc(z)}</label>`).join('')}</div></div>
        ${s ? `<label class="check-todos"><input type="checkbox" name="activo" ${s.activo ? 'checked' : ''}> Se usa</label>` : ''}
        <button class="btn ${s ? 'sec' : ''} peq" type="submit">${s ? 'Guardar' : 'Añadir silo'}</button></form>`;
      pantalla({ volver: '#/piensos', textoVolver: 'Piensos', titulo: 'Silos' }, `<div id="msg"></div>${M.silos.map(filaSilo).join('')}${filaSilo(null)}
        <div class="suave peq">«Da de comer a» sirve para saber qué pienso comían los animales de una zona cuando hay diarreas.</div>`);
      document.querySelectorAll('form[data-silo]').forEach((f) => f.addEventListener('submit', async (ev) => {
        ev.preventDefault(); const id = f.dataset.silo;
        const r = { granja: G, nombre: f.nombre.value.trim(), capacidad_kg: f.capacidad_kg.value === '' ? null : Number(f.capacidad_kg.value), zonas: [...f.querySelectorAll('input[name=zonas]:checked')].map((x) => x.value) };
        if (id) r.activo = f.activo.checked;
        if (!r.nombre) return msg('Falta el nombre del silo.');
        const res = id ? await sb.from('silos').update(r).eq('id', id) : await sb.from('silos').insert({ ...r, orden: M.silos.length + 1 });
        if (res.error) return msg(/duplicate|unique/i.test(res.error.message) ? 'Ya hay un silo con ese nombre.' : traducirError(res.error));
        toast('Guardado'); await cargar(); vistaSilos();
      }));
    }

    // ================================================================ para Resultados y Comparar
    const fuentesAnalisis = () => {
      if (!M.listo || M.falta) return {};
      const reposiciones = M.silos.flatMap((s) => hist(s.id).map((r) => { const p = piensoEn(hist(s.id), r.fecha);
        return { fecha: r.fecha, silo: s.nombre, pienso: nomP(r.pienso_id), kg: Number(r.kg), kgDia: r.kgDia, cambio: r.cambio ? 1 : 0, diasCambio: p && p.conocido ? p.diasDesdeCambio : null, lote: r.lote || '' }; }));
      const digestivo = digestivos().map((x) => ({ ...x, n: 1 }));
      return { reposiciones, digestivo };
    };
    const medidasAnalisis = () => [
      { id: 'pzKg', fuente: 'reposiciones', nombre: 'Kilos de pienso repuestos', unidad: 'kg', tipo: 'suma', valor: (f) => f.kg, desc: 'Suma de los kilos repuestos en los silos.' },
      { id: 'pzCons', fuente: 'reposiciones', nombre: 'Consumo de pienso', unidad: 'kg/día', tipo: 'media', dec: 1, valor: (f) => f.kgDia, desc: 'Consumo estimado entre una reposición y la siguiente del mismo silo.' },
      { id: 'pzCambios', fuente: 'reposiciones', nombre: 'Cambios de pienso', tipo: 'suma', valor: (f) => f.cambio, desc: 'Reposiciones en las que se cambió de pienso.' },
      { id: 'dgCasos', fuente: 'digestivo', nombre: 'Problemas digestivos', tipo: 'cuenta', valor: () => 1, desc: 'Diarreas, bajada de consumo, rechazo, vómitos…' + (G === 'porc' ? ' Incluye las bajas de lechones y cerdos registradas con causa «Diarrea».' : '') },
      { id: 'dgAnimales', fuente: 'digestivo', nombre: 'Animales con problemas digestivos', tipo: 'suma', valor: (f) => (f.animales == null ? null : Number(f.animales)), desc: 'Suma de los animales afectados (cuando se anotó).' },
    ];
    const gruposAnalisis = () => [
      { id: 'pienso', nombre: 'Pienso', clave: (f) => (f.pienso ? { k: f.pienso, etq: f.pienso, orden: f.pienso } : null) },
      { id: 'silo', nombre: 'Silo', clave: (f) => (f.silo ? { k: f.silo, etq: f.silo, orden: f.silo } : null) },
      { id: 'tramoCambio', nombre: 'Días tras el cambio de pienso', clave: (f) => { if (!('diasCambio' in f)) return null; const t = tramo(f.diasCambio); return { k: t, etq: t, orden: [...TRAMOS.map((x) => x[1]), 'Sin cambio conocido'].indexOf(t) }; } },
      { id: 'tipoDig', nombre: 'Tipo de problema digestivo', clave: (f) => (f.tipo && 'origen' in f ? { k: f.tipo, etq: f.tipo, orden: f.tipo } : null) },
    ];
    const legible = (fuente, r) => (fuente === 'reposiciones'
      ? { Fecha: r.fecha, Silo: r.silo, Pienso: r.pienso, Kg: r.kg, 'Consumo (kg/día)': r.kgDia == null ? '' : Math.round(r.kgDia * 10) / 10, 'Cambio de pienso': r.cambio ? 'sí' : '', 'Días desde el cambio': r.diasCambio ?? '', Lote: r.lote }
      : { Fecha: r.fecha, Problema: r.tipo, Zona: r.zona, Animales: r.animales ?? '', Silo: r.silo, Pienso: r.pienso, 'Días desde el cambio de pienso': r.diasCambio ?? '', Origen: r.origen, Observaciones: r.nota });

    async function vista(a, b) {
      if (!M.listo) {
        pantalla({ volver: '#/inicio', textoVolver: 'Hoy', titulo: 'Piensos y consumo' }, '<div class="ok-caja">Cargando…</div>');
        try { await cargar(); } catch (e) { return pantalla({ volver: '#/inicio', textoVolver: 'Hoy', titulo: 'Error' }, `<div class="aviso-caja">${esc(traducirError(e))}</div>`); }
      }
      if (M.falta) return pantalla({ volver: '#/inicio', textoVolver: 'Hoy', titulo: 'Piensos y consumo' }, faltaSQL());
      if (a === 'silo') return vistaSilo(b);
      if (a === 'reposicion') return vistaReposicion(b);
      if (a === 'incidencia') return vistaIncidencia();
      if (a === 'relacion') return vistaRelacion();
      if (a === 'fichas') return vistaFichas();
      if (a === 'ficha') return vistaFicha(b);
      if (a === 'silos') return vistaSilos();
      return vistaInicio();
    }
    return { vista, cargar: async () => { if (!M.listo) { try { await cargar(); } catch (_) { M.listo = true; M.falta = true; } } }, listo: () => M.listo, recargar: () => { M.listo = false; },
      fuentesAnalisis, medidasAnalisis, gruposAnalisis, legible, nombresFuente: { reposiciones: 'Reposiciones de pienso', digestivo: 'Problemas digestivos' } };
  }
  Piensos._ = { historialSilo, piensoEn, tramo, dias };
  if (typeof module !== 'undefined') module.exports = Piensos; else window.Piensos = Piensos;
})();
