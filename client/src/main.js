const ROOM_ID = "oyun-odasi-1";

let socket;
let localStream;
let isMuted = false;
const peers = {};
let audioCtx;
let ytPlayer;

function onYouTubeIframeAPIReady() {
  ytPlayer = new YT.Player('yt-player', {
    height: '0',
    width: '0',
    playerVars: { autoplay: 1, controls: 0 }
  });
}

document.getElementById('join-btn').addEventListener('click', async () => {
  const username = document.getElementById('username').value.trim() || "Oyuncu";
  const serverUrl = document.getElementById('server-url').value.trim() || "http://localhost:3000";

  try {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    localStream = await navigator.mediaDevices.getUserMedia({
      video: false,
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: false
      }
    });
  } catch (err) {
    alert("Mikrofon izni alınamadı: " + err.message);
    return;
  }

  document.getElementById('login-box').style.display = 'none';
  document.getElementById('app-box').style.display = 'block';

  socket = io(serverUrl);
  socket.emit('join-room', ROOM_ID, username);

  socket.on('existing-users', (users) => {
    users.forEach(u => createPeerConnection(u.id, u.username, true));
  });

  socket.on('user-connected', (user) => {
    createPeerConnection(user.id, user.username, false);
  });

  socket.on('signal', async ({ from, username: remoteName, signal }) => {
    if (!peers[from]) createPeerConnection(from, remoteName, false);
    const pc = peers[from];

    if (signal.sdp) {
      await pc.setRemoteDescription(new RTCSessionDescription(signal.sdp));
      if (signal.sdp.type === 'offer') {
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        socket.emit('signal', { to: from, signal: { sdp: pc.localDescription } });
      }
    } else if (signal.candidate) {
      await pc.addIceCandidate(new RTCIceCandidate(signal.candidate));
    }
  });

  socket.on('sync-music', ({ videoId, title }) => {
    document.getElementById('now-playing').innerText = `Şu an çalan: ${title}`;
    if (ytPlayer && ytPlayer.loadVideoById) {
      ytPlayer.loadVideoById(videoId);
      ytPlayer.setVolume(document.getElementById('music-vol').value);
    }
  });

  socket.on('user-disconnected', (id) => {
    if (peers[id]) peers[id].close();
    delete peers[id];
    const el = document.getElementById(`user-${id}`);
    if (el) el.remove();
  });
});

document.getElementById('mute-self-btn').addEventListener('click', (e) => {
  if (!localStream) return;
  isMuted = !isMuted;
  localStream.getAudioTracks().forEach(t => t.enabled = !isMuted);
  const btn = e.target;
  btn.innerText = isMuted ? "🔇 Mikrofon Kapalı" : "🎤 Mikrofon Açık";
  btn.classList.toggle('muted', isMuted);
});

function createPeerConnection(targetId, targetName, isOffer) {
  const emptyMsg = document.getElementById('empty-msg');
  if (emptyMsg) emptyMsg.style.display = 'none';

  const pc = new RTCPeerConnection({
    iceServers: [{ urls: "stun:stun.l.google.com:19302" }]
  });
  peers[targetId] = pc;

  localStream.getTracks().forEach(track => pc.addTrack(track, localStream));

  pc.onicecandidate = (e) => {
    if (e.candidate) socket.emit('signal', { to: targetId, signal: { candidate: e.candidate } });
  };

  pc.ontrack = (e) => {
    const source = audioCtx.createMediaStreamSource(e.streams[0]);
    const gainNode = audioCtx.createGain();
    source.connect(gainNode);
    gainNode.connect(audioCtx.destination);

    const audio = new Audio();
    audio.srcObject = e.streams[0];
    audio.muted = true;
    audio.play();

    let row = document.getElementById(`user-${targetId}`);
    if (!row) {
      const list = document.getElementById('users-list');
      row = document.createElement('div');
      row.className = 'user-row';
      row.id = `user-${targetId}`;
      row.innerHTML = `
        <span>🎙️ ${targetName}</span>
        <div style="display:flex; align-items:center; gap:8px;">
          <span class="badge" id="vol-label-${targetId}">100%</span>
          <input type="range" min="0" max="2" step="0.05" value="1" class="slider" />
        </div>
      `;
      row.querySelector('input').addEventListener('input', (ev) => {
        const val = parseFloat(ev.target.value);
        gainNode.gain.value = val;
        document.getElementById(`vol-label-${targetId}`).innerText = `${Math.round(val * 100)}%`;
      });
      list.appendChild(row);
    }
  };

  if (isOffer) {
    pc.onnegotiationneeded = async () => {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      socket.emit('signal', { to: targetId, signal: { sdp: pc.localDescription } });
    };
  }
}

document.getElementById('play-btn').addEventListener('click', () => {
  const q = document.getElementById('music-query').value.trim();
  if (q && socket) socket.emit('play-music', q);
});

document.getElementById('music-vol').addEventListener('input', (e) => {
  if (ytPlayer && ytPlayer.setVolume) ytPlayer.setVolume(e.target.value);
});
