/* FRONTEND EAXY - app.js
   Versión totalmente corregida
   Funciona: login, operaciones, historial, daily, caja fuerte, ajustes
*/

const API = window.FRONTEND_API_URL || (location.origin + "/api");

function qs(s){ return document.querySelector(s); }
function qsa(s){ return [...document.querySelectorAll(s)]; }

function getToken(){
  try{
    const u = JSON.parse(localStorage.getItem("eaxy_user")) || {};
    return u.token || localStorage.getItem("token");
  }catch(e){
    return localStorage.getItem("token");
  }
}

function saveUserToken(token, username){
  localStorage.setItem("eaxy_user", JSON.stringify({ token, username }));
  localStorage.setItem("token", token);
}
function clearUser(){
  localStorage.removeItem("eaxy_user");
  localStorage.removeItem("token");
}

async function fetchJSON(url, opts = {}){
  const token = getToken();
  opts.headers = opts.headers || {};
  if(token) opts.headers["Authorization"] = "Bearer " + token;

  try{
    const r = await fetch(url, opts);
    const text = await r.text();
    let data = null;
    try{ data = text ? JSON.parse(text) : null; }catch(_){}

    return { ok: r.ok, status: r.status, data, text };
  }catch(err){
    return { ok:false, error: err.message };
  }
}

document.addEventListener("DOMContentLoaded", ()=>{

  /* ========== LOGIN ========== */
  if(qs("#loginBtn")){
    qs("#loginBtn").addEventListener("click", async ()=>{
      const u = qs("#username").value.trim();
      const p = qs("#password").value.trim();
      const msg = qs("#loginMsg");

      if(!u || !p){ msg.textContent = "Rellena usuario y PIN"; return; }

      msg.textContent = "Conectando...";

      const r = await fetchJSON(API + "/login", {
        method: "POST",
        headers: {"Content-Type":"application/json"},
        body: JSON.stringify({ username: u, pin: p })
      });

      if(!r.ok || !r.data?.token){
        msg.textContent = "Usuario o PIN incorrectos";
        return;
      }

      saveUserToken(r.data.token, u);
      window.location.href = "home.html";
    });
  }

  /* ========== HOME ========== */
  if(location.pathname.includes("home")){
    qs("#logoutBtn")?.addEventListener("click", ()=>{
      clearUser();
      window.location.href = "index.html";
    });
  }

  /* ========== OPERACIONES ========== */
  if(location.pathname.includes("operaciones.html")){

    const form = qs("#opForm");
    const list = qs("#opsList");

    async function loadOps(){
      const r = await fetchJSON(API + "/historial");
      const ops = r.data?.operaciones || [];

      if(!ops.length){
        list.innerHTML = "<small>Sin actividad</small>";
        return;
      }

      list.innerHTML = ops.map(o=>`
        <div class="op-item">
          <b>${o.tipo}</b> — ${o.importe} ${o.moneda}
          <div class="op-meta">${o.cliente || ''} • ${o.tienda || ''} • ${o.fecha || ''}</div>
        </div>
      `).join("");
    }

    form?.addEventListener("submit", async (ev)=>{
      ev.preventDefault();

      const payload = {
        tipo: qs("#tipoSelect").value,
        cliente: qs("#cliente").value.trim(),
        importe: Number(qs("#importe").value),
        moneda: qs("#moneda").value
      };

      if(!payload.tipo || !payload.importe){
        alert("Rellena el tipo e importe");
        return;
      }

      const r = await fetchJSON(API + "/operaciones", {
        method:"POST",
        headers: {"Content-Type":"application/json"},
        body: JSON.stringify(payload)
      });

      if(r.ok && r.data?.ok){
        alert("Operación creada correctamente");
        form.reset();
        loadOps();
      }else{
        alert("Error al crear operación: " + (r.data?.error || r.text));
      }
    });

    loadOps();
  }

  /* ========== CAJA FUERTE ========== */
  if(location.pathname.includes("caja_fuerte.html")){
    (async ()=>{
      const bal = await fetchJSON(API + "/caja");
      qs("#safeBalance").textContent = (bal.data?.total || 0) + " EUR";

      const h = await fetchJSON(API + "/historial");
      const ops = h.data?.operaciones || [];
      const movEl = qs("#safeMovs");

      if(!ops.length){
        movEl.innerHTML = "<small>Sin movimientos</small>";
        return;
      }

      movEl.innerHTML = ops.slice(0,6).map(o=>`
        <div>${o.tipo} ${o.importe} ${o.moneda}</div>
      `).join("");
    })();
  }

  /* ========== DAILY ========== */
  if(location.pathname.includes("daily.html")){
    qs("#loadDaily")?.addEventListener("click", async ()=>{
      const date = qs("#dailyDate").value;
      const r = await fetchJSON(API + "/daily" + (date ? "?fecha="+date : ""));

      const ops = r.data?.daily || [];
      const list = qs("#dailyList");

      if(!ops.length){
        list.innerHTML = "<small>Sin movimientos</small>";
        return;
      }

      list.innerHTML = ops.map(o=>`
        <div class="op-item">${o.tipo} ${o.importe} ${o.moneda} • ${o.fecha}</div>
      `).join("");
    });
  }

  /* ========== AJUSTES / BACKUP ========== */
  if(location.pathname.includes("ajustes.html")){
    qs("#btnExportBackup")?.addEventListener("click", async ()=>{
      const r = await fetchJSON(API + "/backup");

      if(!r.ok){
        alert("Error al exportar");
        return;
      }

      const blob = new Blob([JSON.stringify(r.data,null,2)], {type:"application/json"});
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "eaxy_backup.json";
      a.click();
    });
  }

  /* ========== HISTORIAL ========== */
  if(location.pathname.includes("historial.html")){
    (async ()=>{
      const r = await fetchJSON(API + "/historial");
      const ops = r.data?.operaciones || [];
      const list = qs("#histList");

      if(!ops.length){
        list.innerHTML = "<small>Sin historiales</small>";
        return;
      }

      list.innerHTML = ops.map(o=>`
        <div class="op-item">${o.tipo} ${o.importe} ${o.moneda} • ${o.fecha}</div>
      `).join("");
    })();
  }

});
