'use strict';

document.addEventListener('DOMContentLoaded', () => {
    const API_BASE_URL = 'http://localhost:3000/api';
    let userData = JSON.parse(sessionStorage.getItem('userData'));

    if (!userData) {
        alert("Anda harus login terlebih dahulu!");
        window.location.href = 'index.html';
        return;
    }

    const DOMElements = {
        sidebar: document.getElementById('sidebar'),
        toggleSidebarButton: document.getElementById('toggleSidebar'),
        darkModeButton: document.getElementById('toggleDarkMode'),
        body: document.body,
        logoutButton: document.getElementById('logout-btn'),
        menuItems: document.querySelectorAll('.menu li'),
        tabContents: document.querySelectorAll('.tab-content'),
        sidebarUserName: document.getElementById('sidebar-user-name'),
        sidebarProfilePic: document.querySelector('.sidebar .profile-picture img'),
        mainProfilePic: document.getElementById('mainProfilePic'),
        uploadProfilePicInput: document.getElementById('uploadProfilePic'),
        changePhotoBtn: document.getElementById('changePhotoBtn'),
        profileForm: document.getElementById('profileForm'),
        profileNamaInput: document.getElementById('profileNama'),
        profileEmailInput: document.getElementById('profileEmail'),
        profileTeleponInput: document.getElementById('profileTelepon'),
        editProfileBtn: document.getElementById('editProfileBtn'),
        saveProfileBtn: document.getElementById('saveProfileBtn'),
        cancelProfileBtn: document.getElementById('cancelProfileBtn'),
        realtimeLocation: document.getElementById('realtime-location'),
        video: document.getElementById('video'),
        canvas: document.getElementById('snapshot'),
        toggleCameraButton: document.getElementById('toggleCameraButton'),
        clockInButton: document.getElementById('clockInButton'),
        clockOutButton: document.getElementById('clockOutButton'),
        riwayatContainer: document.getElementById("riwayatContainer"),
        bulanRekapInput: document.getElementById('bulanRekap'),
        tampilkanRekapBtn: document.getElementById('tampilkanRekapBtn'),
        detailRekapList: document.getElementById('detailRekapList')
    };

    let cameraStream = null;
    let isCameraOn = false;

    async function apiCall(endpoint, options = {}) {
        try {
            const response = await fetch(`${API_BASE_URL}${endpoint}`, options);
            const result = await response.json();
            if (!response.ok) throw new Error(result.error || result.message || "Terjadi kesalahan pada server");
            return result;
        } catch (error) {
            console.error(`API Call Error (${endpoint}):`, error);
            alert(`Gagal terhubung ke server: ${error.message}`);
            throw error;
        }
    }

    function getLocation(updateUI = false) {
        return new Promise((resolve) => {
            const locationElement = DOMElements.realtimeLocation;
            if (!navigator.geolocation || !locationElement) {
                if (locationElement) locationElement.textContent = "Geolocation tidak didukung.";
                return resolve({ locationString: "Tidak Didukung" });
            }
            if (updateUI) locationElement.textContent = "Mendeteksi lokasi...";

            navigator.geolocation.getCurrentPosition(
                (position) => {
                    const locStr = `Lat: ${position.coords.latitude.toFixed(5)}, Lon: ${position.coords.longitude.toFixed(5)}`;
                    if (updateUI) locationElement.textContent = locStr;
                    resolve({ latitude: position.coords.latitude, longitude: position.coords.longitude, locationString: locStr });
                },
                (error) => {
                    console.error("Geolocation Error Details:", error);
                    let errorMessage = "Gagal mendapatkan lokasi.";
                    switch (error.code) {
                        case error.PERMISSION_DENIED: errorMessage = "Izin lokasi ditolak pengguna."; break;
                        case error.POSITION_UNAVAILABLE: errorMessage = "Informasi lokasi tidak tersedia."; break;
                        case error.TIMEOUT: errorMessage = "Waktu permintaan lokasi habis."; break;
                        case error.UNKNOWN_ERROR: errorMessage = "Terjadi kesalahan yang tidak diketahui."; break;
                    }
                    if (updateUI) locationElement.textContent = errorMessage;
                    resolve({ locationString: "Gagal" });
                }, { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
            );
        });
    }

    async function handleAttendance(type) {
        if (!isCameraOn) {
            alert("Kamera tidak aktif. Silakan nyalakan kamera terlebih dahulu.");
            return;
        }
        const locationData = await getLocation(true);
        if (locationData.locationString === "Gagal" || locationData.locationString === "Tidak Didukung") {
            alert("Gagal mendapatkan lokasi, absen dibatalkan.");
            return;
        }
        const context = DOMElements.canvas.getContext('2d');
        DOMElements.canvas.width = DOMElements.video.videoWidth;
        DOMElements.canvas.height = DOMElements.video.videoHeight;
        context.drawImage(DOMElements.video, 0, 0, DOMElements.canvas.width, DOMElements.canvas.height);
        const photoDataUrl = DOMElements.canvas.toDataURL('image/jpeg', 0.8);
        try {
            const endpoint = type === 'clockin' ? '/clockin' : '/clockout';
            const now = new Date();
            const hours = String(now.getHours()).padStart(2, '0');
            const minutes = String(now.getMinutes()).padStart(2, '0');
            const seconds = String(now.getSeconds()).padStart(2, '0');
            const currentTime = `${hours}:${minutes}:${seconds}`;
            const result = await apiCall(endpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    userId: userData.id,
                    time: currentTime,
                    location: locationData.locationString,
                    photo: photoDataUrl
                })
            });
            alert(result.message);
            loadDailyHistory();
        } catch (error) { /* Handled in apiCall */ }
    }

    // =============================================================
    // DITAMBAHKAN: Fungsi untuk mengatur status tombol absen
    // =============================================================
    function updateAttendanceButtonsState(attendanceData) {
        const { clockInButton, clockOutButton } = DOMElements;

        // Default state: enable clock-in, disable clock-out.
        clockInButton.disabled = false;
        clockInButton.style.opacity = '1';
        clockInButton.style.cursor = 'pointer';

        clockOutButton.disabled = true;
        clockOutButton.style.opacity = '0.5';
        clockOutButton.style.cursor = 'not-allowed';

        if (attendanceData) {
            // Jika sudah ada waktu masuk, nonaktifkan tombol Masuk
            if (attendanceData.waktu_masuk) {
                clockInButton.disabled = true;
                clockInButton.style.opacity = '0.5';
                clockInButton.style.cursor = 'not-allowed';
                // Dan aktifkan tombol Pulang
                clockOutButton.disabled = false;
                clockOutButton.style.opacity = '1';
                clockOutButton.style.cursor = 'pointer';
            }
            // Jika sudah ada waktu pulang, nonaktifkan juga tombol Pulang
            if (attendanceData.waktu_pulang) {
                clockOutButton.disabled = true;
                clockOutButton.style.opacity = '0.5';
                clockOutButton.style.cursor = 'not-allowed';
            }
        }
    }


    async function loadDailyHistory() {
        if (!DOMElements.riwayatContainer) return;
        const today = new Date().toISOString().split('T')[0];
        try {
            const data = await apiCall(`/attendance/history/${userData.id}?bulan=${today.substring(0, 7)}`);
            const todayAttendance = data.find(att => att.tanggal === today);

            // DIUBAH: Panggil fungsi untuk update tombol berdasarkan data
            updateAttendanceButtonsState(todayAttendance);

            DOMElements.riwayatContainer.innerHTML = "";
            if (!todayAttendance) {
                DOMElements.riwayatContainer.innerHTML = "<p class='no-data-info'>Belum ada riwayat kehadiran hari ini.</p>";
                return;
            }
            const statusClass = (todayAttendance.status || 'Hadir').toLowerCase();
            const card = `
                <div class="card-kehadiran">
                    <div class="card-info">
                        <span class="tgl">Hari Ini - ${new Date(todayAttendance.tanggal).toLocaleDateString("id-ID", { weekday: "long", day: "numeric", month: "long" })}</span>
                        <span class="jam">Masuk: ${todayAttendance.waktu_masuk || '---'} | Pulang: ${todayAttendance.waktu_pulang || '---'}</span>
                    </div>
                    <div class="card-status ${statusClass}">${todayAttendance.status || 'Hadir'}</div>
                </div>`;
            DOMElements.riwayatContainer.innerHTML = card;
        } catch (error) {
            console.error("Error loading daily history:", error);
            DOMElements.riwayatContainer.innerHTML = "<p class='no-data-info' style='color:red;'>Gagal memuat riwayat.</p>";
            // Jika gagal memuat, set tombol ke keadaan awal
            updateAttendanceButtonsState(null);
        }
    }

    async function loadRecapData(bulan) {
        if (!DOMElements.detailRekapList) return;
        DOMElements.detailRekapList.innerHTML = `<li class="no-data-info">Memuat data rekap untuk bulan ${bulan}...</li>`;
        try {
            const data = await apiCall(`/attendance/history/${userData.id}?bulan=${bulan}`);
            if (data.length === 0) {
                DOMElements.detailRekapList.innerHTML = `<li class="no-data-info">Tidak ada data kehadiran untuk bulan yang dipilih.</li>`;
                return;
            }
            const header = `
                <li class="rekap-item-header">
                    <div>Tanggal</div>
                    <div style="text-align:center;">Status</div>
                    <div style="text-align:right;">Waktu</div>
                </li>`;
            const listItems = data.map(item => {
                const tanggalFormatted = new Date(item.tanggal).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
                const statusClass = (item.status || '').toLowerCase().replace(' ', '-');
                return `
                    <li class="rekap-item">
                        <div class="rekap-date">${tanggalFormatted}</div>
                        <div class="rekap-status rekap-status-${statusClass}">${item.status || 'Tidak Diketahui'}</div>
                        <div class="rekap-time">
                            <span>Masuk: ${item.waktu_masuk || '---'}</span>
                            <span>Pulang: ${item.waktu_pulang || '---'}</span>
                        </div>
                    </li>`;
            }).join('');
            DOMElements.detailRekapList.innerHTML = header + listItems;
        } catch (error) {
            console.error("Error loading recap data:", error);
            DOMElements.detailRekapList.innerHTML = `<li class="no-data-info"><strong style="color: red;">Gagal memuat data rekap.</strong></li>`;
        }
    }

    function toggleProfileEditMode(isEditing) {
        const { profileNamaInput, profileEmailInput, profileTeleponInput, editProfileBtn, saveProfileBtn, cancelProfileBtn } = DOMElements;
        [profileNamaInput, profileEmailInput, profileTeleponInput].forEach(input => input.readOnly = !isEditing);
        editProfileBtn.style.display = isEditing ? 'none' : 'inline-flex';
        saveProfileBtn.style.display = isEditing ? 'inline-flex' : 'none';
        cancelProfileBtn.style.display = isEditing ? 'inline-flex' : 'none';
    }

    function initProfileUI() {
        const displayName = userData.namaLengkap || userData.nama || 'Pengguna';
        DOMElements.sidebarUserName.textContent = displayName;
        DOMElements.profileNamaInput.value = displayName;
        DOMElements.profileEmailInput.value = userData.email || '';
        DOMElements.profileTeleponInput.value = userData.telepon || '';
        if (userData.foto_profil) {
            DOMElements.mainProfilePic.src = userData.foto_profil;
            DOMElements.sidebarProfilePic.src = userData.foto_profil;
        } else {
            DOMElements.mainProfilePic.src = 'Admin-Avatar.png';
            DOMElements.sidebarProfilePic.src = 'Admin-Avatar.png';
        }
    }

    async function setupCamera() {
        if (!navigator.mediaDevices?.getUserMedia) {
            alert("Kamera tidak didukung oleh browser ini.");
            return;
        }
        try {
            cameraStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" } });
            DOMElements.video.srcObject = cameraStream;
            await DOMElements.video.play();
            isCameraOn = true;
            DOMElements.video.classList.remove('camera-off');
        } catch (error) {
            alert("Kamera tidak dapat diakses. Pastikan Anda memberikan izin akses kamera untuk situs ini.");
            console.error("Camera access error:", error);
            isCameraOn = false;
        }
        updateCameraButtonState();
    }

    function stopCamera() {
        if (!cameraStream) return;
        cameraStream.getTracks().forEach(track => track.stop());
        DOMElements.video.srcObject = null;
        isCameraOn = false;
        DOMElements.video.classList.add('camera-off');
        updateCameraButtonState();
    }

    function updateCameraButtonState() {
        if (!DOMElements.toggleCameraButton) return;
        DOMElements.toggleCameraButton.innerHTML = isCameraOn ? `<i class="fas fa-video-slash"></i> <span>Matikan Kamera</span>` : `<i class="fas fa-video"></i> <span>Nyalakan Kamera</span>`;
    }

    function setupEventListeners() {
        DOMElements.toggleSidebarButton?.addEventListener('click', () => DOMElements.sidebar.classList.toggle('collapsed'));
        DOMElements.darkModeButton?.addEventListener('click', () => {
            document.body.classList.toggle('dark-mode');
            localStorage.setItem('darkMode', document.body.classList.contains('dark-mode'));
        });
        DOMElements.logoutButton?.addEventListener('click', () => {
            if (confirm('Yakin mau logout?')) { sessionStorage.clear(); window.location.href = "index.html"; }
        });

        DOMElements.menuItems.forEach(li => {
            const tabId = li.getAttribute('data-tab');
            if (tabId) li.addEventListener('click', () => {
                DOMElements.tabContents.forEach(tab => tab.classList.remove('active'));
                document.getElementById(tabId)?.classList.add('active');
                DOMElements.menuItems.forEach(item => item.classList.remove('active-menu'));
                li.classList.add('active-menu');
                if (tabId === 'kehadiran') {
                    loadDailyHistory();
                    if (!isCameraOn) setupCamera();
                } else {
                    if (isCameraOn) stopCamera();
                }
            });
        });

        DOMElements.editProfileBtn?.addEventListener('click', () => toggleProfileEditMode(true));
        DOMElements.cancelProfileBtn?.addEventListener('click', () => {
            initProfileUI();
            toggleProfileEditMode(false);
        });
        DOMElements.profileForm?.addEventListener('submit', async (event) => {
            event.preventDefault();
            const bodyData = {
                namaLengkap: DOMElements.profileNamaInput.value,
                email: DOMElements.profileEmailInput.value,
                telepon: DOMElements.profileTeleponInput.value,
            };
            if (DOMElements.mainProfilePic.src.startsWith('data:image')) {
                bodyData.foto_profil = DOMElements.mainProfilePic.src;
            }
            try {
                const result = await apiCall(`/users/${userData.id}/profile`, {
                    method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(bodyData)
                });
                alert(result.message);
                const updatedUser = { ...userData, ...result.updatedUser };
                sessionStorage.setItem('userData', JSON.stringify(updatedUser));
                userData = updatedUser;
                initProfileUI();
                toggleProfileEditMode(false);
            } catch (error) { /* Handled in apiCall */ }
        });

        DOMElements.changePhotoBtn?.addEventListener('click', () => DOMElements.uploadProfilePicInput.click());
        DOMElements.uploadProfilePicInput?.addEventListener('change', e => {
            if (e.target.files && e.target.files[0]) {
                const reader = new FileReader();
                reader.onload = (event) => { DOMElements.mainProfilePic.src = event.target.result; };
                reader.readAsDataURL(e.target.files[0]);
            }
        });

        DOMElements.toggleCameraButton?.addEventListener('click', () => isCameraOn ? stopCamera() : setupCamera());
        DOMElements.clockInButton?.addEventListener('click', () => handleAttendance('clockin'));
        DOMElements.clockOutButton?.addEventListener('click', () => handleAttendance('clockout'));

        DOMElements.tampilkanRekapBtn?.addEventListener('click', () => {
            const bulan = DOMElements.bulanRekapInput.value;
            if (!bulan) {
                alert('Silakan pilih bulan terlebih dahulu.');
                return;
            }
            loadRecapData(bulan);
        });
    }

    async function init() {
        if (localStorage.getItem('darkMode') === 'true') {
            document.body.classList.add('dark-mode');
        }
        try {
            const fullProfile = await apiCall(`/users/${userData.id}/profile`);
            userData = { ...userData, ...fullProfile };
            sessionStorage.setItem('userData', JSON.stringify(userData));
        } catch (error) {
            console.error("Gagal memuat profil lengkap.", error);
        }
        initProfileUI();
        setupEventListeners();
        const kehadiranTab = document.querySelector('.menu li[data-tab="kehadiran"]');
        if (kehadiranTab) {
            kehadiranTab.click();
        } else {
            loadDailyHistory();
            setupCamera();
        }
    }

    init();
});
