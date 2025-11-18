// frontend/static/js/app.js
const API = (typeof window.FRONTEND_API_URL !== 'undefined') ? window.FRONTEND_API_URL : (location.origin + '/api');

async function fetchJSON(url, opts){
  opts = opts || {};
  try{
    const r = await fetch(url, opts);
    const text = await r.text();
    // try parse JSON safely
    try { const data = JSON.parse(text || '{}'); if(!r.ok) throw {status:r.status, data}; return {ok:true, status:r.status, data}; }
    catch(parseErr){
      // not JSON
      return {ok:false, status:r.status, error: text || 'Non-JSON response'};
    }
  }catch(err){
    return {ok:false, error: err.message || String(err)};
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
      const res = await fetchJSON(API + '/login', {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({username:u, pin:p})});
      if(res.ok && res.data && res.data.ok){
        saveUser(res.data.user);
        window.location.href = 'home.html';
      } else {
        if(res.data && res.data.message) msg.textContent = res.data.message;
        else if(res.error) msg.textContent = res.error;
        else msg.textContent = 'Error de autenticación';
      }
    });
  }

  // HOME actions
  if(location.pathname.endsWith('/home.html') || location.pathname.endsWith('/')){
    const user = loadUser();
    if(!user){ /* optional redirect to login if required */ }
    const logoutBtn = document.getElementById('logoutBtn');
    if(logoutBtn) logoutBtn.addEventListener('click', ()=>{ clearUser(); window.location.href='index.html'; });
    // oficina selector
    const sel = document.getElementById('oficinaSelector');
    if(sel && user && user.tienda) sel.value = user.tienda;
  }

  // OPERACIONES page handlers
  if(location.pathname.endsWith('/operaciones.html')){
    const form = document.getElementById('opForm');
    const opsList = document.getElementById('opsList');
    const tipoSelect = document.getElementById('tipoSelect');

    async function loadOps(){
      opsList.textContent = 'Cargando...';
      const resp = await fetchJSON(API + '/operaciones');
      if(!resp.ok){ opsList.textContent = 'Error: ' + (resp.error || JSON.stringify(resp.data)); return; }
      const rows = resp.data;
      if(!Array.isArray(rows) || rows.length===0){ opsList.innerHTML = '<small>No hay operaciones</small>'; return; }
      opsList.innerHTML = rows.map(r=>{
        return `<div class="op-item card" data-id="${r.id}">
          <div><b>${r.tipo}</b> — ${r.importe} ${r.moneda} — <i>${r.estado}</i></div>
          <div class="op-meta">${r.usuario || ''} • ${r.oficina || ''} • ${r.fecha ? r.fecha.replace('T',' ') : ''}</div>
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
          const r = await fetchJSON(API + '/operaciones/' + id, {method:'DELETE'});
          if(r.ok) loadOps(); else alert('Error: ' + (r.error||JSON.stringify(r.data)));
        };
      });
      document.querySelectorAll('.btn-change').forEach(b=>{
        b.onclick = (ev)=>{
          const id = b.dataset.id;
          openEstadoModal(id, loadOps);
        };
      });
      document.querySelectorAll('.btn-edit').forEach(b=>{
        b.onclick = async ()=>{
          const id = b.dataset.id;
          // simple inline edit demo: load op and prompt for new importe
          const r = await fetchJSON(API + '/operaciones');
          if(!r.ok) return alert('Error cargando');
          const op = r.data.find(x=>String(x.id)===String(id));
          if(!op) return alert('No encontrado');
          const nuevo = prompt('Nuevo importe:', op.importe);
          if(nuevo!==null){
            const upd = await fetchJSON(API + '/operaciones/' + id, {method:'PUT', headers:{'Content-Type':'application/json'}, body:JSON.stringify({importe: Number(nuevo)})});
            if(upd.ok) loadOps(); else alert('Error: ' + (upd.error||JSON.stringify(upd.data)));
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
      const res = await fetchJSON(API + '/operaciones', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(body)});
      if(res.ok && res.status===201){ alert('Operación creada'); form.reset(); loadOps(); }
      else alert('Error al crear: ' + (res.error || JSON.stringify(res.data)));
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
        const r = await fetchJSON(API + '/operaciones/' + currentOpId, {method:'PUT', headers:{'Content-Type':'application/json'}, body:JSON.stringify({estado:'finalizada'})});
        if(r.ok){ modal.classList.remove('show'); if(after) after(); } else alert('Error: ' + (r.error||JSON.stringify(r.data)));
      };
      document.getElementById('btnPendiente').onclick = async ()=>{
        const r = await fetchJSON(API + '/operaciones/' + currentOpId, {method:'PUT', headers:{'Content-Type':'application/json'}, body:JSON.stringify({estado:'recogida_pendiente'})});
        if(r.ok){ modal.classList.remove('show'); if(after) after(); } else alert('Error: ' + (r.error||JSON.stringify(r.data)));
      };
      document.getElementById('btnCancel').onclick = ()=> modal.classList.remove('show');
    }
  }

  // DAILY page
  if(location.pathname.endsWith('/daily.html')){
    const dailyDate = document.getElementById('dailyDate');
    const loadBtn = document.getElementById('loadDaily');
    const list = document.getElementById('dailyList');
    loadBtn.onclick = async ()=>{
      const fecha = dailyDate.value;
      const url = API + '/operaciones/daily' + (fecha ? '?fecha=' + fecha : '');
      const r = await fetchJSON(url);
      if(!r.ok) return list.textContent = 'Error: ' + (r.error || JSON.stringify(r.data));
      const arr = r.data;
      list.innerHTML = arr.map(o=> `<div class="op-item card" data-id="${o.id}"><div><b>${o.tipo}</b> ${o.importe} ${o.moneda}</div>
        <div>${o.usuario} • ${o.oficina} • ${o.fecha}</div>
        <div><button class="btn-ghost btn-edit" data-id="${o.id}">Editar</button></div></div>`).join('');
      // attach edit handlers similar to operaciones list
      list.querySelectorAll('.btn-edit').forEach(b=>{
        b.onclick = async ()=>{
          const id = b.dataset.id;
          const nuevo = prompt('Nuevo importe:');
          if(nuevo!==null){
            const upd = await fetchJSON(API + '/operaciones/' + id, {method:'PUT', headers:{'Content-Type':'application/json'}, body:JSON.stringify({importe:Number(nuevo)})});
            if(upd.ok) loadBtn.click(); else alert('Error');
          }
        };
      });
    };
  }

  // AJUSTES page
  if(location.pathname.endsWith('/ajustes.html')){
    const sForm = document.getElementById('settingsForm');
    if(sForm){
      sForm.onsubmit = (ev)=>{ ev.preventDefault(); alert('Ajustes guardados (demo)'); };
    }
    const btnExport = document.getElementById('btnExportBackup');
    if(btnExport){
      btnExport.onclick = async ()=>{
        const r = await fetchJSON(API + '/backup');
        if(!r.ok) return alert('Error: ' + (r.error||JSON.stringify(r.data)));
        const blob = new Blob([JSON.stringify(r.data,null,2)], {type:'application/json'});
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'eaxy_backup_'+(new Date().toISOString().slice(0,19).replace(/[:T]/g,'_'))+'.json';
        document.body.appendChild(a); a.click(); a.remove();
      };
    }
    const importBtn = document.getElementById('btnImport');
    if(importBtn){
      importBtn.onclick = async ()=>{
        const f = document.getElementById('importFile').files[0];
        if(!f) return alert('Selecciona un fichero JSON');
        const txt = await f.text();
        try{
          const parsed = JSON.parse(txt);
          // naive import: write operations and users - demo only
          // you can send to backend a dedicated import endpoint
          alert('Archivo cargado (demo). Para importar en backend implementa endpoint /api/import');
        }catch(e){ alert('JSON inválido'); }
      };
    }

    document.getElementById('openHist')?.addEventListener('click', ()=> window.location.href='historial.html');
    document.getElementById('openReports')?.addEventListener('click', ()=> alert('Generador de informes - pendiente'));
  }

  // HISTORIAL page (if exists)
  if(location.pathname.endsWith('/historial.html')){
    const hist = document.getElementById('histList');
    hist.textContent = 'Cargando...';
    (async ()=>{
      const r = await fetchJSON(API + '/operaciones');
      if(!r.ok) return hist.textContent = 'Error: ' + (r.error||JSON.stringify(r.data));
      const arr = r.data;
      hist.innerHTML = arr.map(o=>`<div class="hist-item card"><div><b>${o.tipo}</b> ${o.importe} ${o.moneda}</div>
        <div>${o.usuario} • ${o.oficina} • ${o.fecha}</div>
        <div><button class="btn-ghost btn-edit" data-id="${o.id}">Editar</button>
        <button class="btn-ghost btn-delete" data-id="${o.id}">Borrar</button>
        <button class="btn-ghost btn-restore" data-id="${o.id}">Restaurar</button></div></div>`).join('');
      // attach handlers as in operaciones
      hist.querySelectorAll('.btn-delete').forEach(b=>{
        b.onclick = async ()=> {
          if(!confirm('Borrar?')) return;
          const r = await fetchJSON(API + '/operaciones/' + b.dataset.id, {method:'DELETE'});
          if(r.ok) location.reload(); else alert('Error');
        }
      });
    })();
  }

});

