const express = require('express');
const path = require('path');
const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');
const cors = require('cors');
const excel = require('exceljs');

const app = express();
const port = 3000;

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// Koneksi Database
const pool = mysql.createPool({
    host: 'localhost',
    user: 'root',
    password: '',
    database: 'attendance_system',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

// Halaman Utama
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// === API OTENTIKASI ===
app.post('/api/login', async (req, res) => {
    const { username, password } = req.body;
    try {
        const [rows] = await pool.execute('SELECT * FROM users WHERE email = ?', [username]);
        if (rows.length === 0) {
            return res.status(401).json({ success: false, message: 'Username atau password salah.' });
        }
        const user = rows[0];
        const isPasswordMatch = await bcrypt.compare(password, user.password_hash);
        if (!isPasswordMatch) {
            return res.status(401).json({ success: false, message: 'Username atau password salah.' });
        }
        const role = user.email.toLowerCase().includes('admin') ? 'admin' : 'user';
        res.json({
            success: true,
            message: 'Login berhasil!',
            role: role,
            userData: {
                id: user.id,
                namaLengkap: user.nama_lengkap, 
                nama: user.nama_lengkap, // 'nama' dipertahankan untuk kompatibilitas
                email: user.email,
                telepon: user.telepon
                // DIHAPUS: foto_profil dihapus dari sini untuk mencegah error QuotaExceededError
            }
        });
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ success: false, message: 'Terjadi kesalahan pada server.' });
    }
});

// === API ABSENSI ===
app.post('/api/clockin', async (req, res) => {
    const { userId, time, location, photo } = req.body;
    try {
        const [settings] = await pool.execute('SELECT jam_masuk FROM attendance_settings WHERE id = 1');
        const jamMasukKantor = settings.length > 0 ? settings[0].jam_masuk : '00:00:00';
        const status = time > jamMasukKantor ? 'Telat' : 'Hadir';
        
        const query = `
            INSERT INTO attendance (user_id, tanggal, status, waktu_masuk, lokasi_masuk, foto_masuk) VALUES (?, CURDATE(), ?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE status = VALUES(status), waktu_masuk = VALUES(waktu_masuk), lokasi_masuk = VALUES(lokasi_masuk), foto_masuk = VALUES(foto_masuk);
        `;
        await pool.execute(query, [userId, status, time, location, photo]);
        
        res.status(200).json({ message: `Absen masuk berhasil dengan status: ${status}` });
    } catch (error) {
        console.error('Clockin error:', error);
        res.status(500).json({ error: 'Database error: ' + error.message });
    }
});

app.post('/api/clockout', async (req, res) => {
    const { userId, time, location, photo } = req.body;
    try {
        const query = `UPDATE attendance SET waktu_pulang = ?, lokasi_pulang = ?, foto_pulang = ? WHERE user_id = ? AND tanggal = CURDATE();`;
        await pool.execute(query, [time, location, photo, userId]);
        
        res.status(200).json({ message: 'Absen pulang berhasil' });
    } catch (error) {
        res.status(500).json({ error: 'Database error: ' + error.message });
    }
});

// === API PENGGUNA & RIWAYAT ===
app.get('/api/attendance/history/:userId', async (req, res) => {
    const { userId } = req.params;
    const { bulan } = req.query; 
    if (!bulan) return res.status(400).json({ error: 'Parameter bulan diperlukan' });
    try {
        const query = `
            SELECT DATE_FORMAT(tanggal, '%Y-%m-%d') as tanggal, status, waktu_masuk, waktu_pulang 
            FROM attendance 
            WHERE user_id = ? AND DATE_FORMAT(tanggal, '%Y-%m') = ? 
            ORDER BY tanggal DESC`;
        const [rows] = await pool.execute(query, [userId, bulan]);
        res.json(rows);
    } catch (error) {
        res.status(500).json({ error: 'Database error: ' + error.message });
    }
});

app.get('/api/users/:id/profile', async (req, res) => {
    const { id } = req.params;
    try {
        const [rows] = await pool.execute('SELECT id, nama_lengkap as namaLengkap, email, telepon, foto_profil FROM users WHERE id = ?', [id]);
        if (rows.length > 0) res.json(rows[0]);
        else res.status(404).json({ error: 'User tidak ditemukan' });
    } catch (error) {
        res.status(500).json({ error: 'Database error: ' + error.message });
    }
});

app.put('/api/users/:id/profile', async (req, res) => {
    const { id } = req.params;
    const { namaLengkap, email, telepon, foto_profil } = req.body;
    try {
        let query = 'UPDATE users SET nama_lengkap = ?, email = ?, telepon = ?';
        const values = [namaLengkap, email, telepon];
        if (foto_profil) {
            query += ', foto_profil = ?';
            values.push(foto_profil);
        }
        query += ' WHERE id = ?';
        values.push(id);
        
        await pool.execute(query, values);
        const [updatedUserRows] = await pool.execute('SELECT id, nama_lengkap as namaLengkap, email, telepon, foto_profil FROM users WHERE id = ?', [id]);
        res.json({ message: 'Profil berhasil diperbarui!', updatedUser: updatedUserRows[0] });
    } catch (error) {
        console.error("Update profile error:", error);
        res.status(500).json({ error: 'Database error: ' + error.message });
    }
});

// === API PANEL ADMIN (CRUD KARYAWAN, PENGATURAN, DLL) ===
app.get('/api/absensi/harian', async (req, res) => {
    const { tanggal } = req.query;
    if (!tanggal) return res.status(400).json({ error: 'Parameter tanggal diperlukan' });
    try {
        const query = `
            SELECT u.nama_lengkap, a.status, a.waktu_masuk, a.waktu_pulang, a.lokasi_masuk, a.foto_masuk
            FROM attendance a JOIN users u ON a.user_id = u.id
            WHERE a.tanggal = ? ORDER BY u.nama_lengkap;`;
        const [rows] = await pool.execute(query, [tanggal]);
        res.json(rows);
    } catch (error) { res.status(500).json({ error: 'Database error: ' + error.message }); }
});

app.get('/api/karyawan', async (req, res) => {
    try {
        const [rows] = await pool.execute('SELECT id, nama_lengkap, email, telepon FROM users WHERE email NOT LIKE \'%admin%\' ORDER BY nama_lengkap');
        res.json(rows);
    } catch (error) { res.status(500).json({ error: 'Database error: ' + error.message }); }
});

app.post('/api/karyawan', async (req, res) => {
    const { namaLengkap, email, telepon, password } = req.body;
    if (!namaLengkap || !email || !password) return res.status(400).json({ error: 'Nama, email, dan password harus diisi.' });
    try {
        const hashedPassword = await bcrypt.hash(password, 10);
        await pool.execute('INSERT INTO users (nama_lengkap, email, telepon, password_hash) VALUES (?, ?, ?, ?)', [namaLengkap, email, telepon, hashedPassword]);
        res.status(201).json({ message: 'Karyawan baru berhasil ditambahkan' });
    } catch (error) { res.status(500).json({ error: 'Database error: ' + error.message }); }
});

app.put('/api/karyawan/:id', async (req, res) => {
    const { id } = req.params;
    const { namaLengkap, email, telepon, password } = req.body;
    try {
        if (password) {
            const hashedPassword = await bcrypt.hash(password, 10);
            await pool.execute('UPDATE users SET nama_lengkap = ?, email = ?, telepon = ?, password_hash = ? WHERE id = ?', [namaLengkap, email, telepon, hashedPassword, id]);
        } else {
            await pool.execute('UPDATE users SET nama_lengkap = ?, email = ?, telepon = ? WHERE id = ?', [namaLengkap, email, telepon, id]);
        }
        res.json({ message: 'Data berhasil diperbarui' });
    } catch (error) { res.status(500).json({ error: 'Database error: ' + error.message }); }
});

app.delete('/api/karyawan/:id', async (req, res) => {
    try {
        await pool.execute('DELETE FROM users WHERE id = ?', [req.params.id]);
        res.json({ message: 'Karyawan berhasil dihapus' });
    } catch (error) { res.status(500).json({ error: 'Database error: ' + error.message }); }
});

app.get('/api/settings/attendance', async (req, res) => {
    try {
        const [rows] = await pool.execute('SELECT * FROM attendance_settings WHERE id = 1');
        res.json(rows.length > 0 ? rows[0] : {});
    } catch (error) { res.status(500).json({ error: 'Database error: ' + error.message }); }
});
app.put('/api/settings/attendance', async (req, res) => {
    const { jam_masuk, jam_pulang, latitude, longitude, radius } = req.body;
    try {
        const query = `
            INSERT INTO attendance_settings (id, jam_masuk, jam_pulang, latitude, longitude, radius) VALUES (1, ?, ?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE jam_masuk=VALUES(jam_masuk), jam_pulang=VALUES(jam_pulang), latitude=VALUES(latitude), longitude=VALUES(longitude), radius=VALUES(radius);`;
        await pool.execute(query, [jam_masuk, jam_pulang, latitude, longitude, radius]);
        res.json({ message: 'Pengaturan absensi berhasil disimpan!' });
    } catch (error) { res.status(500).json({ error: 'Database error: ' + error.message }); }
});

// =============================================================
// DITAMBAHKAN: Endpoint baru khusus untuk mengambil data rekap JSON
// =============================================================
app.get('/api/rekap/bulanan', async (req, res) => {
    const { bulan } = req.query;
    if (!bulan) {
        return res.status(400).json({ error: 'Parameter bulan diperlukan' });
    }
    try {
        const query = `
            SELECT u.nama_lengkap, DATE_FORMAT(a.tanggal, '%Y-%m-%d') as tanggal, a.status, a.waktu_masuk, a.waktu_pulang
            FROM attendance a 
            JOIN users u ON u.id = a.user_id
            WHERE DATE_FORMAT(a.tanggal, '%Y-%m') = ? 
            ORDER BY a.tanggal, u.nama_lengkap;
        `;
        const [rows] = await pool.execute(query, [bulan]);
        res.json(rows);
    } catch (error) {
        console.error('Error fetching monthly recap:', error);
        res.status(500).json({ error: 'Database error: ' + error.message });
    }
});


app.get('/api/rekap/download', async (req, res) => {
    const { bulan } = req.query;
    if (!bulan) return res.status(400).json({ error: 'Parameter bulan diperlukan' });
    try {
        const [rows] = await pool.execute(`
            SELECT u.nama_lengkap, a.tanggal, a.status, a.waktu_masuk, a.waktu_pulang
            FROM attendance a JOIN users u ON u.id = a.user_id
            WHERE DATE_FORMAT(a.tanggal, '%Y-%m') = ? ORDER BY u.nama_lengkap, a.tanggal;
        `, [bulan]);
        const workbook = new excel.Workbook();
        const worksheet = workbook.addWorksheet(`Rekap Absensi ${bulan}`);
        worksheet.columns = [
            { header: 'Tanggal', key: 'tanggal', width: 15 },
            { header: 'Nama Karyawan', key: 'nama', width: 30 },
            { header: 'Status', key: 'status', width: 15 },
            { header: 'Jam Masuk', key: 'masuk', width: 15 },
            { header: 'Jam Pulang', key: 'pulang', width: 15 }
        ];
        rows.forEach(row => {
            worksheet.addRow({
                tanggal: new Date(row.tanggal).toLocaleDateString('id-ID'),
                nama: row.nama_lengkap,
                status: row.status,
                masuk: row.waktu_masuk,
                pulang: row.waktu_pulang || '-'
            });
        });
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename="rekap-absensi-${bulan}.xlsx"`);
        await workbook.xlsx.write(res);
        res.end();
    } catch (error) {
        console.error('Download rekap error:', error);
        res.status(500).send('Gagal membuat file rekap');
    }
});

// Jalankan Server
app.listen(port, () => {
    console.log(`Server berjalan di http://localhost:${port}`);
    pool.getConnection().then(conn => {
        console.log('Terhubung ke database MySQL.');
        conn.release();
    }).catch(err => console.error('Gagal terhubung ke database:', err));
});
