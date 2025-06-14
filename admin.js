'use strict';

document.addEventListener('DOMContentLoaded', () => {

    // =================================================================
    // KONFIGURASI DAN STATE APLIKASI
    // =================================================================
    const API_BASE_URL = 'http://localhost:3000/api';
    let userData = JSON.parse(sessionStorage.getItem('userData'));

    if (!userData || sessionStorage.getItem('userRole') !== 'admin') {
        alert("Akses ditolak. Silakan login sebagai admin.");
        window.location.href = 'index.html';
        return;
    }

    const DOMElements = {
        // Layout
        sidebar: document.getElementById('sidebar'),
        toggleSidebarButton: document.getElementById('toggleSidebar'),
        darkModeButton: document.getElementById('toggleDarkMode'),
        body: document.body,
        // Menu & Konten
        menuItems: document.querySelectorAll('.menu li'),
        tabContents: document.querySelectorAll('.tab-content'),
        logoutButton: document.getElementById('logout-btn'),
        adminNameHeader: document.getElementById('adminName'),
        sidebarProfilePic: document.getElementById('sidebarProfilePic'),
        // Tab Cek Absensi
        tabelAbsensiHarianBody: document.querySelector('#tabelAbsensiHarian tbody'),
        filterTanggalBtn: document.getElementById('filterTanggalBtn'),
        tanggalCekInput: document.getElementById('tanggalCek'),
        // Tab Rekap Absensi
        tabelRekapDetailBody: document.querySelector('#tabelRekapDetail tbody'),
        tampilkanRekapBtn: document.getElementById('tampilkanRekapBtn'),
        downloadRekapBtn: document.getElementById('downloadRekapBtn'),
        bulanRekapInput: document.getElementById('bulanRekap'),
        // Tab Pengaturan Akun
        tabelKaryawanBody: document.querySelector('#tabelKaryawan tbody'),
        tambahKaryawanBtn: document.getElementById('tambahKaryawanBtn'),
        // Tab Pengaturan Absensi
        formPengaturanAbsensi: document.getElementById('formPengaturanAbsensi'),
        // Modal Karyawan
        userModal: document.getElementById('userModal'),
        closeModalBtn: document.querySelector('#userModal .close-button'),
        userForm: document.getElementById('userForm'),
        modalTitle: document.getElementById('modalTitle'),
        userIdInput: document.getElementById('userId'),
        namaLengkapInput: document.getElementById('namaLengkap'),
        emailInput: document.getElementById('email'),
        teleponInput: document.getElementById('telepon'),
        karyawanPasswordInput: document.getElementById('karyawanPassword'),
        // Modal Foto
        photoModal: document.getElementById('photoModal'),
        modalImage: document.getElementById('modalImage'),
        closePhotoModalBtn: document.querySelector('.close-photo-button'),
    };

    // =================================================================
    // FUNGSI API
    // =================================================================
    async function apiCall(endpoint, options = {}) {
        try {
            const response = await fetch(`${API_BASE_URL}${endpoint}`, options);
            if (!response.ok) {
                const errorData = await response.json().catch(() => ({ message: `Server error: ${response.statusText}` }));
                throw new Error(errorData.message || 'Terjadi kesalahan pada server');
            }
            if (response.headers.get('content-type')?.includes('application/json')) {
                return response.json();
            }
            return response.text(); // Fallback untuk response non-JSON
        } catch (error) {
            console.error(`API Call Error (${endpoint}):`, error);
            alert(`Gagal terhubung ke server: ${error.message}`);
            throw error;
        }
    }

    // =================================================================
    // FUNGSI RENDER UI
    // =================================================================
    function renderAbsensiTable(data) {
        const tabelBody = DOMElements.tabelAbsensiHarianBody;
        tabelBody.innerHTML = '';
        if (!data || data.length === 0) {
            tabelBody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding: 20px;">Tidak ada data absensi untuk tanggal ini.</td></tr>`;
            return;
        }
        data.forEach(d => {
            const statusClass = d.status ? d.status.toLowerCase() : '';
            const fotoSrc = (d.foto_masuk && d.foto_masuk.startsWith('data:image')) ? d.foto_masuk : 'https://placehold.co/100x100/e60000/white?text=No+Img';
            const row = `
                <tr>
                    <td>${d.nama_lengkap}</td>
                    <td><span class="status-${statusClass}">${d.status}</span></td>
                    <td>${d.waktu_masuk || '-'}</td>
                    <td>${d.waktu_pulang || '-'}</td>
                    <td>${d.lokasi_masuk || '-'}</td>
                    <td><img src="${fotoSrc}" alt="Foto Absen" class="foto-thumbnail" data-full-src="${fotoSrc}"></td>
                </tr>`;
            tabelBody.insertAdjacentHTML('beforeend', row);
        });
    }

    function renderRekapTable(data) {
        const tabelBody = DOMElements.tabelRekapDetailBody;
        tabelBody.innerHTML = '';
        if (!data || data.length === 0) {
            tabelBody.innerHTML = `<tr><td colspan="5" style="text-align:center; padding: 20px;">Tidak ada data rekap untuk bulan ini.</td></tr>`;
            return;
        }
        data.forEach(d => {
            const statusClass = d.status ? d.status.toLowerCase() : '';
            const tanggalFormatted = new Date(d.tanggal).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
            const row = `
                <tr>
                    <td>${tanggalFormatted}</td>
                    <td>${d.nama_lengkap}</td>
                    <td><span class="status-${statusClass}">${d.status}</span></td>
                    <td>${d.waktu_masuk || '-'}</td>
                    <td>${d.waktu_pulang || '-'}</td>
                </tr>`;
            tabelBody.insertAdjacentHTML('beforeend', row);
        });
    }

    function renderKaryawanTable(data) {
        const tabelBody = DOMElements.tabelKaryawanBody;
        tabelBody.innerHTML = '';
        data.forEach(k => {
            const row = `
                <tr>
                    <td>${k.nama_lengkap}</td>
                    <td>${k.email}</td>
                    <td>${k.telepon || '-'}</td>
                    <td class="action-buttons">
                        <button class="btn-edit" data-id="${k.id}" data-nama="${k.nama_lengkap}" data-email="${k.email}" data-telepon="${k.telepon || ''}"><i class="fas fa-edit"></i></button>
                        <button class="btn-delete" data-id="${k.id}"><i class="fas fa-trash-alt"></i></button>
                    </td>
                </tr>`;
            tabelBody.insertAdjacentHTML('beforeend', row);
        });
    }

    // =================================================================
    // FUNGSI LOGIKA INTI
    // =================================================================
    async function loadDataForTab(tabId) {
        switch (tabId) {
            case 'cekAbsensi': await loadAbsensiHarian(); break;
            case 'pengaturanAkun': await loadDaftarKaryawan(); break;
            case 'pengaturanAbsensi': await loadPengaturanAbsensi(); break;
            case 'rekapAbsensi': await loadRekapAbsensi(); break;
        }
    }

    async function loadAbsensiHarian(tanggal = new Date().toISOString().split('T')[0]) {
        try {
            renderAbsensiTable(await apiCall(`/absensi/harian?tanggal=${tanggal}`));
        } catch (error) {
            DOMElements.tabelAbsensiHarianBody.innerHTML = `<tr><td colspan="6" style="text-align:center; color:red;">Gagal memuat data.</td></tr>`;
        }
    }

    async function loadRekapAbsensi() {
        const bulan = DOMElements.bulanRekapInput.value;
        if (!bulan) return;
        try {
            // Memanggil endpoint baru yang khusus untuk JSON
            renderRekapTable(await apiCall(`/rekap/bulanan?bulan=${bulan}`));
        } catch (error) {
            DOMElements.tabelRekapDetailBody.innerHTML = `<tr><td colspan="5" style="text-align:center; color:red;">Gagal memuat data rekap.</td></tr>`;
        }
    }

    async function loadDaftarKaryawan() {
        try {
            renderKaryawanTable(await apiCall('/karyawan'));
        } catch (error) {
            DOMElements.tabelKaryawanBody.innerHTML = `<tr><td colspan="4" style="text-align:center; color:red;">Gagal memuat data karyawan.</td></tr>`;
        }
    }

    async function loadPengaturanAbsensi() {
        try {
            const settings = await apiCall('/settings/attendance');
            if (DOMElements.formPengaturanAbsensi && Object.keys(settings).length > 0) {
                document.getElementById('jamMasuk').value = settings.jam_masuk;
                document.getElementById('jamPulang').value = settings.jam_pulang;
                document.getElementById('latitude').value = settings.latitude;
                document.getElementById('longitude').value = settings.longitude;
                document.getElementById('radius').value = settings.radius;
            }
        } catch (error) {
            console.log("Gagal memuat pengaturan, mungkin belum ada data.");
        }
    }

    // --- Logika Modal ---
    function openUserModal(mode = 'add', karyawan = {}) {
        DOMElements.userForm.reset();
        DOMElements.modalTitle.textContent = mode === 'add' ? 'Tambah Karyawan Baru' : 'Edit Data Karyawan';
        DOMElements.userIdInput.value = karyawan.id || '';
        if (mode === 'edit') {
            DOMElements.namaLengkapInput.value = karyawan.nama;
            DOMElements.emailInput.value = karyawan.email;
            DOMElements.teleponInput.value = karyawan.telepon;
            DOMElements.karyawanPasswordInput.placeholder = 'Biarkan kosong jika tidak ingin mengubah';
            DOMElements.karyawanPasswordInput.required = false;
        } else {
            DOMElements.karyawanPasswordInput.placeholder = 'Password Wajib Diisi';
            DOMElements.karyawanPasswordInput.required = true;
        }
        DOMElements.userModal.style.display = 'block';
    }

    function closeModal() {
        DOMElements.userModal.style.display = 'none';
    }

    function openPhotoModal(imageUrl) {
        DOMElements.modalImage.src = imageUrl;
        DOMElements.photoModal.style.display = 'flex';
    }

    function closePhotoModal() {
        DOMElements.photoModal.style.display = 'none';
    }

    // =================================================================
    // PENGATURAN EVENT LISTENERS
    // =================================================================
    function setupEventListeners() {
        DOMElements.toggleSidebarButton?.addEventListener('click', () => DOMElements.sidebar.classList.toggle('collapsed'));
        
        // DIUBAH: Event listener untuk dark mode sekarang menyimpan state
        DOMElements.darkModeButton?.addEventListener('click', () => {
            DOMElements.body.classList.toggle('dark-mode');
            localStorage.setItem('adminDarkMode', DOMElements.body.classList.contains('dark-mode'));
        });
        
        DOMElements.logoutButton?.addEventListener('click', () => {
            if (confirm('Yakin ingin logout?')) { sessionStorage.clear(); window.location.href = 'index.html'; }
        });

        DOMElements.menuItems.forEach(li => {
            li.addEventListener('click', () => {
                const tabId = li.getAttribute('data-tab');
                DOMElements.tabContents.forEach(tab => tab.classList.remove('active'));
                document.getElementById(tabId)?.classList.add('active');
                DOMElements.menuItems.forEach(i => i.classList.remove('active-menu'));
                li.classList.add('active-menu');
                loadDataForTab(tabId);
            });
        });

        // Event Listeners untuk Tab Spesifik
        DOMElements.filterTanggalBtn?.addEventListener('click', () => loadAbsensiHarian(DOMElements.tanggalCekInput.value));
        DOMElements.tampilkanRekapBtn?.addEventListener('click', loadRekapAbsensi);
        DOMElements.tambahKaryawanBtn?.addEventListener('click', () => openUserModal('add'));
        DOMElements.closeModalBtn?.addEventListener('click', closeModal);
        DOMElements.closePhotoModalBtn?.addEventListener('click', closePhotoModal);
        
        // Event Delegation untuk Aksi Tabel
        document.body.addEventListener('click', (event) => {
            if (event.target.classList.contains('foto-thumbnail')) {
                openPhotoModal(event.target.dataset.fullSrc);
            }
            const editButton = event.target.closest('.btn-edit');
            if (editButton) {
                openUserModal('edit', editButton.dataset);
            }
            const deleteButton = event.target.closest('.btn-delete');
            if (deleteButton && confirm(`Yakin ingin menghapus karyawan ini?`)) {
                apiCall(`/karyawan/${deleteButton.dataset.id}`, { method: 'DELETE' }).then(result => { alert(result.message); loadDaftarKaryawan(); });
            }
        });
        
        window.addEventListener('click', (event) => {
             if (event.target == DOMElements.userModal) closeModal();
             if (event.target == DOMElements.photoModal) closePhotoModal();
        });

        // Event Listeners untuk Form
        DOMElements.userForm?.addEventListener('submit', async (event) => {
            event.preventDefault();
            const id = DOMElements.userIdInput.value;
            const isEdit = id !== '';
            const password = DOMElements.karyawanPasswordInput.value;
            if (!isEdit && !password) return alert('Password wajib diisi untuk karyawan baru.');
            const bodyData = {
                namaLengkap: DOMElements.namaLengkapInput.value,
                email: DOMElements.emailInput.value,
                telepon: DOMElements.teleponInput.value
            };
            if (password) bodyData.password = password;
            try {
                const result = await apiCall(isEdit ? `/karyawan/${id}` : '/karyawan', {
                    method: isEdit ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(bodyData)
                });
                alert(result.message || 'Data berhasil disimpan!');
                closeModal();
                loadDaftarKaryawan();
            } catch (error) { /* Handled in apiCall */ }
        });

        DOMElements.formPengaturanAbsensi?.addEventListener('submit', async (event) => {
            event.preventDefault();
            const bodyData = {
                jam_masuk: document.getElementById('jamMasuk').value,
                jam_pulang: document.getElementById('jamPulang').value,
                latitude: document.getElementById('latitude').value,
                longitude: document.getElementById('longitude').value,
                radius: document.getElementById('radius').value
            };
            if (confirm("Yakin ingin menyimpan pengaturan ini?")) {
                try {
                    const result = await apiCall('/settings/attendance', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(bodyData) });
                    alert(result.message || "Pengaturan berhasil disimpan!");
                } catch (error) { /* Handled in apiCall */ }
            }
        });
        
        DOMElements.downloadRekapBtn?.addEventListener('click', () => {
            const bulan = DOMElements.bulanRekapInput.value;
            if (!bulan) return alert('Silakan pilih bulan terlebih dahulu.');
            window.location.href = `${API_BASE_URL}/rekap/download?bulan=${bulan}`;
        });
    }

    // =================================================================
    // INISIALISASI APLIKASI
    // =================================================================
    function initAdminUI() {
        const { adminNameHeader, sidebarProfilePic, tanggalCekInput, bulanRekapInput } = DOMElements;
        adminNameHeader.textContent = userData.namaLengkap || userData.nama || 'Admin';
        sidebarProfilePic.src = userData.foto_profil || 'Admin-Avatar.png';
        tanggalCekInput.valueAsDate = new Date();
        const now = new Date();
        bulanRekapInput.value = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    }

    async function init() {
        // DIUBAH: Memeriksa dan menerapkan dark mode saat aplikasi dimuat
        if (localStorage.getItem('adminDarkMode') === 'true') {
            DOMElements.body.classList.add('dark-mode');
        }

        setupEventListeners();
        try {
            const fullProfile = await apiCall(`/users/${userData.id}/profile`);
            userData = { ...userData, ...fullProfile };
            sessionStorage.setItem('userData', JSON.stringify(userData));
        } catch (error) {
            console.error("Gagal memuat profil lengkap, menggunakan data sesi dasar.", error);
        }
        initAdminUI();
        document.querySelector('.menu li[data-tab="cekAbsensi"]')?.click();
    }
    
    init();
});
