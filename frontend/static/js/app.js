// frontend/static/js/app.js
const API = window.FRONTEND_API_URL || (location.origin + '/api');

function qs(s){ return document.querySelector(s); }
function saveUser(token, username, tienda){
  const obj = { token, username, tienda };
  localStorage.setItem('eaxy_user', JSON.stringify(obj));
  localStorage.setItem('token', token);
}
function getToken(){ try{ return JSON.parse(localStorage.getItem('eaxy_user')||'null')?.token || localStorage.getItem('token'); }catch(e){ return localStorage.getItem('token'); } }

async function fetchJSON(url, opts = {}){
  opts.headers = opts.headers || {};
  const t = getToken();
  if(t) opts.headers['Authorization'] = 'Bearer ' + t;
  try{
    const r = await fetch(url, opts);
    const txt = await r.text();
    let data = null;
    try{ data = txt ? JSON.parse(txt) : null; }catch(e){}
    return { ok: r.ok, status: r.status, data, text: txt };
  }catch(err){
    return { ok:false, error: err.message || String(err) };
  }
}

document.addEventListener('DOMContentLoaded', ()=>{

  const loginBtn = qs('#loginBtn');
  const usernameEl = qs('#username');
  const passwordEl = qs('#password');
  const tiendaEl = qs('#tiendaSelect');
  const msgEl = qs('#loginMsg');

  // Preseleccionar tienda si existiera en localStorage
  try{
    const prev = JSON.parse(localStorage.getItem('eaxy_user')||'null');
    if(prev && prev.tienda) tiendaEl.value = prev.tienda;
  }catch(e){}

  loginBtn?.addEventListener('click', async ()=>{
    msgEl.textContent = '';
    const username = (usernameEl.value||'').trim();
    const pin = (passwordEl.value||'').trim();
    const tienda = (tiendaEl.value||'').trim() || 'Barcelona';

    if(!username || !pin){ msgEl.textContent = 'Rellena usuario y PIN'; return; }

    msgEl.textContent = 'Conectando...';

    // Envío correcto como JSON
    const res = await fetchJSON(API + '/login', {
      method: 'POST',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ username: username, pin: pin })
    });

    console.log('POST /api/login ->', res);

    if(!res.ok){
      // Mostrar el mensaje exacto que venga en JSON si existe
      const errMsg = (res.data && (res.data.msg || res.data.error)) ? (res.data.msg || res.data.error) : (res.text || 'Error en autenticación');
      msgEl.textContent = errMsg;
      return;
    }

    // OK: se espera token en res.data.token
    const token = res.data && res.data.token ? res.data.token : null;
    if(!token){
      // debug: mostrar el body completo
      console.warn('No token received in login response:', res);
      msgEl.textContent = 'No se recibió token. Revisa backend (mira logs).';
      return;
    }

    // Guardar y redirigir
    saveUser(token, username, tienda);

    // Si backend devuelve tienda distinta, lo actualizamos
    if(res.data.tienda){
      try{
        const s = JSON.parse(localStorage.getItem('eaxy_user')||'{}');
        s.tienda = res.data.tienda;
        localStorage.setItem('eaxy_user', JSON.stringify(s));
      }catch(e){}
    }

    window.location.href = 'home.html';
  });

});
