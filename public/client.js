const socket = io();
let localStream = null;
const pcs = {};
const videoContainers = {};
let myId = null;
let currentRoom = null;
let isHost = false;
let myName = 'Guest';

// الحصول على العناصر والتأكد من وجودها قبل الاستخدام
const createBtn = document.getElementById('createBtn');
const joinBtn = document.getElementById('joinBtn');
const roomInput = document.getElementById('roomInput');
const roomIdSpan = document.getElementById('roomId');
const inviteLinkInput = document.getElementById('inviteLink');
const lobbyMsg = document.getElementById('lobbyMsg');
const lobbySection = document.getElementById('lobby');
const roomSection = document.getElementById('room');
const videosDiv = document.getElementById('videos');
const localVideo = document.getElementById('localVideo'); // هذا هو عنصر الفيديو المحلي الموجود في HTML
// عناصر المحادثة والمشاركين قد لا تكون موجودة، لذا نتحقق منها لاحقًا
const participantsList = document.getElementById('participantsList');
const chatInput = document.getElementById('chatInput');
const sendChat = document.getElementById('sendChat');
const messagesDiv = document.getElementById('messages');

const nameInput = document.getElementById('nameInput');
const joinNotify = document.getElementById('joinNotify');
const notifyText = document.getElementById('notifyText');
const notifyAccept = document.getElementById('notifyAccept');
const notifyReject = document.getElementById('notifyReject');

// تأكد من وجود عناصر الإشعار، وإلا أظهر خطأ في الـ Console
if (!joinNotify || !notifyText || !notifyAccept || !notifyReject) {
  console.error('خطأ: عناصر إشعار القبول (joinNotify) غير موجودة في الصفحة. تحقق من index.html');
}
const toggleAudioBtn = document.getElementById('toggleAudio');
const toggleVideoBtn = document.getElementById('toggleVideo');
const myNameSpan = document.getElementById('myName');
const closeRoomBtn = document.getElementById('closeRoomBtn');
const hostControls = document.getElementById('hostControls');

async function startLocalMedia(){
  try{
    localStream = await navigator.mediaDevices.getUserMedia({video:true,audio:true});
    if (localVideo) { // التحقق من وجود localVideo
        localVideo.srcObject = localStream; // ربط التدفق المحلي بالعنصر الموجود في HTML
        localVideo.style.display = ''; // التأكد من أن الفيديو المحلي ليس معطلًا عند البداية
    }
  }catch(e){
    alert('خطأ في الوصول للكاميرا/الميكروفون: ' + e.message);
    console.error('Failed to get local media:', e); // سجل الخطأ الكامل
  }
}

startLocalMedia();

socket.on('connect', ()=>{ myId = socket.id; console.log('socket id', myId); });

if (createBtn) {
  createBtn.onclick = ()=>{
    myName = nameInput.value || 'Host';
    socket.emit('create-room', ({roomId})=>{
      if (lobbyMsg) lobbyMsg.textContent = 'تم إنشاء الغرفة: ' + roomId;
      currentRoom = roomId; // أضف هذا السطر
      enterRoomUI(roomId, true);
      console.log(`Host: Created room ${roomId}. My ID: ${myId}`); // سجل إضافي
    });
  };
}

if (joinBtn) {
  joinBtn.onclick = ()=>{
    myName = nameInput.value || 'Guest';
    let value = roomInput.value.trim();
    if(!value){ if (lobbyMsg) lobbyMsg.textContent='اكتب رمز الغرفة أو رابط'; return; }
    let roomId = value.split('/').pop();
    socket.emit('join-request', { roomId, name: myName });
    if (lobbyMsg) lobbyMsg.textContent = 'تم إرسال طلب الانضمام...';
    console.log(`Guest: Sending join request to room ${roomId} as ${myName}. My ID: ${myId}`); // سجل إضافي
  };
}

let pendingRequest = null;
socket.on('join-request', ({from, name})=>{
  pendingRequest = {from, name};
  if (notifyText) notifyText.textContent = `طلب انضمام من "${name}" - قبول؟`;
  if (joinNotify) joinNotify.style.display = ''; // إظهار إشعار طلب الانضمام
  console.log(`Host: Received join request from ${name} (${from}). Displaying notification.`);
});

if (notifyAccept) {
  notifyAccept.onclick = ()=>{
    if (joinNotify) joinNotify.style.display = 'none'; // إخفاء الإشعار
    if(!pendingRequest) return;
    socket.emit('join-response', { roomId: currentRoom, targetId: pendingRequest.from, accept: true, name: myName });
    console.log(`Host: Accepted join request from ${pendingRequest.name} (${pendingRequest.from}).`);
    pendingRequest = null;
  };
}
if (notifyReject) {
  notifyReject.onclick = ()=>{
    if (joinNotify) joinNotify.style.display = 'none'; // إخفاء الإشعار
    if(!pendingRequest) return;
    socket.emit('join-response', { roomId: currentRoom, targetId: pendingRequest.from, accept: false });
    console.log(`Host: Rejected join request from ${pendingRequest.name} (${pendingRequest.from}).`);
    pendingRequest = null;
  };
}

socket.on('join-rejected', ({reason})=>{
  if (lobbyMsg) lobbyMsg.textContent = 'رفض الدخول: ' + reason;
  console.log(`Guest: Join request rejected. Reason: ${reason}`);
});

socket.on('join-accepted', async ({roomId, existing, hostId, name, names})=>{
  currentRoom = roomId;
  isHost = (hostId === myId);
  myName = name || myName;
  enterRoomUI(roomId, isHost); // هنا ينتقل الضيف إلى واجهة المستخدم الخاصة بالغرفة
  console.log(`Guest: Join accepted to room ${roomId}. Initializing UI and connections.`);
  console.log(`Guest: My ID is ${myId}, Host ID is ${hostId}`); // سجل إضافي
  console.log('Guest: Existing participants:', existing); // سجل إضافي
  console.log('Guest: Names of existing participants:', names); // سجل إضافي

    // أضف جميع المشاركين الحاليين بأسمائهم وأظهر فيديو لكل منهم
    if(Array.isArray(existing) && existing.length > 0){
      for(let i=0;i<existing.length;i++){
        addParticipantListItem(existing[i], false, names[i]);
        addParticipantVideo(existing[i], names[i]);
      }
    }
    // هذا الجزء لم يعد ضرورياً هنا بما أن الخادم سيضم الضيف إلى الغرفة
    // عند القبول، ولكن تركه لن يضر.
    socket.emit('register-in-room', {roomId, name}, (res)=>{
        if (res && res.error) console.error('Error registering in room on server:', res.error);
        else console.log('Successfully confirmed registration in room on server.');
    });
});


socket.on('new-participant', ({id, name})=>{
  console.log(`New participant ${name} (${id}) joined. Creating PeerConnection if not exists.`);
  if (id === myId) return;
  if (!pcs[id]) {
    createOfferTo(id);
  }
  addParticipantVideo(id, name);
  addParticipantListItem(id, false, name);
});

socket.on('offer', async ({ from, sdp })=>{
  console.log(`Received WebRTC offer from ${from}`);
  await ensureLocalStream();
  // تأكد أن PeerConnection لم ينشأ بعد لهذا الند
  let pc = pcs[from];
  if (!pc) {
      pc = createPeerConnection(from);
  }
  await pc.setRemoteDescription(new RTCSessionDescription(sdp));
  const answer = await pc.createAnswer();
  await pc.setLocalDescription(answer);
  socket.emit('answer', { to: from, from: myId, sdp: pc.localDescription });
  console.log(`Sent WebRTC answer to ${from}`);
});

socket.on('answer', async ({ from, sdp })=>{
  console.log(`Received WebRTC answer from ${from}`);
  const pc = pcs[from];
  if(!pc) return;
  await pc.setRemoteDescription(new RTCSessionDescription(sdp));
});

socket.on('candidate', async ({ from, candidate })=>{
  if (candidate) {
    // console.log(`Received ICE candidate from ${from}`); // هذا يمكن أن يكون كثير جداً
    const pc = pcs[from];
    if(pc) { // لا حاجة للتحقق من candidate هنا، فقد يكون null أحياناً للإشارة إلى نهاية المرشحات
      try{ await pc.addIceCandidate(new RTCIceCandidate(candidate)); }catch(e){ console.warn('Error adding ICE candidate:', e); }
    }
  }
});

socket.on('chat-message', ({message, name, time, from})=>{
  if (messagesDiv) {
    const el = document.createElement('div');
    el.textContent = `${name || from}: ${message}`;
    messagesDiv.appendChild(el);
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
  }
});

socket.on('kicked', ()=>{
  alert('تم طردك من الغرفة');
  window.location.reload();
});

socket.on('room-closed', ()=>{
  alert('المضيف أغلق الغرفة');
  window.location.reload();
});

socket.on('user-left', ({id})=>{
  console.log(`User ${id} left the room.`);
  removeParticipantVideo(id);
  removeParticipantListItem(id);
});

function enterRoomUI(roomId, hostFlag){
  if (lobbySection) lobbySection.hidden = true;
  if (roomSection) roomSection.hidden = false;
  if (roomIdSpan) roomIdSpan.textContent = roomId;
  if (inviteLinkInput) inviteLinkInput.value = location.origin + '/room/' + roomId;
  if (myNameSpan) myNameSpan.textContent = myName;
  if(hostFlag && hostControls) hostControls.hidden = false;
  
  addParticipantVideo(myId, myName); // تحديث تسمية الفيديو المحلي بالاسم الصحيح
  addParticipantListItem(myId, true, myName); // إضافة نفسي إلى قائمة المشاركين
}

async function ensureLocalStream(){
  if(!localStream) {
    await startLocalMedia();
  }
  // تأكد من أن localStream موجود بعد المحاولة
  if (!localStream) {
      console.error("Local stream is not available after startLocalMedia.");
      throw new Error("Local media stream is unavailable.");
  }
}

function createPeerConnection(peerId){
  // إذا كان هناك PeerConnection موجود لهذا الـ peerId، أعد استخدامه
  if (pcs[peerId]) {
      console.log(`Reusing existing PeerConnection for ${peerId}`);
      return pcs[peerId];
  }

  const pc = new RTCPeerConnection({ iceServers:[{urls:'stun:stun.l.google.com:19302'}] });
  pcs[peerId] = pc;
  console.log(`Created new PeerConnection for ${peerId}`);

  if(localStream) {
    localStream.getTracks().forEach(t=>pc.addTrack(t, localStream));
    console.log(`Added local stream tracks to PeerConnection for ${peerId}`);
  } else {
    console.warn(`Local stream not available when creating PeerConnection for ${peerId}.`);
  }

  const remoteVideoEl = addParticipantVideo(peerId);

  pc.onicecandidate = (e)=>{
    if(e.candidate) {
        socket.emit('candidate', { to: peerId, from: myId, candidate: e.candidate });
    } else {
        //console.log(`ICE candidate gathering complete for ${peerId}`);
    }
  };

  pc.ontrack = (e)=>{
    if (e.streams && e.streams[0]) {
        remoteVideoEl.srcObject = e.streams[0];
        console.log(`Received remote track for ${peerId} and set srcObject.`);
    }
  };

  pc.onconnectionstatechange = ()=>{
    console.log(`PeerConnection state for ${peerId}: ${pc.connectionState}`);
    if(pc.connectionState === 'failed' || pc.connectionState === 'closed') {
      console.warn(`PeerConnection for ${peerId} failed or closed. Removing video.`);
      removeParticipantVideo(peerId);
      removeParticipantListItem(peerId);
      // تأكد من إزالة PeerConnection من الـ pcs object
      if (pcs[peerId]) {
          pcs[peerId].close();
          delete pcs[peerId];
      }
    }
  };

  return pc;
}

async function createOfferTo(peerId){
  await ensureLocalStream();
  const pc = createPeerConnection(peerId);
  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);
  socket.emit('offer', { to: peerId, from: myId, sdp: pc.localDescription });
  console.log(`Sent WebRTC offer to ${peerId}`);
}

function addParticipantVideo(id, participantName = null){
  if (id === myId) {
    const myVideoBox = document.querySelector('.videoBox.self');
    if (myVideoBox) {
        myVideoBox.style.display = '';
        const labelEl = myVideoBox.querySelector('.label');
        if (labelEl) {
            labelEl.textContent = participantName ? participantName + ' (أنا)' : 'أنا';
        }
    }
    videoContainers[myId] = localVideo;
    return localVideo;
  }

  if(videoContainers[id]) {
      const existingRemoteVideoBox = document.getElementById('box-' + id);
      if (existingRemoteVideoBox) {
          existingRemoteVideoBox.style.display = '';
          const labelEl = existingRemoteVideoBox.querySelector('.label');
          if (labelEl && participantName) {
              labelEl.textContent = participantName;
          }
      }
      return videoContainers[id];
  }

  const box = document.createElement('div');
  box.className = 'videoBox';
  box.id = 'box-' + id;

  const vid = document.createElement('video');
  vid.autoplay = true;
  vid.playsInline = true;
  box.appendChild(vid);

  const label = document.createElement('div');
  label.className = 'label';
  label.textContent = participantName ? participantName : id;
  box.appendChild(label);

  const controls = document.createElement('div');
  controls.className='controls';

  const muteBtn = document.createElement('button');
  muteBtn.textContent='كتم';
  muteBtn.onclick = ()=>{
    if (vid && vid.srcObject) {
        vid.muted = !vid.muted;
        muteBtn.textContent = vid.muted ? 'إلغاء كتم' : 'كتم';
    }
  };
  controls.appendChild(muteBtn);


  const kickBtn = document.createElement('button');
  kickBtn.textContent='طرد';
  kickBtn.onclick = ()=>{
    if(!isHost) return alert('أنت لست المضيف');
    socket.emit('kick', { roomId: currentRoom, targetId: id });
  };
  if (isHost) {
      controls.appendChild(kickBtn);
  }

  box.appendChild(controls);

  if (videosDiv) {
      videosDiv.appendChild(box);
  }
  videoContainers[id] = vid;
  return vid;
}

function removeParticipantVideo(id){
  if (id === myId) {
      return;
  }
  const box = document.getElementById('box-' + id);
  if(box) box.remove();
  delete videoContainers[id];
  if(pcs[id]) { pcs[id].close(); delete pcs[id]; }
}

function addParticipantListItem(id, self=false, name=null){
  const li = document.createElement('li');
  li.id = 'p-' + id;
  li.className = 'participantItem';
  if(self){
    li.textContent = (name ? name : myName) + ' (أنا)';
  }else{
    li.textContent = name ? name : id;
  }
  if(!self && isHost){
    const btn = document.createElement('button'); btn.textContent='طرد'; btn.onclick = ()=> socket.emit('kick', { roomId: currentRoom, targetId: id });
    li.appendChild(btn);
  }
  if (participantsList) {
      participantsList.appendChild(li);
  }
}

function removeParticipantListItem(id){
  const el = document.getElementById('p-' + id);
  if(el) el.remove();
}

if (sendChat) {
  sendChat.onclick = ()=>{
    if (!chatInput || !messagesDiv) {
      console.warn('Chat elements are not available in the DOM. Cannot send message.');
      return;
    }
    const msg = chatInput.value.trim();
    if(!msg) return;
    socket.emit('chat-message', { roomId: currentRoom, message: msg, name: myName });
    chatInput.value='';
  };
} else {
    // console.warn('Send chat button (sendChat) not found in DOM. Chat feature might be disabled.');
}

if (toggleAudioBtn) {
  toggleAudioBtn.onclick = ()=>{
    if(!localStream) return;
    const audioTrack = localStream.getAudioTracks()[0];
    if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        toggleAudioBtn.textContent = audioTrack.enabled ? 'كتم/تشغيل صوتي' : 'تشغيل الصوت';
    } else {
        console.warn("لا يوجد مسار صوتي محلي للتحكم به.");
    }
  };
}
// تم تصحيح خطأ إملائي هنا
if (toggleVideoBtn) {
  toggleVideoBtn.onclick = ()=>{
    if(!localStream) return;
    const videoTrack = localStream.getVideoTracks()[0];
    if (videoTrack) {
        videoTrack.enabled = !videoTrack.enabled;
        if (localVideo) localVideo.style.display = '';
        toggleVideoBtn.textContent = videoTrack.enabled ? 'إيقاف/تشغيل كام' : 'تشغيل الكاميرا';
    } else {
        console.warn("لا يوجد مسار فيديو محلي للتحكم به.");
    }
  };
}

if (closeRoomBtn) {
  closeRoomBtn.onclick = ()=>{
    if(!confirm('هل تريد إغلاق الغرفة؟')) return;
    socket.disconnect();
    
    if (roomSection) roomSection.hidden = true;
    if (lobbySection) lobbySection.hidden = false;
    if (nameInput) nameInput.value = myName;
    if (roomIdSpan) roomIdSpan.textContent = '';
    if (inviteLinkInput) inviteLinkInput.value = '';
    if (myNameSpan) myNameSpan.textContent = '';
    if (hostControls) hostControls.hidden = true;

    const myVideoBox = document.querySelector('.videoBox.self');
    if (myVideoBox) {
      myVideoBox.style.display = 'none';
    }

    const remoteVideoBoxes = videosDiv.querySelectorAll('.videoBox:not(.self)');
    remoteVideoBoxes.forEach(box => box.remove());
    
    for (const id in videoContainers) {
        if (id !== myId) {
            delete videoContainers[id];
        }
    }
    for (const id in pcs) {
        if (id !== myId) {
            pcs[id].close();
            delete pcs[id];
        }
    }
    
    if (participantsList) participantsList.innerHTML = '';
    startLocalMedia();
  };
}

(function checkPath(){
  const parts = location.pathname.split('/');
  if(parts[1] === 'room' && parts[2]){
    if (roomInput) roomInput.value = parts[2];
  }
})();