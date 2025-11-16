console.log("Eaxy JS cargado");

function login() {
    const u = document.getElementById("username").value.trim();
    const p = document.getElementById("password").value.trim();

    fetch("/api/login", {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({username: u, pin: p})
    })
    .then(r => r.json())
    .then(d => {
        if (d.ok) {
            localStorage.setItem("token", d.token);
            window.location.href = "home.html";
        } else {
            alert("Usuario o PIN incorrecto");
        }
    });
}

const loginBtn = document.getElementById("loginBtn");
if (loginBtn) loginBtn.onclick = login;

function api(path, options = {}) {
    const token = localStorage.getItem("token");
    options.headers = options.headers || {};
    options.headers["Authorization"] = "Bearer " + token;
    return fetch(path, options).then(r => r.json());
}

const logoutBtn = document.getElementById("logoutBtn");
if (logoutBtn) {
    logoutBtn.onclick = () => {
        localStorage.removeItem("token");
        window.location.href = "index.html";
    };
}
