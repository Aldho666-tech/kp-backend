function login() {
    var username = document.getElementById("username").value;
    var password = document.getElementById("password").value;

    // Contoh validasi sederhana
    if (username === "admin" && password === "admin123") {
        window.location.href = "dashboard.html"; // Pindah ke dashboard
    } else {
        alert("Username atau Password salah!");
    }
}