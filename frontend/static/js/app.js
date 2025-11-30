const API = window.FRONTEND_API_URL || (location.origin + '/api');

function qs(s){ return document.querySelector(s); }
function qsa(s){ return Array.from(document.querySelectorAll(s)); }

function saveUser(token, username, tienda){
  localStorage.setItem('eaxy_user', JSON.stringify({ token, username, tienda }));
}
function getToken(){
  try { return JSON.parse(localStorage.getItem('eaxy_user'))?.token; } catch(e){ return null; }
}
function getTiendaLocal(){ try{ return JSON.parse(localStorage.getItem('eaxy_user'))?.tienda || 'Barcelona' }catch(e){ return 'Barcelona' } }

async function fetchJSON(url, opts={}){
  opts.headers = opts.headers || {};
  const t = getToken();
  if(t) opts.headers['Authorization'] = 'Bearer ' + t;
  try{
    const r = await fetch(url, opts);
    const txt = await r.text();
    try{ return { ok: r.ok, status: r.status, data: txt ? JSON.parse(txt) : null, text: txt }; }
    catch(e){ return { ok: r.ok, status: r.status, data: null, text: txt }; }
  }catch(e){
    return { ok:false, error: e.message || String(e) };
  }
}

/* DOM ready */
document.addEventListener('DOMContentLoaded', ()=>{

  // Inicializa selector tienda mostrado
  const selDisplay = qs('#selectedTienda');
  if(selDisplay) selDisplay.textContent = getTiendaLocal();

  // TIENDA modal handlers
  const openT = qs('#openTiendaModal');
  const modalT = qs('#tiendaModal');
  const saveT = qs('#tiendaSave');
  const cancelT = qs('#tiendaCancel');

  openT?.addEventListener('click', ()=> modalT.classList.remove('hidden'));
  cancelT?.addEventListener('click', ()=> modalT.classList.add('hidden'));

  saveT?.addEventListener('click', ()=>{
    const radios = qsa('input[name="tienda"]');
    let selected = 'Barcelona';
    radios.forEach(r=>{ if(r.checked) selected = r.value; });
    // actualizar visual y localstorage parcial
    selDisplay && (selDisplay.textContent = selected);
    // si ya hay token guardado, mantenemos token y username, actualizamos tienda local
    try{
      const obj = JSON.parse(localStorage.getItem('eaxy_user')) || {};
      obj.tienda = selected;
      localStorage.setItem('eaxy_user', JSON.stringify(obj));
    }catch(e){}
    modalT.classList.add('hidden');
  });

  /* LOGIN */
  if(location.pathname.endsWith('index.html') || location.pathname.endsWith('/')){
    qs('#loginBtn')?.addEventListener('click', async ()=>{

      const u = qs('#username').value.trim();
      const p = qs('#password').value.trim();
      const msg = qs('#loginMsg');

      if(!u || !p){ if(msg) msg.textContent = 'Rellena usuario y PIN'; return; }

      msg && (msg.textContent = 'Conectando...');

      const res = await fetchJSON(API + '/login', {
        method:'POST',
        headers:{ 'Content-Type':'application/json' },
        body: JSON.stringify({ username: u, pin: p })
      });

      if(!res.ok || !res.data?.token){
        msg && (msg.textContent = (res.data && res.data.msg) ? res.data.msg : 'Usuario o PIN incorrectos');
        return;
      }

      // guardar token + username + tienda seleccionada (si la han elegido)
      const tienda = qs('#selectedTienda')?.textContent || 'Barcelona';
      saveUser(res.data.token || res.data.token, u, tienda);

      // ir a home
      window.location.href = 'home.html';
    });
  }

  /* LOGOUT */
  qs('#logoutBtn')?.addEventListener('click', ()=>{
    localStorage.removeItem('eaxy_user');
    window.location.href = 'index.html';
  });

  /* OPERACIONES page handlers (si estamos en operaciones) */
  if(location.pathname.includes('operaciones.html')){
    const btnNew = qs('#btnNuevaOp');
    const modal = qs('#modalOp');
    const btnCancel = qs('#opCancel');
    const btnSave = qs('#opSave');
    const opsList = qs('#opsList');

    btnNew?.addEventListener('click', ()=> modal.classList.remove('hidden'));
    btnCancel?.addEventListener('click', ()=> modal.classList.add('hidden'));

    async function cargarOps(){
      const r = await fetchJSON(API + '/historial');
      if(!r.ok){ opsList.innerHTML = '<small>Sin movimientos</small>'; return; }
      const arr = (r.data && r.data.operaciones) ? r.data.operaciones : (r.data || []);
      if(!Array.isArray(arr) || arr.length === 0){ opsList.innerHTML = '<small>Sin movimientos</small>'; return; }
      opsList.innerHTML = arr.map(o=>`<div class="op-item"><b>${o.tipo}</b> — ${o.importe} ${o.moneda}<div class="op-meta">${o.cliente || ''} • ${o.fecha || ''}</div></div>`).join('');
    }

    btnSave?.addEventListener('click', async ()=>{
      const payload = {
        tipo: qs('#opTipo').value,
        cliente: qs('#opCliente').value,
        importe: Number(qs('#opImporte').value),
        moneda: qs('#opMoneda').value || 'EUR'
      };
      if(!payload.tipo || !payload.importe){ alert('Rellena tipo e importe'); return; }

      const r = await fetchJSON(API + '/operaciones', {
        method:'POST',
        headers:{ 'Content-Type':'application/json' },
        body: JSON.stringify(payload)
      });

      if(r.ok && r.data && r.data.ok){
        alert('Operación creada correctamente');
        modal.classList.add('hidden');
        cargarOps();
      } else {
        alert('Error al crear: ' + (r.data?.error || r.text || 'Error'));
      }
    });

    cargarOps();
  }

  /* Otras páginas (caja/daily/historial) mantienen handlers previos si existen */

});
