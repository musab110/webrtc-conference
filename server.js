const express = require('express');
const https = require('https');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const socketIO = require('socket.io');
require('dotenv').config();

const PORT = process.env.PORT || 3000;

const app = express();

// التحقق من وجود ملفات الشهادات
const certPath = path.join(__dirname, 'cert');
const keyPath = path.join(certPath, 'key.pem');
const certFilePath = path.join(certPath, 'cert.pem');

if (!fs.existsSync(keyPath) || !fs.existsSync(certFilePath)) {
    console.error('❌ ملفات الشهادات غير موجودة!');
    console.error('🔧 يرجى تشغيل: npm run setup');
    process.exit(1);
}

// إعدادات HTTPS مع OpenSSL 3.5.3
const options = {
    key: fs.readFileSync(keyPath),
    cert: fs.readFileSync(certFilePath),
    // إعدادات أمان إضافية
    secureProtocol: 'TLSv1_2_method',
    ciphers: 'ECDHE-RSA-AES128-GCM-SHA256:ECDHE-RSA-AES256-GCM-SHA384',
    honorCipherOrder: true
};

const server = https.createServer(options, app);
const io = socketIO(server, {
    cors: {
        origin: "*", // للسماح بأي مصدر أثناء التطوير فقط
        methods: ["GET", "POST"]
    }
});

app.use(express.static('public'));

const rooms = {};

io.on('connection', (socket) => {
  console.log('Client connected', socket.id);

  socket.on('create-room', (cb) => {
    const roomId = uuidv4().slice(0,8);
    rooms[roomId] = { hostId: socket.id, participants: new Set() };
    cb({ roomId });
  });

  socket.on('join-request', ({roomId, name}) => {
    const room = rooms[roomId];
    if(!room) {
      socket.emit('join-error', 'Room not found');
      return;
    }
    const hostId = room.hostId;
    io.to(hostId).emit('join-request', { from: socket.id, name });
  });

  // حفظ أسماء المشاركين
  if(!app.locals.userNames) app.locals.userNames = {};
  socket.on('join-response', ({roomId, targetId, accept, name}) => {
    const room = rooms[roomId];
    if(!room) return;
    if(accept) {
      room.participants.add(targetId);
      app.locals.userNames[targetId] = name;
      const existing = Array.from(room.participants).filter(id => id !== targetId);
      const names = existing.map(id => app.locals.userNames[id] || id);
      io.to(targetId).emit('join-accepted', { roomId, existing, hostId: room.hostId, name, names });
      // إشعار جميع المشاركين (بما فيهم الضيف) بوجود كل مشارك آخر
      existing.forEach(id => {
        io.to(id).emit('new-participant', { id: targetId, name });
        io.to(targetId).emit('new-participant', { id, name: app.locals.userNames[id] });
      });
    } else {
      io.to(targetId).emit('join-rejected', { reason: 'Host rejected the request' });
    }
  });

  socket.on('register-in-room', ({roomId, name}, cb) => {
    const room = rooms[roomId];
    if(!room) { cb({ error: 'room not found' }); return; }
    room.participants.add(socket.id);
    app.locals.userNames[socket.id] = name;
    socket.join(roomId);
    cb({ ok: true });
  });

  socket.on('leave-room', ({roomId}) => {
    const room = rooms[roomId];
    if(!room) return;
    room.participants.delete(socket.id);
    socket.leave(roomId);
    io.to(room.hostId).emit('participant-left', { id: socket.id });
    io.to(roomId).emit('user-left', { id: socket.id });
  });

  socket.on('offer', (data) => {
    io.to(data.to).emit('offer', data);
  });

  socket.on('answer', (data) => {
    io.to(data.to).emit('answer', data);
  });

  socket.on('candidate', (data) => {
    io.to(data.to).emit('candidate', data);
  });

  socket.on('chat-message', ({roomId, message, name}) => {
    io.to(roomId).emit('chat-message', { message, name, from: socket.id, time: Date.now() });
  });

  socket.on('kick', ({roomId, targetId}) => {
    const room = rooms[roomId];
    if(!room) return;
    if(socket.id !== room.hostId) return;
    room.participants.delete(targetId);
    io.to(targetId).emit('kicked');
    io.to(roomId).emit('user-left', { id: targetId });
  });

  socket.on('disconnect', () => {
    for(const [roomId, room] of Object.entries(rooms)) {
      if(room.hostId === socket.id) {
        for(const p of room.participants) {
          io.to(p).emit('room-closed');
        }
        delete rooms[roomId];
      } else if(room.participants.has(socket.id)) {
        room.participants.delete(socket.id);
        io.to(room.hostId).emit('participant-left', { id: socket.id });
        io.to(roomId).emit('user-left', { id: socket.id });
      }
    }
    console.log('Client disconnected', socket.id);
  });
});

// معالجة الأخطاء
server.on('error', (error) => {
    if (error.code === 'EADDRINUSE') {
        console.error(`❌ المنفذ ${PORT} مستخدم بالفعل`);
        console.log('🔧 جرب إيقاف الخادم الآخر أو استخدم منفذ مختلف');
    } else {
        console.error('❌ خطأ في الخادم:', error.message);
    }
    process.exit(1);
});

// معالجة إيقاف الخادم
process.on('SIGINT', () => {
    console.log('\n🛑 إيقاف الخادم...');
    server.close(() => {
        console.log('✅ تم إيقاف الخادم بنجاح');
        process.exit(0);
    });
});

server.listen(PORT, () => {
    const { networkInterfaces } = require('os');
    const nets = networkInterfaces();
    const addresses = [];

    for (const name of Object.keys(nets)) {
        for (const net of nets[name]) {
            if (net.family === 'IPv4' && !net.internal) {
                addresses.push(net.address);
            }
        }
    }

    console.log('\n' + '='.repeat(60));
    console.log('🚀 خادم WebRTC Conference يعمل بنجاح!');
    console.log(`📡 العنوان المحلي: https://localhost:${PORT}`);
    console.log(`🌐 عناوين الشبكة: ${addresses.join(', ')}:${PORT}`);
    console.log(`🔐 HTTPS: مفعل مع OpenSSL 3.5.3`);
    console.log(`📁 المجلد العام: ${path.join(__dirname, 'public')}`);
    console.log(`📄 الشهادات: ${certPath}`);
    console.log('='.repeat(60));
    console.log('💡 نصائح للاتصال من الهاتف:');
    console.log(`   - من الهاتف: https://${addresses[0] || '192.168.1.100'}:${PORT}`);
    console.log('   - قد يظهر تحذير أمان (طبيعي للشهادات الذاتية)');
    console.log('   - انقر على "متقدم" ← "متابعة إلى [IP]"');
    console.log('   - لمعرفة IP: شغّل get-ip.bat');
    console.log('   - لإيقاف الخادم: اضغط Ctrl+C');
    console.log('='.repeat(60));
});

