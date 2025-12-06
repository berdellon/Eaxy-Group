const API = "https://eaxy-backend.onrender.com/api";

function qs(a){ return document.querySelector(a); }

function saveUser(token, tienda){
  localStorage.setItem("token", token);
  localStorage.setItem("tienda", tienda);
}

function getToken(){
  return localStorage.getItem("token");
}

async function fetchJSON(url, options={}){
  const token = getToken();

  options.headers = options.headers || {};
  options.headers["Content-Type"] = "application/json";
  if(token) options.headers["Authorization"] = "Bearer " + token;

  const res = await fetch(url, options);
  const text = await res.text();
  let data = null;

  try { data = JSON.parse(text); } catch (_) {}

  return { ok: res.ok, data, text };
}

document.addEventListener("DOMContentLoaded", ()=>{

  /* LOGIN */
  if(qs("#loginBtn")){
    qs("#loginBtn").addEventListener("click", async ()=>{

      const u = qs("#username").value.trim();
      const p = qs("#pin").value.trim();
      const t = qs("#tiendaSelect").value;
      const msg = qs("#msg");

      if(!u || !p){ msg.textContent = "Rellena usuario y PIN"; return; }

      msg.textContent = "Conectando...";

      const r = await fetchJSON(API + "/login", {
        method: "POST",
        body: JSON.stringify({ username: u, pin: p, tienda: t })
      });

      if(!r.ok || !r.data || !r.data.token){
        msg.textContent = "Credenciales incorrectas";
        return;
      }

      saveUser(r.data.token, r.data.tienda);
      msg.textContent = "";

      window.location.href = "home.html";
    });
  }

});
