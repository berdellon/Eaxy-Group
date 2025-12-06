// frontend/static/js/app.js
const API = window.FRONTEND_API_URL || (location.origin + "/api");

function qs(s){ return document.querySelector(s); }
function qsa(s){ return Array.from(document.querySelectorAll(s)); }

function getStoredUser(){
  try{ return JSON.parse(localStorage.getItem('eaxy_user')||'null'); }catch(e){ return null; }
}
function getToken(){ const u = getStoredUser(); return u?.token || localStorage.getItem('token'); }
function getTienda(){ const u = getStoredUser(); return u?.tienda || localStorage.getItem('tienda'); }

async function fetchJSON(url, opts = {}){
  opts.headers = opts.headers || {};
  const token = getToken();
  if(token) opts.headers['Authorization'] = 'Bearer ' + token;
  try{
    const r = await fetch(url, opts);
    const txt = await r.text();
    let data = null;
    try{ data = txt ? JSON.parse(txt) : null; }catch(e){ data = null; }
    return { ok: r.ok, status: r.status, data, text: txt };
  }catch(err){
    return { ok:false, error: err.message || String(err) };
  }
}

/* ----------------------
   EFECTOS (aplicar clases)
   ---------------------- */
function applyEffect(name){
  document.documentElement.classList.remove('effect-metal','effect-neon','effect-snow');
  if(name === 'metal') document.documentElement.classList.add('effect-metal');
  if(name === 'neon') document.documentElement.classList.add('effect-neon');
  if(name === 'snow') document.documentElement.classList.add('effect-snow');
  localStorage.setItem('eaxy_effect', name);
}
function loadEffect(){
  const e = localStorage.getItem('eaxy_effect') || 'none';
  applyEffect(e);
}

/* ----------------------
   MODALES genéricos
   ---------------------- */
function openModal(id){
  const m = qs(id);
  if(!m) return;
  m.style.display = 'block';
  m.setAttribute('aria-hidden','false');
  // focus primer input si lo hay
  const input = m.querySelector('input,select,button,textarea');
  if(input) input.focus();
}
function closeModal(id){
  const m = qs(id);
  if(!m) return;
  m.style.display = 'none';
  m.setAttribute('aria-hidden','true');
}

/* ----------------------
   OPERACIONES: carga y modal
   ---------------------- */
async function loadOps(){
  const opsList = qs('#opsList');
  if(!opsList) return;
  opsList.textContent = 'Cargando...';
  const r = await fetchJSON(API + '/historial');
  if(!r.ok){
    opsList.innerHTML = '<small>Sin actividad</small>';
    console.warn('loadOps error', r);
    return;
  }
  const arr = r.data || r.data?.operaciones || [];
  if(!Array.isArray(arr) || arr.length === 0){
    opsList.innerHTML = '<small>Sin actividad</small>';
    return;
  }
  opsList.innerHTML = arr.map(o=>`
    <div class="op-item">
      <div style="display:flex;justify-content:space-between">
        <div><b>${o.tipo}</b> — ${o.importe} ${o.moneda}</div>
        <div style="opacity:.9">${o.fecha ? new Date(o.fecha).toLocaleString() : ''}</div>
      </div>
      <div class="op-meta">${o.cliente || ''} • ${o.tienda || ''}</div>
    </div>
  `).join('');
}

document.addEventListener('DOMContentLoaded', ()=>{

  loadEffect();

  /* ---------- Operaciones page ---------- */
  if(qs('#openCreateOp')){
    // abrir modal
    qs('#openCreateOp').addEventListener('click', ()=> openModal('#opModal'));

    // cerrar modal
    qs('#closeOpModal')?.addEventListener('click', ()=> closeModal('#opModal'));
    qs('#cancelOp')?.addEventListener('click', ()=> closeModal('#opModal'));

    // mostrar campo recogida si tipo es cripto o entrada/cash
    qs('#modalTipo')?.addEventListener('change', (e)=>{
      const v = e.target.value;
      const row = qs('#recogidaRow');
      if(v === 'cash' || v === 'entrada' || v === 'cripto') row.style.display = 'block';
      else row.style.display = 'none';
    });

    // submit modal
    qs('#opModalForm')?.addEventListener('submit', async (ev)=>{
      ev.preventDefault();
      const tipo = qs('#modalTipo').value;
      const cliente = qs('#modalCliente').value.trim();
      const importe = Number(qs('#modalImporte').value || 0);
      const moneda = qs('#modalMoneda').value || 'EUR';
      const recogida = qs('#recogidaPendiente')?.checked || false;

      if(!tipo || !importe){
        qs('#opModalMsg').textContent = 'Rellena tipo e importe';
        return;
      }
      qs('#opModalMsg').textContent = 'Guardando...';

      const payload = { tipo, cliente, importe, moneda, recogida };
      const res = await fetchJSON(API + '/operaciones', {
        method: 'POST',
        headers: {'Content-Type':'application/json'},
        body: JSON.stringify(payload)
      });

      if(res.ok && res.data && res.data.ok){
        qs('#opModalMsg').textContent = '';
        closeModal('#opModal');
        // limpiar form
        qs('#opModalForm').reset();
        // recargar lista
        setTimeout(loadOps, 350);
      } else {
        const err = (res.data && res.data.error) ? res.data.error : (res.text || res.error || 'Error al crear');
        qs('#opModalMsg').textContent = 'Error: ' + err;
        console.warn('crear operacion result', res);
      }
    });

    // inizial load
    loadOps();
  }

  /* ---------- AJUSTES: elegir efecto ---------- */
  qsa('.effect-btn')?.forEach(b=>{
    b.addEventListener('click', (ev)=>{
      const e = b.getAttribute('data-effect');
      applyEffect(e);
      // marcar visualmente
      qsa('.effect-btn').forEach(x=>x.classList.remove('selected'));
      b.classList.add('selected');
    });
  });

  // preseleccionar botón por efecto actual
  const cur = localStorage.getItem('eaxy_effect') || 'none';
  qsa(`.effect-btn[data-effect="${cur}"]`).forEach(x => x.classList.add('selected'));

  // settings save (oficina)
  qs('#settingsForm')?.addEventListener('submit', (ev)=>{
    ev.preventDefault();
    const v = qs('#oficinaSetting')?.value;
    if(v) localStorage.setItem('eaxy_oficina', v);
    alert('Ajustes guardados');
  });

  /* ---------- Historial button placeholder ---------- */
  qs('#openHist')?.addEventListener('click', ()=> window.location.href='historial.html');
  qs('#openReports')?.addEventListener('click', ()=> alert('Funcionalidad informes: pendiente implementar'));

});
