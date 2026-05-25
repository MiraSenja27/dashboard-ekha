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
app.use(express.static(path.join(__dirname, 'public')));

// Flag to track database mode
let useLocalFallback = false;

// ==========================================
// FILE-BASED DATABASE FALLBACK ENGINE
// ==========================================
class LocalDb {
  constructor() {
    this.filePath = path.join(__dirname, 'db_fallback.json');
    if (!fs.existsSync(this.filePath)) {
      fs.writeFileSync(this.filePath, JSON.stringify({ ar: [], ap: [], pymhd: [], umo: [] }, null, 2));
    }
  }

  read() {
    try {
      const content = fs.readFileSync(this.filePath, 'utf8');
      return JSON.parse(content);
    } catch (e) {
      return { ar: [], ap: [], pymhd: [], umo: [] };
    }
  }

  write(data) {
    fs.writeFileSync(this.filePath, JSON.stringify(data, null, 2));
  }

  async find(collection) {
    const db = this.read();
    const list = db[collection.toLowerCase()] || [];
    return [...list].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }

  async create(collection, item) {
    const db = this.read();
    const colName = collection.toLowerCase();
    if (!db[colName]) db[colName] = [];
    
    const record = {
      _id: 'local_' + Math.random().toString(36).substring(2, 9),
      ...item,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    this.calculateFields(colName, record);

    // Unique Constraint check for manual additions
    const uniqueFields = { ar: 'invoiceNo', ap: 'invoiceNo', pymhd: 'referenceNo', umo: 'umoNo' };
    const uniqKey = uniqueFields[colName];
    if (uniqKey && db[colName].some(x => x[uniqKey] === record[uniqKey])) {
      const err = new Error('Nomor Dokumen sudah terdaftar di database.');
      err.code = 11000;
      throw err;
    }

    db[colName].push(record);
    this.write(db);
    return record;
  }

  // SMART UPSERT FOR LOCAL DB
  async insertMany(collection, items) {
    const db = this.read();
    const colName = collection.toLowerCase();
    if (!db[colName]) db[colName] = [];

    const uniqueFields = { ar: 'invoiceNo', ap: 'invoiceNo', pymhd: 'referenceNo', umo: 'umoNo' };
    const uniqKey = uniqueFields[colName];

    let insertedCount = 0;
    let updatedCount = 0;

    for (let rawItem of items) {
      this.calculateFields(colName, rawItem);
      
      const existingIdx = db[colName].findIndex(x => x[uniqKey] === rawItem[uniqKey]);
      
      if (existingIdx !== -1) {
        // Update existing record
        db[colName][existingIdx] = {
          ...db[colName][existingIdx],
          ...rawItem,
          updatedAt: new Date().toISOString()
        };
        updatedCount++;
      } else {
        // Insert new record
        const record = {
          _id: 'local_' + Math.random().toString(36).substring(2, 9),
          ...rawItem,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        };
        db[colName].push(record);
        insertedCount++;
      }
    }

    this.write(db);
    return { insertedCount, updatedCount };
  }

  async findByIdAndUpdate(collection, id, updateBody) {
    const db = this.read();
    const colName = collection.toLowerCase();
    const list = db[colName] || [];
    const idx = list.findIndex(x => x._id === id);
    if (idx === -1) throw new Error('Data tidak ditemukan');

    const updated = {
      ...list[idx],
      ...updateBody,
      updatedAt: new Date().toISOString()
    };

    this.calculateFields(colName, updated);
    list[idx] = updated;
    this.write(db);
    return updated;
  }

  async findByIdAndDelete(collection, id) {
    const db = this.read();
    const colName = collection.toLowerCase();
    const list = db[colName] || [];
    const idx = list.findIndex(x => x._id === id);
    if (idx === -1) throw new Error('Data tidak ditemukan');

    const deleted = list.splice(idx, 1)[0];
    this.write(db);
    return deleted;
  }

  async deleteMany(collection) {
    const db = this.read();
    const colName = collection.toLowerCase();
    const count = db[colName] ? db[colName].length : 0;
    db[colName] = [];
    this.write(db);
    return { deletedCount: count };
  }

  calculateFields(colName, record) {
    if (colName === 'ar') {
      record.paidAmount = record.paidAmount || 0;
      record.amount = record.amount || 0;
      record.balance = record.amount - record.paidAmount;
      if (record.balance <= 0) {
        record.status = 'Paid';
      } else {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const due = new Date(record.dueDate);
        due.setHours(0, 0, 0, 0);
        record.status = due < today ? 'Overdue' : 'Outstanding';
      }
    } else if (colName === 'ap') {
      record.paidAmount = record.paidAmount || 0;
      record.amount = record.amount || 0;
      record.balance = record.amount - record.paidAmount;
      if (record.balance <= 0) {
        record.status = 'Paid';
      } else {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const due = new Date(record.dueDate);
        due.setHours(0, 0, 0, 0);
        record.status = due < today ? 'Overdue' : 'Unpaid';
      }
    } else if (colName === 'pymhd') {
      record.amount = record.amount || 0;
      record.status = record.status || 'Accrued';
    } else if (colName === 'umo') {
      record.amount = record.amount || 0;
      record.realizedAmount = record.realizedAmount || 0;
      record.settlementBalance = record.amount - record.realizedAmount;
      record.status = record.settlementBalance <= 0 ? 'Settled' : 'Open';
    }
  }
}

const localDb = new LocalDb();

// Connect to MongoDB Atlas with Automatic Local Fallback
mongoose.connect(process.env.MONGO_URI)
  .then(async () => {
    console.log('Koneksi ke MongoDB Atlas BERHASIL! 🚀');
    await seedData(false);
  })
  .catch(async (err) => {
    console.warn('\n⚠️  KONEKSI DATABASE ATLAS GAGAL! ⚠️');
    console.warn('Alasan:', err.message);
    console.warn('💡 Sistem otomatis beralih ke Mode Database Lokal (db_fallback.json)!\n');
    useLocalFallback = true;
    await seedData(true);
  });

// ==========================================
// DYNAMIC MOCK DATA SEEDER
// ==========================================
const seedData = async (isLocal) => {
  try {
    const arCount = isLocal ? (await localDb.find('ar')).length : await AR.countDocuments();
    const apCount = isLocal ? (await localDb.find('ap')).length : await AP.countDocuments();
    const pymhdCount = isLocal ? (await localDb.find('pymhd')).length : await PYMHD.countDocuments();
    const umoCount = isLocal ? (await localDb.find('umo')).length : await UMO.countDocuments();

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

      if (isLocal) {
        for (let item of arMock) await localDb.create('ar', item);
        for (let item of apMock) await localDb.create('ap', item);
        for (let item of pymhdMock) await localDb.create('pymhd', item);
        for (let item of umoMock) await localDb.create('umo', item);
      } else {
        await AR.insertMany(arMock);
        await AP.insertMany(apMock);
        await PYMHD.insertMany(pymhdMock);
        await UMO.insertMany(umoMock);
      }

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

    if (useLocalFallback) {
      arData = await localDb.find('ar');
      apData = await localDb.find('ap');
      pymhdData = await localDb.find('pymhd');
      umoData = await localDb.find('umo');
    } else {
      arData = await AR.find();
      apData = await AP.find();
      pymhdData = await PYMHD.find();
      umoData = await UMO.find();
    }

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
  
  if (useLocalFallback) {
    try {
      const list = await localDb.find(menu);
      return res.json(list);
    } catch(err) {
      return res.status(500).json({ error: err.message });
    }
  }

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

  if (useLocalFallback) {
    try {
      const record = await localDb.create(menu, req.body);
      return res.status(201).json(record);
    } catch (err) {
      if (err.code === 11000) {
        return res.status(400).json({ error: 'Nomor Dokumen / Invoice sudah terdaftar di database.' });
      }
      return res.status(500).json({ error: err.message });
    }
  }

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

  if (useLocalFallback) {
    try {
      const stats = await localDb.insertMany(menu, records);
      return res.status(201).json({
        message: `Sinkronisasi Excel selesai di Database Lokal. ${stats.insertedCount} data baru ditambahkan, ${stats.updatedCount} data tagihan/pembayaran diperbarui!`,
        insertedCount: stats.insertedCount,
        updatedCount: stats.updatedCount
      });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
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

  if (useLocalFallback) {
    try {
      const record = await localDb.findByIdAndUpdate(menu, id, req.body);
      return res.json(record);
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

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

  if (useLocalFallback) {
    try {
      const deleted = await localDb.findByIdAndDelete(menu, id);
      return res.json({ message: 'Data berhasil dihapus', id: deleted._id });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

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

  if (useLocalFallback) {
    try {
      const result = await localDb.deleteMany(menu);
      return res.json({ message: `Berhasil membersihkan seluruh database untuk menu ${menu.toUpperCase()}`, count: result.deletedCount });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  const Model = getModel(menu);
  if (!Model) return res.status(404).json({ error: 'Menu tidak ditemukan' });

  try {
    const result = await Model.deleteMany({});
    res.json({ message: `Berhasil membersihkan seluruh database untuk menu ${menu.toUpperCase()}`, count: result.deletedCount });
  } catch (err) {
    res.status(500).json({ error: 'Gagal membersihkan database: ' + err.message });
  }
});

// Catch-All Static Router
app.get('/*path', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Server aktif di http://localhost:${PORT}`);
});