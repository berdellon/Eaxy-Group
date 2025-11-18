document.addEventListener("DOMContentLoaded", () => {

  const loginBtn = document.getElementById("loginBtn");
  if (loginBtn) {
    loginBtn.addEventListener("click", login);
  }

});

function login() {
  const u = document.getElementById("username").value.trim();
  const p = document.getElementById("password").value.trim();

  fetch(window.FRONTEND_API_URL + "/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: u, pin: p })
  })
  .then(r => r.json())
  .then(data => {
    if (!data.ok) {
      document.getElementById("loginMsg").innerText = "Credenciales 
incorrectas";
      return;
    }

    localStorage.setItem("token", data.token);
    window.location.href = "home.html";
  });
}
