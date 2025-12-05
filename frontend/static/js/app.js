const API = window.FRONTEND_API_URL || (location.origin + "/api");

function qs(s) { return document.querySelector(s); }

function saveUserToken(token, username) {
  localStorage.setItem("eaxy_user", JSON.stringify({ token, username }));
  localStorage.setItem("token", token);
}

function clearUser() {
  localStorage.removeItem("eaxy_user");
  localStorage.removeItem("token");
}

function getToken() {
  try {
    const data = JSON.parse(localStorage.getItem("eaxy_user"));
    return data?.token || localStorage.getItem("token");
  } catch {
    return localStorage.getItem("token");
  }
}

async function fetchJSON(url, opts = {}) {
  const token = getToken();
  opts.headers = opts.headers || {};
  if (token) opts.headers["Authorization"] = "Bearer " + token;

  const res = await fetch(url, opts);
  const text = await res.text();

  let data = null;
  try { data = JSON.parse(text); } catch {}

  return { ok: res.ok, status: res.status, data, raw: text };
}

document.addEventListener("DOMContentLoaded", () => {

  // LOGIN
  if (qs("#loginBtn")) {
    qs("#loginBtn").addEventListener("click", async () => {
      const u = qs("#username").value.trim();
      const p = qs("#password").value.trim();
      const msg = qs("#loginMsg");

      if (!u || !p) {
        msg.textContent = "Rellena usuario y PIN";
        return;
      }

      msg.textContent = "Conectando...";

      const r = await fetchJSON(API + "/login", {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({ username: u, pin: p })
      });

      if (!r.ok || !r.data?.token) {
        msg.textContent = "Usuario o PIN incorrectos";
        return;
      }

      saveUserToken(r.data.token, u);
      window.location.href = "home.html";
    });
  }

});
