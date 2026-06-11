let socket = io();
let currentRoomId = null;
let player = null;
let ytPlayer = null;
let isYouTube = false;
let ignoreSync = false;
let isOwner = false;
let myUsername = 'کاربر';
let currentVideoUrl = '';
let myReconnectId = null;
let resizeObserver = null;
let roomIdFromUrl = null;

// DOM elements
const landingPage = document.getElementById('landing-page');
const roomPage = document.getElementById('room-page');
const createBtn = document.getElementById('create-room-btn');
const joinBtn = document.getElementById('join-room-btn');
const joinInput = document.getElementById('join-room-input');
const usernameInput = document.getElementById('username-input');
const tempUsernameInput = document.getElementById('temp-username-input');
const confirmUsernameBtn = document.getElementById('confirm-username-btn');
const usernamePromptDiv = document.getElementById('username-prompt');
const defaultButtonsDiv = document.getElementById('default-buttons');
const roomCodeSpan = document.getElementById('room-code');
const userCountSpan = document.getElementById('user-count');
const copyCodeBtn = document.getElementById('copy-room-code');
const leaveBtn = document.getElementById('leave-room-btn');
const videoUrlInput = document.getElementById('video-url');
const loadVideoBtn = document.getElementById('load-video');
const chatInput = document.getElementById('chat-input');
const sendChatBtn = document.getElementById('send-chat');
const chatMessagesDiv = document.getElementById('chat-messages');
const adminPanelBtn = document.getElementById('admin-panel-btn');
const adminModal = document.getElementById('admin-modal');
const closeAdminModal = document.getElementById('close-admin-modal');
const adminUsersList = document.getElementById('admin-users-list');
const adminForceSeek = document.getElementById('admin-force-seek');
const adminForceSync = document.getElementById('admin-force-sync');
const adminSeekTime = document.getElementById('admin-seek-time');
const adminRefreshUsers = document.getElementById('admin-refresh-users');
const adminUserCountSpan = document.getElementById('admin-user-count');
const videoWrapper = document.getElementById('video-wrapper');
const footerCta = document.getElementById('footer-cta');

// ================ مودال اعلان سراسری ================
let announcementModal = document.getElementById('announcement-modal');
if (!announcementModal) {
    const modalHTML = `
    <div id="announcement-modal" class="modal-overlay" style="display:none; z-index:3000;">
        <div class="modal-content glass-card" style="max-width: 400px; text-align: center;">
            <div class="modal-header" style="justify-content: center;">
                <h3><i class="fas fa-bullhorn"></i> اعلان مهم</h3>
            </div>
            <div class="modal-body">
                <p id="announcement-message" style="font-size: 1.1rem; line-height: 1.5; margin-bottom: 20px;"></p>
                <button id="close-announcement-btn" class="btn-primary">متوجه شدم</button>
            </div>
        </div>
    </div>`;
    document.body.insertAdjacentHTML('beforeend', modalHTML);
    announcementModal = document.getElementById('announcement-modal');
}
const announcementMessage = document.getElementById('announcement-message');
const closeAnnouncementBtn = document.getElementById('close-announcement-btn');
function showAnnouncement(text) {
    if (announcementMessage && announcementModal) {
        announcementMessage.innerText = text;
        announcementModal.style.display = 'flex';
    }
}
if (closeAnnouncementBtn) closeAnnouncementBtn.onclick = () => { if (announcementModal) announcementModal.style.display = 'none'; };

socket.on('global-announcement', ({ text }) => {
    const isOnLandingPage = landingPage.style.display !== 'none';
    const key = `seen_announcement_${text}`;
    if (isOnLandingPage && !localStorage.getItem(key)) {
        showAnnouncement(text);
        localStorage.setItem(key, 'true');
    }
});
socket.on('global-announcement-clear', () => { if (announcementModal) announcementModal.style.display = 'none'; });

// ================ نمایش/عدم نمایش بخش CTA در فوتر ================
function toggleFooterCta() {
    if (footerCta) {
        const isLandingVisible = landingPage.style.display !== 'none';
        footerCta.style.display = isLandingVisible ? 'flex' : 'none';
    }
}

// ================ توابع نمایش ================
function showDefaultButtons() {
    defaultButtonsDiv.style.display = 'block';
    usernamePromptDiv.style.display = 'none';
    if (createBtn) createBtn.disabled = false;
    if (joinBtn) joinBtn.disabled = false;
}
function showUsernamePrompt() {
    defaultButtonsDiv.style.display = 'none';
    usernamePromptDiv.style.display = 'block';
}
function checkDirectRoomLink() {
    const path = window.location.pathname;
    const match = path.match(/^\/room\/([A-Z0-9]+)$/i);
    if (match && match[1]) {
        roomIdFromUrl = match[1].toUpperCase();
        showUsernamePrompt();
    } else {
        showDefaultButtons();
    }
}
document.addEventListener('DOMContentLoaded', () => {
    checkDirectRoomLink();
    toggleFooterCta();
});
socket.on('connect', () => {
    if (currentRoomId && myReconnectId) socket.emit('reconnect-user', { roomId: currentRoomId, oldSocketId: myReconnectId, username: myUsername });
});

// ================ توابع کمکی (Notification, Player, ...) ================
function showNotification(msg, type='info') {
    const d = document.createElement('div');
    d.innerHTML = `<i class="fas ${type==='error'?'fa-exclamation-circle':'fa-info-circle'}"></i> ${msg}`;
    d.style.cssText = `position:fixed;top:20px;right:20px;background:${type==='error'?'#e74c3c':'#2ecc71'};color:white;padding:12px 20px;border-radius:40px;z-index:3000;backdrop-filter:blur(8px);box-shadow:0 4px 12px rgba(0,0,0,0.3);`;
    document.body.appendChild(d);
    setTimeout(()=>d.remove(),3000);
}
function isYouTubeLink(u){return /^(https?:\/\/)?(www\.)?(youtube\.com|youtu\.be)\/.+$/.test(u);}
function extractYouTubeId(u){const m=u.match(/^.*((youtu.be\/)|(v\/)|(\/u\/\w\/)|(embed\/)|(watch\?))\??v?=?([^#&?]*).*/);return m&&m[7].length===11?m[7]:'';}
function getMimeType(u){const a=u.toLowerCase();if(a.endsWith('.mp4'))return'video/mp4';if(a.endsWith('.webm'))return'video/webm';if(a.endsWith('.ogg'))return'video/ogg';if(a.includes('.m3u8'))return'application/x-mpegURL';return'video/mp4';}
function ensureHttps(u){return u&&u.startsWith('http://')?u.replace('http://','https://'):u;}
function copyRoomCode(){const c=roomCodeSpan.innerText;if(!c)return;if(navigator.clipboard&&navigator.clipboard.writeText)navigator.clipboard.writeText(c).then(()=>showNotification('✅ کد کپی شد')).catch(()=>fallbackCopy(c));else fallbackCopy(c);}
function fallbackCopy(t){const ta=document.createElement('textarea');ta.value=t;document.body.appendChild(ta);ta.select();document.execCommand('copy');document.body.removeChild(ta);showNotification('✅ کد کپی شد');}
function destroyPlayer(){if(player){player.dispose();player=null;}if(ytPlayer){ytPlayer.destroy();ytPlayer=null;}if(resizeObserver){resizeObserver.disconnect();resizeObserver=null;}isYouTube=false;}

function initPlayer(url, ct = 0, autoplay = false) {
    destroyPlayer();
    if (!url) return false;
    url = ensureHttps(url);
    currentVideoUrl = url;
    if (videoWrapper) {
        if (resizeObserver) resizeObserver.disconnect();
        resizeObserver = new ResizeObserver(() => {
            if (isYouTube && ytPlayer && ytPlayer.getIframe) {
                const iframe = ytPlayer.getIframe();
                if (iframe) { iframe.style.width = '100%'; iframe.style.height = '100%'; }
            } else if (player) {
                player.fluid(true);
                player.dimensions(videoWrapper.clientWidth, videoWrapper.clientHeight);
            }
        });
        resizeObserver.observe(videoWrapper);
    }
    if (isYouTubeLink(url)) {
        isYouTube = true;
        const vid = extractYouTubeId(url);
        if (!vid) { showNotification('❌ لینک یوتیوب نامعتبر', 'error'); return false; }
        const container = document.getElementById('player-container');
        container.innerHTML = '<div id="youtube-iframe" style="width:100%; height:100%;"></div>';
        if (typeof YT === 'undefined') { showNotification('در حال بارگذاری پلیر یوتیوب، لطفاً صفحه را رفرش کنید', 'error'); return false; }
        ytPlayer = new YT.Player('youtube-iframe', {
            videoId: vid, playerVars: { controls: isOwner ? 1 : 0, modestbranding: 1, rel: 0, start: ct, autoplay: autoplay ? 1 : 0, playsinline: 1 },
            events: {
                onReady: e => { if (ct > 0) e.target.seekTo(ct, true); if (!autoplay) e.target.pauseVideo(); const ifr = e.target.getIframe(); if (ifr) { ifr.style.width = '100%'; ifr.style.height = '100%'; } },
                onStateChange: e => { if (isOwner && !ignoreSync) onYouTubeStateChange(e); },
                onError: () => showNotification('خطا در پخش یوتیوب', 'error')
            }
        });
        return true;
    } else {
        isYouTube = false;
        const container = document.getElementById('player-container');
        container.innerHTML = '<video id="video-player" class="video-js vjs-default-skin" preload="auto" style="width:100%; height:100%;"></video>';
        const isHLS = url.includes('.m3u8');
        const isMP4 = url.endsWith('.mp4') || url.includes('.mp4');
        try {
            player = videojs('video-player', {
                controls: isOwner, fluid: true, techOrder: ['html5'],
                html5: { nativeControlsForTouch: true, hls: { enableLowInitialPlaylist: true, overrideNative: /iPhone|iPad|iPod/i.test(navigator.userAgent) && isHLS } },
                sources: [{ src: url, type: getMimeType(url) }], autoplay: autoplay, playsinline: true
            });
            player.ready(() => { if (ct > 0) player.currentTime(ct); if (autoplay) player.play().catch(e => console.warn); if (isOwner) attachVideoJSEvents(); player.dimensions(videoWrapper.clientWidth, videoWrapper.clientHeight); });
            player.on('error', () => {
                const err = player.error();
                let msg = '❌ خطا در پخش ویدیو. ';
                if (err && err.code === 4) msg += 'لینک معتبر نیست (404).';
                else if (err && err.code === 2) msg += 'فرمت پشتیبانی نمی‌شود. از MP4 یا HLS استفاده کنید.';
                else msg += 'ممکن است لینک روی موبایل کار نکند.';
                showNotification(msg, 'error');
                if (isMP4) container.innerHTML = `<video controls style="width:100%; height:100%;" ${autoplay ? 'autoplay' : ''} playsinline><source src="${url}" type="video/mp4"></video>`;
            });
            return true;
        } catch (e) { showNotification('پلیر ویدیو بارگذاری نشد', 'error'); return false; }
    }
}
function onYouTubeStateChange(e){if(!isOwner||ignoreSync)return;const state=e.data;const ct=ytPlayer.getCurrentTime();if(state===YT.PlayerState.PLAYING)socket.emit('play-video',{roomId:currentRoomId,currentTime:ct});else if(state===YT.PlayerState.PAUSED)socket.emit('pause-video',{roomId:currentRoomId,currentTime:ct});}
function attachVideoJSEvents(){if(!player)return;player.on('play',()=>{if(!ignoreSync&&isOwner)socket.emit('play-video',{roomId:currentRoomId,currentTime:player.currentTime()});});player.on('pause',()=>{if(!ignoreSync&&isOwner)socket.emit('pause-video',{roomId:currentRoomId,currentTime:player.currentTime()});});player.on('seeked',()=>{if(!ignoreSync&&isOwner)socket.emit('seek-video',{roomId:currentRoomId,currentTime:player.currentTime()});});}

// ================ رویدادهای سوکت ================
socket.on('reconnect-success',({videoUrl,isPlaying,currentTime,isOwner:ownerStatus})=>{isOwner=ownerStatus;if(isOwner)adminPanelBtn.style.display='flex';if(videoUrl){videoUrlInput.value=videoUrl;initPlayer(videoUrl,currentTime,isPlaying);}showNotification('اتصال مجدد برقرار شد','info');});
socket.on('sync-play',({currentTime})=>{ignoreSync=true;if(isYouTube&&ytPlayer){ytPlayer.seekTo(currentTime,true);ytPlayer.playVideo();}else if(player){player.currentTime(currentTime);player.play().catch(e=>{});}setTimeout(()=>ignoreSync=false,500);});
socket.on('sync-pause',({currentTime})=>{ignoreSync=true;if(isYouTube&&ytPlayer){ytPlayer.seekTo(currentTime,true);ytPlayer.pauseVideo();}else if(player){player.currentTime(currentTime);player.pause();}setTimeout(()=>ignoreSync=false,500);});
socket.on('sync-seek',({currentTime})=>{ignoreSync=true;if(isYouTube&&ytPlayer)ytPlayer.seekTo(currentTime,true);else if(player)player.currentTime(currentTime);setTimeout(()=>ignoreSync=false,500);});
socket.on('video-changed',({videoUrl})=>{if(videoUrl===currentVideoUrl)return;videoUrlInput.value=videoUrl;initPlayer(videoUrl,0,false);showNotification('ویدیو توسط ادمین تغییر کرد');});
socket.on('user-count',({count})=>{userCountSpan.innerText=count;if(adminUserCountSpan)adminUserCountSpan.innerText=count;});
socket.on('user-joined',({userName,userCount})=>{addChatMessage('🟢 سیستم',`${userName} به اتاق پیوست (${userCount} نفر)`,'#2ecc71');userCountSpan.innerText=userCount;if(adminUserCountSpan)adminUserCountSpan.innerText=userCount;});
socket.on('user-left',({userCount,userName})=>{addChatMessage('🔴 سیستم',`${userName||'یک کاربر'} خارج شد (${userCount} نفر)`,'#e74c3c');userCountSpan.innerText=userCount;if(adminUserCountSpan)adminUserCountSpan.innerText=userCount;});
socket.on('new-chat-message',({message,username})=>{addChatMessage(username,message,'#ddd',false);});
socket.on('user-list',({users,ownerId,count})=>{updateUserList(users,ownerId);userCountSpan.innerText=count;if(adminUserCountSpan)adminUserCountSpan.innerText=count;});
socket.on('you-are-owner',()=>{isOwner=true;adminPanelBtn.style.display='flex';loadVideoBtn.innerHTML='<i class="fas fa-play-circle"></i> بارگذاری (ادمین)';if(player)player.controls(true);if(ytPlayer&&ytPlayer.setOption)ytPlayer.setOption('controls',1);addChatMessage('👑 سیستم','شما مالک اتاق هستید. فقط شما فیلم را کنترل می‌کنید.','#f39c12');});
socket.on('new-owner',({newOwnerId})=>{if(socket.id===newOwnerId){isOwner=true;adminPanelBtn.style.display='flex';loadVideoBtn.innerHTML='<i class="fas fa-play-circle"></i> بارگذاری (ادمین)';if(player)player.controls(true);addChatMessage('👑 سیستم','مالکیت اتاق به شما منتقل شد.','#f39c12');}});
socket.on('kicked-from-room',()=>{showNotification('⛔ شما توسط ادمین اخراج شدید','error');leaveRoom();});
socket.on('room-closed-by-admin',()=>{showNotification('اتاق توسط ادمین اصلی بسته شد','error');leaveRoom();});

function addChatMessage(username,message,color='#ddd',isOwn=false){const div=document.createElement('div');div.className=`chat-message ${isOwn?'own':''}`;const time=new Date().toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'});div.innerHTML=`<div class="sender" style="color:${color};">${escapeHtml(username)}</div><div class="text">${escapeHtml(message)}</div><div class="time">${time}</div>`;chatMessagesDiv.appendChild(div);chatMessagesDiv.scrollTop=chatMessagesDiv.scrollHeight;}
function escapeHtml(str){return str.replace(/[&<>]/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[m]));}
function updateUserList(users,ownerId){if(!adminUsersList)return;adminUsersList.innerHTML='<strong><i class="fas fa-users"></i> کاربران آنلاین:</strong><br>';users.forEach(u=>{const isOwnerUser=(u.id===ownerId);adminUsersList.innerHTML+=`<div class="user-item"><span>${escapeHtml(u.name)} ${isOwnerUser?'👑':''}</span>${(isOwner&&u.id!==socket.id)?`<button class="kick-user-btn" data-id="${u.id}"><i class="fas fa-ban"></i> اخراج</button>`:''}</div>`;});document.querySelectorAll('.kick-user-btn').forEach(btn=>{btn.onclick=(e)=>{e.stopPropagation();const targetId=btn.getAttribute('data-id');if(targetId)socket.emit('kick-user',{roomId:currentRoomId,targetSocketId:targetId});};});}
function leaveRoom(){destroyPlayer();currentRoomId=null;isOwner=false;myReconnectId=null;adminPanelBtn.style.display='none';landingPage.style.display='flex';roomPage.style.display='none';socket.disconnect();socket.connect();window.history.pushState({}, '', '/'); toggleFooterCta();}
function joinRoomWithUsername(roomId, username) {
    myUsername = username;
    socket.emit('join-room', { roomId, username: myUsername }, (response) => {
        if (response.error) { showNotification(response.error, 'error'); if (roomIdFromUrl) { showDefaultButtons(); roomIdFromUrl = null; window.history.pushState({}, '', '/'); toggleFooterCta(); } return; }
        currentRoomId = roomId; myReconnectId = response.reconnectId; isOwner = response.isOwner || false;
        joinRoomUI(roomId, response.videoUrl, response.isPlaying, response.currentTime);
        if (isOwner) adminPanelBtn.style.display = 'flex';
        toggleFooterCta();
    });
}
function createRoomWithUsername(username) {
    myUsername = username;
    socket.emit('create-room', myUsername, (response) => {
        currentRoomId = response.roomId; myReconnectId = response.reconnectId;
        window.history.pushState({}, '', `/room/${currentRoomId}`);
        joinRoomUI(currentRoomId);
        toggleFooterCta();
    });
}
function joinRoomUI(roomId, initialVideoUrl='', isPlaying=false, currentTime=0){
    landingPage.style.display='none'; roomPage.style.display='block'; roomCodeSpan.innerText=roomId;
    if(initialVideoUrl){ videoUrlInput.value=initialVideoUrl; initPlayer(initialVideoUrl,currentTime,isPlaying); } else destroyPlayer();
    if (window.location.pathname !== `/room/${roomId}`) window.history.pushState({}, '', `/room/${roomId}`);
}

// ================ رویدادهای دکمه‌ها ================
confirmUsernameBtn.onclick = () => {
    const username = tempUsernameInput.value.trim();
    if (!username) return showNotification('لطفاً نام کاربری خود را وارد کنید', 'error');
    if (username.length < 3) return showNotification('نام کاربری باید حداقل ۳ کاراکتر باشد', 'error');
    if (roomIdFromUrl) joinRoomWithUsername(roomIdFromUrl, username);
    else createRoomWithUsername(username);
};
createBtn.onclick = () => {
    const username = usernameInput.value.trim();
    if (!username) return showNotification('لطفاً نام کاربری خود را وارد کنید', 'error');
    if (username.length < 3) return showNotification('نام کاربری باید حداقل ۳ کاراکتر باشد', 'error');
    createRoomWithUsername(username);
};
joinBtn.onclick = () => {
    const roomId = joinInput.value.trim().toUpperCase();
    if (!roomId) return showNotification('لطفاً کد اتاق را وارد کنید', 'error');
    const username = usernameInput.value.trim();
    if (!username) return showNotification('لطفاً نام کاربری خود را وارد کنید', 'error');
    if (username.length < 3) return showNotification('نام کاربری باید حداقل ۳ کاراکتر باشد', 'error');
    joinRoomWithUsername(roomId, username);
};
loadVideoBtn.onclick=()=>{if(!isOwner)return;let newUrl=videoUrlInput.value.trim();if(!newUrl)return;newUrl=ensureHttps(newUrl);videoUrlInput.value=newUrl;socket.emit('change-video',{roomId:currentRoomId,videoUrl:newUrl});initPlayer(newUrl,0,true);showNotification('ویدیو بارگذاری شد');};
copyCodeBtn.onclick=copyRoomCode; leaveBtn.onclick=leaveRoom;
sendChatBtn.onclick=()=>{const msg=chatInput.value.trim();if(!msg)return;addChatMessage(myUsername,msg,'#6c5ce7',true);socket.emit('chat-message',{roomId:currentRoomId,message:msg,username:myUsername});chatInput.value='';};
adminPanelBtn.onclick=()=>{adminModal.style.display='flex';};
closeAdminModal.onclick=()=>{adminModal.style.display='none';};
adminRefreshUsers.onclick=()=>{showNotification('لیست کاربران بروزرسانی شد');};
adminForceSeek.onclick=()=>{const sec=parseFloat(adminSeekTime.value);if(isNaN(sec)){showNotification('زمان معتبر وارد کنید','error');return;}if(isYouTube&&ytPlayer)ytPlayer.seekTo(sec,true);else if(player)player.currentTime(sec);socket.emit('seek-video',{roomId:currentRoomId,currentTime:sec});adminModal.style.display='none';showNotification('همه کاربران به زمان مورد نظر رفتند');};
adminForceSync.onclick=()=>{const curTime=isYouTube?ytPlayer?.getCurrentTime():player?.currentTime();if(curTime!==undefined)socket.emit('seek-video',{roomId:currentRoomId,currentTime:curTime});adminModal.style.display='none';showNotification('همگام‌سازی مجدد انجام شد');};
window.onclick = (e) => { if (e.target === adminModal) adminModal.style.display = 'none'; };

// ================ فرم ثبت نظر (رفع خطای شبکه) ================
const feedbackModal = document.getElementById('feedback-modal');
const openFeedbackBtn = document.getElementById('open-feedback-btn');
const closeFeedbackBtns = document.querySelectorAll('.close-feedback-modal');
const feedbackForm = document.getElementById('feedback-form');

function openFeedbackModal() { if (feedbackModal) feedbackModal.style.display = 'flex'; }
function closeFeedbackModal() { if (feedbackModal) feedbackModal.style.display = 'none'; }

if (openFeedbackBtn) openFeedbackBtn.onclick = openFeedbackModal;
closeFeedbackBtns.forEach(btn => btn.onclick = closeFeedbackModal);
window.onclick = function(e) {
    if (e.target === feedbackModal) closeFeedbackModal();
    if (e.target === adminModal) adminModal.style.display = 'none';
};

if (feedbackForm) {
    feedbackForm.onsubmit = async (e) => {
        e.preventDefault();
        
        const name = document.getElementById('fb-name').value.trim();
        const contact = document.getElementById('fb-contact').value.trim();
        const age = document.getElementById('fb-age').value.trim();
        const message = document.getElementById('fb-message').value.trim();
        
        if (!name || !message) {
            showNotification('لطفاً نام و نظر خود را وارد کنید', 'error');
            return;
        }
        
        const submitBtn = feedbackForm.querySelector('button[type="submit"]');
        const originalText = submitBtn.innerText;
        submitBtn.innerText = 'در حال ارسال...';
        submitBtn.disabled = true;
        
        try {
            const response = await fetch('/api/feedback', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name, contact, message, age: age || null })
            });
            
            const result = await response.json();
            
            if (response.ok && result.success) {
                showNotification('✅ نظر شما با موفقیت ثبت شد. سپاسگزاریم!', 'info');
                feedbackForm.reset();
                closeFeedbackModal();
            } else {
                showNotification(result.error || '❌ خطا در ثبت نظر. لطفاً دوباره تلاش کنید', 'error');
            }
        } catch (err) {
            console.error('Fetch error:', err);
            showNotification('❌ خطای شبکه. لطفاً اتصال خود را بررسی کنید', 'error');
        } finally {
            submitBtn.innerText = originalText;
            submitBtn.disabled = false;
        }
    };
}

// ================ دکمه ساخت اتاق در فوتر ================
const footerCreateBtn = document.getElementById('footer-create-room-btn');
function triggerCreateRoomFlow() {
    if (currentRoomId) {
        leaveRoom();
        setTimeout(() => { if (createBtn) createBtn.click(); }, 500);
    } else {
        if (createBtn) createBtn.click();
    }
}
if (footerCreateBtn) footerCreateBtn.onclick = triggerCreateRoomFlow;

// ================ ذخیره وضعیت در sessionStorage ================
window.addEventListener('beforeunload', () => {
    if (currentRoomId && myReconnectId) sessionStorage.setItem('watchparty_room', JSON.stringify({ roomId: currentRoomId, reconnectId: myReconnectId, username: myUsername, isOwner }));
});
const saved = sessionStorage.getItem('watchparty_room');
if (saved) {
    try {
        const { roomId, reconnectId, username, isOwner: savedOwner } = JSON.parse(saved);
        if (roomId && reconnectId) {
            currentRoomId = roomId; myReconnectId = reconnectId; myUsername = username; isOwner = savedOwner;
            socket.emit('reconnect-user', { roomId: currentRoomId, oldSocketId: myReconnectId, username: myUsername });
            joinRoomUI(currentRoomId);
            toggleFooterCta();
        }
        sessionStorage.removeItem('watchparty_room');
    } catch(e) {}
}