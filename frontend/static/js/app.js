// Frontend JS para Eaxy Group
// Configura la URL del API:
// - Si quieres que el frontend use el backend en otra URL,
//   añade en index.html: <script>window.FRONTEND_API_URL='https://eaxy-backend.onrender.com/api'</script>
const API = (typeof window.FRONTEND_API_URL !== 'undefined') ? window.FRONTEND_API_URL : (location.origin + '/api');

function saveUser(obj){ localStorage.setItem('eaxy_user', JSON.stringify(obj)); }
function loadUser(){ try { return JSON.parse(localStorage.getItem('eaxy_user')); } catch(e){return null} }
function clearUser(){ localStorage.removeItem('eaxy_user'); }

async function postJSON(path, body){
  const res = await fetch(API + path, {
    method: 'POST',
    headers: {'Content-Type':'application/json'},
    body: JSON.stringify(body)
  });
  return res;
}

async function getJSON(path){
  const res = await fetch(API + path);
  return res;
}

/* ========== LOGIN ========== */
document.addEventListener('DOMContentLoaded', ()=> {
  const loginBtn = document.getElementById('loginBtn');
  if(loginBtn){
    loginBtn.addEventListener('click', async ()=> {
      const username = document.getElementById('username').value.trim();
      const pin = document.getElementById('password').value.trim();
      const msg = document.getElementById('loginMsg');

      if(!username || !pin){ msg.textContent = 'Rellena usuario y PIN'; return; }
      msg.textContent = 'Conectando...';

      try{
        const resp = await postJSON('/login', {username, pin});
        if(resp.ok){
          const data = await resp.json();
          // Resp shape depends on backend. We accept both {user:...} or {ok:true, token:...}
          if(data.user){ saveUser(data.user); window.location.href = 'home.html'; return; }
          if(data.ok && data.token){
            saveUser({token: data.token});
            window.location.href = 'home.html'; return;
          }
          msg.textContent = 'Credenciales incorrectas';
        } else {
          if(resp.status === 401) msg.textContent = 'Usuario o PIN incorrecto';
          else msg.textContent = 'Error de conexión: ' + resp.status;
        }
      }catch(e){
        msg.textContent = 'Error: ' + e.message;
      }
    });
  }

  // Home page init
  if(location.pathname.endsWith('/home.html') || location.pathname.endsWith('/')){
    const user = loadUser();
    if(!user) { /* si no hay token intenta redirigir al login */ }
    const selector = document.getElementById('oficinaSelector');
    if(selector && user && user.oficina) selector.value = user.oficina;
    const btnExport = document.getElementById('btnExportBackup');
    if(btnExport){
      btnExport.addEventListener('click', async ()=> {
        try {
          const resp = await fetch(API + '/backup');
          if(!resp.ok) throw new Error('backup failed');
          const blob = await resp.blob();
          const a = document.createElement('a');
          a.href = URL.createObjectURL(blob);
          a.download = 'eaxy_backup_' + new Date().toISOString().slice(0,19).replace(/[:T]/g,'_') + '.json';
          document.body.appendChild(a); a.click(); a.remove();
        } catch(err){
          alert('Export failed: ' + err.message);
        }
      });
    }
  }

  // Operaciones page handlers
  if(location.pathname.endsWith('/operaciones.html')){
    const form = document.getElementById('opForm');
    const opsList = document.getElementById('opsList');
    const modal = document.getElementById('modal');
    const modalClose = document.getElementById('modalClose');

    async function loadOps(){
      opsList.textContent = 'Cargando...';
      try{
        const q = await fetch(API + '/operaciones');
        const data = await q.json();
        if(Array.isArray(data)){
          if(data.length===0) opsList.innerHTML = '<small>No hay operaciones</small>';
          else {
            opsList.innerHTML = data.map(o=>`<div class="op-item"><b>${o.tipo}</b> — ${o.importe} ${o.moneda} — ${o.estado}</div>`).join('');
          }
        } else opsList.textContent = 'Error cargando';
      }catch(e){ opsList.textContent = 'Error: ' + e.message; }
    }

    form.addEventListener('submit', async (ev)=>{
      ev.preventDefault();
      const fd = new FormData(form);
      const body = {
        tipo: fd.get('tipo'),
        cliente: fd.get('cliente'),
        importe: Number(fd.get('importe')||0),
        moneda: fd.get('moneda'),
        usuario: loadUser() && loadUser().username ? loadUser().username : 'anon',
        oficina: document.getElementById('oficinaSelector') ? document.getElementById('oficinaSelector').value : 'Barcelona'
      };
      try{
        const r = await postJSON('/operaciones', body);
        if(r.status === 201 || r.ok){
          alert('Operación creada');
          form.reset();
          loadOps();
        } else {
          const txt = await r.text();
          alert('Error al crear operación: ' + txt);
        }
      }catch(e){ alert('Error: ' + e.message); }
    });

    loadOps();
    if(modalClose) modalClose.onclick = ()=> modal.classList.remove('show');
  }

  // Historial
  if(location.pathname.endsWith('/historial.html')){
    const hist = document.getElementById('histList');
    hist.textContent = 'Cargando...';
    fetch(API + '/operaciones').then(r=>r.json()).then(d=>{
      hist.innerHTML = (Array.isArray(d) && d.length) ? d.map(x=>`<div class="hist-item">${x.tipo} — ${x.importe} ${x.moneda} — ${x.fecha||''}</div>`).join('') : '<small>No hay historiales</small>';
    }).catch(e=>hist.textContent='Error: '+e.message);
  }

  // Caja fuerte
  if(location.pathname.endsWith('/caja_fuerte.html')){
    const st = document.getElementById('safeBalance');
    const mv = document.getElementById('safeMovs');
    st.textContent = '--';
    mv.textContent = 'Cargando...';
    // demo: pedir API si existe
    fetch(API + '/backups').then(r=>r.json()).then(d=> mv.textContent = 'Backups: ' + (Array.isArray(d)?d.length:0)).catch(e=>mv.textContent='Error');
  }

  // Settings form
  if(location.pathname.endsWith('/ajustes.html')){
    const fm = document.getElementById('settingsForm');
    fm.addEventListener('submit', ev=>{
      ev.preventDefault();
      alert('Ajustes guardados (demo).');
    });
  }
});
