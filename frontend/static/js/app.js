// app.js


// Export backup: tries File System Access API, otherwise fallback to anchor download
async function exportBackup() {
  try {
    const res = await fetch('/api/backup');
    if(!res.ok){ throw new Error('Error al pedir backup: ' + res.status); }
    const data = await res.json();
    const jsonStr = JSON.stringify(data, null, 2);
    const blob = new Blob([jsonStr], {type: 'application/json'});

    // If the browser supports showSaveFilePicker (Chrome/Edge/Opera with flag), use it
    if(window.showSaveFilePicker){
      try{
        const handle = await window.showSaveFilePicker({
          suggestedName: 'eaxy_backup_' + new Date().toISOString().slice(0,19).replace(/[:T]/g,'_') + '.json',
          types: [{description: 'JSON file', accept: {'application/json': ['.json']}}]
        });
        const writable = await handle.createWritable();
        await writable.write(blob);
        await writable.close();
        alert('Backup guardado correctamente.');
        return;
      }catch(e){
        console.warn('showSaveFilePicker fallo, fallback:', e);
      }
    }
    // Fallback: create a temporary anchor to trigger download (this opens Save As dialog)
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'eaxy_backup_' + new Date().toISOString().slice(0,19).replace(/[:T]/g,'_') + '.json';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }catch(e){
    console.error(e);
    alert('No se pudo exportar el backup: ' + e.message);
  }
}

// attach to button if exists
document.addEventListener('click', function(e){
  if(e.target && e.target.id === 'export-backup'){
    e.preventDefault();
    exportBackup();
  }
});
