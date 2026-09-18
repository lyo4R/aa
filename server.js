const http = require('http'), fs = require('fs'), path = require('path');
const root = __dirname;

function type(file) { return file.endsWith('.js') ? 'application/javascript' : file.endsWith('.css') ? 'text/css' : 'text/html'; }

http.createServer(async (req, res) => {
  if (req.method === 'GET' && req.url.startsWith('/api/megapot/recent-buys')) {
    const requestUrl = new URL(req.url, 'http://localhost');
    const address = requestUrl.searchParams.get('address') || '';
    let drawingId = Number(requestUrl.searchParams.get('drawingId'));
    const days = requestUrl.searchParams.get('days') === '3' ? 3 : 1;
    if (!/^0x[a-fA-F0-9]{40}$/.test(address)) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: 'Geçerli bir cüzdan adresi girin.' }));
    }
    try {
      let currentRound = null;
      if (!Number.isInteger(drawingId) || drawingId < 1 || days === 3) {
        const stateResponse = await fetch('https://megapot.io/api/rounds/settlement-state', { headers: { Accept: 'application/json' } });
        if (!stateResponse.ok) throw new Error(`Aktif çekiliş alınamadı: ${stateResponse.status}`);
        const state = await stateResponse.json();
        currentRound = state.currentRound;
        if (!Number.isInteger(drawingId) || drawingId < 1) drawingId = Number(currentRound?.drawingId);
        if (!Number.isInteger(drawingId) || drawingId < 1) throw new Error('Aktif çekiliş kimliği bulunamadı.');
      }
      const drawingIds = Array.from({ length: days }, (_, index) => drawingId - index);
      const roundsResponse = await fetch('https://megapot.io/api/rounds', { headers: { Accept: 'application/json' } });
      const roundsData = roundsResponse.ok ? await roundsResponse.json() : { data: [] };
      const roundsById = new Map((roundsData.data || []).map(round => [Number(round.drawingId), round]));
      const drawingResults = await Promise.all(drawingIds.map(async (id, index) => {
        const upstream = await fetch(`https://megapot.io/api/wallets/${encodeURIComponent(address)}/recent-buys?drawingId=${id}`, { headers: { Accept: 'application/json' } });
        if (!upstream.ok) throw new Error(`Megapot yanıtı: ${upstream.status}`);
        const data = await upstream.json();
        const tickets = (data.tickets || []).map(ticket => {
          const normals = typeof ticket.normals === 'string' ? JSON.parse(ticket.normals) : ticket.normals;
          if (!Array.isArray(normals) || normals.length !== 5 || !Number.isInteger(ticket.bonusball) || !ticket.id) return null;
          return { id: String(ticket.id), walletAddress: ticket.walletAddress || null, numbers: [...normals, ticket.bonusball], createdAt: ticket.createdAt || null };
        }).filter(Boolean);
        const rows = tickets.map(ticket => ticket.numbers.join('-'));
        const drawTime = currentRound?.drawingTime ? new Date(new Date(`${currentRound.drawingTime}Z`).getTime() - index * 86400000) : null;
        const round = roundsById.get(id);
        let result = null;
        try {
          const normals = typeof round?.winningNormals === 'string' ? JSON.parse(round.winningNormals) : round?.winningNormals;
          if (Array.isArray(normals) && normals.length === 5 && Number.isInteger(round?.winningBonusball)) result = { normals, bonus: round.winningBonusball };
        } catch {}
        return { drawingId: id, date: drawTime ? drawTime.toISOString().slice(0, 10) : null, rows, tickets, result, username: data.username || null, address: data.recipientAddress || address };
      }));
      const rows = drawingResults.flatMap(result => result.rows);
      const data = drawingResults[0] || {};
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({
        rows,
        username: data.username || null,
        address: data.recipientAddress || address,
        returnedTickets: rows.length,
        drawingId,
        drawings: drawingResults,
        note: 'Megapot Recent buys rotası her çekiliş için en fazla 200 bilet döndürür.'
      }));
    } catch (err) {
      res.writeHead(502, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: err.message || 'Megapot verisi alınamadı.' }));
    }
  }
  const requested = req.url === '/' ? 'index.html' : req.url.slice(1);
  const full = path.join(root, requested);
  if (!full.startsWith(root) || !fs.existsSync(full)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': type(full) });
  fs.createReadStream(full).pipe(res);
}).listen(4173, () => console.log('Sunucu hazır: http://localhost:4173'));
