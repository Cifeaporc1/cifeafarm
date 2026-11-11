// =====================================================================
// CIFEAFARM · Lo común a todas las granjas
// · PROTOCOLOS: tareas de los protocolos diarios del centro (documentos
//   «Protocolos diarios CIFEA ganadería»), para marcarlas como hechas en Hoy.
// · Operaciones repetidas: registros que parecen duplicados (solo los ve
//   el administrador).
// Para añadir otra especie (equino, aviar, cunícola…) basta con añadir su
// protocolo aquí con su propia clave.
// =====================================================================
(function (raiz) {
  const TRIM = { meses: [1, 4, 7, 10] }, SEMES = { meses: [3, 9] };
  const PROTOCOLOS = {
    rumi: {
      nota: 'Al llegar, mira los registros para comprobar lo hecho en el turno anterior. Empieza por lo más delicado (partos, crías, gestación). Revisa todos los animales (diarreas, muertes, anomalías) y, si hay algo fuera de lo normal, avisa al responsable. Todo lo hecho en un turno ha de quedar apuntado.',
      partos: 'En época de partos: 2 c.c. de miloxán a cada cría el día del nacimiento, comprobar que se ha encalostrado y vaciar las ubres para igualarlas si las crías no las vacían por parejo. Si se pincha antibiótico por mamitis: collar rojo y la leche aparte hasta el 4.º día después del tratamiento.',
      grupos: [
        { nombre: 'Ordeño (cabras)', tareas: [
          ['ord-marcha', 'Puesta en marcha de la máquina de ordeño (limpia, filtro, vacío, tanque de frío preparado)', 'dia'],
          ['ord-ordeno', 'Ordeño de los animales', 'dia'],
          ['ord-tanque', 'Pasar la leche del tanque colector al tanque de frío', 'dia'],
          ['ord-sala', 'Limpieza de la sala de ordeño y de la sala de espera', 'dia'],
          ['ord-lavado', 'Lavado de la máquina de ordeño (detergente o ácido, según toque)', 'dia'],
          ['ord-lecheria', 'Limpieza del tanque de leche y de la lechería', 'dia'],
          ['ord-secar', 'Al final del día: soltar las pezoneras y comprobar que se ha lavado bien', 'dia'],
        ] },
        { nombre: 'Caprino', tareas: [
          ['cap-revision', 'Revisión de animales y retirada de bajas si las hubiere', 'dia'],
          ['cap-bebederos', 'Limpieza de bebederos con cepillo', 'dia'],
          ['cap-comederos', 'Barrido de comederos y retirada de los restos de pienso', 'dia'],
          ['cap-forrajeras', 'Retirada del polvo que se pega en las forrajeras', 'dia'],
          ['cap-pienso', 'Reparto de pienso y paja según ración acordada y estado de producción', 'dia'],
          ['cap-paja', 'Mullir la paja y completar lo que falte', 'dia'],
          ['cap-pasillos', 'Barrido de pasillos, una vez encerrado el ganado', 'dia'],
          ['cap-estiercol', 'Retirada del estiércol de las cuadras', 'mes'],
          ['cap-superfosfato', 'Espolvoreo de superfosfato en las cuadras (después de retirar el estiércol)', 'mes'],
          ['cap-insecticida', 'Aplicación de insecticida en cuadras y pasillos', 'mes'],
          ['cap-pezunas', 'Recorte de pezuñas a todos los animales', TRIM],
          ['cap-lecheria-fondo', 'Limpieza a fondo de la lechería y de la sala de herraje de caballos', SEMES],
          ['cap-focos', 'Limpieza de focos de luz y hierros de las cuadras (excrementos de moscas)', SEMES],
          ['cap-desparasitar', 'Desparasitación (julio o agosto, sin lactación para no dejar residuos en la leche)', { meses: [7, 8], clave: 'anio', nombre: 'Una vez al año (julio o agosto)' }],
        ] },
        { nombre: 'Ovino', tareas: [
          ['ovi-revision', 'Revisión de animales y retirada de bajas si las hubiere', 'dia'],
          ['ovi-bebederos', 'Limpieza de bebederos con cepillo', 'dia'],
          ['ovi-comederos', 'Barrido de comederos y retirada de los restos de pienso', 'dia'],
          ['ovi-pienso', 'Reparto de pienso y paja según ración acordada', 'dia'],
          ['ovi-pasillos', 'Barrido de pasillos, una vez encerrado el ganado', 'dia'],
          ['ovi-estiercol', 'Retirada del estiércol de las cuadras', 'mes'],
          ['ovi-superfosfato', 'Espolvoreo de superfosfato en las cuadras (después de retirar el estiércol)', 'mes'],
          ['ovi-insecticida', 'Aplicación de insecticida en cuadras y pasillos', 'mes'],
          ['ovi-pezunas', 'Recorte de pezuñas a todos los animales', TRIM],
          ['ovi-esquilado', 'Esquilado de las ovejas (lo normal es a principios de primavera, antes del calor). Apúntalo también en Sanidad → Esquilado', { meses: [3, 4], clave: 'anio', nombre: 'Una vez al año (marzo o abril)' }],
          ['ovi-focos', 'Limpieza de focos de luz y hierros de las cuadras (excrementos de moscas)', SEMES],
        ] },
      ],
    },
    porc: {
      nota: 'Al llegar, mira los registros, la rueda de gestación y los trabajos del día anterior. Empieza por lo más delicado: parideras, lechones, celos, implantación, gestación y cebo. Después de vaciar una sala: limpieza, desinfección, desinsectación y arreglo de la instalación antes de meter animales nuevos.',
      grupos: [
        { nombre: 'Porcino', tareas: [
          ['por-parideras', 'Limpieza de parideras y zona de implantación', 'dia'],
          ['por-cebo', 'Limpieza con agua a presión del cebo', 'dia'],
          ['por-cebadero', 'Cebadero: observación, comida y bebida (avisar si hay toses, heridas, agresiones…)', 'dia'],
          ['por-verraqueras', 'Limpieza de verraqueras y recogida de la paja de la zona de descanso', 'dia'],
          ['por-laboratorio', 'Limpieza de la sala de extracción, del laboratorio de semen y del material', 'dia'],
          ['por-pienso', 'Reparto de pienso a los animales', 'dia'],
          ['por-oficina', 'Limpieza de la oficina de porcino y del almacén del laboratorio', 'quincena'],
          ['por-cama', 'Cambio de la cama de paja de los verracos', 'quincena'],
          ['por-matas', 'Limpieza de matas y retirada de residuos del interior de la explotación', 'mes'],
          ['por-techos', 'Limpieza con agua del interior de los techos (naves, cebo, parideras e implantación)', 'mes'],
          ['por-hierros', 'Limpieza de hierros, cables y focos de la sala de partos e implantación', TRIM],
        ] },
      ],
    },
  };
  const NOMBRE_CADA = (c) => (c === 'dia' ? 'Cada día' : c === 'quincena' ? 'Cada quincena (días 1 y 15)' : c === 'mes' ? 'Cada mes'
    : c.nombre ? c.nombre : c.clave === 'anio' ? 'Una vez al año' : c.meses.length === 4 ? 'Cada trimestre (enero, abril, julio y octubre)' : 'Dos veces al año (marzo y septiembre)');
  // Periodo al que corresponde una tarea en una fecha (o null si ese mes no toca)
  function periodo(cada, f) {
    const ym = f.slice(0, 7), mes = Number(f.slice(5, 7)), dia = Number(f.slice(8, 10));
    if (cada === 'dia') return f;
    if (cada === 'quincena') return `${ym}-${dia < 15 ? 'q1' : 'q2'}`;
    if (cada === 'mes') return ym;
    if (!cada.meses.includes(mes)) return null;
    return cada.clave === 'anio' ? `${f.slice(0, 4)}-${cada.meses.join('')}` : ym;
  }
  // Tareas que tocan en una fecha, con su estado (hecha por quién y cuándo)
  function tareasDe(granja, f, hechas) {
    const P = PROTOCOLOS[granja]; if (!P) return [];
    const out = [];
    for (const g of P.grupos) for (const [id, texto, cada] of g.tareas) {
      const per = periodo(cada, f); if (!per) continue;
      const h = (hechas || []).find((x) => x.granja === granja && x.tarea === id && x.periodo === per);
      out.push({ id, texto, cada, grupo: g.nombre, periodo: per, hecha: h || null });
    }
    return out;
  }

  // Lista de tareas para marcar (la usan las dos granjas). o: { esc, puedeDeshacer(h), quien(h), faltaSQL }
  function htmlTareas(granja, f, hechas, o) {
    const P = PROTOCOLOS[granja]; if (!P) return '';
    const ts = tareasDe(granja, f, hechas);
    const orden = ['dia', 'quincena', 'mes'];
    const grupos = {};
    for (const t of ts) { const k = typeof t.cada === 'string' ? t.cada : NOMBRE_CADA(t.cada); (grupos[k] = grupos[k] || []).push(t); }
    const claves = Object.keys(grupos).sort((a, b) => (orden.indexOf(a) + 1 || 9) - (orden.indexOf(b) + 1 || 9));
    const hora = (h) => { const d = new Date(h.creado); const z = (n) => String(n).padStart(2, '0'); return `${z(d.getDate())}/${z(d.getMonth() + 1)} ${z(d.getHours())}:${z(d.getMinutes())}`; };
    const item = (t) => `<label class="${t.hecha ? 'hecha' : ''}"><input type="checkbox" data-tarea="${t.id}" data-periodo="${t.periodo}" ${t.hecha ? 'checked' : ''} ${t.hecha && !o.puedeDeshacer(t.hecha) ? 'disabled' : ''} ${o.faltaSQL ? 'disabled' : ''}>
      <span><span class="t">${o.esc(t.texto)}</span>${t.hecha ? `<br><span class="suave peq">Hecha por ${o.esc(o.quien(t.hecha))} · ${hora(t.hecha)}</span>` : ''}</span></label>`;
    const bloque = (k) => {
      const l = grupos[k]; const n = l.filter((t) => t.hecha).length; const titulo = k === 'dia' ? 'Hoy' : k === 'quincena' ? NOMBRE_CADA('quincena') : k === 'mes' ? 'Este mes' : k;
      const porGrupo = {}; for (const t of l) (porGrupo[t.grupo] = porGrupo[t.grupo] || []).push(t);
      return `<details ${k === 'dia' || n < l.length ? 'open' : ''}><summary class="entre" style="min-height:44px"><strong>${o.esc(titulo)}</strong><span class="chip ${n === l.length ? '' : 'nar'}">${n}/${l.length}</span></summary>
        ${Object.entries(porGrupo).map(([g, x]) => `${Object.keys(porGrupo).length > 1 ? `<h3>${o.esc(g)}</h3>` : ''}${x.map(item).join('')}`).join('')}</details>`;
    };
    const hechasN = ts.filter((t) => t.hecha).length;
    return `<section class="tarjeta tareas-prot"><div class="entre"><h2>Tareas del protocolo</h2><span class="chip ${hechasN === ts.length ? '' : 'nar'}">${hechasN}/${ts.length}</span></div>
      ${o.faltaSQL ? '<div class="aviso-caja">Para marcar las tareas hechas hay que ejecutar en Supabase el archivo 12_administrador.sql.</div>' : ''}
      <details><summary class="suave" style="min-height:40px;display:flex;align-items:center">Al llegar a la explotación…</summary><div class="peq">${o.esc(P.nota)}</div>${P.partos ? `<div class="peq" style="margin-top:6px">${o.esc(P.partos)}</div>` : ''}</details>
      ${claves.map(bloque).join('')}</section>`;
  }

  // ---------------- Pauta de un tratamiento: dosis siguientes con sus intervalos
  // (p. ej. vacuna: 2.ª dosis a los 21 días y después cada año)
  const UNI = { dias: ['día', 'días'], semanas: ['semana', 'semanas'], meses: ['mes', 'meses'], anios: ['año', 'años'] };
  const MAX_PAUTA = 4;
  const txtInt = (x) => `${x.n} ${UNI[x.u] ? UNI[x.u][x.n === 1 ? 0 : 1] : x.u}`;
  function leerPauta(get) {
    const out = [];
    for (let i = 0; i < MAX_PAUTA; i++) { const n = parseInt(get(`pauta_n_${i}`), 10); const u = get(`pauta_u_${i}`) || 'dias'; if (n > 0 && UNI[u]) out.push({ n, u }); }
    return out;
  }
  function htmlPauta(v, esc, id = '') {
    const p = Array.isArray(v.pauta) ? v.pauta : [];
    const opt = (sel) => Object.entries(UNI).map(([k, t]) => `<option value="${k}" ${sel === k ? 'selected' : ''}>${t[1]}</option>`).join('');
    const valor = (i, k) => (v[`pauta_${k}_${i}`] !== undefined ? v[`pauta_${k}_${i}`] : p[i] ? p[i][k] : '');
    return `<details class="campo" ${p.length || v.pauta_n_0 ? 'open' : ''}><summary style="min-height:44px;display:flex;align-items:center;font-weight:700">Pauta con varias dosis <span class="suave" style="font-weight:400">&nbsp;(opcional)</span></summary>
      <div class="suave peq">Para vacunas o tratamientos con dosis a distintos intervalos. Cada intervalo se cuenta desde la dosis anterior. Al marcar una dosis como hecha se programa sola la siguiente.</div>
      ${Array.from({ length: MAX_PAUTA }, (_, i) => `<div class="dos"><div class="campo"><label for="${id}pauta_n_${i}">${i + 2}.ª dosis a los</label><input id="${id}pauta_n_${i}" name="pauta_n_${i}" type="number" min="1" inputmode="numeric" value="${esc(valor(i, 'n'))}"></div>
        <div class="campo"><label for="${id}pauta_u_${i}">&nbsp;</label><select id="${id}pauta_u_${i}" name="pauta_u_${i}" aria-label="Unidad de la ${i + 2}.ª dosis">${opt(valor(i, 'u') || 'dias')}</select></div></div>`).join('')}
      <div class="suave peq">Después de la última, si se repite siempre (por ejemplo, cada año), rellena «Repetir cada».</div></details>`;
  }
  // Siguiente dosis a programar al hacer una: primero la pauta y, al acabarla, «repetir cada»
  function siguienteDosis(fecha, pauta, rep, sumarPeriodo) {
    const p = Array.isArray(pauta) ? pauta : [];
    if (p.length) return { fecha: sumarPeriodo(fecha, p[0].n, p[0].u), pauta: p.slice(1) };
    if (rep && rep.repetir_n) return { fecha: sumarPeriodo(fecha, rep.repetir_n, rep.repetir_unidad || 'dias'), pauta: [] };
    return null;
  }
  const textoPauta = (r) => (Array.isArray(r.pauta) && r.pauta.length ? `quedan ${r.pauta.length} ${r.pauta.length === 1 ? 'dosis' : 'dosis'}: a los ${r.pauta.map(txtInt).join(', después a los ')}` : '');

  // ---------------- Operaciones repetidas
  const norm = (t) => String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '');
  function agrupar(lista, clave) {
    const g = {}; for (const x of lista) { const k = clave(x); if (k) (g[k] = g[k] || []).push(x); }
    return Object.values(g).filter((x) => x.length > 1);
  }
  const ff = (iso) => (iso ? String(iso).slice(0, 10).split('-').reverse().join('/') : '');
  const claveAviso = (tabla, filas) => `${tabla}:${filas.map((x) => x.id).sort().join(',')}`;
  const prodSan = (r) => (r.tipo === 'analitica' ? `a:${norm(r.analisis)}` : r.medicamento_id ? `m:${r.medicamento_id}` : `p:${norm(r.producto)}`);
  // R: { eventos, sanidad, manejo } de rumiantes; P: { eventos, sanidad, extracciones, recuentos, mov_grupos } de porcino.
  // base: prefijo de los enlaces { rumi: '', porc: 'porc/' } desde CIFEARUMI; { rumi: '../', porc: '' } desde CIFEAPORC.
  function repetidas(R, P, base, nombres = {}) {
    const out = [];
    const add = (granja, tabla, filas, titulo, detalle, enlace) => out.push({ clave: claveAviso(tabla, filas), granja, tabla, titulo, detalle, filas, enlace });
    const quien = (x) => [...new Set(x.map((y) => y.realizado_por || y.autor_alias || '?'))].join(', ');
    if (R) {
      for (const g of agrupar((R.eventos || []).filter((e) => !['nota', 'lechero', 'alta'].includes(e.tipo) && !(e.datos && e.datos.importado)), (e) => `${e.animal_id}|${e.tipo}|${e.fecha}|${e.estado || ''}`))
        add('rumi', 'rum_eventos', g, `${nombres.evento ? nombres.evento(g[0]) : g[0].tipo} repetido`, `${nombres.animal ? nombres.animal(g[0].animal_id) : ''} · ${ff(g[0].fecha)} · ${g.length} veces · ${quien(g)}`, `${base.rumi}#/animal/${g[0].animal_id}`);
      for (const g of agrupar((R.sanidad || []).filter((r) => r.estado !== 'cancelado'), (r) => `${r.estado}|${r.tipo}|${r.fecha}|${prodSan(r)}|${r.ambito}|${r.corralina_id || ''}|${r.especie || ''}|${r.ambito === 'animales' ? (r.animales || []).slice().sort().join(',') : ''}`))
        add('rumi', 'rum_sanidad', g, 'Tratamiento repetido (cabras y ovejas)', `${g[0].producto || g[0].analisis || g[0].tipo} · ${ff(g[0].fecha)} · ${g.length} veces · ${quien(g)}`, `${base.rumi}#/sanidad/${g[0].estado === 'previsto' ? 'realizar' : 'editar'}/${g[0].id}`);
      const man = R.manejo || [];
      const vistos = new Set();
      for (let i = 0; i < man.length; i++) {
        if (vistos.has(man[i].id)) continue;
        const g = [man[i], ...man.slice(i + 1).filter((m) => m.fecha === man[i].fecha && (m.corralinas || []).some((c) => (man[i].corralinas || []).includes(c)) && (m.tareas || []).some((t) => (man[i].tareas || []).includes(t)))];
        if (g.length > 1) { g.forEach((m) => vistos.add(m.id)); add('rumi', 'rum_manejo', g, 'Manejo diario repetido', `${ff(g[0].fecha)} · mismas corralinas y tareas · ${quien(g)}`, `${base.rumi}#/manejo`); }
      }
    }
    if (P) {
      for (const g of agrupar((P.eventos || []).filter((e) => !['nota'].includes(e.tipo)), (e) => `${e.cerda_id}|${e.tipo}|${e.fecha}`))
        add('porc', 'eventos', g, `${nombres.eventoPorc ? nombres.eventoPorc(g[0]) : g[0].tipo} repetido`, `${nombres.cerda ? nombres.cerda(g[0].cerda_id) : ''} · ${ff(g[0].fecha)} · ${g.length} veces · ${quien(g)}`, `${base.porc}#/cerda/${g[0].cerda_id}`);
      for (const g of agrupar((P.sanidad || []).filter((r) => r.estado !== 'cancelado'), (r) => `${r.estado}|${r.tipo}|${r.fecha}|${prodSan(r)}|${r.ambito}|${r.cerda_id || ''}|${r.verraco_id || ''}|${r.zona || ''}`))
        add('porc', 'sanidad', g, 'Tratamiento repetido (porcino)', `${g[0].producto || g[0].analisis || g[0].tipo} · ${ff(g[0].fecha)} · ${g.length} veces · ${quien(g)}`, `${base.porc}#/sanidad/editar/${g[0].id}`);
      for (const g of agrupar(P.extracciones || [], (x) => `${x.verraco_id}|${x.fecha}`))
        add('porc', 'extracciones', g, 'Extracción repetida', `${nombres.verraco ? nombres.verraco(g[0].verraco_id) : ''} · ${ff(g[0].fecha)} · ${g.length} veces · ${quien(g)}`, `${base.porc}#/verraco/${g[0].verraco_id}`);
      for (const g of agrupar(P.recuentos || [], (x) => `${x.estancia}|${x.fecha}`))
        add('porc', 'recuentos', g, 'Recuento repetido', `${g[0].estancia} · ${ff(g[0].fecha)} · ${g.map((x) => x.n).join(' y ')} animales · ${quien(g)}`, `${base.porc}#/plano`);
      for (const g of agrupar(P.mov_grupos || [], (x) => `${x.tipo}|${x.origen || ''}|${x.destino || ''}|${x.fecha}|${x.n}`))
        add('porc', 'mov_grupos', g, 'Movimiento de lechones o cebo repetido', `${g[0].origen || ''}${g[0].destino ? ` → ${g[0].destino}` : ''} · ${ff(g[0].fecha)} · ${g[0].n} animales · ${quien(g)}`, `${base.porc}#/plano`);
    }
    return out.sort((a, b) => String(b.filas[0].fecha).localeCompare(String(a.filas[0].fecha)));
  }

  // =====================================================================
  // RESULTADOS Y COMPARAR (lo usan todas las granjas)
  // Cada granja da sus «fuentes» (filas de datos con fecha) y su catálogo:
  //   medidas: { id, nombre, unidad, fuente, tipo, valor(fila) | num(fila)+den(fila), desc, dec }
  //     tipo: 'cuenta' (filas con valor ≠ null) · 'media' · 'pct' (media de 0/1 × 100) · 'ratio' (100 × Σnum / Σden)
  //   grupos:  { id, nombre, clave(fila) → { k, etq, orden } | null }
  // =====================================================================
  const POCOS = 5; // con menos datos, la cifra es poco fiable
  const MESES_C = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  const GRUPOS_FECHA = [
    { id: 'todo', nombre: 'Todo junto', clave: () => ({ k: 'todo', etq: 'Total', orden: 0 }) },
    { id: 'semana', nombre: 'Semana', clave: (f) => { if (!f.fecha) return null; const d = new Date(`${f.fecha}T12:00:00Z`); d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7)); const l = d.toISOString().slice(0, 10); return { k: l, etq: `sem. ${l.slice(8)}/${l.slice(5, 7)}/${l.slice(2, 4)}`, orden: l }; } },
    { id: 'mes', nombre: 'Mes', clave: (f) => (f.fecha ? { k: f.fecha.slice(0, 7), etq: `${MESES_C[+f.fecha.slice(5, 7) - 1]} ${f.fecha.slice(2, 4)}`, orden: f.fecha.slice(0, 7) } : null) },
    { id: 'trimestre', nombre: 'Trimestre', clave: (f) => { if (!f.fecha) return null; const t = Math.ceil(+f.fecha.slice(5, 7) / 3); return { k: `${f.fecha.slice(0, 4)}T${t}`, etq: `${t}.º trim. ${f.fecha.slice(0, 4)}`, orden: `${f.fecha.slice(0, 4)}${t}` }; } },
    { id: 'anio', nombre: 'Año', clave: (f) => (f.fecha ? { k: f.fecha.slice(0, 4), etq: f.fecha.slice(0, 4), orden: f.fecha.slice(0, 4) } : null) },
  ];
  function calcular(fuentes, medidas, grupo, desde, hasta) {
    const enFechas = (f) => (!desde || (f.fecha && f.fecha >= desde)) && (!hasta || (f.fecha && f.fecha <= hasta));
    const filas = {}; for (const [k, l] of Object.entries(fuentes)) filas[k] = (l || []).filter(enFechas);
    const gr = {};
    for (const m of medidas) {
      for (const f of filas[m.fuente] || []) {
        const c = grupo.clave(f); if (!c) continue;
        const g = (gr[c.k] = gr[c.k] || { k: c.k, etq: c.etq, orden: c.orden, acc: {} });
        const a = (g.acc[m.id] = g.acc[m.id] || { s: 0, n: 0, num: 0, den: 0 });
        if (m.tipo === 'ratio') { const nu = m.num(f), de = m.den(f); if (nu == null || de == null || !(de > 0)) continue; a.num += nu; a.den += de; a.n += 1; continue; }
        const v = m.valor(f); if (v == null || Number.isNaN(v)) continue; a.s += v; a.n += 1;
      }
    }
    const lista = Object.values(gr).sort((x, y) => (typeof x.orden === 'number' && typeof y.orden === 'number' ? x.orden - y.orden : String(x.orden).localeCompare(String(y.orden), 'es', { numeric: true })));
    for (const g of lista) {
      g.vals = {};
      for (const m of medidas) {
        const a = g.acc[m.id]; if (!a || !a.n) { g.vals[m.id] = { v: null, n: 0 }; continue; }
        const v = m.tipo === 'cuenta' ? a.n : m.tipo === 'suma' ? a.s : m.tipo === 'media' ? a.s / a.n : m.tipo === 'pct' ? (100 * a.s) / a.n : (100 * a.num) / a.den;
        g.vals[m.id] = { v, n: a.n };
      }
    }
    return lista.filter((g) => medidas.some((m) => g.vals[m.id].n));
  }
  const fmtNum = (v, m) => (v == null ? '—' : `${(m.tipo === 'cuenta' || m.tipo === 'suma' ? Math.round(v) : v.toFixed(m.dec ?? 1)).toString().replace('.', ',')}${m.tipo === 'pct' || m.tipo === 'ratio' ? ' %' : ''}`);
  // Un recuento no es «poco fiable» por ser pequeño; una media o un % con pocos datos, sí
  const poca = (m, n) => n > 0 && n < POCOS && !['cuenta', 'suma'].includes(m.tipo);
  // Gráfica de barras horizontales en SVG (se lee bien en el móvil)
  function svgBarras(lista, m, esc) {
    const items = lista.filter((g) => g.vals[m.id].v != null);
    if (!items.length) return '<div class="suave peq">Sin datos.</div>';
    const max = Math.max(...items.map((g) => g.vals[m.id].v), m.tipo === 'pct' || m.tipo === 'ratio' ? 100 : 0) || 1;
    const fila = 26, izq = 86, ancho = 200, h = items.length * fila + 6;
    return `<svg class="grafica" viewBox="0 0 ${izq + ancho + 64} ${h}" role="img" aria-label="${esc(m.nombre)}">${items.map((g, i) => {
      const { v, n } = g.vals[m.id]; const w = Math.max(2, (v / max) * ancho); const y = i * fila + 3;
      return `<text x="${izq - 6}" y="${y + 16}" text-anchor="end" class="g-etq">${esc(String(g.etq).slice(0, 12))}</text>
        <rect x="${izq}" y="${y + 3}" width="${w}" height="${fila - 8}" rx="3" class="${poca(m, n) ? 'g-poca' : 'g-barra'}"/>
        <text x="${izq + w + 5}" y="${y + 16}" class="g-val">${esc(fmtNum(v, m))}${poca(m, n) ? '*' : ''}</text>`; }).join('')}</svg>`;
  }
  function htmlTabla(lista, medidas, grupo, esc) {
    return `<div class="tabla-scroll"><table class="tabla"><thead><tr><th>${esc(grupo.nombre)}</th>${medidas.map((m) => `<th>${esc(m.nombre)}${m.unidad ? ` <span class="suave">(${esc(m.unidad)})</span>` : ''}</th>`).join('')}</tr></thead><tbody>
      ${lista.map((g) => `<tr><th>${esc(g.etq)}</th>${medidas.map((m) => { const { v, n } = g.vals[m.id]; return `<td class="${poca(m, n) ? 'suave' : ''}">${fmtNum(v, m)}${poca(m, n) ? '*' : ''}${n && !['cuenta', 'suma'].includes(m.tipo) ? ` <span class="suave peq">n=${n}</span>` : ''}</td>`; }).join('')}</tr>`).join('')}
      </tbody></table></div>`;
  }
  // Texto para pegar en una IA (Claude): contexto, cómo se calcula cada cosa y la tabla
  function textoIA(o) {
    const f = (d) => (d ? d.split('-').reverse().join('/') : '…');
    const lineas = [`Datos de ${o.granja}, ${o.desde ? `del ${f(o.desde)} al` : 'desde el primer registro hasta el'} ${o.hasta ? f(o.hasta) : 'día de hoy'}. Agrupado por: ${o.grupo.nombre}.`, '', 'Qué significa cada columna:',
      ...o.medidas.map((m) => `- ${m.nombre}${m.unidad ? ` (${m.unidad})` : ''}: ${m.desc}`), '- n: número de datos con los que se calcula cada cifra. En medias y porcentajes, con n < 5 la cifra es poco fiable.', '',
      `| ${o.grupo.nombre} | ${o.medidas.map((m) => `${m.nombre} | n`).join(' | ')} |`, `|${' --- |'.repeat(1 + 2 * o.medidas.length)}`,
      ...o.lista.map((g) => `| ${g.etq} | ${o.medidas.map((m) => `${fmtNum(g.vals[m.id].v, m)} | ${g.vals[m.id].n}`).join(' | ')} |`)];
    if (o.filas && o.filas.length) {
      const cols = Object.keys(o.filas[0]);
      lineas.push('', 'Datos uno a uno:', `| ${cols.join(' | ')} |`, `|${' --- |'.repeat(cols.length)}`, ...o.filas.map((r) => `| ${cols.map((c) => (r[c] ?? '')).join(' | ')} |`));
    }
    lineas.push('', 'Analiza estos datos: qué diferencias son importantes, cuáles pueden deberse al azar por tener pocos datos y qué recomendarías revisar en el manejo.');
    return lineas.join('\n');
  }

  // ---- Pantallas de Resultados y Comparar (comunes). cat: catálogo de la granja; st: estado (fechas, elección)
  const filtrosFechas = (st, esc) => `<div class="dos"><div class="campo"><label for="an-desde">Desde</label><input id="an-desde" type="date" value="${esc(st.desde || '')}"></div>
    <div class="campo"><label for="an-hasta">Hasta</label><input id="an-hasta" type="date" value="${esc(st.hasta || '')}"></div></div>
    <div class="opciones peq">${[['12', 'Último año'], ['6', '6 meses'], ['24', '2 años'], ['0', 'Todo']].map(([k, t]) => `<button type="button" class="chip" data-an-rango="${k}">${t}</button>`).join('')}</div>`;
  const grupoDe = (cat, id) => cat.grupos.find((g) => g.id === id) || cat.grupos[0];
  const medidaDe = (cat, id) => cat.medidas.find((m) => m.id === id);
  function htmlResultados(cat, st, esc) {
    const todo = grupoDe(cat, 'todo');
    const kp = cat.kpis.map((id) => medidaDe(cat, id)).filter(Boolean);
    const tot = calcular(cat.fuentes, kp, todo, st.desde, st.hasta)[0];
    return `${filtrosFechas(st, esc)}
      <div class="totales an-kpis">${kp.map((m) => { const x = tot ? tot.vals[m.id] : { v: null, n: 0 }; return `<div class="dato"><span class="et">${esc(m.nombre)}</span><span class="val">${fmtNum(x.v, m)}${m.unidad && !['%'].includes(m.unidad) && m.tipo !== 'pct' ? ` <span class="peq">${esc(m.unidad)}</span>` : ''}</span>${['cuenta', 'suma'].includes(m.tipo) ? '' : `<span class="suave peq">n=${x.n}${poca(m, x.n) ? ' · poco fiable' : ''}</span>`}</div>`; }).join('')}</div>
      <a class="btn" href="${cat.hrefComparar}">Comparar y analizar con IA</a>
      ${cat.graficas.map((gx) => { const m = medidaDe(cat, gx.medida), g = grupoDe(cat, gx.grupo); const l = calcular(cat.fuentes, [m], g, st.desde, st.hasta);
        return `<section class="tarjeta"><h2>${esc(gx.titulo)}</h2>${svgBarras(l, m, esc)}<div class="suave peq">${esc(m.desc)}</div></section>`; }).join('')}
      <div class="suave peq">* Media o porcentaje con menos de ${POCOS} datos: la cifra es poco fiable. «n» es el número de datos con los que se calcula.</div>`;
  }
  function htmlComparar(cat, st, esc) {
    const sel = (st.medidas || []).map((id) => medidaDe(cat, id)).filter(Boolean);
    const g = grupoDe(cat, st.grupo);
    const lista = sel.length ? calcular(cat.fuentes, sel, g, st.desde, st.hasta) : [];
    const porFuente = {}; for (const m of cat.medidas) (porFuente[m.fuente] = porFuente[m.fuente] || []).push(m);
    return `${filtrosFechas(st, esc)}
      <details class="tarjeta" ${sel.length ? '' : 'open'}><summary style="min-height:44px;display:flex;align-items:center;font-weight:700">Qué comparar (${sel.length})</summary>
        ${Object.entries(porFuente).map(([f, ms]) => `<h3 class="peq" style="margin:8px 0 2px">${esc(cat.nombresFuente[f] || f)}</h3>${ms.map((m) => `<label class="check-todos"><input type="checkbox" data-an-medida="${m.id}" ${sel.includes(m) ? 'checked' : ''}> ${esc(m.nombre)}</label>`).join('')}`).join('')}</details>
      <div class="campo"><label for="an-grupo">Agrupar por</label><select id="an-grupo">${cat.grupos.map((x) => `<option value="${x.id}" ${x === g ? 'selected' : ''}>${esc(x.nombre)}</option>`).join('')}</select></div>
      ${sel.length ? `<section class="tarjeta"><h2>Tabla</h2>${lista.length ? htmlTabla(lista, sel, g, esc) : '<div class="suave">No hay datos en estas fechas.</div>'}</section>
        <div class="botones"><button class="btn" type="button" id="an-copiar">Copiar para analizar con IA</button><button class="btn sec" type="button" id="an-excel">Descargar Excel</button></div>
        <div class="suave peq">«Copiar» pone en el portapapeles la tabla, lo que significa cada columna y los datos uno a uno, listos para pegar en Claude. No incluye nombres de alumnos.</div>
        <div id="an-texto"></div>
        ${sel.map((m) => `<section class="tarjeta"><h2>${esc(m.nombre)}${m.unidad ? ` <span class="suave">(${esc(m.unidad)})</span>` : ''}</h2>${svgBarras(lista, m, esc)}<div class="suave peq">${esc(m.desc)}</div></section>`).join('')}
        <div class="suave peq">* Media o porcentaje con menos de ${POCOS} datos: la cifra es poco fiable.</div>`
      : '<div class="vacio">Marca arriba lo que quieres comparar.</div>'}`;
  }
  // Eventos de las dos pantallas. o: { repintar(), toast(t), cargarXLSX() }
  function enlazarAnalisis(raiz, cat, st, o) {
    const q = (s) => raiz.querySelector(s);
    const hoyIso = new Date(Date.now() - new Date().getTimezoneOffset() * 6e4).toISOString().slice(0, 10);
    raiz.querySelectorAll('[data-an-rango]').forEach((b) => b.addEventListener('click', () => {
      const m = +b.dataset.anRango; st.hasta = hoyIso;
      if (!m) st.desde = ''; else { const d = new Date(); d.setMonth(d.getMonth() - m); st.desde = d.toISOString().slice(0, 10); }
      o.repintar();
    }));
    ['desde', 'hasta'].forEach((k) => { const i = q(`#an-${k}`); if (i) i.addEventListener('change', () => { st[k] = i.value; o.repintar(); }); });
    raiz.querySelectorAll('[data-an-medida]').forEach((c) => c.addEventListener('change', () => {
      st.medidas = (st.medidas || []).filter((x) => x !== c.dataset.anMedida); if (c.checked) st.medidas.push(c.dataset.anMedida); o.repintar();
      const d = raiz.querySelector('details'); if (d) d.open = true;
    }));
    const gs = q('#an-grupo'); if (gs) gs.addEventListener('change', () => { st.grupo = gs.value; o.repintar(); });
    const datosActuales = () => {
      const sel = st.medidas.map((id) => medidaDe(cat, id)).filter(Boolean); const g = grupoDe(cat, st.grupo);
      const lista = calcular(cat.fuentes, sel, g, st.desde, st.hasta);
      const fuentes = [...new Set(sel.map((m) => m.fuente))];
      const enF = (f) => (!st.desde || (f.fecha && f.fecha >= st.desde)) && (!st.hasta || (f.fecha && f.fecha <= st.hasta));
      const brutos = fuentes.map((f) => ({ f, filas: (cat.fuentes[f] || []).filter(enF).map((r) => cat.legible(f, r)) }));
      return { sel, g, lista, brutos };
    };
    const bc = q('#an-copiar');
    if (bc) bc.addEventListener('click', async () => {
      const { sel, g, lista, brutos } = datosActuales();
      const texto = textoIA({ granja: cat.granja, desde: st.desde, hasta: st.hasta, grupo: g, medidas: sel, lista, filas: brutos.length === 1 ? brutos[0].filas : null })
        + (brutos.length > 1 ? `\n\n${brutos.map((b) => { const c = b.filas.length ? Object.keys(b.filas[0]) : []; return `${cat.nombresFuente[b.f]} (uno a uno):\n| ${c.join(' | ')} |\n|${' --- |'.repeat(c.length)}\n${b.filas.map((r) => `| ${c.map((k) => r[k] ?? '').join(' | ')} |`).join('\n')}`; }).join('\n\n')}` : '');
      try { await navigator.clipboard.writeText(texto); o.toast('Copiado: pégalo en Claude y pide el análisis'); }
      catch (_) { q('#an-texto').innerHTML = `<div class="campo"><label for="an-ta">Selecciona todo y cópialo</label><textarea id="an-ta" rows="8" readonly>${texto.replace(/</g, '&lt;')}</textarea></div>`; q('#an-ta').select(); }
    });
    const be = q('#an-excel');
    if (be) be.addEventListener('click', async () => {
      be.disabled = true;
      try {
        await o.cargarXLSX(); const X = window.XLSX; const libro = X.utils.book_new();
        const { sel, g, lista, brutos } = datosActuales();
        const resumen = lista.map((x) => { const r = { [g.nombre]: x.etq }; for (const m of sel) { const v = x.vals[m.id]; r[m.nombre] = v.v == null ? '' : Math.round(v.v * 100) / 100; r[`${m.nombre} (n)`] = v.n; } return r; });
        X.utils.book_append_sheet(libro, X.utils.json_to_sheet(resumen.length ? resumen : [{}]), 'Resumen');
        X.utils.book_append_sheet(libro, X.utils.json_to_sheet(sel.map((m) => ({ Medida: m.nombre, Unidad: m.unidad || '', 'Cómo se calcula': m.desc }))), 'Qué es cada columna');
        for (const b of brutos) X.utils.book_append_sheet(libro, X.utils.json_to_sheet(b.filas.length ? b.filas : [{}]), String(cat.nombresFuente[b.f] || b.f).slice(0, 30));
        X.writeFile(libro, `${cat.archivo}-${hoyIso}.xlsx`);
      } catch (e) { o.toast('No se pudo crear el Excel'); }
      be.disabled = false;
    });
  }

  // ---- Tres granjas: 1 = GRANJA 1.º, 2 = GRANJA 2.º, 3 = GRANJA MADRE (registro oficial)
  const GRANJAS = { 1: { nombre: 'GRANJA 1.º', corto: '1.º', color: 'naranja' }, 2: { nombre: 'GRANJA 2.º', corto: '2.º', color: 'verde' }, 3: { nombre: 'GRANJA MADRE', corto: 'MADRE', color: 'granate' } };
  // Granja en la que trabaja la persona (la misma regla que granja_activa() en Supabase)
  function granjaDe(p) {
    if (!p) return null;
    if (p.rol === 'alumno') return p.granja_id;
    const gs = p.granjas || [];
    if (p.admin) return p.granja_activa || 2;
    if (p.granja_activa && gs.includes(p.granja_activa)) return p.granja_activa;
    return gs[0] || (p.granjas === undefined ? 2 : null); // sin el SQL 18 todo seguía en la 2
  }
  const granjasDe = (p) => (!p ? [] : p.rol === 'alumno' ? [p.granja_id] : p.admin ? [1, 2, 3] : (p.granjas || []).slice().sort());
  function aplicarColorGranja(g) { try { document.documentElement.dataset.granja = String(g || ''); } catch (_) {} }
  const chipGranja = (g, href) => (GRANJAS[g] ? (href ? `<a class="granja-chip" href="${href}" aria-label="Cambiar de granja (ahora ${GRANJAS[g].nombre})">${GRANJAS[g].nombre} ▾</a>` : `<span class="granja-chip">${GRANJAS[g].nombre}</span>`) : '');

  const api = { PROTOCOLOS, NOMBRE_CADA, periodo, tareasDe, htmlTareas, repetidas, leerPauta, htmlPauta, siguienteDosis, textoPauta, POCOS, GRUPOS_FECHA, calcular, fmtNum, svgBarras, htmlTabla, textoIA, htmlResultados, htmlComparar, enlazarAnalisis, GRANJAS, granjaDe, granjasDe, aplicarColorGranja, chipGranja };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else raiz.Comun = api;
})(typeof window !== 'undefined' ? window : globalThis);
