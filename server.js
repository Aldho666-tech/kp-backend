// Menggunakan paket 'pg' untuk Postgres, bukan mysql2
const { Pool } = require('pg'); 
const express = require('express');
const path = require('path');
const bcrypt = require('bcryptjs');
const cors = require('cors');
const excel = require('exceljs');

const app = express();
// Railway/platform lain akan menyediakan port secara otomatis lewat process.env.PORT
const port = process.env.PORT || 3000; 

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// Koneksi Database ke Neon menggunakan Connection String dari Railway
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
        rejectUnauthorized: false // Diperlukan untuk koneksi ke Neon/platform serupa
    }
});

// Halaman Utama (jika diperlukan)
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// === API OTENTIKASI ===
// Catatan: Sintaks query untuk Postgres menggunakan $1, $2, dst. bukan '?'
app.post('/api/login', async (req, res) => {
    const { username, password } = req.body;
    try {
        const result = await pool.query('SELECT * FROM users WHERE email = $1', [username]);
        if (result.rows.length === 0) {
            return res.status(401).json({ success: false, message: 'Username atau password salah.' });
        }
        const user = result.rows[0];
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
                nama: user.nama_lengkap,
                email: user.email,
                telepon: user.telepon
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
        const settingsResult = await pool.query('SELECT jam_masuk FROM attendance_settings WHERE id = 1');
        const jamMasukKantor = settingsResult.rows.length > 0 ? settingsResult.rows[0].jam_masuk : '00:00:00';
        const status = time > jamMasukKantor ? 'Telat' : 'Hadir';
        
        // Postgres menggunakan ON CONFLICT ... DO UPDATE untuk "INSERT OR UPDATE"
        const query = `
            INSERT INTO attendance (user_id, tanggal, status, waktu_masuk, lokasi_masuk, foto_masuk) 
            VALUES ($1, CURRENT_DATE, $2, $3, $4, $5)
            ON CONFLICT (user_id, tanggal) 
            DO UPDATE SET 
                status = EXCLUDED.status, 
                waktu_masuk = EXCLUDED.waktu_masuk, 
                lokasi_masuk = EXCLUDED.lokasi_masuk, 
                foto_masuk = EXCLUDED.foto_masuk;
        `;
        await pool.query(query, [userId, status, time, location, photo]);
        
        res.status(200).json({ message: `Absen masuk berhasil dengan status: ${status}` });
    } catch (error) {
        console.error('Clockin error:', error);
        res.status(500).json({ error: 'Database error: ' + error.message });
    }
});

app.post('/api/clockout', async (req, res) => {
    const { userId, time, location, photo } = req.body;
    try {
        const query = `UPDATE attendance SET waktu_pulang = $1, lokasi_pulang = $2, foto_pulang = $3 WHERE user_id = $4 AND tanggal = CURRENT_DATE;`;
        await pool.query(query, [time, location, photo, userId]);
        
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
        // Menggunakan to_char untuk format tanggal di Postgres
        const query = `
            SELECT to_char(tanggal, 'YYYY-MM-DD') as tanggal, status, waktu_masuk, waktu_pulang 
            FROM attendance 
            WHERE user_id = $1 AND to_char(tanggal, 'YYYY-MM') = $2
            ORDER BY tanggal DESC`;
        const result = await pool.query(query, [userId, bulan]);
        res.json(result.rows);
    } catch (error) {
        res.status(500).json({ error: 'Database error: ' + error.message });
    }
});

app.get('/api/users/:id/profile', async (req, res) => {
    const { id } = req.params;
    try {
        const result = await pool.query('SELECT id, nama_lengkap as namaLengkap, email, telepon, foto_profil FROM users WHERE id = $1', [id]);
        if (result.rows.length > 0) res.json(result.rows[0]);
        else res.status(404).json({ error: 'User tidak ditemukan' });
    } catch (error) {
        res.status(500).json({ error: 'Database error: ' + error.message });
    }
});

app.put('/api/users/:id/profile', async (req, res) => {
    const { id } = req.params;
    const { namaLengkap, email, telepon, foto_profil } = req.body;
    try {
        let query;
        const values = [namaLengkap, email, telepon];
        if (foto_profil) {
            query = 'UPDATE users SET nama_lengkap = $1, email = $2, telepon = $3, foto_profil = $4 WHERE id = $5';
            values.push(foto_profil, id);
        } else {
            query = 'UPDATE users SET nama_lengkap = $1, email = $2, telepon = $3 WHERE id = $4';
            values.push(id);
        }
        
        await pool.query(query, values);
        const updatedUserResult = await pool.query('SELECT id, nama_lengkap as namaLengkap, email, telepon, foto_profil FROM users WHERE id = $1', [id]);
        res.json({ message: 'Profil berhasil diperbarui!', updatedUser: updatedUserResult.rows[0] });
    } catch (error) {
        console.error("Update profile error:", error);
        res.status(500).json({ error: 'Database error: ' + error.message });
    }
});

// === API PANEL ADMIN ===
app.get('/api/absensi/harian', async (req, res) => {
    const { tanggal } = req.query;
    if (!tanggal) return res.status(400).json({ error: 'Parameter tanggal diperlukan' });
    try {
        const query = `
            SELECT u.nama_lengkap, a.status, a.waktu_masuk, a.waktu_pulang, a.lokasi_masuk, a.foto_masuk
            FROM attendance a JOIN users u ON a.user_id = u.id
            WHERE a.tanggal = $1 ORDER BY u.nama_lengkap;`;
        const result = await pool.query(query, [tanggal]);
        res.json(result.rows);
    } catch (error) { res.status(500).json({ error: 'Database error: ' + error.message }); }
});

app.get('/api/karyawan', async (req, res) => {
    try {
        const result = await pool.query('SELECT id, nama_lengkap, email, telepon FROM users WHERE email NOT LIKE \'%admin%\' ORDER BY nama_lengkap');
        res.json(result.rows);
    } catch (error) { res.status(500).json({ error: 'Database error: ' + error.message }); }
});

app.post('/api/karyawan', async (req, res) => {
    const { namaLengkap, email, telepon, password } = req.body;
    if (!namaLengkap || !email || !password) return res.status(400).json({ error: 'Nama, email, dan password harus diisi.' });
    try {
        const hashedPassword = await bcrypt.hash(password, 10);
        await pool.query('INSERT INTO users (nama_lengkap, email, telepon, password_hash) VALUES ($1, $2, $3, $4)', [namaLengkap, email, telepon, hashedPassword]);
        res.status(201).json({ message: 'Karyawan baru berhasil ditambahkan' });
    } catch (error) { res.status(500).json({ error: 'Database error: ' + error.message }); }
});

app.put('/api/karyawan/:id', async (req, res) => {
    const { id } = req.params;
    const { namaLengkap, email, telepon, password } = req.body;
    try {
        if (password) {
            const hashedPassword = await bcrypt.hash(password, 10);
            await pool.query('UPDATE users SET nama_lengkap = $1, email = $2, telepon = $3, password_hash = $4 WHERE id = $5', [namaLengkap, email, telepon, hashedPassword, id]);
        } else {
            await pool.query('UPDATE users SET nama_lengkap = $1, email = $2, telepon = $3 WHERE id = $4', [namaLengkap, email, telepon, id]);
        }
        res.json({ message: 'Data berhasil diperbarui' });
    } catch (error) { res.status(500).json({ error: 'Database error: ' + error.message }); }
});

app.delete('/api/karyawan/:id', async (req, res) => {
    try {
        await pool.query('DELETE FROM users WHERE id = $1', [req.params.id]);
        res.json({ message: 'Karyawan berhasil dihapus' });
    } catch (error) { res.status(500).json({ error: 'Database error: ' + error.message }); }
});

app.get('/api/settings/attendance', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM attendance_settings WHERE id = 1');
        res.json(result.rows.length > 0 ? result.rows[0] : {});
    } catch (error) { res.status(500).json({ error: 'Database error: ' + error.message }); }
});

app.put('/api/settings/attendance', async (req, res) => {
    const { jam_masuk, jam_pulang, latitude, longitude, radius } = req.body;
    try {
        const query = `
            INSERT INTO attendance_settings (id, jam_masuk, jam_pulang, latitude, longitude, radius) VALUES (1, $1, $2, $3, $4, $5)
            ON CONFLICT (id) DO UPDATE SET jam_masuk=EXCLUDED.jam_masuk, jam_pulang=EXCLUDED.jam_pulang, latitude=EXCLUDED.latitude, longitude=EXCLUDED.longitude, radius=EXCLUDED.radius;`;
        await pool.query(query, [jam_masuk, jam_pulang, latitude, longitude, radius]);
        res.json({ message: 'Pengaturan absensi berhasil disimpan!' });
    } catch (error) { res.status(500).json({ error: 'Database error: ' + error.message }); }
});

app.get('/api/rekap/bulanan', async (req, res) => {
    const { bulan } = req.query;
    if (!bulan) {
        return res.status(400).json({ error: 'Parameter bulan diperlukan' });
    }
    try {
        const query = `
            SELECT u.nama_lengkap, to_char(a.tanggal, 'YYYY-MM-DD') as tanggal, a.status, a.waktu_masuk, a.waktu_pulang
            FROM attendance a 
            JOIN users u ON u.id = a.user_id
            WHERE to_char(a.tanggal, 'YYYY-MM') = $1
            ORDER BY a.tanggal, u.nama_lengkap;
        `;
        const result = await pool.query(query, [bulan]);
        res.json(result.rows);
    } catch (error) {
        console.error('Error fetching monthly recap:', error);
        res.status(500).json({ error: 'Database error: ' + error.message });
    }
});

app.get('/api/rekap/download', async (req, res) => {
    const { bulan } = req.query;
    if (!bulan) return res.status(400).json({ error: 'Parameter bulan diperlukan' });
    try {
        const result = await pool.query(`
            SELECT u.nama_lengkap, a.tanggal, a.status, a.waktu_masuk, a.waktu_pulang
            FROM attendance a JOIN users u ON u.id = a.user_id
            WHERE to_char(a.tanggal, 'YYYY-MM') = $1 ORDER BY u.nama_lengkap, a.tanggal;
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
        result.rows.forEach(row => {
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
    console.log(`Server berjalan di port ${port}`);
    pool.connect(err => {
        if(err) {
            console.error('Gagal terhubung ke database Postgres:', err.stack);
        } else {
            console.log('Terhubung ke database Postgres.');
        }
    });
});
