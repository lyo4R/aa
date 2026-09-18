(() => {
  const attach = p => {
    if (p.card.querySelector('.watch-megapot')) return;
    const label = document.createElement('label'); label.className = 'person-choice';
    label.innerHTML = '<input class="watch-megapot" type="checkbox"> Otomatik takip et (dakikada bir)';
    p.card.querySelector('.direct-import').append(label);
    label.querySelector('input').onchange = e => {
      clearInterval(p.watchTimer);
      p.watchTimer = e.target.checked ? setInterval(() => fetchMegapot(p), 60000) : null;
      if (e.target.checked) fetchMegapot(p);
    };
  };
  const addOriginal = addPerson;
  addPerson = function (name) { addOriginal(name); attach(people.at(-1)); };
  people.forEach(attach);
  fetchMegapot = async function (p) {
    const card=p.card,address=card.querySelector('.wallet-address').value.trim(),button=card.querySelector('.fetch-megapot'),msg=card.querySelector('.person-message'),name=nameOf(p);
    if(!name||!address){msg.textContent=!name?'Önce kişi etiketi yazın.':'Cüzdan adresini girin.';return}
    button.disabled=true;
    try {
      const res=await fetch(`/api/megapot/recent-buys?address=${encodeURIComponent(address)}&days=3`),data=await res.json();
      if(!res.ok) throw new Error(data.error||'Megapot verisi alınamadı.');
      const known=new Set(entries.filter(e=>e.person===name&&e.externalTicketId).map(e=>e.externalTicketId)); let added=0,base=entries.filter(e=>e.person===name).length;
      const normalizedAddress=address.toLowerCase();
      data.drawings.forEach(draw=>(draw.tickets||[]).forEach(ticket=>{if(String(ticket.walletAddress||'').toLowerCase()!==normalizedAddress)return;const externalTicketId=`${draw.drawingId}:${ticket.id}`;if(known.has(externalTicketId))return;known.add(externalTicketId);added++;entries.push({id:crypto.randomUUID(),externalTicketId,person:name,numbers:ticket.numbers,index:++base,drawingId:draw.drawingId,drawDate:draw.date,drawResult:draw.result,remoteMegapot:true})}));
      p.currentDrawingId=data.drawingId; msg.textContent=added?`${added} yeni bilet kaydedildi.`:'Yeni bilet bulunamadı.';
      const daySummary=data.drawings.sort((a,b)=>b.drawingId-a.drawingId).map((draw,index)=>{const count=entries.filter(entry=>entry.person===name&&entry.remoteMegapot&&entry.drawingId===draw.drawingId).length;return `${index===0?'Güncel çekiliş':'Önceki gün'} (#${draw.drawingId} · ${draw.date||''}): <b>${count} bilet</b>`});
      card.querySelector('.scan-report').innerHTML=`<strong>Takip özeti:</strong> ${daySummary.join(' · ')}`;
      localStorage.setItem('megapot-ticket-cache',JSON.stringify(entries));
      if(added){syncPeople();renderRecords();compare();}
    } catch(err){msg.textContent=`Hata: ${err.message}`} finally {button.disabled=false}
  };
})();
