// frontend/static/js/app.js
const API = window.FRONTEND_API_URL || (location.origin + '/api');

function qs(sel){ return document.querySelector(sel); }
function qsa(sel){ return Array.from(document.querySelectorAll(sel)); }

function saveUser(token, username, tienda){
  const obj = { token, username, tienda };
  localStorage.setItem('eaxy_user', JSON.stringify(obj));
  // también guardamos token por separado por compatibilidad
  localStorage.setItem('token', token);
}

function getStoredUser(){
  try{ return JSON.parse(localStorage.getItem('eaxy_user') || 'null'); }catch(e){ return null; }
}

function getToken(){
  const u = getStoredUser();
  if(u && u.token) return u.token;
  return localStorage.getItem('token');
}

async function fetchJSON(url, opts = {}){
  opts.headers = opts.headers || {};
  const t = getToken();
  if(t) opts.headers['Authorization'] = 'Bearer ' + t;

  try{
    const res = await fetch(url, opts);
    const txt = await res.text();
    let data = null;
    try{ data = txt ? JSON.parse(txt) : null; } catch(e) { data = null; }
    return { ok: res.ok, status: res.status, data, text: txt };
  }catch(err){
    return { ok:false, error: err.message || String(err) };
  }
}

document.addEventListener('DOMContentLoaded', ()=>{

  const loginBtn = qs('#loginBtn');
  const usernameEl = qs('#username');
  const passwordEl = qs('#password');
  const tiendaEl = qs('#tiendaSelect');
  const loginMsg = qs('#loginMsg');

  // Si hay tienda guardada, preseleccionarla
  const stored = getStoredUser();
  if(stored && stored.tienda){
    try{ tiendaEl.value = stored.tienda; }catch(e){}
  }

  // Manejo del botón Entrar
  loginBtn?.addEventListener('click', async (ev)=>{
    ev.preventDefault();
    loginMsg.textContent = '';

    const username = (usernameEl.value || '').trim();
    const pin = (passwordEl.value || '').trim();
    const tienda = (tiendaEl.value || '').trim() || 'Barcelona';

    if(!username || !pin){
      loginMsg.textContent = 'Rellena usuario y PIN';
      return;
    }

    // Mostrar estado
    loginMsg.textContent = 'Conectando...';

    // Petición al backend
    try{
      const res = await fetchJSON(API + '/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: username, pin: pin })
      });

      console.log('Login response raw:', res);

      if(!res.ok){
        // Si backend devolvió JSON con msg, mostrarlo; si no, mostrar texto plano
        const msg = (res.data && res.data.msg) ? res.data.msg : (res.text || 'Error de autenticación');
        loginMsg.textContent = msg;
        return;
      }

      // En algunos casos token puede venir en res.data.token o en res.data (si res.data es token)
      const token = (res.data && res.data.token) ? res.data.token
                  : (res.data && res.data.ok && res.data.token) ? res.data.token
                  : (typeof res.data === 'string' ? res.data : null);

      if(!token && res.data && res.data.ok === true && res.data.tienda){
        // fallback: si backend devuelve ok:true y tienda/role sin token (raro), no hagas login
        loginMsg.textContent = 'Respuesta inesperada del servidor (falta token)';
        return;
      }

      if(!token){
        // try to parse token inside nested object
        if(res.data && res.data.token) {
          saveUser(res.data.token, username, tienda);
        } else {
          loginMsg.textContent = 'No se recibió token. Revisa el backend.';
          console.warn('No token in login response:', res);
          return;
        }
      } else {
        saveUser(token, username, tienda);
      }

      // Guardamos la tienda real devuelta por back si viene
      if(res.data && res.data.tienda){
        try{
          const u = JSON.parse(localStorage.getItem('eaxy_user') || '{}');
          u.tienda = res.data.tienda;
          localStorage.setItem('eaxy_user', JSON.stringify(u));
        }catch(e){}
      }

      // redirigir a home
      window.location.href = 'home.html';
    }catch(e){
      console.error('Login error', e);
      loginMsg.textContent = 'Error conexión: ' + (e.message || String(e));
    }
  });

});
