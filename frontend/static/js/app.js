const API = (location.origin) + '/api';
function saveUser(u){localStorage.setItem('eaxy_user',JSON.stringify(u));}
function loadUser(){try{return 
JSON.parse(localStorage.getItem('eaxy_user'));}catch(e){return null;}}
function clearUser(){localStorage.removeItem('eaxy_user'); 
window.location.href = '/';}
document.addEventListener('DOMContentLoaded',()=> {
  const loginBtn=document.getElementById('loginBtn');
  if(loginBtn){
    loginBtn.addEventListener('click',async()=>{
      const nombre=document.getElementById('username').value.trim();
      const pin=document.getElementById('password').value.trim();
      try{
        const res=await 
fetch(API+'/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({nombre,pin})});
        if(res.ok){const d=await res.json(); saveUser(d.user); 
window.location.href='/home.html';} else {alert('Usuario o PIN 
incorrecto');}
      }catch(err){alert('Error conectando con el servidor: 
'+err.message);}
    });
  }
  if(window.location.pathname.endsWith('/home.html')) {
    const user = loadUser();
    if(!user){ window.location.href = '/'; return; }
    const oficinaSelect = document.getElementById('oficina-selector');
    if(oficinaSelect) oficinaSelect.value = user.oficina || 'Barcelona';
    const exportBtn = document.getElementById('btnBackup');
    if(exportBtn){
      exportBtn.addEventListener('click', async ()=>{
        try{
          const resp = await fetch(API + '/backup');
          if(!resp.ok) throw new Error('backup failed');
          const blob = await resp.blob();
          const a = document.createElement('a');
          a.href = URL.createObjectURL(blob);
          a.download = 'eaxy_backup_' + new 
Date().toISOString().slice(0,19).replace(/[:T]/g,'_') + '.json';
          document.body.appendChild(a); a.click(); a.remove();
        }catch(e){ alert('Export failed: ' + e.message); }
      });
    }
    const logoutBtn = document.getElementById('logoutBtn');
    if(logoutBtn) logoutBtn.addEventListener('click', ()=> clearUser());
  }
});
