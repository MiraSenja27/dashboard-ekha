const express = require('express');
const mongoose = require('mongoose');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

const { AR, AP, PYMHD, UMO } = require('./models');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

// Serve static frontend files
app.use(express.static(__dirname));

// Middleware: pastikan DB terkoneksi setiap request (penting untuk Vercel)
app.use(async (req, res, next) => {
  try {
    await connectDB();
    next();
  } catch (err) {
    res.status(500).json({ error: 'Gagal konek ke database: ' + err.message });
  }
});

// Flag MongoDB connection cache
let isConnected = false;

async function connectDB() {
  if (isConnected && mongoose.connection.readyState === 1) return;
  if (!process.env.MONGO_URI) throw new Error('MONGO_URI tidak ditemukan di Environment Variables!');
  await mongoose.connect(process.env.MONGO_URI, {
    serverSelectionTimeoutMS: 10000,
  });
  isConnected = true;
  console.log('Koneksi ke MongoDB Atlas BERHASIL! 🚀');
  await seedData();
}

// ==========================================
// DYNAMIC MOCK DATA SEEDER
// ==========================================
const seedData = async () => {
  try {
    const arCount = await AR.countDocuments();
    const apCount = await AP.countDocuments();
    const pymhdCount = await PYMHD.countDocuments();
    const umoCount = await UMO.countDocuments();

    if (arCount === 0 && apCount === 0 && pymhdCount === 0 && umoCount === 0) {
      console.log('Database kosong. Memulai seeding data contoh keuangan... 🌱');

      const getPastDate = (monthsAgo, day = 15) => {
        const d = new Date();
        d.setMonth(d.getMonth() - monthsAgo);
        d.setDate(day);
        d.setHours(0, 0, 0, 0);
        return d;
      };

      const arMock = [
        { invoiceNo: 'INV/2026/001', customerName: 'PT Harapan Jaya Logistik', invoiceDate: getPastDate(4, 10), dueDate: getPastDate(3, 10), amount: 150000000, paidAmount: 150000000, notes: 'Lunas tepat waktu' },
        { invoiceNo: 'INV/2026/002', customerName: 'PT Semesta Distribusi', invoiceDate: getPastDate(3, 15), dueDate: getPastDate(2, 15), amount: 280000000, paidAmount: 200000000, notes: 'Cicilan ke-1 selesai' },
        { invoiceNo: 'INV/2026/003', customerName: 'CV Samudra Abadi', invoiceDate: getPastDate(2, 5), dueDate: getPastDate(1, 5), amount: 95000000, paidAmount: 0, notes: 'Invoice dikirim via email' },
        { invoiceNo: 'INV/2026/004', customerName: 'PT Sinergi Bangun Bangsa', invoiceDate: getPastDate(1, 20), dueDate: getPastDate(0, 20), amount: 420000000, paidAmount: 120000000, notes: 'Pembayaran sebagian' },
        { invoiceNo: 'INV/2026/005', customerName: 'PT Nusantara Cargo', invoiceDate: getPastDate(0, 5), dueDate: getPastDate(-1, 5), amount: 180000000, paidAmount: 0, notes: 'Belum jatuh tempo' },
        { invoiceNo: 'INV/2026/006', customerName: 'CV Multi Niaga', invoiceDate: getPastDate(5, 12), dueDate: getPastDate(4, 12), amount: 62000000, paidAmount: 62000000, notes: 'Pembayaran penuh' }
      ];

      const apMock = [
        { invoiceNo: 'AP/VND/2026/012', supplierName: 'PT Pertamina Patra Niaga', invoiceDate: getPastDate(4, 8), dueDate: getPastDate(3, 8), amount: 90000000, paidAmount: 90000000, notes: 'Bahan bakar armada' },
        { invoiceNo: 'AP/VND/2026/013', supplierName: 'CV Global Sparepart', invoiceDate: getPastDate(3, 22), dueDate: getPastDate(2, 22), amount: 45000000, paidAmount: 45000000, notes: 'Suku cadang truk logistik' },
        { invoiceNo: 'AP/VND/2026/014', supplierName: 'PT Jasa Marga Persero', invoiceDate: getPastDate(2, 10), dueDate: getPastDate(1, 10), amount: 120000000, paidAmount: 80000000, notes: 'Langganan e-toll armada' },
        { invoiceNo: 'AP/VND/2026/015', supplierName: 'PT Telekomunikasi Indonesia', invoiceDate: getPastDate(1, 18), dueDate: getPastDate(0, 18), amount: 35000000, paidAmount: 0, notes: 'Tagihan internet & telepon kantor' },
        { invoiceNo: 'AP/VND/2026/016', supplierName: 'CV Bintang Logistik', invoiceDate: getPastDate(0, 1), dueDate: getPastDate(-1, 1), amount: 155000000, paidAmount: 0, notes: 'Sewa gudang tambahan' }
      ];

      const pymhdMock = [
        { referenceNo: 'PYMHD/2026/05/01', expenseCategory: 'Beban Gaji Karyawan', vendorName: 'Divisi SDM & Payroll', period: 'Mei 2026', amount: 320000000, status: 'Accrued', notes: 'Gaji bulan berjalan belum ditransfer' },
        { referenceNo: 'PYMHD/2026/05/02', expenseCategory: 'Beban Sewa Gudang', vendorName: 'PT Agung Podomoro', period: 'Mei 2026', amount: 80000000, status: 'Accrued', notes: 'Sewa gudang Blok C' },
        { referenceNo: 'PYMHD/2026/04/01', expenseCategory: 'Beban Listrik & Air', vendorName: 'PT PLN & PDAM', period: 'April 2026', amount: 24000000, status: 'Paid', notes: 'Sudah didebit otomatis' },
        { referenceNo: 'PYMHD/2026/04/02', expenseCategory: 'Beban Jasa Konsultan', vendorName: 'KPMG Indonesia', period: 'April 2026', amount: 150000000, status: 'Accrued', notes: 'Jasa audit keuangan Q1' }
      ];

      const umoMock = [
        { umoNo: 'UMO/OPS/2026/045', employeeName: 'Budi Santoso', requestDate: getPastDate(1, 5), description: 'Uang muka operasional pengiriman barang rute Jakarta-Surabaya', amount: 7500000, realizedAmount: 6800000, notes: 'Sisa Rp 700.000 sudah dikembalikan' },
        { umoNo: 'UMO/OPS/2026/048', employeeName: 'Eka Saputra', requestDate: getPastDate(0, 10), description: 'Biaya perjalanan dinas survei lokasi gudang baru di Semarang', amount: 5000000, realizedAmount: 0, notes: 'Masih dalam perjalanan dinas' },
        { umoNo: 'UMO/OPS/2026/049', employeeName: 'Rian Hidayat', requestDate: getPastDate(0, 18), description: 'Uang saku sopir kontainer rute Merak-Bakauheni', amount: 3500000, realizedAmount: 3200000, notes: 'Dalam proses settlement dokumen' }
      ];

      await AR.insertMany(arMock);
      await AP.insertMany(apMock);
      await PYMHD.insertMany(pymhdMock);
      await UMO.insertMany(umoMock);

      console.log('Seeding data keuangan BERHASIL! 🍃');
    }
  } catch (err) {
    console.error('Gagal melakukan seeding data:', err);
  }
};

// Helper model retriever
const getModel = (menu) => {
  const map = { 'ar': AR, 'ap': AP, 'pymhd': PYMHD, 'umo': UMO };
  return map[menu.toLowerCase()];
};

// ==========================================
// 1. DASHBOARD SUMMARY ENDPOINT
// ==========================================
app.get('/api/dashboard/summary', async (req, res) => {
  try {
    let arData, apData, pymhdData, umoData;

    arData = await AR.find();
    apData = await AP.find();
    pymhdData = await PYMHD.find();
    umoData = await UMO.find();

    // 1. AR Calculations
    let arTotal = 0, arOutstanding = 0, arPaid = 0, arOverdue = 0;
    arData.forEach(item => {
      arTotal += item.amount || 0;
      arPaid += item.paidAmount || 0;
      arOutstanding += item.balance || 0;
      if (item.status === 'Overdue') arOverdue += item.balance || 0;
    });

    // 2. AP Calculations
    let apTotal = 0, apUnpaid = 0, apPaid = 0, apOverdue = 0;
    apData.forEach(item => {
      apTotal += item.amount || 0;
      apPaid += item.paidAmount || 0;
      apUnpaid += item.balance || 0;
      if (item.status === 'Overdue') apOverdue += item.balance || 0;
    });

    // 3. PYMHD Calculations
    let pymhdTotal = 0, pymhdAccrued = 0, pymhdPaid = 0;
    pymhdData.forEach(item => {
      pymhdTotal += item.amount || 0;
      if (item.status === 'Accrued') pymhdAccrued += item.amount || 0;
      if (item.status === 'Paid') pymhdPaid += item.amount || 0;
    });

    // 4. UMO Calculations
    let umoTotal = 0, umoOpen = 0, umoSettled = 0;
    umoData.forEach(item => {
      umoTotal += item.amount || 0;
      umoOpen += item.settlementBalance || 0;
      umoSettled += item.realizedAmount || 0;
    });

    // 5. Monthly trend analysis (combining all)
    const monthlyTrends = {};
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
    
    // Initialise last 6 months
    const today = new Date();
    for (let i = 5; i >= 0; i--) {
      const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
      const label = `${months[d.getMonth()]} ${d.getFullYear().toString().substring(2)}`;
      monthlyTrends[label] = { label, ar: 0, ap: 0, pymhd: 0, umo: 0 };
    }

    const addToTrend = (date, amount, type) => {
      if (!date) return;
      const d = new Date(date);
      const label = `${months[d.getMonth()]} ${d.getFullYear().toString().substring(2)}`;
      if (monthlyTrends[label]) {
        monthlyTrends[label][type] += amount;
      }
    };

    arData.forEach(item => addToTrend(item.invoiceDate, item.amount, 'ar'));
    apData.forEach(item => addToTrend(item.invoiceDate, item.amount, 'ap'));
    umoData.forEach(item => addToTrend(item.requestDate, item.amount, 'umo'));
    
    // PYMHD has period or createdAt
    pymhdData.forEach(item => {
      if (item.createdAt) addToTrend(item.createdAt, item.amount, 'pymhd');
    });

    res.json({
      ar: { total: arTotal, outstanding: arOutstanding, paid: arPaid, overdue: arOverdue, count: arData.length },
      ap: { total: apTotal, unpaid: apUnpaid, paid: apPaid, overdue: apOverdue, count: apData.length },
      pymhd: { total: pymhdTotal, accrued: pymhdAccrued, paid: pymhdPaid, count: pymhdData.length },
      umo: { total: umoTotal, open: umoOpen, settled: umoSettled, count: umoData.length },
      trends: Object.values(monthlyTrends)
    });
  } catch (err) {
    res.status(500).json({ error: 'Gagal mengambil ringkasan dashboard: ' + err.message });
  }
});

// ==========================================
// 2. CRUD ENDPOINTS
// ==========================================

// Get all
app.get('/api/:menu', async (req, res) => {
  const menu = req.params.menu.toLowerCase();
  
  const Model = getModel(menu);
  if (!Model) return res.status(404).json({ error: 'Menu tidak ditemukan' });

  try {
    const data = await Model.find().sort({ createdAt: -1 });
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: 'Gagal mengambil data: ' + err.message });
  }
});

// Create one
app.post('/api/:menu', async (req, res) => {
  const menu = req.params.menu.toLowerCase();

  const Model = getModel(menu);
  if (!Model) return res.status(404).json({ error: 'Menu tidak ditemukan' });

  try {
    const newRecord = new Model(req.body);
    await newRecord.save();
    res.status(201).json(newRecord);
  } catch (err) {
    if (err.code === 11000) {
      return res.status(400).json({ error: 'Nomor Dokumen / Invoice sudah terdaftar di database.' });
    }
    res.status(500).json({ error: 'Gagal menambahkan data: ' + err.message });
  }
});

// SMART UPSERT BULK IMPORT
app.post('/api/:menu/bulk', async (req, res) => {
  const menu = req.params.menu.toLowerCase();
  const records = req.body;
  if (!Array.isArray(records) || records.length === 0) {
    return res.status(400).json({ error: 'Format data tidak valid.' });
  }

  const Model = getModel(menu);
  if (!Model) return res.status(404).json({ error: 'Menu tidak ditemukan' });

  const uniqueFields = { ar: 'invoiceNo', ap: 'invoiceNo', pymhd: 'referenceNo', umo: 'umoNo' };
  const uniqKey = uniqueFields[menu];

  try {
    // Generate high-performance bulk operations for Upserts
    const bulkOps = records.map(item => {
      // Clean and calculate balance / status in JS first
      if (menu === 'ar') {
        item.paidAmount = item.paidAmount || 0;
        item.amount = item.amount || 0;
        item.balance = item.amount - item.paidAmount;
        if (item.balance <= 0) {
          item.status = 'Paid';
        } else {
          const today = new Date();
          today.setHours(0, 0, 0, 0);
          const due = new Date(item.dueDate);
          due.setHours(0, 0, 0, 0);
          item.status = due < today ? 'Overdue' : 'Outstanding';
        }
      } else if (menu === 'ap') {
        item.paidAmount = item.paidAmount || 0;
        item.amount = item.amount || 0;
        item.balance = item.amount - item.paidAmount;
        if (item.balance <= 0) {
          item.status = 'Paid';
        } else {
          const today = new Date();
          today.setHours(0, 0, 0, 0);
          const due = new Date(item.dueDate);
          due.setHours(0, 0, 0, 0);
          item.status = due < today ? 'Overdue' : 'Unpaid';
        }
      } else if (menu === 'pymhd') {
        item.amount = item.amount || 0;
        item.status = item.status || 'Accrued';
      } else if (menu === 'umo') {
        item.amount = item.amount || 0;
        item.realizedAmount = item.realizedAmount || 0;
        item.settlementBalance = item.amount - item.realizedAmount;
        item.status = item.settlementBalance <= 0 ? 'Settled' : 'Open';
      }

      const filter = {};
      filter[uniqKey] = item[uniqKey];

      return {
        updateOne: {
          filter,
          update: { $set: item },
          upsert: true
        }
      };
    });

    const result = await Model.bulkWrite(bulkOps);
    
    // bulkWrite response contains upsertedCount and modifiedCount
    const inserted = result.upsertedCount || 0;
    const updated = result.modifiedCount || 0;

    res.status(201).json({
      message: `Sinkronisasi Excel selesai di MongoDB Atlas. ${inserted} data baru ditambahkan, ${updated} data pembayaran/tagihan diperbarui!`,
      insertedCount: inserted,
      updatedCount: updated
    });
  } catch (err) {
    res.status(500).json({ error: 'Gagal menyinkronkan data Excel massal: ' + err.message });
  }
});

// Update one
app.put('/api/:menu/:id', async (req, res) => {
  const menu = req.params.menu.toLowerCase();
  const id = req.params.id;

  const Model = getModel(menu);
  if (!Model) return res.status(404).json({ error: 'Menu tidak ditemukan' });

  try {
    const record = await Model.findById(id);
    if (!record) return res.status(404).json({ error: 'Data tidak ditemukan' });

    Object.assign(record, req.body);
    await record.save();

    res.json(record);
  } catch (err) {
    res.status(500).json({ error: 'Gagal memperbarui data: ' + err.message });
  }
});

// Delete one
app.delete('/api/:menu/:id', async (req, res) => {
  const menu = req.params.menu.toLowerCase();
  const id = req.params.id;

  const Model = getModel(menu);
  if (!Model) return res.status(404).json({ error: 'Menu tidak ditemukan' });

  try {
    const deleted = await Model.findByIdAndDelete(id);
    if (!deleted) return res.status(404).json({ error: 'Data tidak ditemukan' });
    res.json({ message: 'Data berhasil dihapus', id: id });
  } catch (err) {
    res.status(500).json({ error: 'Gagal menghapus data: ' + err.message });
  }
});

// Clear all
app.delete('/api/:menu', async (req, res) => {
  const menu = req.params.menu.toLowerCase();

  const Model = getModel(menu);
  if (!Model) return res.status(404).json({ error: 'Menu tidak ditemukan' });

  try {
    const result = await Model.deleteMany({});
    res.json({ message: `Berhasil membersihkan seluruh database untuk menu ${menu.toUpperCase()}`, count: result.deletedCount });
  } catch (err) {
    res.status(500).json({ error: 'Gagal membersihkan database: ' + err.message });
  }
});

// Catch-All: only for non-file routes
app.get('/*path', (req, res) => {
  const reqPath = req.path;
  // Don't intercept static file requests
  if (reqPath.includes('.')) {
    return res.status(404).send('Not found');
  }
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Jalankan server lokal saja (Vercel tidak butuh ini)
if (process.env.NODE_ENV !== 'production') {
  app.listen(PORT, () => {
    console.log(`Server aktif di http://localhost:${PORT}`);
  });
}

module.exports = app;