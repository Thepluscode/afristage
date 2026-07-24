const { io } = require('socket.io-client');
const { randomUUID } = require('crypto');
const cfg = require('/tmp/bigo-cfg.json');

const s = io(cfg.ws, { transports: ['websocket'], auth: { token: cfg.token }, reconnection: true });
const lines = [
  'yooo this is fire 🔥', 'Amara sings like an angel 😍', 'where you watching from?',
  'turn UP 🎶', 'sending love from Accra 🇬🇭', 'best live on AfriStage',
  'who else is here??', '🔥🔥🔥', 'that voice!!', '🇳🇬 represent'
];

s.on('connect', () => { s.emit('room.join', { roomId: cfg.roomId }); console.log('bot connected'); });
s.on('connect_error', (e) => console.log('connect_error', e.message));

let i = 0;
setInterval(() => {
  s.emit('chat.message', { roomId: cfg.roomId, message: lines[i++ % lines.length] }, (ack) => {
    if (i <= 2) console.log('chat ack', JSON.stringify(ack));
  });
}, 3000);

setInterval(() => {
  fetch(cfg.api + '/live-rooms/' + cfg.roomId + '/gifts', {
    method: 'POST',
    headers: { authorization: 'Bearer ' + cfg.token, 'content-type': 'application/json' },
    body: JSON.stringify({ giftId: cfg.giftId, quantity: 1, idempotencyKey: randomUUID() })
  }).then((r) => console.log('gift', r.status)).catch((e) => console.log('gift err', e.message));
}, 12000);

setTimeout(() => process.exit(0), 330000);
