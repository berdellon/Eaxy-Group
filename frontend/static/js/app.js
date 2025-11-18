// app.js - actualizado: fixes en creación/opciones y mejor feedback
const API = (typeof window.FRONTEND_API_URL !== 'undefined') ? window.FRONTEND_API_URL : (location.origin + '/api');

async function fetchJSONraw(url, opts){
  opts = opts || {};
  try{
    const r = await fetch(url, opts);
    const text = await r.text();
    let parsed = null;
    try { parsed = text ? JSON.parse(text) : null; } catch(e) { parsed = null; }
    return { ok: r.ok, status: r.status, data: parsed, text };
  } catch(err){
    return { ok:false, error: err.message || String(err) };
  }
}

function saveUser(u){ localStorage.setItem('eaxy_user', JSON.stringify(u)); }
function loadUser(){ try{return JSON.parse(localStorage.getItem('eaxy_user'));}catch(e){return null;} }
function clearUser(){ localStorage.removeItem('eaxy_user'); }

document.addEventListener('DOMContentLoaded', ()=>{

  // LOGIN
  const loginBtn = document.getElementById('loginBtn');
  if(loginBtn){
    loginBtn.addEventListener('click', async ()=>{
      const u = document.getElementById('username').value.trim();
      const p = document.getElementById('password').value.trim();
      const msg = document.getElementById('loginMsg');
      msg.textContent = '';
      if(!u || !p){ msg.textContent='Rellena usuario y PIN'; return; }
      msg.textContent = 'Conectando...';
      const res = await fetchJSONraw(API + '/login', {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({username:u, pin:p})});
      if(res.ok && res.data && res.data.ok){
        saveUser(res.data.user);
        window.location.href = 'home.html';
      } else {
        msg.textContent = (res.data && res.data.message) ? res.data.message : (res.text || res.error || 'Error de autenticación');
      }
    });
  }

  // Common: load oficina selector if present
  const oficinaSelectorGlobal = document.getElementById('oficinaSelector');
  const user = loadUser();
  if(oficinaSelectorGlobal && user && user.tienda) oficinaSelectorGlobal.value = user.tienda;

  // OPERACIONES page handlers
  if(location.pathname.endsWith('/operaciones.html')){
    const form = document.getElementById('opForm');
    const opsList = document.getElementById('opsList');
    const tipoSelect = document.getElementById('tipoSelect');

    async function loadOps(){
      opsList.textContent = 'Cargando...';
      const resp = await fetchJSONraw(API + '/operaciones');
      if(!resp.ok){ opsList.textContent = 'Error: ' + (resp.text || JSON.stringify(resp.data) || resp.error); return; }
      const rows = resp.data || [];
      if(!Array.isArray(rows) || rows.length===0){ opsList.innerHTML = '<small>No hay operaciones</small>'; return; }
      opsList.innerHTML = rows.map(r=>{
        return `<div class="op-item" data-id="${r.id}">
          <div style="display:flex;justify-content:space-between;align-items:center;">
            <div><b>${r.tipo}</b> — ${r.importe} ${r.moneda}</div>
            <div style="font-size:13px;opacity:.85">${r.estado || 'pendiente'}</div>
          </div>
          <div class="op-meta">${r.usuario||''} • ${r.oficina||''} • ${r.fecha? r.fecha.replace('T',' ') : ''}</div>
          <div class="op-actions">
            <button class="btn-ghost btn-edit" data-id="${r.id}">Editar</button>
            <button class="btn-ghost btn-delete" data-id="${r.id}">Borrar</button>
            <button class="btn-ghost btn-change" data-id="${r.id}">Estado</button>
          </div>
        </div>`;
      }).join('');
      // attach events
      document.querySelectorAll('.btn-delete').forEach(b=>{
        b.onclick = async ()=> {
          if(!confirm('Borrar operación?')) return;
          const id = b.dataset.id;
          const r = await fetchJSONraw(API + '/operaciones/' + id, {method:'DELETE'});
          if(r.ok) loadOps(); else alert('Error: ' + (r.text || r.error || JSON.stringify(r.data)));
        };
      });
      document.querySelectorAll('.btn-change').forEach(b=>{
        b.onclick = (ev)=> openEstadoModal(b.dataset.id, loadOps);
      });
      document.querySelectorAll('.btn-edit').forEach(b=>{
        b.onclick = async ()=>{
          const id = b.dataset.id;
          const resAll = await fetchJSONraw(API + '/operaciones');
          if(!resAll.ok) return alert('Error cargando operaciones');
          const op = (resAll.data||[]).find(x=>String(x.id)===String(id));
          if(!op) return alert('No encontrado');
          const nuevo = prompt('Nuevo importe:', op.importe);
          if(nuevo!==null){
            const upd = await fetchJSONraw(API + '/operaciones/' + id, {method:'PUT', headers:{'Content-Type':'application/json'}, body: JSON.stringify({importe: Number(nuevo)})});
            if(upd.ok) loadOps(); else alert('Error: ' + (upd.text||upd.error||JSON.stringify(upd.data)));
          }
        };
      });
    }

    form.addEventListener('submit', async (ev)=>{
      ev.preventDefault();
      const body = {
        tipo: document.getElementById('tipoSelect').value,
        cliente: document.getElementById('cliente').value,
        importe: Number(document.getElementById('importe').value || 0),
        moneda: document.getElementById('moneda').value || 'EUR',
        usuario: loadUser() && loadUser().username ? loadUser().username : 'anon',
        oficina: document.getElementById('oficinaSelector') ? document.getElementById('oficinaSelector').value : 'Barcelona'
      };
      const res = await fetchJSONraw(API + '/operaciones', {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body)});
      // accept 201 or ok with success flag
      if(res.ok && (res.status===201 || (res.data && res.data.success)) ){
        alert('Operación creada');
        form.reset();
        loadOps();
      } else {
        alert('Error al crear: ' + (res.text || res.error || JSON.stringify(res.data)));
      }
    });

    document.getElementById('btnClear').onclick = ()=> form.reset();
    loadOps();

    // modal logic
    let currentOpId = null;
    function openEstadoModal(id, after){
      currentOpId = id;
      const modal = document.getElementById('estadoModal');
      modal.classList.add('show');
      document.getElementById('btnFinalizada').onclick = async ()=>{
        const r = await fetchJSONraw(API + '/operaciones/' + currentOpId, {method:'PUT', headers:{'Content-Type':'application/json'}, body:JSON.stringify({estado:'finalizada'})});
        if(r.ok){ modal.classList.remove('show'); if(after) after(); } else alert('Error: ' + (r.text||r.error||JSON.stringify(r.data)));
      };
      document.getElementById('btnPendiente').onclick = async ()=>{
        const r = await fetchJSONraw(API + '/operaciones/' + currentOpId, {method:'PUT', headers:{'Content-Type':'application/json'}, body:JSON.stringify({estado:'recogida_pendiente'})});
        if(r.ok){ modal.classList.remove('show'); if(after) after(); } else alert('Error: ' + (r.text||r.error||JSON.stringify(r.data)));
      };
      document.getElementById('btnCancel').onclick = ()=> modal.classList.remove('show');
    }
  }

  // OTHER PAGES: daily, ajustes, historial use previous logic (unchanged)
});
