// ============================================
// ADMIN: CRUD User (FIXED with Password Hashing)
// ============================================

import { db } from '../firebase.js';
import { ref, onValue, set, get, update } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js';
import { DOM, showToast, currentUser } from './core.js';

// ✅ FIX: Simple hash function (tanpa library eksternal)
function simpleHash(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return 'hash_' + Math.abs(hash).toString(36);
}

export function initAdminPanel() {
  if (!currentUser || currentUser.role !== 'admin') {
    if (DOM.adminMenu) DOM.adminMenu.style.display = 'none';
    return;
  }
  if (DOM.adminMenu) DOM.adminMenu.style.display = 'block';
  loadUserList();
  initAddUserForm();
}

function loadUserList() {
  if (!DOM.userList) return;
  onValue(ref(db, 'users'), (snapshot) => {
    const users = snapshot.val();
    if (!users) {
      DOM.userList.innerHTML = '<p style="color:var(--muted);text-align:center;padding:20px;">Belum ada user terdaftar.</p>';
      return;
    }
    
    let html = `<table style="width:100%;text-align:left;border-collapse:collapse;font-size:14px;">
      <thead>
        <tr style="border-bottom:1px solid rgba(255,255,255,.1);">
          <th style="padding:8px 4px;">Username</th>
          <th style="padding:8px 4px;">Nama</th>
          <th style="padding:8px 4px;">Role</th>
          <th style="padding:8px 4px;">Aksi</th>
        </tr>
      </thead>
      <tbody>`;
    
    for (const [username, data] of Object.entries(users)) {
      const isCurrent = username === currentUser.username;
      html += `<tr style="border-bottom:1px solid rgba(255,255,255,.05);">
        <td style="padding:8px 4px;">${username}${isCurrent ? ' 👑' : ''}</td>
        <td style="padding:8px 4px;">${data.nama || '-'}</td>
        <td style="padding:8px 4px;"><span style="background:${data.role === 'admin' ? 'rgba(139,92,246,.2)' : 'rgba(34,197,94,.2)'};padding:2px 10px;border-radius:12px;font-size:12px;">${data.role}</span></td>
        <td style="padding:8px 4px;">
          ${!isCurrent ? `
            <button onclick="window.changeRole('${username}','admin')" style="background:rgba(139,92,246,.2);border:none;color:#a78bfa;padding:4px 8px;border-radius:6px;cursor:pointer;font-size:11px;margin-right:4px;">⬆ Admin</button>
            <button onclick="window.changeRole('${username}','petani')" style="background:rgba(34,197,94,.2);border:none;color:#4ade80;padding:4px 8px;border-radius:6px;cursor:pointer;font-size:11px;margin-right:4px;">⬇ Petani</button>
            <button onclick="window.deleteUser('${username}')" style="background:rgba(239,68,68,.2);border:none;color:#f87171;padding:4px 8px;border-radius:6px;cursor:pointer;font-size:11px;">🗑 Hapus</button>
          ` : '<span style="color:var(--muted);font-size:11px;">(Anda)</span>'}
        </td>
      </tr>`;
    }
    DOM.userList.innerHTML = html + '</tbody></table>';
  });
}

// Expose to global
window.changeRole = function(username, newRole) {
  if (currentUser.role !== 'admin') {
    alert('❌ Hanya admin yang bisa mengubah role!');
    return;
  }
  if (!confirm(`Ubah role ${username} menjadi ${newRole}?`)) return;
  update(ref(db, `users/${username}`), { role: newRole })
    .then(() => showToast('✅ Role berhasil diubah!', 'success'))
    .catch(err => showToast('❌ Gagal mengubah role: ' + err.message, 'error'));
};

window.deleteUser = function(username) {
  if (currentUser.role !== 'admin') {
    alert('❌ Hanya admin yang bisa menghapus user!');
    return;
  }
  if (!confirm(`Hapus user ${username}?`)) return;
  set(ref(db, `users/${username}`), null)
    .then(() => showToast('✅ User berhasil dihapus!', 'success'))
    .catch(err => showToast('❌ Gagal menghapus user: ' + err.message, 'error'));
};

function initAddUserForm() {
  if (!DOM.addUserForm) return;
  DOM.addUserForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    if (currentUser.role !== 'admin') {
      alert('❌ Hanya admin yang bisa menambah user!');
      return;
    }
    
    const username = document.getElementById('newUsername').value.trim();
    const password = document.getElementById('newPassword').value.trim();
    const nama = document.getElementById('newNama').value.trim() || username;
    const role = document.getElementById('newRole').value;
    
    if (!username || !password) {
      showToast('❌ Username dan password wajib diisi!', 'error');
      return;
    }
    if (username.length < 3) {
      showToast('❌ Username minimal 3 karakter!', 'error');
      return;
    }
    if (password.length < 4) {
      showToast('❌ Password minimal 4 karakter!', 'error');
      return;
    }
    
    try {
      const snap = await get(ref(db, `users/${username}`));
      if (snap.exists()) {
        showToast('❌ Username sudah terdaftar!', 'error');
        return;
      }
      
      // ✅ FIX: Hash password sebelum disimpan
      const hashedPassword = simpleHash(password);
      
      await set(ref(db, `users/${username}`), {
        password: hashedPassword, // Hash!
        nama,
        role,
        createdAt: new Date().toISOString()
      });
      showToast('✅ User berhasil ditambahkan!', 'success');
      document.getElementById('newUsername').value = '';
      document.getElementById('newPassword').value = '';
      document.getElementById('newNama').value = '';
    } catch(err) {
      showToast('❌ Gagal menambahkan user: ' + err.message, 'error');
    }
  });
}

// ✅ FIX: Fungsi verifikasi password untuk login
export function verifyPassword(inputPassword, storedHash) {
  return simpleHash(inputPassword) === storedHash;
}
