const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const yts = require('yt-search');
const cors = require('cors');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.static(path.join(__dirname, '../client/src')));

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*" }
});

const rooms = {};

io.on('connection', (socket) => {
  socket.on('join-room', (roomId, username) => {
    socket.join(roomId);
    if (!rooms[roomId]) rooms[roomId] = [];
    rooms[roomId] = rooms[roomId].filter(u => u.id !== socket.id);
    rooms[roomId].push({ id: socket.id, username });

    socket.to(roomId).emit('user-connected', { id: socket.id, username });
    socket.emit('existing-users', rooms[roomId].filter(u => u.id !== socket.id));

    socket.on('signal', (data) => {
      io.to(data.to).emit('signal', {
        from: socket.id,
        username: username,
        signal: data.signal
      });
    });

    socket.on('play-music', async (query) => {
      try {
        const r = await yts(query);
        if (r.videos && r.videos.length > 0) {
          const video = r.videos[0];
          io.in(roomId).emit('sync-music', {
            videoId: video.videoId,
            title: video.title,
            timestamp: Date.now()
          });
        }
      } catch (err) {
        console.error("Muzik arama hatasi:", err);
      }
    });

    socket.on('disconnect', () => {
      if (rooms[roomId]) {
        rooms[roomId] = rooms[roomId].filter(u => u.id !== socket.id);
      }
      socket.to(roomId).emit('user-disconnected', socket.id);
    });
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Sunucu ${PORT} portunda calisiyor.`));
