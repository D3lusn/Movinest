const express = require('express');
const path = require('path');
const fs = require('fs');
const app = express();
const http = require('http');
const server = http.createServer(app);
const { Server } = require('socket.io');
const io = new Server(server, {
  cors: { origin: "*", methods: ["GET", "POST"] }
});

const PORT = process.env.PORT || 3000;
const rooms = new Map();
const ADMIN_PASSWORD = 'admin123';

let globalAnnouncement = { text: '', active: false };

const FEEDBACK_FILE = path.join(__dirname, 'feedback.json');
if (!fs.existsSync(FEEDBACK_FILE)) {
  fs.writeFileSync(FEEDBACK_FILE, JSON.stringify([], null, 2));
}

app.use(express.json());
app.use(express.static('public'));

// ==================== صفحات ====================
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});
app.get('/room/:roomId', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ==================== API نظرات ====================
app.get('/api/feedback', (req, res) => {
  try {
    const data = fs.readFileSync(FEEDBACK_FILE, 'utf8');
    res.json(JSON.parse(data));
  } catch (err) {
    res.status(500).json({ error: 'خطا در خواندن نظرات' });
  }
});

app.post('/api/feedback', (req, res) => {
  const { name, contact, message, age } = req.body;
  if (!name || !message) {
    return res.status(400).json({ error: 'نام و نظر الزامی است' });
  }
  const newFeedback = {
    id: Date.now(),
    name: name.trim(),
    contact: contact?.trim() || '',
    message: message.trim(),
    age: age ? parseInt(age) : null,
    createdAt: new Date().toISOString()
  };
  try {
    const data = fs.readFileSync(FEEDBACK_FILE, 'utf8');
    const feedbacks = JSON.parse(data);
    feedbacks.unshift(newFeedback);
    fs.writeFileSync(FEEDBACK_FILE, JSON.stringify(feedbacks, null, 2));
    res.status(201).json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'خطا در ذخیره نظر' });
  }
});

app.delete('/api/feedback/:id', (req, res) => {
  const id = parseInt(req.params.id);
  try {
    let data = fs.readFileSync(FEEDBACK_FILE, 'utf8');
    let feedbacks = JSON.parse(data);
    const newFeedbacks = feedbacks.filter(f => f.id !== id);
    if (feedbacks.length === newFeedbacks.length) {
      return res.status(404).json({ error: 'نظر یافت نشد' });
    }
    fs.writeFileSync(FEEDBACK_FILE, JSON.stringify(newFeedbacks, null, 2));
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'خطا در حذف نظر' });
  }
});

// ==================== Socket.IO ====================
io.on('connection', (socket) => {
  console.log(`✅ connected: ${socket.id}`);

  if (globalAnnouncement.active && globalAnnouncement.text) {
    socket.emit('global-announcement', { text: globalAnnouncement.text });
  }

  socket.on('reconnect-user', ({ roomId, oldSocketId, username }) => {
    const room = rooms.get(roomId);
    if (!room) return;
    if (room.users.has(oldSocketId)) {
      const userData = room.users.get(oldSocketId);
      room.users.delete(oldSocketId);
      userData.id = socket.id;
      room.users.set(socket.id, userData);
      socket.join(roomId);
      socket.emit('reconnect-success', { 
        videoUrl: room.videoUrl, 
        isPlaying: room.isPlaying, 
        currentTime: room.currentTime,
        isOwner: (room.ownerId === oldSocketId)
      });
      if (room.ownerId === oldSocketId) {
        room.ownerId = socket.id;
        io.to(roomId).emit('new-owner', { newOwnerId: socket.id });
      }
      sendUserList(roomId);
    }
  });

  socket.on('create-room', (username, callback) => {
    const roomId = generateRoomId();
    const reconnectId = generateReconnectId();
    rooms.set(roomId, {
      ownerId: socket.id,
      videoUrl: '',
      isPlaying: false,
      currentTime: 0,
      users: new Map([[socket.id, { id: socket.id, name: username?.trim() || 'کاربر', reconnectId }]])
    });
    socket.join(roomId);
    if (callback && typeof callback === 'function') callback({ roomId, reconnectId });
    socket.emit('you-are-owner', true);
    sendUserList(roomId);
    console.log(`🏠 Room ${roomId} created by ${username}`);
  });

  socket.on('join-room', ({ roomId, username }, callback) => {
    if (!rooms.has(roomId)) {
      if (callback && typeof callback === 'function') callback({ error: 'اتاقی با این کد وجود ندارد' });
      return;
    }
    const room = rooms.get(roomId);
    const userName = username?.trim() || 'کاربر';
    const reconnectId = generateReconnectId();
    room.users.set(socket.id, { id: socket.id, name: userName, reconnectId });
    socket.join(roomId);
    const isOwner = (room.ownerId === socket.id);
    if (callback && typeof callback === 'function') {
      callback({
        success: true,
        videoUrl: room.videoUrl,
        isPlaying: room.isPlaying,
        currentTime: room.currentTime,
        isOwner: isOwner,
        reconnectId: reconnectId
      });
    }
    socket.to(roomId).emit('user-joined', { userName, userCount: room.users.size });
    socket.emit('user-count', { count: room.users.size });
    sendUserList(roomId);
    console.log(`🚪 ${userName} joined room ${roomId}`);
  });

  socket.on('change-video', ({ roomId, videoUrl }) => {
    const room = rooms.get(roomId);
    if (!room || room.ownerId !== socket.id) return;
    room.videoUrl = videoUrl;
    room.currentTime = 0;
    room.isPlaying = false;
    io.to(roomId).emit('video-changed', { videoUrl });
  });

  socket.on('play-video', ({ roomId, currentTime }) => {
    const room = rooms.get(roomId);
    if (!room || room.ownerId !== socket.id) return;
    room.isPlaying = true;
    room.currentTime = currentTime;
    socket.to(roomId).emit('sync-play', { currentTime });
  });
  socket.on('pause-video', ({ roomId, currentTime }) => {
    const room = rooms.get(roomId);
    if (!room || room.ownerId !== socket.id) return;
    room.isPlaying = false;
    room.currentTime = currentTime;
    socket.to(roomId).emit('sync-pause', { currentTime });
  });
  socket.on('seek-video', ({ roomId, currentTime }) => {
    const room = rooms.get(roomId);
    if (!room || room.ownerId !== socket.id) return;
    room.currentTime = currentTime;
    socket.to(roomId).emit('sync-seek', { currentTime });
  });

  socket.on('chat-message', ({ roomId, message, username }) => {
    if (!message?.trim()) return;
    socket.to(roomId).emit('new-chat-message', {
      message: message.trim(),
      username: username?.trim() || 'کاربر',
      timestamp: Date.now()
    });
  });

  socket.on('kick-user', ({ roomId, targetSocketId }) => {
    const room = rooms.get(roomId);
    if (!room || room.ownerId !== socket.id) return;
    const targetSocket = io.sockets.sockets.get(targetSocketId);
    if (targetSocket) {
      targetSocket.leave(roomId);
      targetSocket.emit('kicked-from-room');
      room.users.delete(targetSocketId);
      sendUserList(roomId);
      io.to(roomId).emit('user-left', { userCount: room.users.size, userName: 'کاربر' });
    }
  });

  // پنل ادمین اصلی
  socket.on('admin-login', (password, callback) => {
    if (password === ADMIN_PASSWORD) {
      callback({ success: true });
      socket.join('admin-room');
      sendAdminStats(socket);
      socket.emit('admin-announcement-status', globalAnnouncement);
    } else {
      callback({ success: false, error: 'رمز اشتباه است' });
    }
  });
  socket.on('admin-get-stats', () => sendAdminStats(socket));
  socket.on('admin-kick-user', ({ roomId, targetSocketId }) => {
    const room = rooms.get(roomId);
    if (!room) return;
    const targetSocket = io.sockets.sockets.get(targetSocketId);
    if (targetSocket) {
      targetSocket.leave(roomId);
      targetSocket.emit('kicked-from-room');
      room.users.delete(targetSocketId);
      sendUserList(roomId);
      io.to(roomId).emit('user-left', { userCount: room.users.size, userName: 'کاربر' });
      sendAdminStatsToAll();
    }
  });
  socket.on('admin-close-room', ({ roomId }) => {
    const room = rooms.get(roomId);
    if (!room) return;
    io.to(roomId).emit('room-closed-by-admin', { message: 'اتاق توسط ادمین بسته شد' });
    for (const [userId] of room.users.entries()) {
      const userSocket = io.sockets.sockets.get(userId);
      if (userSocket) {
        userSocket.leave(roomId);
        userSocket.emit('kicked-from-room');
      }
    }
    rooms.delete(roomId);
    sendAdminStatsToAll();
  });
  socket.on('admin-set-announcement', ({ text, active }) => {
    const adminRoom = io.sockets.adapter.rooms.get('admin-room');
    if (!adminRoom || !adminRoom.has(socket.id)) return;
    globalAnnouncement = { text: text.trim(), active: active };
    if (active && text.trim()) {
      io.emit('global-announcement', { text: globalAnnouncement.text });
    } else {
      io.emit('global-announcement-clear');
    }
    io.to('admin-room').emit('admin-announcement-status', globalAnnouncement);
  });

  socket.on('disconnect', () => {
    for (const [roomId, room] of rooms.entries()) {
      if (room.users.has(socket.id)) {
        room.users.delete(socket.id);
        sendUserList(roomId);
        io.to(roomId).emit('user-left', { userCount: room.users.size, userName: 'کاربر' });
        if (room.users.size === 0) {
          rooms.delete(roomId);
        } else if (room.ownerId === socket.id) {
          const newOwnerId = room.users.keys().next().value;
          room.ownerId = newOwnerId;
          io.to(roomId).emit('new-owner', { newOwnerId });
          sendUserList(roomId);
        }
        break;
      }
    }
    console.log(`❌ disconnected: ${socket.id}`);
  });
});

function sendUserList(roomId) {
  const room = rooms.get(roomId);
  if (!room) return;
  const users = Array.from(room.users.values()).map(u => ({ id: u.id, name: u.name }));
  const count = room.users.size;
  io.to(roomId).emit('user-list', { users, ownerId: room.ownerId, count });
  io.to(roomId).emit('user-count', { count });
}
function sendAdminStats(socket) {
  const stats = getStats();
  socket.emit('admin-stats', stats);
}
function sendAdminStatsToAll() {
  const stats = getStats();
  io.to('admin-room').emit('admin-stats', stats);
}
function getStats() {
  const stats = { totalRooms: rooms.size, totalUsers: 0, roomsList: [] };
  for (const [roomId, room] of rooms.entries()) {
    const usersCount = room.users.size;
    stats.totalUsers += usersCount;
    stats.roomsList.push({
      roomId,
      ownerId: room.ownerId,
      ownerName: room.users.get(room.ownerId)?.name || 'نامشخص',
      userCount: usersCount,
      videoUrl: room.videoUrl,
      isPlaying: room.isPlaying,
      currentTime: room.currentTime,
      users: Array.from(room.users.values()).map(u => ({ id: u.id, name: u.name }))
    });
  }
  return stats;
}
function generateRoomId() {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}
function generateReconnectId() {
  return Math.random().toString(36).substring(2, 15);
}

server.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));