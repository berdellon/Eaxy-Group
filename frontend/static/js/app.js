/* frontend/static/js/app.js
   Versión corregida: login funcional, token en headers, llamadas protegidas,
   manejo de errores más claro y logs para depuración.
*/

const API = (typeof window.FRONTEND_API_URL !== 'undefined') ? window.FRONTEND_API_URL : (location.origin + '/api');

function qs(s){ return document.querySelector(s); }
function qsa(s){ return Array.from(document.querySelectorAll(s)); }

function getToken(){ 
  try{ const u = JSON.parse(localStorage.getItem('eaxy_user')) || {}; return u.token || localStorage.getItem('token'); }catch(e){ return localStorage.getItem('token'); }
}

async function fetchJSON(url, opts = {}){
  // añade Authorization si existe token
  const token = getToken();
  opts.headers = opts.headers || {};
  if(token) opts.headers['Authorization'] = 'Bearer ' + token;
  try {
    const r = await fetch(url, opts);
    const txt = await r.text();
    try { const data = txt ? JSON.parse(txt) : null; return { ok: r.ok, status: r.status, data, text: txt }; }
    catch(e){ return { ok: r.ok, status: r.status, data: null, text: txt }; }
  } catch(err){
    console.error('fetchJSON error', err);
    return { ok:false, error: err.message || String(err) };
  }
}

function saveUserToken(token, username){
  // guardamos token y username para referencia
  const obj = { token: token, username: username };
  localStorage.setItem('eaxy_user', JSON.stringify(obj));
  localStorage.setItem('token', token);
}

function clearUser(){ localStorage.removeItem('eaxy_user'); localStorage.removeItem('token'); }

// DOM ready
document.addEventListener('DOMContentLoaded', ()=>{

  // --- LOGIN ---
  const loginBtn = qs('#loginBtn');
  if(loginBtn){
    loginBtn.addEventListener('click', async (ev)=>{
      ev.preventDefault();
      const u = (qs('#username') || {}).value || '';
      const p = (qs('#password') || {}).value || '';
      const msg = qs('#loginMsg');
      if(msg) msg.textContent = '';

      if(!u || !p){ if(msg) msg.textContent = 'Rellena usuario y PIN'; return; }

      try {
        if(msg) msg.textContent = 'Conectando...';
        const res = await fetchJSON(API + '/login', {
          method: 'POST',
          headers: {'Content-Type':'application/json'},
          body: JSON.stringify({ username: u, pin: p })
        });

        if(!res.ok){
          // res.text puede tener "Not Found"
          const errorMsg = (res.data && res.data.msg) ? res.data.msg : (res.text || res.error || 'Error de autenticación');
          if(msg) msg.textContent = errorMsg;
          console.warn('Login failed', res);
          return;
        }

        // éxito: puede venir token
        const token = (res.data && res.data.token) ? res.data.token : null;
        saveUserToken(token, u);
        // redirigir a home
        window.location.href = 'home.html';
      } catch(e){
        console.error('login error', e);
        if(msg) msg.textContent = 'Error conexión';
      }
    });
  }

  // --- HOME ---
  if(location.pathname.endsWith('/home.html') || location.pathname.endsWith('/home') ){
    qs('#logoutBtn')?.addEventListener('click', ()=>{ clearUser(); window.location.href='index.html'; });
  }

  // --- OPERACIONES ---
  if(location.pathname.endsWith('/operaciones.html')){
    // asegurar fondo azul
    document.body.style.background = null; // CSS se encargará; esto evita override
    const opsList = qs('#opsList');
    const form = qs('#opForm');

    async function loadOps(){
      if(opsList) opsList.textContent = 'Cargando...';
      const r = await fetchJSON(API + '/historial'); // backend devuelve operaciones por tienda
      if(!r.ok){ if(opsList) opsList.textContent = 'Sin actividad'; console.warn('loadOps error', r); return; }
      const arr = r.data && r.data.operaciones ? r.data.operaciones : r.data || [];
      if(!Array.isArray(arr) || arr.length === 0){ if(opsList) opsList.innerHTML = '<small>Sin actividad</small>'; return; }
      if(opsList) opsList.innerHTML = arr.map(o=>`
        <div class="op-item">
          <div style="display:flex;justify-content:space-between">
            <div><b>${o.tipo}</b> — ${o.importe} ${o.moneda}</div>
            <div style="opacity:.9">${o.estado || ''}</div>
          </div>
          <div class="op-meta">${o.cliente || ''} • ${o.tienda || ''} • ${o.fecha || ''}</div>
        </div>
      `).join('');
    }

    form?.addEventListener('submit', async (ev)=>{
      ev.preventDefault();
      const payload = {
        tipo: qs('#tipoSelect')?.value || '',
        cliente: qs('#cliente')?.value || '',
        importe: Number(qs('#importe')?.value || 0),
        moneda: qs('#moneda')?.value || 'EUR'
      };

      // validaciones
      if(!payload.tipo || !payload.importe){ alert('Rellena tipo e importe'); return; }

      const res = await fetchJSON(API + '/operaciones', {
        method: 'POST',
        headers: {'Content-Type':'application/json'},
        body: JSON.stringify(payload)
      });

      if(res.ok && res.data && res.data.ok){
        alert('Operación creada correctamente');
        form.reset();
        loadOps();
      } else {
        // mostrar respuesta concreta
        const err = (res.data && res.data.error) ? res.data.error : (res.text || res.error || JSON.stringify(res.data));
        alert('Error al crear: ' + err);
        console.warn('crear operacion result', res);
      }
    });

    qs('#btnClear')?.addEventListener('click', ()=> form.reset());

    loadOps();
  }

  // --- CAJA FUERTE ---
  if(location.pathname.endsWith('/caja_fuerte.html') || location.pathname.endsWith('/caja.html')){
    (async ()=>{
      const r = await fetchJSON(API + '/caja');
      const el = qs('#safeBalance');
      if(r.ok && r.data && (r.data.total !== undefined)){
        el.textContent = r.data.total + ' EUR';
      } else {
        el.textContent = '0 EUR';
      }
      // movimientos
      const h = await fetchJSON(API + '/historial');
      const movsEl = qs('#safeMovs');
      if(h.ok && h.data && Array.isArray(h.data.operaciones) && h.data.operaciones.length){
        movsEl.innerHTML = h.data.operaciones.slice(0,6).map(x=>`<div>${x.tipo} ${x.importe} ${x.moneda}</div>`).join('');
      } else {
        movsEl.innerHTML = '<small>Sin movimientos</small>';
      }
    })();
  }

  // --- DAILY ---
  if(location.pathname.endsWith('/daily.html')){
    qs('#loadDaily')?.addEventListener('click', async ()=>{
      const date = qs('#dailyDate').value;
      const url = API + '/daily' + (date ? '?fecha=' + date : '');
      const r = await fetchJSON(url);
      const list = qs('#dailyList');
      if(!r.ok){ list.textContent = 'Error: ' + (r.text || r.error); return; }
      const arr = r.data && r.data.daily ? r.data.daily : r.data || [];
      if(!arr.length) list.innerHTML = '<small>Sin movimientos</small>'; else list.innerHTML = arr.map(o=>`<div class="op-item">${o.tipo} ${o.importe} ${o.moneda} • ${o.fecha}</div>`).join('');
    });
  }

  // --- AJUSTES / BACKUP / HISTORIAL ---
  if(location.pathname.endsWith('/ajustes.html') || location.pathname.endsWith('/exportar.html')){
    qs('#btnExportBackup')?.addEventListener('click', async ()=>{
      const r = await fetchJSON(API + '/backup');
      if(!r.ok){ alert('Error al exportar: ' + (r.text || r.error)); return; }
      const blob = new Blob([JSON.stringify(r.data || r, null,2)], {type:'application/json'});
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'eaxy_backup.json'; document.body.appendChild(a); a.click(); a.remove();
    });
  }

  if(location.pathname.endsWith('/historial.html')){
    (async ()=>{
      const r = await fetchJSON(API + '/historial');
      const el = qs('#histList');
      const arr = r.data && r.data.operaciones ? r.data.operaciones : r.data || [];
      if(!arr.length) el.innerHTML = '<small>Sin historiales</small>'; else el.innerHTML = arr.map(o=>`<div class="op-item">${o.tipo} ${o.importe} ${o.moneda} • ${o.fecha}</div>`).join('');
    })();
  }

});

