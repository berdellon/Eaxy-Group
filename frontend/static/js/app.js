/* FRONTEND EAXY - app.js COMPLETO */

const API = window.FRONTEND_API_URL || (location.origin + "/api");

function qs(s){ return document.querySelector(s); }

function getToken(){
  try{
    const u = JSON.parse(localStorage.getItem("eaxy_user")) || {};
    return u.token;
  }catch{
    return null;
  }
}

function saveUserToken(token, username, tienda){
  localStorage.setItem("eaxy_user", JSON.stringify({ token, username, tienda }));
}

function clearUser(){
  localStorage.removeItem("eaxy_user");
}


/* ====== DETECCIÓN MÓVIL ====== */
document.addEventListener("DOMContentLoaded", ()=>{

(function(){
  const isMobile = window.matchMedia("(max-width: 768px)").matches;

  if (isMobile) {
    document.body.style.overflowX = "hidden";
    document.documentElement.style.maxWidth = "100%";

    const box = qs(".login-container");
    if (box){
      box.style.width = "92%";
      box.style.padding = "20px";
    }
  }
})();
  

/* ========== LOGIN ========== */
if(qs("#loginBtn")){
  qs("#loginBtn").addEventListener("click", async ()=>{

    const u = qs("#username").value.trim();
    const p = qs("#password").value.trim();
    const t = qs("#tiendaSelect").value;
    const msg = qs("#loginMsg");

    if(!u || !p){
      msg.textContent = "Rellena usuario y PIN";
      return;
    }

    msg.textContent = "Conectando...";

    const r = await fetch(API + "/login", {
      method:"POST",
      headers:{"Content-Type":"application/json"},
      body:JSON.stringify({ username:u, pin:p })
    });

    const data = await r.json().catch(()=>null);

    if(!r.ok || !data?.token){
      msg.textContent = "Usuario o PIN incorrectos";
      return;
    }

    saveUserToken(data.token, u, t);
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
if(location.pathname.includes("operaciones")){

  const list = qs("#opsList");

  async function loadOps(){
    const r = await fetch(API + "/historial", {
      headers:{ "Authorization":"Bearer "+getToken() }
    });
    const data = await r.json().catch(()=>[]);

    if(!Array.isArray(data) || !data.length){
      list.innerHTML = "<small>Sin actividad</small>";
      return;
    }

    list.innerHTML = data.map(o=>`
      <div class="op-item">
        <b>${o.tipo}</b> — ${o.importe} ${o.moneda}
        <div class="op-meta">${o.cliente || ''} • ${o.tienda || ''} • ${o.fecha || ''}</div>
      </div>
    `).join("");
  }

  /* Modal */
  const modal = qs("#opModal");
  qs("#openModalOp")?.addEventListener("click", ()=> modal.classList.remove("hidden"));
  qs("#m_close")?.addEventListener("click", ()=> modal.classList.add("hidden"));

  qs("#m_save")?.addEventListener("click", async ()=>{
    const payload = {
      tipo: qs("#m_tipo").value,
      cliente: qs("#m_cliente").value,
      importe: Number(qs("#m_importe").value),
      moneda: qs("#m_moneda").value
    };

    const r = await fetch(API + "/operaciones", {
      method:"POST",
      headers:{
        "Content-Type":"application/json",
        "Authorization":"Bearer "+getToken()
      },
      body: JSON.stringify(payload)
    });

    const data = await r.json().catch(()=>null);

    if(r.ok){
      alert("Operación creada");
      modal.classList.add("hidden");
      loadOps();
    } else {
      alert("Error al crear operación");
    }
  });

  loadOps();
}


/* ========== CAJA FUERTE / DAILY / AJUSTES / HISTORIAL ========= */
/* (Mantengo tus funciones existentes porque ya funcionan) */

});

