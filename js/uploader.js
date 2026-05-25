/**
 * FIN-CORE Uploader Module
 * Client-side spreadsheet (XLSX, XLS, CSV) parsing, auto-column-mapping, and bulk upload utility.
 */

class SpreadsheetUploader {
  constructor(appInstance) {
    this.app = appInstance;
    this.excelData = null;
    this.excelHeaders = [];
    this.activeMenu = '';
    
    // DB field structures and descriptive labels with mapping keywords (synonyms)
    this.schemaDefinitions = {
      ar: [
        { key: 'invoiceNo', label: 'Nomor Invoice', required: true, synonyms: ['invoice', 'no invoice', 'no. invoice', 'invoice no', 'inv no', 'nomor invoice', 'no_invoice'] },
        { key: 'customerName', label: 'Nama Customer', required: true, synonyms: ['customer', 'nama customer', 'customer name', 'pelanggan', 'nama pelanggan', 'client'] },
        { key: 'invoiceDate', label: 'Tanggal Invoice', required: true, synonyms: ['tanggal invoice', 'tgl invoice', 'invoice date', 'date', 'tanggal', 'tgl_invoice', 'inv date'] },
        { key: 'dueDate', label: 'Tanggal Jatuh Tempo', required: true, synonyms: ['jatuh tempo', 'due date', 'tgl jatuh tempo', 'tanggal jatuh tempo', 'due_date'] },
        { key: 'amount', label: 'Nilai Invoice (Rp)', required: true, synonyms: ['amount', 'nilai', 'total', 'jumlah', 'nilai invoice', 'total invoice', 'dpp'] },
        { key: 'paidAmount', label: 'Nilai Terbayar (Rp)', required: false, synonyms: ['paid', 'terbayar', 'jumlah bayar', 'sudah dibayar', 'paid amount', 'realisasi'] },
        { key: 'notes', label: 'Catatan', required: false, synonyms: ['notes', 'catatan', 'keterangan', 'keterangan tambahan'] }
      ],
      ap: [
        { key: 'invoiceNo', label: 'Nomor Invoice AP', required: true, synonyms: ['invoice', 'no invoice', 'no. invoice', 'invoice no', 'inv no', 'nomor invoice', 'no_invoice', 'no tagihan'] },
        { key: 'supplierName', label: 'Nama Supplier', required: true, synonyms: ['supplier', 'nama supplier', 'supplier name', 'vendor', 'nama vendor', 'rekanan'] },
        { key: 'invoiceDate', label: 'Tanggal Invoice', required: true, synonyms: ['tanggal invoice', 'tgl invoice', 'invoice date', 'date', 'tanggal', 'tgl_invoice', 'inv date'] },
        { key: 'dueDate', label: 'Tanggal Jatuh Tempo', required: true, synonyms: ['jatuh tempo', 'due date', 'tgl jatuh tempo', 'tanggal jatuh tempo', 'due_date'] },
        { key: 'amount', label: 'Nilai Invoice (Rp)', required: true, synonyms: ['amount', 'nilai', 'total', 'jumlah', 'nilai invoice', 'total invoice', 'dpp'] },
        { key: 'paidAmount', label: 'Nilai Terbayar (Rp)', required: false, synonyms: ['paid', 'terbayar', 'jumlah bayar', 'sudah dibayar', 'paid amount', 'realisasi'] },
        { key: 'notes', label: 'Catatan', required: false, synonyms: ['notes', 'catatan', 'keterangan', 'keterangan tambahan'] }
      ],
      pymhd: [
        { key: 'referenceNo', label: 'Nomor Referensi', required: true, synonyms: ['no referensi', 'ref', 'no ref', 'reference no', 'reference', 'nomor referensi', 'no_ref'] },
        { key: 'expenseCategory', label: 'Kategori Biaya', required: true, synonyms: ['kategori', 'kategori biaya', 'category', 'expense category', 'pos biaya', 'akun'] },
        { key: 'vendorName', label: 'Nama Vendor', required: true, synonyms: ['vendor', 'nama vendor', 'vendor name', 'supplier', 'rekanan'] },
        { key: 'period', label: 'Periode', required: true, synonyms: ['periode', 'period', 'bulan', 'bulan tahun'] },
        { key: 'amount', label: 'Nilai Biaya (Rp)', required: true, synonyms: ['amount', 'nilai', 'total', 'jumlah', 'nilai biaya', 'dpp'] },
        { key: 'status', label: 'Status (Accrued/Paid/Cancelled)', required: false, synonyms: ['status', 'keterangan status'] },
        { key: 'notes', label: 'Catatan', required: false, synonyms: ['notes', 'catatan', 'keterangan'] }
      ],
      umo: [
        { key: 'umoNo', label: 'Nomor UMO', required: true, synonyms: ['no umo', 'no. umo', 'umo no', 'nomor umo', 'id umo', 'no_umo'] },
        { key: 'requestDate', label: 'Tanggal Pengajuan', required: true, synonyms: ['tanggal pengajuan', 'tgl pengajuan', 'request date', 'date', 'tanggal', 'tgl_pengajuan'] },
        { key: 'employeeName', label: 'Nama Karyawan', required: true, synonyms: ['karyawan', 'nama karyawan', 'employee', 'employee name', 'nama pengaju', 'pemohon'] },
        { key: 'description', label: 'Keterangan UMO', required: true, synonyms: ['keterangan', 'deskripsi', 'rincian', 'description', 'peruntukan'] },
        { key: 'amount', label: 'Nilai UMO (Rp)', required: true, synonyms: ['amount', 'nilai', 'total', 'jumlah', 'nilai umo', 'panjar'] },
        { key: 'realizedAmount', label: 'Realisasi Pengeluaran (Rp)', required: false, synonyms: ['realisasi', 'realized', 'realized amount', 'pengeluaran realisasi', 'sudah dipertanggungjawabkan'] },
        { key: 'notes', label: 'Catatan', required: false, synonyms: ['notes', 'catatan', 'keterangan tambahan'] }
      ]
    };

    this.initElements();
    this.bindEvents();
  }

  initElements() {
    this.overlay = document.getElementById('uploadModalOverlay');
    this.closeBtn = document.getElementById('closeUploadModal');
    this.cancelBtn1 = document.getElementById('cancelUploadBtn1');
    this.dropZone = document.getElementById('dropZone');
    this.fileInput = document.getElementById('excelFileInput');
    this.step1 = document.getElementById('uploadStep1');
    this.step2 = document.getElementById('uploadStep2');
    
    this.mappingArea = document.getElementById('columnMappingArea');
    this.parsedCountEl = document.getElementById('parsedRecordsCount');
    this.backToStep1Btn = document.getElementById('backToStep1');
    this.confirmImportBtn = document.getElementById('confirmImportBtn');
  }

  bindEvents() {
    // Open click
    this.dropZone.addEventListener('click', () => this.fileInput.click());
    
    // File input selection
    this.fileInput.addEventListener('change', (e) => this.handleFileSelect(e));
    
    // Drag & Drop events
    this.dropZone.addEventListener('dragover', (e) => {
      e.preventDefault();
      this.dropZone.classList.add('dragover');
    });
    
    this.dropZone.addEventListener('dragleave', () => {
      this.dropZone.classList.remove('dragover');
    });
    
    this.dropZone.addEventListener('drop', (e) => {
      e.preventDefault();
      this.dropZone.classList.remove('dragover');
      const files = e.dataTransfer.files;
      if (files.length > 0) {
        this.processFile(files[0]);
      }
    });

    // Navigation and Close
    this.closeBtn.addEventListener('click', () => this.hide());
    this.cancelBtn1.addEventListener('click', () => this.hide());
    this.backToStep1Btn.addEventListener('click', () => this.resetToStep1());
    
    this.confirmImportBtn.addEventListener('click', () => this.executeBulkUpload());
  }

  show(menu) {
    this.activeMenu = menu;
    this.resetToStep1();
    this.overlay.classList.add('active');
    document.getElementById('uploadModalTitle').innerText = `Impor Data ${menu.toUpperCase()}`;
  }

  hide() {
    this.overlay.classList.remove('active');
    this.fileInput.value = '';
    this.excelData = null;
    this.excelHeaders = [];
  }

  resetToStep1() {
    this.step1.style.display = 'block';
    this.step2.style.display = 'none';
    this.fileInput.value = '';
    this.excelData = null;
    this.excelHeaders = [];
  }

  handleFileSelect(e) {
    const files = e.target.files;
    if (files.length > 0) {
      this.processFile(files[0]);
    }
  }

  processFile(file) {
    const reader = new FileReader();
    
    // Visual indicators
    this.app.showLoadingToast('Membaca file spreadsheet...', 'Silakan tunggu sebentar');
    
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target.result);
        const workbook = XLSX.read(data, { type: 'array', cellDates: true, dateNF: 'yyyy-mm-dd' });
        
        if (workbook.SheetNames.length === 0) {
          throw new Error('File spreadsheet tidak memiliki worksheet.');
        }
        
        // Grab first sheet
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        
        // Parse rows as raw objects
        const rawRows = XLSX.utils.sheet_to_json(sheet, { defval: "" });
        
        if (rawRows.length === 0) {
          throw new Error('Sheet pertama kosong atau tidak ada data yang terdeteksi.');
        }

        // Save records and extract headers
        this.excelData = rawRows;
        
        // Collect all unique keys from all rows (handles slightly irregular files)
        const headerSet = new Set();
        rawRows.forEach(row => {
          Object.keys(row).forEach(key => {
            if (key && !key.startsWith('__EMPTY')) {
              headerSet.add(key);
            }
          });
        });
        
        this.excelHeaders = Array.from(headerSet);

        this.app.showToast('File Berhasil Dibaca', `${rawRows.length} baris data dimuat.`, 'success');
        this.renderColumnMapping();
      } catch (err) {
        console.error(err);
        this.app.showToast('Gagal Membaca File', err.message, 'danger');
      }
    };
    
    reader.readAsArrayBuffer(file);
  }

  renderColumnMapping() {
    this.step1.style.display = 'none';
    this.step2.style.display = 'block';
    this.parsedCountEl.innerText = this.excelData.length;
    this.mappingArea.innerHTML = '';

    const fields = this.schemaDefinitions[this.activeMenu];
    
    fields.forEach(field => {
      // Build Mapping Row
      const row = document.createElement('div');
      row.className = 'mapping-row';
      
      const labelDiv = document.createElement('div');
      labelDiv.className = 'mapping-field-label';
      labelDiv.innerHTML = `${field.label} ${field.required ? '<span style="color: var(--color-danger)">*</span>' : ''}`;
      
      const arrowDiv = document.createElement('div');
      arrowDiv.className = 'mapping-field-arrow';
      arrowDiv.innerHTML = '<i class="fa-solid fa-arrow-right-long"></i>';
      
      const selectDiv = document.createElement('div');
      const select = document.createElement('select');
      select.className = 'mapping-select';
      select.dataset.field = field.key;
      select.dataset.required = field.required;
      
      // Default empty options
      const optEmpty = document.createElement('option');
      optEmpty.value = '';
      optEmpty.innerText = '-- Abaikan Kolom --';
      select.appendChild(optEmpty);
      
      // Auto mapping indicator
      let bestMatch = '';
      
      // Populate and evaluate best match based on synonyms
      this.excelHeaders.forEach(header => {
        const option = document.createElement('option');
        option.value = header;
        option.innerText = header;
        select.appendChild(option);
        
        // Auto-match algorithm
        const cleanHeader = header.toLowerCase().trim().replace(/[_\-\.]/g, ' ');
        field.synonyms.forEach(syn => {
          if (cleanHeader === syn.toLowerCase() || cleanHeader.includes(syn.toLowerCase()) || syn.toLowerCase().includes(cleanHeader)) {
            bestMatch = header;
          }
        });
      });
      
      if (bestMatch) {
        select.value = bestMatch;
      } else if (field.required) {
        // Fallback: If required, select first matching or leave empty
      }
      
      selectDiv.appendChild(select);
      row.appendChild(labelDiv);
      row.appendChild(arrowDiv);
      row.appendChild(selectDiv);
      
      this.mappingArea.appendChild(row);
    });
  }

  // Parses Excel Date values to actual standard string/date objects
  parseExcelDate(val) {
    if (!val) return null;
    if (val instanceof Date) return val.toISOString();
    
    // Check if it's an Excel serial date number
    if (typeof val === 'number') {
      const date = new Date((val - 25569) * 86400 * 1000);
      return date.toISOString();
    }
    
    // Check if it's a string, attempt parsing
    const parsedDate = new Date(val);
    if (!isNaN(parsedDate.getTime())) {
      return parsedDate.toISOString();
    }
    
    return null;
  }

  // Cleans numeric inputs
  parseExcelNumber(val) {
    if (val === undefined || val === null || val === '') return 0;
    if (typeof val === 'number') return val;
    
    // Format cleaning e.g. Rp 1.000.000,00 -> 1000000
    const cleanStr = val.toString()
      .replace(/rp/i, '')
      .replace(/\s/g, '')
      .replace(/\./g, '') // remove thousands dot
      .replace(/,/g, '.'); // change comma decimals to dot
      
    const parsed = parseFloat(cleanStr);
    return isNaN(parsed) ? 0 : parsed;
  }

  async executeBulkUpload() {
    const selects = this.mappingArea.querySelectorAll('.mapping-select');
    const mapping = {};
    let missingRequired = false;
    
    selects.forEach(select => {
      const field = select.dataset.field;
      const val = select.value;
      const isRequired = select.dataset.required === 'true';
      
      if (isRequired && !val) {
        missingRequired = true;
        select.style.borderColor = 'var(--color-danger)';
      } else {
        select.style.borderColor = '';
        if (val) {
          mapping[field] = val;
        }
      }
    });

    if (missingRequired) {
      this.app.showToast('Pemetaan Tidak Lengkap', 'Silakan pilih kolom yang wajib diisi (tanda merah).', 'warning');
      return;
    }

    this.app.showLoadingToast('Memproses & Mengunggah Data...', 'Menyimpan data massal ke server');

    try {
      // Compile row-by-row payload
      const payload = this.excelData.map(row => {
        const item = {};
        
        Object.keys(mapping).forEach(dbField => {
          const excelCol = mapping[dbField];
          const excelVal = row[excelCol];
          
          // Field dynamic transformations based on data type requirements
          if (['invoiceDate', 'dueDate', 'requestDate'].includes(dbField)) {
            item[dbField] = this.parseExcelDate(excelVal);
          } else if (['amount', 'paidAmount', 'realizedAmount'].includes(dbField)) {
            item[dbField] = this.parseExcelNumber(excelVal);
          } else {
            item[dbField] = excelVal ? excelVal.toString().trim() : '';
          }
        });
        
        return item;
      });

      // Filter out elements with completely empty required identifier fields
      const cleanPayload = payload.filter(item => {
        if (this.activeMenu === 'ar' || this.activeMenu === 'ap') return !!item.invoiceNo;
        if (this.activeMenu === 'pymhd') return !!item.referenceNo;
        if (this.activeMenu === 'umo') return !!item.umoNo;
        return true;
      });

      if (cleanPayload.length === 0) {
        throw new Error('Tidak ada data valid yang bisa diimpor setelah penyaringan.');
      }

      // Fetch POST upload
      const response = await fetch(`/api/${this.activeMenu}/bulk`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(cleanPayload)
      });

      const resData = await response.json();
      
      if (!response.ok) {
        throw new Error(resData.error || 'Terjadi kesalahan sistem saat menyimpan.');
      }

      // Success
      this.hide();
      this.app.showToast(
        'Impor Selesai',
        resData.message || `Berhasil mengimpor ${resData.insertedCount} data ke database!`,
        resData.skippedCount > 0 ? 'warning' : 'success'
      );
      
      // Refresh current active view
      this.app.loadCurrentView();

    } catch (err) {
      console.error(err);
      this.app.showToast('Impor Gagal', err.message, 'danger');
    }
  }
}

// Attach to window so app.js can instantiate
window.SpreadsheetUploader = SpreadsheetUploader;
