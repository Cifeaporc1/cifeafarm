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
          ['cap-desparasitar', 'Desparasitación (julio o agosto, sin lactación para no dejar residuos en la leche)', { meses: [7, 8], clave: 'anio' }],
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
    : c.clave === 'anio' ? 'Una vez al año (julio o agosto)' : c.meses.length === 4 ? 'Cada trimestre (enero, abril, julio y octubre)' : 'Dos veces al año (marzo y septiembre)');
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

  const api = { PROTOCOLOS, NOMBRE_CADA, periodo, tareasDe, htmlTareas, repetidas };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else raiz.Comun = api;
})(typeof window !== 'undefined' ? window : globalThis);
