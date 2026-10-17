// GLOBAL STATE
let studentsData = [];
let surveyResponses = [];
let usersData = [];
let currentUser = null; // null = Guest / Mode Siswa

// OPTIONAL: Google Apps Script Web App URL (Kosongkan jika menggunakan LocalStorage)
const GOOGLE_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycby-oyF5NxWvPJLiFiIkusvzDgm0_bl6agBZslGJJmspIR7ohUsIFnxWN47EZJ6nS-TEEA/exec'; 

// Siswa Session state
let activeClass = '';
let activeClassStudents = [];
let currentStudentIndex = 0;

const emojiIconMap = {
  'Sangat Senang': '🤩',
  'Senang': '😊',
  'Biasa Saja': '😐',
  'Kurang Senang': '🙁',
  'Sedih': '😢'
};

function getTodayDateStr() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

// SMART GRADE NUMBER EXTRACTOR (1-6)
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

// SMART CLASS MATCHING
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

// INITIALIZATION
window.addEventListener('DOMContentLoaded', () => {
  loadDataFromLocalStorage();
  if (studentsData.length === 0) loadSampleData(false);
  updateAuthUI();
  updateAllViews();
});

// LOCAL STORAGE
function loadDataFromLocalStorage() {
  const savedStudents = localStorage.getItem('sd1tiga_students');
  const savedResponses = localStorage.getItem('sd1tiga_responses');
  const savedUsers = localStorage.getItem('sd1tiga_users');
  const savedCurrentUser = localStorage.getItem('sd1tiga_current_user');

  if (savedStudents) studentsData = JSON.parse(savedStudents);
  if (savedResponses) surveyResponses = JSON.parse(savedResponses);
  
  if (savedUsers) {
    usersData = JSON.parse(savedUsers);
  } else {
    usersData = [
      { id: 'u0', nama: 'Administrator Sekolah', username: 'admin', password: 'admin123', role: 'admin', assignedClass: 'ALL' },
      { id: 'u1', nama: 'Guru Kelas I', username: 'guru1', password: 'guru123', role: 'guru', assignedClass: 'Kelas I' },
      { id: 'u2', nama: 'Guru Kelas II', username: 'guru2', password: 'guru123', role: 'guru', assignedClass: 'Kelas II' },
      { id: 'u3', nama: 'Guru Kelas III', username: 'guru3', password: 'guru123', role: 'guru', assignedClass: 'Kelas III' },
      { id: 'u4', nama: 'Guru Kelas IV', username: 'guru4', password: 'guru123', role: 'guru', assignedClass: 'Kelas IV' },
      { id: 'u5', nama: 'Guru Kelas V', username: 'guru5', password: 'guru123', role: 'guru', assignedClass: 'Kelas V' },
      { id: 'u6', nama: 'Guru Kelas VI', username: 'guru6', password: 'guru123', role: 'guru', assignedClass: 'Kelas VI' }
    ];
    saveUsersToLocalStorage();
  }

  if (savedCurrentUser) currentUser = JSON.parse(savedCurrentUser);
}

function saveDataToLocalStorage() {
  localStorage.setItem('sd1tiga_students', JSON.stringify(studentsData));
  localStorage.setItem('sd1tiga_responses', JSON.stringify(surveyResponses));
}

function saveUsersToLocalStorage() {
  localStorage.setItem('sd1tiga_users', JSON.stringify(usersData));
}

// AUTHENTICATION SYSTEM
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
    localStorage.setItem('sd1tiga_current_user', JSON.stringify(currentUser));
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
  currentUser = null;
  localStorage.removeItem('sd1tiga_current_user');
  updateAuthUI();
  switchTab('siswa');
  showToast('Anda telah logout.', '👋');
}

// TAB SWITCHING WITH ROLE GUARDS
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

// ADMIN KELOLA SISWA (TAMBAH MANUAL, EDIT, & HAPUS)
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

  // Simpan di LocalStorage Browser
  studentsData.push({ id: newStudentPayload.id, nama: newStudentPayload.nama, kelas: newStudentPayload.kelas });
  saveDataToLocalStorage();
  updateAllViews();

  // Kirim ke Google Sheets
  if (GOOGLE_SCRIPT_URL) {
    fetch(GOOGLE_SCRIPT_URL, {
      method: 'POST',
      mode: 'no-cors',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newStudentPayload)
    }).catch(err => console.error('Gagal kirim data siswa ke Google Sheets:', err));
  }

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
    surveyResponses.forEach(r => {
      if (r.studentId === id) {
        r.nama = newNama;
        r.kelas = newKelas;
      }
    });

    student.nama = newNama;
    student.kelas = newKelas;

    saveDataToLocalStorage();
    updateAllViews();
    closeEditStudentModal();
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
    saveDataToLocalStorage();
    updateAllViews();
    showToast(`🗑️ Data ${studentName} berhasil dihapus.`, '⚠️');
  }
}

// ADMIN USER MANAGEMENT (TAMBAH, EDIT, & HAPUS AKUN)
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

  usersData.push({
    id: 'u_' + Date.now(),
    nama, username, password, role, assignedClass
  });

  saveUsersToLocalStorage();
  renderUsersTable();
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
      localStorage.setItem('sd1tiga_current_user', JSON.stringify(currentUser));
      updateAuthUI();
    }

    saveUsersToLocalStorage();
    renderUsersTable();
    closeEditUserModal();
    showToast(`✅ Akun "${newNama}" berhasil diperbarui!`, '✏️');
  }
}

function deleteUser(id) {
  if (confirm('Hapus akun pengguna ini?')) {
    usersData = usersData.filter(u => u.id !== id);
    saveUsersToLocalStorage();
    renderUsersTable();
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

// EXCEL PARSER (ADMIN ONLY)
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
        saveDataToLocalStorage();
        updateAllViews();

        // === OTOMATIS KIRIM DATA EXCEL KE GOOGLE SHEETS ===
        if (GOOGLE_SCRIPT_URL) {
          fetch(GOOGLE_SCRIPT_URL, {
            method: 'POST',
            mode: 'no-cors',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              action: 'ADD_BULK_STUDENTS',
              students: newStudents
            })
          }).catch(err => console.error('Gagal sync Excel ke Google Sheets:', err));
        }

        showToast(`✅ Berhasil mengunggah ${newStudents.length} data siswa!`, '🎉');
      }
    } catch (err) {
      showToast('❌ Gagal membaca file Excel.');
    }
  };
  reader.readAsArrayBuffer(file);
}
function loadSampleData(notify = true) {
  studentsData = [
    { id: 's1', nama: 'Aditya Pratama', kelas: 'Kelas I' },
    { id: 's2', nama: 'Anisa Rahma', kelas: 'Kelas I' },
    { id: 's3', nama: 'Budi Santoso', kelas: 'Kelas II' },
    { id: 's4', nama: 'Citra Dewi', kelas: 'Kelas III' },
    { id: 's5', nama: 'Dion Permana', kelas: 'Kelas IV' },
    { id: 's6', nama: 'Eka Lestari', kelas: 'Kelas IV' },
    { id: 's7', nama: 'Faris Hidayat', kelas: 'Kelas V' },
    { id: 's8', nama: 'Gita Savitri', kelas: 'Kelas VI' }
  ];

  const today = getTodayDateStr();
  surveyResponses = [
    { id: 'r1', studentId: 's1', nama: 'Aditya Pratama', kelas: 'Kelas I', score: 5, emojiText: 'Sangat Senang', dateStr: today, timestamp: `${today} 08:30` },
    { id: 'r2', studentId: 's2', nama: 'Anisa Rahma', kelas: 'Kelas I', score: 4, emojiText: 'Senang', dateStr: today, timestamp: `${today} 08:31` },
    { id: 'r3', studentId: 's5', nama: 'Dion Permana', kelas: 'Kelas IV', score: 5, emojiText: 'Sangat Senang', dateStr: today, timestamp: `${today} 09:15` }
  ];

  saveDataToLocalStorage();
  updateAllViews();
  if (notify) showToast('Data contoh SD Negeri 1 Tiga dimuat!');
}

function clearAllData() {
  if (!currentUser || currentUser.role !== 'admin') {
    showToast('⛔ Hanya Admin yang dapat menghapus seluruh data.');
    return;
  }
  if (confirm('Hapus seluruh data siswa dan riwayat survei?')) {
    studentsData = [];
    surveyResponses = [];
    saveDataToLocalStorage();
    updateAllViews();
    showToast('Data dibersihkan.');
  }
}

function deleteSingleResponse(respId) {
  if (!currentUser || currentUser.role !== 'admin') {
    showToast('⛔ Hanya Admin yang dapat menghapus respon.');
    return;
  }

  if (confirm('Apakah Anda yakin ingin menghapus respon siswa ini?')) {
    surveyResponses = surveyResponses.filter(r => r.id !== respId);
    saveDataToLocalStorage();
    renderDashboard();
    renderStudentTable();
    showToast('🗑️ Respon siswa berhasil dihapus.');
  }
}

function deleteAllResponsesForFilter() {
  if (!currentUser || currentUser.role !== 'admin') {
    showToast('⛔ Hanya Admin yang dapat menghapus respon.');
    return;
  }

  const selectedClass = document.getElementById('dashboardClassFilter').value;
  const selectedDate = document.getElementById('dashboardDateFilter').value;

  if (confirm(`Hapus seluruh respon untuk filter (${selectedDate} - ${selectedClass})?`)) {
    surveyResponses = surveyResponses.filter(r => {
      const matchClass = selectedClass === 'ALL' || isClassMatch(r.kelas, selectedClass);
      const matchDate = selectedDate === 'ALL' || r.dateStr === selectedDate;
      return !(matchClass && matchDate);
    });

    saveDataToLocalStorage();
    renderDashboard();
    renderStudentTable();
    showToast('🗑️ Seluruh respon terfilter berhasil dihapus.');
  }
}

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
  const dates = [...new Set(surveyResponses.map(r => r.dateStr))].filter(Boolean).sort().reverse();
  dates.forEach(dStr => dashDateFilter.appendChild(new Option(`🗓️ ${dStr}`, dStr)));
}

// SISWA SESSION
function startSiswaSession() {
  const selectedClass = document.getElementById('siswaClassSelect').value;
  if (!selectedClass) return;

  activeClass = selectedClass;
  activeClassStudents = studentsData.filter(s => isClassMatch(s.kelas, activeClass));
  currentStudentIndex = 0;

  document.getElementById('siswaClassSelectCard').classList.add('hidden');
  document.getElementById('siswaFinishedCard').classList.add('hidden');
  document.getElementById('siswaVotingCard').classList.remove('hidden');

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
  confetti({ particleCount: 30, spread: 50, origin: { y: 0.7 } });
  const currentStudent = activeClassStudents[currentStudentIndex];
  const todayDateStr = getTodayDateStr();

  const dataRespon = {
    id: 'resp_' + Date.now(),
    studentId: currentStudent.id,
    nama: currentStudent.nama,
    kelas: currentStudent.kelas,
    score: score,
    emojiText: emojiText,
    dateStr: todayDateStr,
    timestamp: new Date().toLocaleString('id-ID')
  };

  surveyResponses = surveyResponses.filter(r => !(r.studentId === currentStudent.id && r.dateStr === todayDateStr));
  surveyResponses.push(dataRespon);

  saveDataToLocalStorage();

  if (GOOGLE_SCRIPT_URL) {
    fetch(GOOGLE_SCRIPT_URL, {
      method: 'POST',
      mode: 'no-cors',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(dataRespon)
    }).catch(err => console.error('Error Google Sheets:', err));
  }

  showToast(`Terima kasih, ${currentStudent.nama}! 😊`, '✨');

  currentStudentIndex++;
  setTimeout(displayCurrentStudent, 400);
}

function skipStudent() {
  currentStudentIndex++;
  displayCurrentStudent();
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
  populateDateSelects();
}

function stopSiswaSession() {
  if (confirm('Akhiri sesi survei ini?')) resetToClassSelect();
}

function resetToClassSelect() {
  document.getElementById('siswaVotingCard').classList.add('hidden');
  document.getElementById('siswaFinishedCard').classList.add('hidden');
  document.getElementById('siswaClassSelectCard').classList.remove('hidden');
}

// RENDER STUDENT TABLE
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

  tbody.innerHTML = filtered.map((s, index) => {
    const hasVotedToday = surveyResponses.some(r => r.studentId === s.id && r.dateStr === todayStr);
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

// RENDER DASHBOARD
function renderDashboard() {
  const classFilterEl = document.getElementById('dashboardClassFilter');
  const dateFilterEl = document.getElementById('dashboardDateFilter');
  const subtextEl = document.getElementById('dashboardRoleSubtext');

  const btnClearResponsesAdmin = document.getElementById('btnClearResponsesAdmin');
  const thActionAdmin = document.getElementById('thActionAdmin');

  let selectedClass = classFilterEl.value;
  const selectedDate = dateFilterEl.value;

  // ROLE RESTRICTION FOR GURU
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

  // Filter Responses based on Role and Filter Selectors
  let filteredResponses = surveyResponses;

  if (selectedClass !== 'ALL') {
    filteredResponses = filteredResponses.filter(r => isClassMatch(r.kelas, selectedClass));
  }
  if (selectedDate !== 'ALL') {
    filteredResponses = filteredResponses.filter(r => r.dateStr === selectedDate);
  }

  // Filter Students
  const filteredStudents = selectedClass === 'ALL' 
    ? studentsData 
    : studentsData.filter(s => isClassMatch(s.kelas, selectedClass));

  const totalResp = filteredResponses.length;
  document.getElementById('statTotalResponses').textContent = totalResp;

  const targetDate = selectedDate === 'ALL' ? getTodayDateStr() : selectedDate;
  const votedStudentIds = new Set(surveyResponses.filter(r => r.dateStr === targetDate).map(r => r.studentId));
  const pending = filteredStudents.filter(s => !votedStudentIds.has(s.id)).length;
  document.getElementById('statPendingStudents').textContent = pending > 0 ? pending : 0;

  if (totalResp === 0) {
    document.getElementById('statSatisfactionRate').textContent = '0%';
    document.getElementById('statTopEmoji').textContent = '-';
    document.getElementById('responseTableBody').innerHTML = `<tr><td colspan="5" class="p-6 text-center text-slate-400">Belum ada respon untuk filter ini.</td></tr>`;
    document.getElementById('emojiDistributionBars').innerHTML = `<p class="text-slate-400 text-xs sm:text-sm">Belum ada data.</p>`;
  } else {
    const totalScore = filteredResponses.reduce((acc, r) => acc + r.score, 0);
    document.getElementById('statSatisfactionRate').textContent = `${Math.round((totalScore / (totalResp * 5)) * 100)}%`;

    const emojiCounts = { 'Sangat Senang': 0, 'Senang': 0, 'Biasa Saja': 0, 'Kurang Senang': 0, 'Sedih': 0 };
    filteredResponses.forEach(r => { if (emojiCounts[r.emojiText] !== undefined) emojiCounts[r.emojiText]++; });

    let topEmoji = '🤩';
    let maxCount = -1;
    Object.keys(emojiCounts).forEach(key => {
      if (emojiCounts[key] > maxCount) {
        maxCount = emojiCounts[key];
        topEmoji = emojiIconMap[key];
      }
    });
    document.getElementById('statTopEmoji').textContent = topEmoji;

    document.getElementById('emojiDistributionBars').innerHTML = Object.keys(emojiCounts).map(key => {
      const count = emojiCounts[key];
      const barPct = Math.round((count / totalResp) * 100);
      return `
        <div>
          <div class="flex justify-between text-xs font-bold mb-1 text-slate-700">
            <span>${emojiIconMap[key]} ${key}</span>
            <span>${count} siswa (${barPct}%)</span>
          </div>
          <div class="w-full bg-slate-100 h-2.5 sm:h-3 rounded-full overflow-hidden">
            <div class="bg-sky-500 h-full rounded-full" style="width: ${barPct}%"></div>
          </div>
        </div>
      `;
    }).join('');

    // Response History Rows
    const isAdmin = currentUser && currentUser.role === 'admin';
    document.getElementById('responseTableBody').innerHTML = filteredResponses.slice().reverse().map(r => `
      <tr class="hover:bg-slate-50">
        <td class="p-2.5 sm:p-3 text-[11px] sm:text-xs text-slate-500 font-mono">${r.timestamp || r.dateStr}</td>
        <td class="p-2.5 sm:p-3 font-semibold text-slate-800">${r.nama}</td>
        <td class="p-2.5 sm:p-3"><span class="bg-sky-50 text-sky-700 px-2 py-0.5 rounded-lg text-xs font-bold">${r.kelas}</span></td>
        <td class="p-2.5 sm:p-3 font-bold">${emojiIconMap[r.emojiText] || ''} ${r.emojiText}</td>
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
  const dates = [...new Set(surveyResponses.map(r => r.dateStr))].filter(Boolean).sort().reverse();

  if (dates.length === 0) {
    dailyTbody.innerHTML = `<tr><td colspan="4" class="p-4 text-center text-slate-400">Belum ada riwayat harian.</td></tr>`;
    return;
  }

  dailyTbody.innerHTML = dates.map(dStr => {
    let dayResponses = surveyResponses.filter(r => r.dateStr === dStr);
    if (selectedClassFilter !== 'ALL') {
      dayResponses = dayResponses.filter(r => isClassMatch(r.kelas, selectedClassFilter));
    }

    const count = dayResponses.length;
    let satisfactionPct = 0;

    if (count > 0) {
      const totalScore = dayResponses.reduce((acc, r) => acc + r.score, 0);
      satisfactionPct = Math.round((totalScore / (count * 5)) * 100);
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
      clsResponses = clsResponses.filter(r => r.dateStr === selectedDateFilter);
    }

    const count = clsResponses.length;
    let satisfactionPct = 0;

    if (count > 0) {
      const totalScore = clsResponses.reduce((acc, r) => acc + r.score, 0);
      satisfactionPct = Math.round((totalScore / (count * 5)) * 100);
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

// EXPORT RESPONSES TO EXCEL
function exportResponsesToExcel() {
  let selectedClass = document.getElementById('dashboardClassFilter').value;
  const selectedDate = document.getElementById('dashboardDateFilter').value;

  if (currentUser && currentUser.role === 'guru') {
    selectedClass = currentUser.assignedClass;
  }

  let filtered = surveyResponses;
  if (selectedClass !== 'ALL') filtered = filtered.filter(r => isClassMatch(r.kelas, selectedClass));
  if (selectedDate !== 'ALL') filtered = filtered.filter(r => r.dateStr === selectedDate);

  if (filtered.length === 0) {
    showToast('⚠️ Belum ada data respon untuk diunduh.');
    return;
  }

  const exportData = filtered.map(r => ({
    "Tanggal": r.dateStr || '-',
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

// AMBIL DATA TERBARU DARI GOOGLE SHEETS (JIKA URL DIISI)
async function syncDataFromGoogleSheets() {
  if (!GOOGLE_SCRIPT_URL) return;
  
  try {
    const res = await fetch(GOOGLE_SCRIPT_URL);
    const dataCloud = await res.json();
    
    if (Array.isArray(dataCloud) && dataCloud.length > 0) {
      surveyResponses = dataCloud;
      saveDataToLocalStorage();
      renderDashboard();
    }
  } catch (err) {
    console.log('Menggunakan data lokal offline.');
  }
}
