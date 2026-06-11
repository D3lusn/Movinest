let socket = io();
let isAdmin = false;
const loginDiv = document.getElementById('admin-login');
const dashboardDiv = document.getElementById('admin-dashboard');
const loginBtn = document.getElementById('admin-login-btn');
const passwordInput = document.getElementById('admin-password');
const logoutBtn = document.getElementById('admin-logout');
const totalRoomsSpan = document.getElementById('total-rooms');
const totalUsersSpan = document.getElementById('total-users');
const roomsContainer = document.getElementById('rooms-list-container');

// اعلان
const announcementActiveCheckbox = document.getElementById('announcement-active');
const announcementTextarea = document.getElementById('announcement-text');
const sendAnnouncementBtn = document.getElementById('send-announcement');
const activeStatusLabel = document.getElementById('active-status-label');

// نظرات
const feedbackListDiv = document.getElementById('feedback-list');

loginBtn.onclick = () => {
    const password = passwordInput.value;
    socket.emit('admin-login', password, (response) => {
        if (response.success) {
            isAdmin = true;
            loginDiv.style.display = 'none';
            dashboardDiv.style.display = 'block';
            socket.emit('admin-get-stats');
            loadFeedbacks();
        } else {
            alert('رمز عبور اشتباه است');
        }
    });
};
logoutBtn.onclick = () => { location.reload(); };

async function loadFeedbacks() {
    try {
        const res = await fetch('/api/feedback');
        const feedbacks = await res.json();
        if (!feedbackListDiv) return;
        if (feedbacks.length === 0) {
            feedbackListDiv.innerHTML = '<p style="text-align:center; padding:20px;">هیچ نظری ثبت نشده است.</p>';
            return;
        }
        feedbackListDiv.innerHTML = '';
        feedbacks.forEach(fb => {
            const item = document.createElement('div');
            item.className = 'feedback-item';
            item.innerHTML = `
                <div class="feedback-header">
                    <span class="feedback-name">${escapeHtml(fb.name)}</span>
                    <span class="feedback-date">${new Date(fb.createdAt).toLocaleDateString('fa-IR')}</span>
                </div>
                ${fb.contact ? `<div class="feedback-contact"><i class="fas fa-address-card"></i> ${escapeHtml(fb.contact)}</div>` : ''}
                ${fb.age ? `<div class="feedback-age"><i class="fas fa-calendar-alt"></i> سن: ${fb.age} سال</div>` : ''}
                <div class="feedback-message">${escapeHtml(fb.message)}</div>
                <div style="text-align: left; margin-top: 10px;">
                    <button class="delete-feedback" data-id="${fb.id}"><i class="fas fa-trash-alt"></i> حذف</button>
                </div>
            `;
            feedbackListDiv.appendChild(item);
        });
        document.querySelectorAll('.delete-feedback').forEach(btn => {
            btn.onclick = async (e) => {
                const id = btn.getAttribute('data-id');
                if (confirm('آیا از حذف این نظر مطمئن هستید؟')) {
                    const res = await fetch(`/api/feedback/${id}`, { method: 'DELETE' });
                    if (res.ok) {
                        loadFeedbacks();
                        alert('نظر با موفقیت حذف شد');
                    } else alert('خطا در حذف نظر');
                }
            };
        });
    } catch (err) { console.error(err); }
}
function escapeHtml(str) { return str.replace(/[&<>]/g, m => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;' }[m])); }

socket.on('admin-announcement-status', (data) => {
    announcementActiveCheckbox.checked = data.active;
    announcementTextarea.value = data.text;
    activeStatusLabel.innerText = data.active ? 'فعال' : 'غیرفعال';
});
sendAnnouncementBtn.onclick = () => {
    const text = announcementTextarea.value;
    const active = announcementActiveCheckbox.checked;
    if (active && !text.trim()) {
        alert('لطفاً متن پیام را وارد کنید');
        return;
    }
    socket.emit('admin-set-announcement', { text, active });
    alert('اعلان با موفقیت ارسال شد');
};

socket.on('admin-stats', (stats) => {
    totalRoomsSpan.innerText = stats.totalRooms;
    totalUsersSpan.innerText = stats.totalUsers;
    roomsContainer.innerHTML = '';
    stats.roomsList.forEach(room => {
        const roomDiv = document.createElement('div');
        roomDiv.className = 'room-item';
        roomDiv.innerHTML = `
            <div class="room-header" data-roomid="${room.roomId}">
                <div><strong><i class="fas fa-hashtag"></i> ${room.roomId}</strong> <span style="color:#aaa;">| مالک: ${room.ownerName}</span></div>
                <div><i class="fas fa-users"></i> ${room.userCount} نفر <button class="small kick-room-btn" data-roomid="${room.roomId}" style="background:#e74c3c; margin-right:10px;">❌ بستن اتاق</button> <i class="fas fa-chevron-down" style="margin-right:10px; cursor:pointer;"></i></div>
            </div>
            <div class="room-details" id="details-${room.roomId}">
                <div><i class="fas fa-video"></i> ویدیو: ${room.videoUrl || 'هیچ'}</div>
                <div><i class="fas fa-play-circle"></i> وضعیت: ${room.isPlaying ? 'در حال پخش' : 'متوقف'}</div>
                <div><i class="fas fa-clock"></i> زمان: ${Math.floor(room.currentTime)} ثانیه</div>
                <div class="users-list-admin"><strong>لیست کاربران:</strong>${room.users.map(u => `<div class="user-row"><span>${u.name}</span><button class="small kick-user-from-room" data-roomid="${room.roomId}" data-userid="${u.id}" style="background:#e67e22;">اخراج</button></div>`).join('')}</div>
            </div>
        `;
        roomsContainer.appendChild(roomDiv);
        const header = roomDiv.querySelector('.room-header');
        const details = roomDiv.querySelector(`#details-${room.roomId}`);
        header.querySelector('.fa-chevron-down').onclick = () => details.classList.toggle('show');
        header.querySelector('.kick-room-btn').onclick = (e) => {
            e.stopPropagation();
            if (confirm(`آیا از بستن اتاق ${room.roomId} مطمئن هستید؟`)) socket.emit('admin-close-room', { roomId: room.roomId });
        };
        roomDiv.querySelectorAll('.kick-user-from-room').forEach(btn => {
            btn.onclick = (e) => {
                e.stopPropagation();
                const roomId = btn.getAttribute('data-roomid');
                const userId = btn.getAttribute('data-userid');
                if (confirm('کاربر را اخراج کنیم؟')) socket.emit('admin-kick-user', { roomId, targetSocketId: userId });
            };
        });
    });
});
socket.on('disconnect', () => {
    if (isAdmin) alert('ارتباط با سرور قطع شد. لطفاً صفحه را رفرش کنید.');
});