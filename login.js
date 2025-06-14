// login.js

async function login(event) {
    event.preventDefault(); // Mencegah form dari auto-submit

    const usernameInput = document.getElementById('username');
    const passwordInput = document.getElementById('password');
    const loginButton = document.getElementById('loginButton');
    const buttonText = document.getElementById('buttonText');
    const loadingSpinner = document.getElementById('loadingSpinner');

    // Tampilkan spinner dan nonaktifkan tombol
    buttonText.style.display = 'none';
    loadingSpinner.style.display = 'inline-block';
    loginButton.disabled = true;

    const username = usernameInput.value;
    const password = passwordInput.value;

    try {
        const response = await fetch('http://localhost:3000/api/login', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ username, password }),
        });

        const result = await response.json();

        if (result.success) {
            // Simpan data user di sessionStorage agar bisa diakses di halaman lain
            sessionStorage.setItem('userData', JSON.stringify(result.userData));
            sessionStorage.setItem('userRole', result.role);

            alert(result.message); // Tampilkan pesan sukses

            // Arahkan ke halaman yang sesuai
            if (result.role === 'admin') {
                window.location.href = 'admin.html';
            } else {
                window.location.href = 'dashboard.html';
            }
        } else {
            alert(result.message); // Tampilkan pesan error dari server
        }

    } catch (error) {
        console.error('Login request failed:', error);
        alert('Tidak dapat terhubung ke server. Silakan coba lagi.');
    } finally {
        // Kembalikan tombol ke keadaan normal
        buttonText.style.display = 'inline-block';
        loadingSpinner.style.display = 'none';
        loginButton.disabled = false;
    }
}