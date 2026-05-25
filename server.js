const express = require('express');
const mongoose = require('mongoose');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

// Logika Menyambungkan ke MongoDB Atlas
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log('Koneksi ke MongoDB Atlas BERHASIL! 🚀'))
  .catch((err) => console.error('Koneksi Database GAGAL:', err));

app.get('/', (req, res) => {
    res.send('Server Dashboard Eka Berhasil Berjalan dan Siap Terhubung!');
});

app.listen(PORT, () => {
    console.log(`Server aktif di http://localhost:${PORT}`);
});