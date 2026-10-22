// ==========================================
// GLOBAL STATE & CONFIGURATION
// ==========================================
let studentsData = [];
let surveyResponses = [];
let usersData = [
  { id: 'u0', nama: 'Administrator Sekolah', username: 'admin', password: 'admin123', role: 'admin', assignedClass: 'ALL' }
];
let currentUser = null; // null = Guest / Mode Siswa

// DURASI SESI LOGIN (1 JAM = 3.600.000 ms)
const SESSION_DURATION_MS = 60 * 60 * 1000; 

// MASUKKAN URL GOOGLE APPS SCRIPT WEB APP ANDA DI SINI
const GOOGLE_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbwkXU4GVuIjgJW4U3QP6bfr7bz_d1L19Y1NvBRdvaww9N0JCWBJ0aWzuAYe3JtNg5UYVw/exec'; 

// Siswa Voting Session state
let activeClass = '';
let activeClassStudents = [];
let currentStudentIndex = 0;
let sessionVotedCount = 0;
let sessionSkippedCount = 0;
let isProcessingVote = false;

const emojiIconMap = {
  'Sangat Senang': '🤩',
  'Senang': '😊',
  'Biasa Saja': '😐',
  'Kurang Senang': '🙁',
  'Sedih': '😢',
  'Tidak Hadir': '🚫'
};

// ==========================================
// SESSION MANAGEMENT (SESI LOGIN 1 JAM)
// ==========================================
function saveUserSession(user) {
  const sessionPayload = {
    user: user,
    loginTimestamp: Date.now()
  };
  localStorage.setItem('sd1tiga_user_session', JSON.stringify(sessionPayload));
}

function loadUserSession() {
  const savedSession = localStorage.getItem('sd1tiga_user_session');
  if (!savedSession) return;

  try {
    const { user, loginTimestamp } = JSON.parse(savedSession);
    const now = Date.now();

    // Periksa apakah sesi belum kadaluarsa (kurang dari 1 jam)
    if (now - loginTimestamp < SESSION_DURATION_MS) {
      currentUser = user;
    } else {
      // Sesi habis / kedaluwarsa
      localStorage.removeItem('sd1tiga_user_session');
      currentUser = null;
      setTimeout(() => {
        showToast('⏱️ Sesi login telah berakhir. Silakan login kembali.', '🔒');
      }, 500);
    }
  } catch (err) {
    localStorage.removeItem('sd1tiga_user_session');
    currentUser = null;
  }
}

function clearUserSession() {
  localStorage.removeItem('sd1tiga_user_session');
  currentUser = null;
}

// ==========================================
// HELPER FUNCTIONS FOR GOOGLE SHEETS & DATES
// ==========================================
function sendToGoogleSheets(payload) {
  if (!GOOGLE_SCRIPT_URL) return;
  fetch(GOOGLE_SCRIPT_URL, {
    method: 'POST',
    mode: 'no-cors',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify(payload)
  }).catch(err => console.error('Gagal kirim ke Google Sheets:', err));
}

function cleanDateStr(dStr) {
  if (!dStr) return '';
  const str = String(dStr).trim();
  
  if (str.includes('GMT') || str.includes('00:00:00') || str.includes('T')) {
    const d = new Date(str);
    if (!isNaN(d.getTime())) {
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    }
  }
  return str;
}

function getTodayDateStr() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

function getGradeNumber(cls) {
  if (!cls) return '';
  let s = String(cls).toUpperCase().trim();

  if (/\b(VIII|8)\b/.test(s) || s.includes('VIII')) return '8';
  if (/\b(VII|7)\b/.test(s) || s.includes('VII')) return '7';
  if (/\b(VI|6)\b/.test(s) || s.includes('VI')) return '6';
  if (/\b(IV|4)\b/.test(s) || s.includes('IV')) return '4';
  if (/\b(V|5)\b/.test(s) || s.includes('V')) return '5';
  if (/\b(III|3)\b/.test(s) || s.includes('III')) return '3';
  if (/\b(II|2)\b/.test(s) || s.includes('II')) return '2';
  if (/\b(I|1)\b/.test(s) || s.includes('I')) return '1';

  const match = s.match(/[1-6]/);
  return match ? match[0] : '';
}

function isClassMatch(classA, classB) {
  if (!classA || !classB) return true;
  if (classA === 'ALL' || classB === 'ALL') return true;

  const gradeA = getGradeNumber(classA);
  const gradeB = getGradeNumber(classB);

  if (gradeA && gradeB) {
    return gradeA === gradeB;
  }

  const cleanA = String(classA).toLowerCase().replace(/[\s\-_]/g, '');
  const cleanB = String(classB).toLowerCase().replace(/[\s\-_]/g, '');
  return cleanA === cleanB;
}

function setEmojiButtonsState(enabled) {
  const emojiButtons = document.querySelectorAll('.emoji-btn');
  const skipBtn = document.getElementById('btnSkipStudent');

  emojiButtons.forEach(btn => {
    if (enabled) {
      btn.classList.remove('pointer-events-none', 'opacity-40');
      btn.disabled = false;
    } else {
      btn.classList.add('pointer-events-none', 'opacity-40');
      btn.disabled = true;
    }
  });

  if (skipBtn) {
    if (enabled) {
      skipBtn.classList.remove('pointer-events-none', 'opacity-40');
      skipBtn.disabled = false;
    } else {
      skipBtn.classList.add('pointer-events-none', 'opacity-40');
      skipBtn.disabled = true;
    }
  }
}

// ==========================================
// INITIALIZATION
// ==========================================
window.addEventListener('DOMContentLoaded', () => {
  loadUserSession();
  updateAuthUI();
  updateAllViews();
  syncDataFromGoogleSheets();
});

// ==========================================
// AUTHENTICATION SYSTEM
// ==========================================
function updateAuthUI() {
  const authContainer = document.getElementById('authStatusContainer');
  const navAdminBtn = document.getElementById('navAdminBtn');

  if (currentUser) {
    const classBadge = currentUser.role === 'guru' ? `[${currentUser.assignedClass}]` : '[ADMIN]';
    authContainer.innerHTML = `
      <div class="flex items-center gap-1.5 sm:gap-2 bg-sky-50 px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-xl border border-sky-200">
        <span class="text-xs font-bold text-sky-900 truncate max-w-[120px] sm:max-w-none">👤 ${currentUser.nama} ${classBadge}</span>
        <button onclick="handleLogout()" class="text-xs bg-rose-500 hover:bg-rose-600 text-white font-bold px-2 py-0.5 sm:py-1 rounded-lg transition" title="Logout">
          <i class="fa-solid fa-right-from-bracket"></i>
        </button>
      </div>
    `;

    if (currentUser.role === 'admin') {
      navAdminBtn.classList.remove('hidden');
    } else {
      navAdminBtn.classList.add('hidden');
    }
  } else {
    authContainer.innerHTML = `
      <button onclick="openLoginModal()" class="bg-sky-100 hover:bg-sky-200 text-sky-800 font-bold px-3 py-1.5 sm:px-4 sm:py-2 rounded-xl text-xs sm:text-sm transition flex items-center gap-1.5 border border-sky-300">
        <i class="fa-solid fa-right-to-bracket"></i> Login
      </button>
    `;
    navAdminBtn.classList.add('hidden');
  }
}

function openLoginModal() {
  document.getElementById('loginModal').classList.remove('hidden');
}

function closeLoginModal() {
  document.getElementById('loginModal').classList.add('hidden');
}

function handleLoginSubmit(e) {
  e.preventDefault();
  const u = document.getElementById('loginUsername').value.trim();
  const p = document.getElementById('loginPassword').value.trim();

  const found = usersData.find(user => user.username === u && user.password === p);

  if (found) {
    currentUser = found;
    saveUserSession(currentUser); // Simpan sesi 1 jam
    updateAuthUI();
    closeLoginModal();
    showToast(`Selamat datang, ${currentUser.nama}!`, '🔑');
    
    if (currentUser.role === 'admin') {
      switchTab('admin');
    } else {
      switchTab('dashboard');
    }
  } else {
    showToast('❌ Username atau password salah!', '⚠️');
  }
}

function handleLogout() {
  clearUserSession();
  updateAuthUI();
  switchTab('siswa');
  showToast('Anda telah logout.', '👋');
}

// ==========================================
// TAB SWITCHING
// ==========================================
function switchTab(tabName) {
  if (tabName === 'dashboard' && !currentUser) {
    showToast('🔒 Silakan Login terlebih dahulu untuk melihat Laporan.');
    openLoginModal();
    return;
  }

  if (tabName === 'admin' && (!currentUser || currentUser.role !== 'admin')) {
    showToast('⛔ Hanya Administrator yang dapat mengakses Panel Admin!');
    return;
  }

  document.querySelectorAll('.tab-content').forEach(el => el.classList.add('hidden'));
  document.querySelectorAll('nav button').forEach(el => {
    el.classList.remove('bg-sky-600', 'text-white', 'shadow-sm');
    el.classList.add('text-slate-600');
  });

  if (tabName === 'siswa') {
    document.getElementById('tabSiswa').classList.remove('hidden');
    document.getElementById('navSiswaBtn').classList.add('bg-sky-600', 'text-white', 'shadow-sm');
    document.getElementById('navSiswaBtn').classList.remove('text-slate-600');
  } else if (tabName === 'dashboard') {
    document.getElementById('tabDashboard').classList.remove('hidden');
    document.getElementById('navDashboardBtn').classList.add('bg-sky-600', 'text-white', 'shadow-sm');
    document.getElementById('navDashboardBtn').classList.remove('text-slate-600');
    syncDataFromGoogleSheets();
    renderDashboard();
  } else if (tabName === 'admin') {
    document.getElementById('tabAdmin').classList.remove('hidden');
    document.getElementById('navAdminBtn').classList.add('bg-sky-600', 'text-white', 'shadow-sm');
    renderStudentTable();
    renderUsersTable();
  }
}

// ==========================================
// ADMIN: KELOLA SISWA (TAMBAH, EDIT, HAPUS)
// ==========================================
function handleAddSingleStudent(e) {
  e.preventDefault();
  if (!currentUser || currentUser.role !== 'admin') {
    showToast('⛔ Hanya Administrator yang dapat menambahkan siswa.');
    return;
  }

  const namaInput = document.getElementById('manualNamaSiswa');
  const kelasInput = document.getElementById('manualKelasSiswa');

  const nama = namaInput.value.trim();
  const kelas = kelasInput.value;

  if (!nama) return;

  const newStudentPayload = {
    action: 'ADD_STUDENT',
    id: 'std_' + Date.now(),
    nama: nama,
    kelas: kelas
  };

  studentsData.push({ id: newStudentPayload.id, nama: newStudentPayload.nama, kelas: newStudentPayload.kelas });
  updateAllViews();

  sendToGoogleSheets(newStudentPayload);

  namaInput.value = '';
  showToast(`✅ Siswa "${nama}" berhasil ditambahkan!`, '👤');
}

function openEditStudentModal(studentId) {
  const student = studentsData.find(s => s.id === studentId);
  if (!student) return;

  document.getElementById('editStudentId').value = student.id;
  document.getElementById('editStudentNama').value = student.nama;
  document.getElementById('editStudentKelas').value = student.kelas;

  document.getElementById('editStudentModal').classList.remove('hidden');
}

function closeEditStudentModal() {
  document.getElementById('editStudentModal').classList.add('hidden');
}

function handleSaveEditStudent(e) {
  e.preventDefault();
  if (!currentUser || currentUser.role !== 'admin') {
    showToast('⛔ Hanya Administrator yang dapat mengubah data siswa.');
    return;
  }

  const id = document.getElementById('editStudentId').value;
  const newNama = document.getElementById('editStudentNama').value.trim();
  const newKelas = document.getElementById('editStudentKelas').value;

  const student = studentsData.find(s => s.id === id);
  if (student) {
    student.nama = newNama;
    student.kelas = newKelas;

    updateAllViews();
    closeEditStudentModal();

    sendToGoogleSheets({ action: 'EDIT_STUDENT', id: id, nama: newNama, kelas: newKelas });

    showToast(`✅ Data siswa "${newNama}" berhasil diperbarui!`, '✏️');
  }
}

function deleteSingleStudent(studentId) {
  if (!currentUser || currentUser.role !== 'admin') {
    showToast('⛔ Hanya Administrator yang dapat menghapus siswa.');
    return;
  }

  const student = studentsData.find(s => s.id === studentId);
  const studentName = student ? student.nama : 'siswa ini';

  if (confirm(`Apakah Anda yakin ingin menghapus data "${studentName}" dari daftar siswa?`)) {
    studentsData = studentsData.filter(s => s.id !== studentId);
    updateAllViews();

    sendToGoogleSheets({ action: 'DELETE_STUDENT', id: studentId });

    showToast(`🗑️ Data ${studentName} berhasil dihapus.`, '⚠️');
  }
}

// ==========================================
// ADMIN: KELOLA AKUN GURU & ADMIN
// ==========================================
function toggleClassAssignmentInput() {
  const role = document.getElementById('newRole').value;
  const group = document.getElementById('classAssignmentGroup');
  if (role === 'guru') {
    group.classList.remove('hidden');
  } else {
    group.classList.add('hidden');
  }
}

function toggleEditClassAssignmentInput() {
  const role = document.getElementById('editUserRole').value;
  const group = document.getElementById('editClassAssignmentGroup');
  if (role === 'guru') {
    group.classList.remove('hidden');
  } else {
    group.classList.add('hidden');
  }
}

function handleCreateUser(e) {
  e.preventDefault();
  const nama = document.getElementById('newNama').value.trim();
  const username = document.getElementById('newUsername').value.trim();
  const password = document.getElementById('newPassword').value.trim();
  const role = document.getElementById('newRole').value;
  const assignedClass = role === 'guru' ? document.getElementById('newAssignedClass').value : 'ALL';

  if (usersData.some(u => u.username === username)) {
    showToast('⚠️ Username telah digunakan.');
    return;
  }

  const newUserPayload = {
    action: 'ADD_USER',
    id: 'u_' + Date.now(),
    nama: nama,
    username: username,
    password: password,
    role: role,
    assignedClass: assignedClass
  };

  usersData.push({ id: newUserPayload.id, nama, username, password, role, assignedClass });
  renderUsersTable();

  sendToGoogleSheets(newUserPayload);

  e.target.reset();
  showToast('✅ Akun baru berhasil ditambahkan!');
}

function openEditUserModal(userId) {
  const user = usersData.find(u => u.id === userId);
  if (!user) return;

  document.getElementById('editUserId').value = user.id;
  document.getElementById('editUserNama').value = user.nama;
  document.getElementById('editUserUsername').value = user.username;
  document.getElementById('editUserPassword').value = user.password;
  document.getElementById('editUserRole').value = user.role;
  document.getElementById('editUserAssignedClass').value = user.assignedClass || 'Kelas I';

  toggleEditClassAssignmentInput();
  document.getElementById('editUserModal').classList.remove('hidden');
}

function closeEditUserModal() {
  document.getElementById('editUserModal').classList.add('hidden');
}

function handleSaveEditUser(e) {
  e.preventDefault();
  if (!currentUser || currentUser.role !== 'admin') {
    showToast('⛔ Hanya Administrator yang dapat mengubah akun pengguna.');
    return;
  }

  const id = document.getElementById('editUserId').value;
  const newNama = document.getElementById('editUserNama').value.trim();
  const newUsername = document.getElementById('editUserUsername').value.trim();
  const newPassword = document.getElementById('editUserPassword').value.trim();
  const newRole = document.getElementById('editUserRole').value;
  const newAssignedClass = newRole === 'guru' ? document.getElementById('editUserAssignedClass').value : 'ALL';

  if (usersData.some(u => u.username === newUsername && u.id !== id)) {
    showToast('⚠️ Username sudah digunakan pengguna lain.');
    return;
  }

  const user = usersData.find(u => u.id === id);
  if (user) {
    user.nama = newNama;
    user.username = newUsername;
    user.password = newPassword;
    user.role = newRole;
    user.assignedClass = newAssignedClass;

    if (currentUser.id === id) {
      currentUser = user;
      saveUserSession(currentUser);
      updateAuthUI();
    }

    renderUsersTable();
    closeEditUserModal();

    sendToGoogleSheets({
      action: 'EDIT_USER',
      id: id,
      nama: newNama,
      username: newUsername,
      password: newPassword,
      role: newRole,
      assignedClass: newAssignedClass
    });

    showToast(`✅ Akun "${newNama}" berhasil diperbarui!`, '✏️');
  }
}

function deleteUser(id) {
  if (confirm('Hapus akun pengguna ini?')) {
    usersData = usersData.filter(u => u.id !== id);
    renderUsersTable();

    sendToGoogleSheets({ action: 'DELETE_USER', id: id });

    showToast('Akun telah dihapus.');
  }
}

function renderUsersTable() {
  const tbody = document.getElementById('usersTableBody');
  tbody.innerHTML = usersData.map(u => `
    <tr class="hover:bg-slate-50">
      <td class="p-2.5 sm:p-3 font-semibold text-slate-800">${u.nama}</td>
      <td class="p-2.5 sm:p-3 font-mono text-[11px] sm:text-xs">${u.username}</td>
      <td class="p-2.5 sm:p-3">
        <span class="px-2 py-0.5 rounded-full text-[10px] sm:text-xs font-bold ${u.role === 'admin' ? 'bg-amber-100 text-amber-800' : 'bg-sky-100 text-sky-800'}">
          ${u.role.toUpperCase()}
        </span>
      </td>
      <td class="p-2.5 sm:p-3 font-bold text-[11px] sm:text-xs text-slate-700">${u.assignedClass || 'Semua Kelas'}</td>
      <td class="p-2.5 sm:p-3 text-center">
        <div class="flex items-center justify-center gap-1.5">
          <button onclick="openEditUserModal('${u.id}')" class="text-xs bg-amber-100 hover:bg-amber-200 text-amber-800 font-bold px-2.5 py-1 rounded-lg transition flex items-center gap-1" title="Edit Akun">
            <i class="fa-solid fa-pen"></i> Edit
          </button>
          ${u.username === 'admin' ? '<span class="text-[11px] text-slate-400 self-center">Utama</span>' : `
            <button onclick="deleteUser('${u.id}')" class="text-xs bg-rose-100 hover:bg-rose-200 text-rose-700 font-bold px-2.5 py-1 rounded-lg transition flex items-center gap-1" title="Hapus Akun">
              <i class="fa-solid fa-trash"></i> Hapus
            </button>
          `}
        </div>
      </td>
    </tr>
  `).join('');
}

// ==========================================
// EXCEL UPLOAD & DATA RESET
// ==========================================
function handleExcelUpload(event) {
  if (!currentUser || currentUser.role !== 'admin') {
    showToast('⛔ Hanya Administrator yang dapat mengunggah file data siswa.');
    return;
  }

  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = function(e) {
    try {
      const data = new Uint8Array(e.target.result);
      const workbook = XLSX.read(data, { type: 'array' });
      const worksheet = workbook.Sheets[workbook.SheetNames[0]];
      const json = XLSX.utils.sheet_to_json(worksheet);

      if (json.length === 0) {
        showToast('⚠️ File Excel kosong!');
        return;
      }

      const newStudents = [];
      json.forEach((row, index) => {
        const keys = Object.keys(row);
        let namaKey = keys.find(k => k.toLowerCase().includes('nama') || k.toLowerCase().includes('name')) || keys[0];
        let kelasKey = keys.find(k => k.toLowerCase().includes('kelas') || k.toLowerCase().includes('class')) || keys[1];

        const nama = row[namaKey];
        const kelas = row[kelasKey] || 'Kelas I';

        if (nama) {
          newStudents.push({
            id: 'std_' + Date.now() + '_' + index,
            nama: String(nama).trim(),
            kelas: String(kelas).trim()
          });
        }
      });

      if (newStudents.length > 0) {
        studentsData = newStudents;
        updateAllViews();

        sendToGoogleSheets({ action: 'ADD_BULK_STUDENTS', students: newStudents });

        showToast(`✅ Berhasil mengunggah ${newStudents.length} data siswa!`, '🎉');
      }
    } catch (err) {
      showToast('❌ Gagal membaca file Excel.');
    }
  };
  reader.readAsArrayBuffer(file);
}

function loadSampleData(notify = true) {
  studentsData = [];
  surveyResponses = [];
  updateAllViews();
  if (notify) showToast('Data dibersihkan.');
}

function clearAllData() {
  if (!currentUser || currentUser.role !== 'admin') {
    showToast('⛔ Hanya Admin yang dapat menghapus seluruh data.');
    return;
  }
  if (confirm('Hapus seluruh data siswa dan riwayat survei di web dan Google Sheets?')) {
    studentsData = [];
    surveyResponses = [];
    updateAllViews();

    sendToGoogleSheets({ action: 'RESET_ALL_DATA' });

    showToast('Seluruh data dibersihkan.');
  }
}

function deleteSingleResponse(respId) {
  if (!currentUser || currentUser.role !== 'admin') {
    showToast('⛔ Hanya Admin yang dapat menghapus respon.');
    return;
  }

  if (confirm('Apakah Anda yakin ingin menghapus respon siswa ini?')) {
    surveyResponses = surveyResponses.filter(r => r.id !== respId);
    renderDashboard();
    renderStudentTable();

    sendToGoogleSheets({ action: 'DELETE_RESPONSE', id: respId });

    showToast('🗑️ Respon siswa berhasil dihapus.');
  }
}

function deleteAllResponsesForFilter() {
  if (!currentUser || currentUser.role !== 'admin') {
    showToast('⛔ Hanya Admin yang dapat menghapus respon.');
    return;
  }

  const classFilter = document.getElementById('dashboardClassFilter').value;
  const dateFilter = document.getElementById('dashboardDateFilter').value;

  const toDelete = surveyResponses.filter(r => {
    const matchClass = (classFilter === 'ALL') || isClassMatch(r.kelas, classFilter);
    const matchDate = (dateFilter === 'ALL') || (cleanDateStr(r.dateStr) === dateFilter);
    return matchClass && matchDate;
  });

  if (toDelete.length === 0) {
    showToast('⚠️ Tidak ada respon terfilter yang dapat dihapus.');
    return;
  }

  const labelKelas = classFilter === 'ALL' ? 'Semua Kelas' : classFilter;
  const labelTanggal = dateFilter === 'ALL' ? 'Semua Tanggal' : dateFilter;

  if (confirm(`Apakah Anda yakin ingin menghapus ${toDelete.length} respon terfilter (${labelKelas} | ${labelTanggal})?`)) {
    const idsToDelete = toDelete.map(r => r.id);

    surveyResponses = surveyResponses.filter(r => !idsToDelete.includes(r.id));

    renderDashboard();
    renderStudentTable();

    sendToGoogleSheets({ action: 'DELETE_BULK_RESPONSES', ids: idsToDelete });

    showToast(`🗑️ Berhasil menghapus ${toDelete.length} respon terfilter.`, '⚠️');
  }
}

// ==========================================
// VIEW RENDERING
// ==========================================
function updateAllViews() {
  populateClassSelects();
  populateDateSelects();
  renderStudentTable();
  renderDashboard();
}

function populateClassSelects() {
  const siswaSelect = document.getElementById('siswaClassSelect');
  const teacherFilter = document.getElementById('teacherClassFilter');
  const dashClassFilter = document.getElementById('dashboardClassFilter');
  const noDataWarning = document.getElementById('noDataWarning');

  siswaSelect.innerHTML = '';
  teacherFilter.innerHTML = '<option value="ALL">Semua Kelas</option>';
  dashClassFilter.innerHTML = '<option value="ALL">🌟 Semua Kelas</option>';

  const classes = [...new Set(studentsData.map(s => s.kelas))].sort();

  if (classes.length === 0) {
    noDataWarning.classList.remove('hidden');
    siswaSelect.innerHTML = '<option value="">-- Data Kosong --</option>';
    return;
  }

  noDataWarning.classList.add('hidden');
  classes.forEach(cls => {
    siswaSelect.appendChild(new Option(cls, cls));
    teacherFilter.appendChild(new Option(cls, cls));
    dashClassFilter.appendChild(new Option(`📚 ${cls}`, cls));
  });
}

function populateDateSelects() {
  const dashDateFilter = document.getElementById('dashboardDateFilter');
  dashDateFilter.innerHTML = '<option value="ALL">📅 Semua Tanggal</option>';
  const dates = [...new Set(surveyResponses.map(r => cleanDateStr(r.dateStr)))].filter(Boolean).sort().reverse();
  dates.forEach(dStr => dashDateFilter.appendChild(new Option(`🗓️ ${dStr}`, dStr)));
}

// ==========================================
// SISWA VOTING SESSION
// ==========================================
function startSiswaSession() {
  const selectedClass = document.getElementById('siswaClassSelect').value;
  if (!selectedClass) return;

  activeClass = selectedClass;
  activeClassStudents = studentsData.filter(s => isClassMatch(s.kelas, activeClass));
  currentStudentIndex = 0;
  sessionVotedCount = 0;
  sessionSkippedCount = 0;
  isProcessingVote = false;

  document.getElementById('siswaClassSelectCard').classList.add('hidden');
  document.getElementById('siswaFinishedCard').classList.add('hidden');
  document.getElementById('siswaVotingCard').classList.remove('hidden');

  setEmojiButtonsState(true);
  displayCurrentStudent();
}

function displayCurrentStudent() {
  if (currentStudentIndex >= activeClassStudents.length) {
    finishSiswaSession();
    return;
  }

  const currentStudent = activeClassStudents[currentStudentIndex];
  document.getElementById('studentNameDisplay').textContent = currentStudent.nama;
  document.getElementById('currentClassBadge').textContent = currentStudent.kelas;
  document.getElementById('currentIndexText').textContent = currentStudentIndex + 1;
  document.getElementById('totalStudentsText').textContent = activeClassStudents.length;
  document.getElementById('progressBar').style.width = `${Math.round((currentStudentIndex / activeClassStudents.length) * 100)}%`;
}

function submitStudentVote(score, emojiText) {
  if (isProcessingVote) return;
  isProcessingVote = true;
  setEmojiButtonsState(false);

  confetti({ particleCount: 30, spread: 50, origin: { y: 0.7 } });
  const currentStudent = activeClassStudents[currentStudentIndex];
  const todayDateStr = getTodayDateStr();

  const dataRespon = {
    id: 'resp_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4),
    studentId: currentStudent.id,
    nama: currentStudent.nama,
    kelas: currentStudent.kelas,
    score: score,
    emojiText: emojiText,
    dateStr: todayDateStr,
    timestamp: new Date().toLocaleString('id-ID')
  };

  surveyResponses = surveyResponses.filter(r => {
    const sameStudent = (r.studentId && String(r.studentId).trim() === String(currentStudent.id).trim()) ||
                        (r.nama && currentStudent.nama && r.nama.trim().toLowerCase() === currentStudent.nama.trim().toLowerCase() && isClassMatch(r.kelas, currentStudent.kelas));
    const sameDate = cleanDateStr(r.dateStr) === todayDateStr;
    return !(sameStudent && sameDate);
  });

  surveyResponses.push(dataRespon);
  sessionVotedCount++;

  sendToGoogleSheets(dataRespon);

  showToast(`Terima kasih, ${currentStudent.nama}! 😊`, '✨');

  currentStudentIndex++;
  setTimeout(() => {
    displayCurrentStudent();
    isProcessingVote = false;
    setEmojiButtonsState(true);
  }, 800);
}

function skipStudent() {
  if (isProcessingVote) return;
  isProcessingVote = true;
  setEmojiButtonsState(false);

  const currentStudent = activeClassStudents[currentStudentIndex];
  const todayDateStr = getTodayDateStr();

  const dataRespon = {
    id: 'resp_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4),
    studentId: currentStudent.id,
    nama: currentStudent.nama,
    kelas: currentStudent.kelas,
    score: 0,
    emojiText: 'Tidak Hadir',
    dateStr: todayDateStr,
    timestamp: new Date().toLocaleString('id-ID')
  };

  surveyResponses = surveyResponses.filter(r => {
    const sameStudent = (r.studentId && String(r.studentId).trim() === String(currentStudent.id).trim()) ||
                        (r.nama && currentStudent.nama && r.nama.trim().toLowerCase() === currentStudent.nama.trim().toLowerCase() && isClassMatch(r.kelas, currentStudent.kelas));
    const sameDate = cleanDateStr(r.dateStr) === todayDateStr;
    return !(sameStudent && sameDate);
  });

  surveyResponses.push(dataRespon);
  sessionSkippedCount++;

  sendToGoogleSheets(dataRespon);

  showToast(`Siswa ${currentStudent.nama} dicatat Tidak Hadir.`, '🚫');

  currentStudentIndex++;

  setTimeout(() => {
    displayCurrentStudent();
    isProcessingVote = false;
    setEmojiButtonsState(true);
  }, 800);
}

function speakCurrentStudent() {
  const currentStudent = activeClassStudents[currentStudentIndex];
  if ('speechSynthesis' in window && currentStudent) {
    window.speechSynthesis.cancel();
    const msg = new SpeechSynthesisUtterance(`Halo, ${currentStudent.nama}`);
    msg.lang = 'id-ID';
    window.speechSynthesis.speak(msg);
  }
}

function finishSiswaSession() {
  document.getElementById('siswaVotingCard').classList.add('hidden');
  document.getElementById('siswaFinishedCard').classList.remove('hidden');

  const votedEl = document.getElementById('statTotalVoted');
  const skippedEl = document.getElementById('statTotalSkipped');
  if (votedEl) votedEl.textContent = sessionVotedCount;
  if (skippedEl) skippedEl.textContent = sessionSkippedCount;

  populateDateSelects();
}

function stopSiswaSession() {
  if (confirm('Akhiri sesi survei ini?')) resetToClassSelect();
}

function resetToClassSelect() {
  document.getElementById('siswaVotingCard').classList.add('hidden');
  document.getElementById('siswaFinishedCard').classList.remove('hidden');
  document.getElementById('siswaClassSelectCard').classList.remove('hidden');
  isProcessingVote = false;
  setEmojiButtonsState(true);
}

// ==========================================
// RENDER TABLES (STUDENTS & DASHBOARD)
// ==========================================
function renderStudentTable() {
  const teacherFilterEl = document.getElementById('teacherClassFilter');
  let filter = teacherFilterEl.value;

  const tbody = document.getElementById('studentTableBody');
  const todayStr = getTodayDateStr();

  let filtered = filter === 'ALL' 
    ? studentsData 
    : studentsData.filter(s => isClassMatch(s.kelas, filter));

  document.getElementById('totalStudentsBadge').textContent = filtered.length;

  if (filtered.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" class="p-6 text-center text-slate-400">Belum ada data siswa untuk kelas ini.</td></tr>`;
    return;
  }

  const isAdmin = currentUser && currentUser.role === 'admin';
  const todayResponses = surveyResponses.filter(r => cleanDateStr(r.dateStr) === todayStr);

  tbody.innerHTML = filtered.map((s, index) => {
    const hasVotedToday = todayResponses.some(r => 
      (r.studentId && String(r.studentId).trim() === String(s.id).trim()) ||
      (r.nama && s.nama && r.nama.trim().toLowerCase() === s.nama.trim().toLowerCase() && isClassMatch(r.kelas, s.kelas))
    );
    return `
      <tr class="hover:bg-sky-50/50">
        <td class="p-2.5 sm:p-3 font-bold">${index + 1}</td>
        <td class="p-2.5 sm:p-3 font-semibold text-slate-800">${s.nama}</td>
        <td class="p-2.5 sm:p-3"><span class="bg-sky-50 text-sky-700 px-2 py-0.5 sm:px-2.5 sm:py-1 rounded-lg text-xs font-bold">${s.kelas}</span></td>
        <td class="p-2.5 sm:p-3 text-center">${hasVotedToday ? '<span class="bg-emerald-100 text-emerald-800 text-[10px] sm:text-xs font-bold px-2 py-0.5 sm:px-2.5 sm:py-1 rounded-full"><i class="fa-solid fa-check"></i> Sudah</span>' : '<span class="bg-slate-100 text-slate-500 text-[10px] sm:text-xs font-bold px-2 py-0.5 sm:px-2.5 sm:py-1 rounded-full">Belum</span>'}</td>
        <td class="p-2.5 sm:p-3 text-center">
          ${isAdmin ? `
            <div class="flex items-center justify-center gap-1.5">
              <button onclick="openEditStudentModal('${s.id}')" class="text-xs bg-amber-100 hover:bg-amber-200 text-amber-800 font-bold px-2.5 py-1 rounded-lg transition flex items-center gap-1" title="Edit Data Siswa">
                <i class="fa-solid fa-pen"></i> Edit
              </button>
              <button onclick="deleteSingleStudent('${s.id}')" class="text-xs bg-rose-100 hover:bg-rose-200 text-rose-700 font-bold px-2.5 py-1 rounded-lg transition flex items-center gap-1" title="Hapus Data Siswa">
                <i class="fa-solid fa-trash"></i> Hapus
              </button>
            </div>
          ` : '<span class="text-xs text-slate-400">-</span>'}
        </td>
      </tr>
    `;
  }).join('');
}

function renderDashboard() {
  const classFilterEl = document.getElementById('dashboardClassFilter');
  const dateFilterEl = document.getElementById('dashboardDateFilter');
  const subtextEl = document.getElementById('dashboardRoleSubtext');

  const btnClearResponsesAdmin = document.getElementById('btnClearResponsesAdmin');
  const thActionAdmin = document.getElementById('thActionAdmin');

  let selectedClass = classFilterEl.value;
  const selectedDate = dateFilterEl.value;

  if (currentUser && currentUser.role === 'guru') {
    selectedClass = currentUser.assignedClass;
    
    for (let i = 0; i < classFilterEl.options.length; i++) {
      if (isClassMatch(classFilterEl.options[i].value, currentUser.assignedClass)) {
        classFilterEl.selectedIndex = i;
        break;
      }
    }

    classFilterEl.disabled = true;
    subtextEl.textContent = `Laporan khusus untuk ${currentUser.assignedClass} (${currentUser.nama}).`;

    if (btnClearResponsesAdmin) btnClearResponsesAdmin.classList.add('hidden');
    if (thActionAdmin) thActionAdmin.classList.add('hidden');
  } else {
    classFilterEl.disabled = false;
    subtextEl.textContent = `Analisis tingkat kepuasan siswa per-kelas dan harian SD Negeri 1 Tiga.`;

    if (currentUser && currentUser.role === 'admin') {
      if (btnClearResponsesAdmin) btnClearResponsesAdmin.classList.remove('hidden');
      if (thActionAdmin) thActionAdmin.classList.remove('hidden');
    } else {
      if (btnClearResponsesAdmin) btnClearResponsesAdmin.classList.add('hidden');
      if (thActionAdmin) thActionAdmin.classList.add('hidden');
    }
  }

  let filteredResponses = surveyResponses;

  if (selectedClass !== 'ALL') {
    filteredResponses = filteredResponses.filter(r => isClassMatch(r.kelas, selectedClass));
  }
  if (selectedDate !== 'ALL') {
    filteredResponses = filteredResponses.filter(r => cleanDateStr(r.dateStr) === selectedDate);
  }

  const filteredStudents = selectedClass === 'ALL' 
    ? studentsData 
    : studentsData.filter(s => isClassMatch(s.kelas, selectedClass));

  const totalResp = filteredResponses.length;
  document.getElementById('statTotalResponses').textContent = totalResp;

  const targetDate = selectedDate === 'ALL' ? getTodayDateStr() : selectedDate;
  const targetDateResponses = surveyResponses.filter(r => cleanDateStr(r.dateStr) === targetDate);

  const pendingCount = filteredStudents.filter(s => {
    const voted = targetDateResponses.some(r => {
      const matchId = r.studentId && String(r.studentId).trim() === String(s.id).trim();
      const matchNameClass = r.nama && s.nama && 
                             r.nama.trim().toLowerCase() === s.nama.trim().toLowerCase() && 
                             isClassMatch(r.kelas, s.kelas);
      return matchId || matchNameClass;
    });
    return !voted;
  }).length;

  document.getElementById('statPendingStudents').textContent = pendingCount;

  const validResponses = filteredResponses.filter(r => r.score > 0);
  const totalValidResp = validResponses.length;

  if (totalResp === 0) {
    document.getElementById('statSatisfactionRate').textContent = '0%';
    document.getElementById('statTopEmoji').textContent = '-';
    document.getElementById('responseTableBody').innerHTML = `<tr><td colspan="5" class="p-6 text-center text-slate-400">Belum ada respon untuk filter ini.</td></tr>`;
    document.getElementById('emojiDistributionBars').innerHTML = `<p class="text-slate-400 text-xs sm:text-sm">Belum ada data.</p>`;
  } else {
    if (totalValidResp > 0) {
      const totalScore = validResponses.reduce((acc, r) => acc + r.score, 0);
      document.getElementById('statSatisfactionRate').textContent = `${Math.round((totalScore / (totalValidResp * 5)) * 100)}%`;
    } else {
      document.getElementById('statSatisfactionRate').textContent = '0%';
    }

    const emojiCounts = { 'Sangat Senang': 0, 'Senang': 0, 'Biasa Saja': 0, 'Kurang Senang': 0, 'Sedih': 0, 'Tidak Hadir': 0 };
    filteredResponses.forEach(r => { if (emojiCounts[r.emojiText] !== undefined) emojiCounts[r.emojiText]++; });

    let topEmoji = '🤩';
    let maxCount = -1;
    Object.keys(emojiCounts).forEach(key => {
      if (key !== 'Tidak Hadir' && emojiCounts[key] > maxCount) {
        maxCount = emojiCounts[key];
        topEmoji = emojiIconMap[key];
      }
    });
    document.getElementById('statTopEmoji').textContent = topEmoji;

    document.getElementById('emojiDistributionBars').innerHTML = Object.keys(emojiCounts).map(key => {
      const count = emojiCounts[key];
      const barPct = Math.round((count / totalResp) * 100);
      const isAbsent = key === 'Tidak Hadir';
      return `
        <div>
          <div class="flex justify-between text-xs font-bold mb-1 text-slate-700">
            <span>${emojiIconMap[key]} ${key}</span>
            <span>${count} siswa (${barPct}%)</span>
          </div>
          <div class="w-full bg-slate-100 h-2.5 sm:h-3 rounded-full overflow-hidden">
            <div class="${isAbsent ? 'bg-rose-400' : 'bg-sky-500'} h-full rounded-full" style="width: ${barPct}%"></div>
          </div>
        </div>
      `;
    }).join('');

    const isAdmin = currentUser && currentUser.role === 'admin';
    document.getElementById('responseTableBody').innerHTML = filteredResponses.slice().reverse().map(r => `
      <tr class="hover:bg-slate-50">
        <td class="p-2.5 sm:p-3 text-[11px] sm:text-xs text-slate-500 font-mono">${r.timestamp || cleanDateStr(r.dateStr)}</td>
        <td class="p-2.5 sm:p-3 font-semibold text-slate-800">${r.nama}</td>
        <td class="p-2.5 sm:p-3"><span class="bg-sky-50 text-sky-700 px-2 py-0.5 rounded-lg text-xs font-bold">${r.kelas}</span></td>
        <td class="p-2.5 sm:p-3 font-bold ${r.emojiText === 'Tidak Hadir' ? 'text-rose-600' : ''}">
          ${emojiIconMap[r.emojiText] || ''} ${r.emojiText}
        </td>
        ${isAdmin ? `
          <td class="p-2.5 sm:p-3 text-center">
            <button onclick="deleteSingleResponse('${r.id}')" class="text-xs bg-rose-100 hover:bg-rose-200 text-rose-700 font-bold px-2 py-1 rounded-lg transition" title="Hapus Respon Ini">
              <i class="fa-solid fa-trash"></i> Hapus
            </button>
          </td>
        ` : ''}
      </tr>
    `).join('');
  }

  renderDailySummaryTable(selectedClass);
  renderClassSummaryTable(selectedDate);
}

function renderDailySummaryTable(selectedClassFilter) {
  const dailyTbody = document.getElementById('dailySummaryTableBody');
  const dates = [...new Set(surveyResponses.map(r => cleanDateStr(r.dateStr)))].filter(Boolean).sort().reverse();

  if (dates.length === 0) {
    dailyTbody.innerHTML = `<tr><td colspan="4" class="p-4 text-center text-slate-400">Belum ada riwayat harian.</td></tr>`;
    return;
  }

  dailyTbody.innerHTML = dates.map(dStr => {
    let dayResponses = surveyResponses.filter(r => cleanDateStr(r.dateStr) === dStr);
    if (selectedClassFilter !== 'ALL') {
      dayResponses = dayResponses.filter(r => isClassMatch(r.kelas, selectedClassFilter));
    }

    const validResp = dayResponses.filter(r => r.score > 0);
    const count = dayResponses.length;
    let satisfactionPct = 0;

    if (validResp.length > 0) {
      const totalScore = validResp.reduce((acc, r) => acc + r.score, 0);
      satisfactionPct = Math.round((totalScore / (validResp.length * 5)) * 100);
    }

    return `
      <tr class="hover:bg-slate-50">
        <td class="p-2.5 sm:p-3 font-bold text-sky-900">${dStr}</td>
        <td class="p-2.5 sm:p-3 text-center font-bold">${count}</td>
        <td class="p-2.5 sm:p-3 text-center">
          <span class="px-2 py-0.5 rounded-full text-[10px] sm:text-xs font-extrabold ${satisfactionPct >= 75 ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}">
            ${satisfactionPct}%
          </span>
        </td>
        <td class="p-2.5 sm:p-3 text-center">
          <button onclick="document.getElementById('dashboardDateFilter').value='${dStr}'; renderDashboard();" class="text-[11px] sm:text-xs bg-sky-100 text-sky-800 font-bold px-2 py-1 rounded-lg">
            Lihat
          </button>
        </td>
      </tr>
    `;
  }).join('');
}

function renderClassSummaryTable(selectedDateFilter) {
  const summaryTbody = document.getElementById('classSummaryTableBody');
  let classes = [...new Set(studentsData.map(s => s.kelas))].sort();

  if (currentUser && currentUser.role === 'guru') {
    classes = classes.filter(cls => isClassMatch(cls, currentUser.assignedClass));
  }

  if (classes.length === 0) {
    summaryTbody.innerHTML = `<tr><td colspan="4" class="p-4 text-center text-slate-400">Belum ada data kelas.</td></tr>`;
    return;
  }

  summaryTbody.innerHTML = classes.map(cls => {
    let clsResponses = surveyResponses.filter(r => isClassMatch(r.kelas, cls));
    if (selectedDateFilter !== 'ALL') {
      clsResponses = clsResponses.filter(r => cleanDateStr(r.dateStr) === selectedDateFilter);
    }

    const validResp = clsResponses.filter(r => r.score > 0);
    const count = clsResponses.length;
    let satisfactionPct = 0;

    if (validResp.length > 0) {
      const totalScore = validResp.reduce((acc, r) => acc + r.score, 0);
      satisfactionPct = Math.round((totalScore / (validResp.length * 5)) * 100);
    }

    return `
      <tr class="hover:bg-slate-50">
        <td class="p-2.5 sm:p-3 font-bold text-sky-900">${cls}</td>
        <td class="p-2.5 sm:p-3 text-center font-bold text-slate-700">${count}</td>
        <td class="p-2.5 sm:p-3 text-center">
          <span class="px-2 py-0.5 rounded-full text-[10px] sm:text-xs font-extrabold ${satisfactionPct >= 75 ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}">
            ${satisfactionPct}%
          </span>
        </td>
        <td class="p-2.5 sm:p-3 text-center">
          <button onclick="document.getElementById('dashboardClassFilter').value='${cls}'; renderDashboard();" class="text-[11px] sm:text-xs bg-sky-100 text-sky-800 font-bold px-2 py-1 rounded-lg">
            Lihat
          </button>
        </td>
      </tr>
    `;
  }).join('');
}

// ==========================================
// EXPORTS & TOAST NOTIFICATION
// ==========================================
function downloadExcelTemplate() {
  const templateData = [
    { "Nama Siswa": "Ahmad Dahlan", "Kelas": "Kelas I" },
    { "Nama Siswa": "Siti Nurhaliza", "Kelas": "Kelas I" },
    { "Nama Siswa": "Bambang Pamungkas", "Kelas": "Kelas IV" }
  ];
  const ws = XLSX.utils.json_to_sheet(templateData);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Daftar Siswa");
  XLSX.writeFile(wb, "Template_Siswa_SDN_1_Tiga.xlsx");
}

function exportResponsesToExcel() {
  let selectedClass = document.getElementById('dashboardClassFilter').value;
  const selectedDate = document.getElementById('dashboardDateFilter').value;

  if (currentUser && currentUser.role === 'guru') {
    selectedClass = currentUser.assignedClass;
  }

  let filtered = surveyResponses;
  if (selectedClass !== 'ALL') filtered = filtered.filter(r => isClassMatch(r.kelas, selectedClass));
  if (selectedDate !== 'ALL') filtered = filtered.filter(r => cleanDateStr(r.dateStr) === selectedDate);

  if (filtered.length === 0) {
    showToast('⚠️ Belum ada data respon untuk diunduh.');
    return;
  }

  const exportData = filtered.map(r => ({
    "Tanggal": cleanDateStr(r.dateStr) || '-',
    "Waktu Detail": r.timestamp || '-',
    "Nama Siswa": r.nama,
    "Kelas": r.kelas,
    "Skor Kepuasan (1-5)": r.score,
    "Pilihan Kepuasan": r.emojiText
  }));

  const ws = XLSX.utils.json_to_sheet(exportData);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Laporan Kepuasan");

  const classLabel = selectedClass === 'ALL' ? 'SemuaKelas' : selectedClass.replace(/\s+/g, '_');
  XLSX.writeFile(wb, `Laporan_Kepuasan_${classLabel}_SDN1Tiga.xlsx`);
}

function showToast(message, icon = '✨') {
  const toast = document.getElementById('toast');
  document.getElementById('toastIcon').textContent = icon;
  document.getElementById('toastMessage').textContent = message;
  toast.classList.remove('translate-y-24', 'opacity-0');
  toast.classList.add('translate-y-0', 'opacity-100');
  setTimeout(() => {
    toast.classList.remove('translate-y-0', 'opacity-100');
    toast.classList.add('translate-y-24', 'opacity-0');
  }, 2500);
}

// ==========================================
// SINKRONISASI LANGSUNG DARI GOOGLE SHEETS
// ==========================================
async function syncDataFromGoogleSheets() {
  if (!GOOGLE_SCRIPT_URL) return;
  
  try {
    const res = await fetch(GOOGLE_SCRIPT_URL);
    const cloudData = await res.json();
    
    // 1. Ambil data siswa murni dari Google Sheets
    if (Array.isArray(cloudData.students)) {
      studentsData = cloudData.students;
    }

    // 2. Ambil data respon murni dari Google Sheets
    if (Array.isArray(cloudData.responses)) {
      surveyResponses = cloudData.responses.map(r => {
        r.dateStr = cleanDateStr(r.dateStr);
        return r;
      });
    }

    // 3. Ambil data user dari Google Sheets
    if (Array.isArray(cloudData.users) && cloudData.users.length > 0) {
      usersData = cloudData.users;
    }

    updateAllViews();
    if (currentUser && currentUser.role === 'admin') renderUsersTable();

  } catch (err) {
    console.error('Gagal sinkronisasi data dari Google Sheets:', err);
  }
}
