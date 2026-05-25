const mongoose = require('mongoose');

// Helper to clean and compute status for AR/AP
const computeArApFields = function (next) {
  this.balance = this.amount - this.paidAmount;
  if (this.balance <= 0) {
    this.status = 'Paid';
  } else {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const due = new Date(this.dueDate);
    due.setHours(0, 0, 0, 0);
    if (due < today) {
      this.status = 'Overdue';
    } else {
      this.status = 'Outstanding';
    }
  }
  next();
};

// Accounts Receivable (AR) Schema
const ARSchema = new mongoose.Schema({
  invoiceNo: { type: String, required: true, unique: true },
  customerName: { type: String, required: true },
  invoiceDate: { type: Date, required: true },
  dueDate: { type: Date, required: true },
  amount: { type: Number, required: true, default: 0 },
  paidAmount: { type: Number, required: true, default: 0 },
  balance: { type: Number },
  status: { type: String, enum: ['Paid', 'Outstanding', 'Overdue'] },
  notes: { type: String, default: '' }
}, { timestamps: true });

ARSchema.pre('save', computeArApFields);

// Accounts Payable (AP) Schema
const APSchema = new mongoose.Schema({
  invoiceNo: { type: String, required: true, unique: true },
  supplierName: { type: String, required: true },
  invoiceDate: { type: Date, required: true },
  dueDate: { type: Date, required: true },
  amount: { type: Number, required: true, default: 0 },
  paidAmount: { type: Number, required: true, default: 0 },
  balance: { type: Number },
  status: { type: String, enum: ['Paid', 'Unpaid', 'Overdue'] },
  notes: { type: String, default: '' }
}, { timestamps: true });

APSchema.pre('save', function (next) {
  this.balance = this.amount - this.paidAmount;
  if (this.balance <= 0) {
    this.status = 'Paid';
  } else {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const due = new Date(this.dueDate);
    due.setHours(0, 0, 0, 0);
    if (due < today) {
      this.status = 'Overdue';
    } else {
      this.status = 'Unpaid';
    }
  }
  next();
});

// Pos-Pos Yang Masih Harus Dibayar (PYMHD) Schema
const PYMHDSchema = new mongoose.Schema({
  referenceNo: { type: String, required: true, unique: true },
  expenseCategory: { type: String, required: true },
  vendorName: { type: String, required: true },
  period: { type: String, required: true }, // e.g. "Mei 2026"
  amount: { type: Number, required: true, default: 0 },
  status: { type: String, enum: ['Accrued', 'Paid', 'Cancelled'], default: 'Accrued' },
  notes: { type: String, default: '' }
}, { timestamps: true });

// Uang Muka Ongkos (UMO) Schema
const UMOSchema = new mongoose.Schema({
  umoNo: { type: String, required: true, unique: true },
  requestDate: { type: Date, required: true },
  employeeName: { type: String, required: true },
  description: { type: String, required: true },
  amount: { type: Number, required: true, default: 0 },
  realizedAmount: { type: Number, required: true, default: 0 },
  settlementBalance: { type: Number },
  status: { type: String, enum: ['Open', 'Settled'] },
  notes: { type: String, default: '' }
}, { timestamps: true });

UMOSchema.pre('save', function (next) {
  this.settlementBalance = this.amount - this.realizedAmount;
  if (this.settlementBalance <= 0) {
    this.status = 'Settled';
  } else {
    this.status = 'Open';
  }
  next();
});

module.exports = {
  AR: mongoose.model('AR', ARSchema),
  AP: mongoose.model('AP', APSchema),
  PYMHD: mongoose.model('PYMHD', PYMHDSchema),
  UMO: mongoose.model('UMO', UMOSchema)
};
