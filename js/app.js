/**
 * FIN-CORE Main Application Engine
 * Handles client-side view routing, CRUD modal rendering, ApexCharts generation, datatable rendering,
 * search/sort, manual entry handling, and custom toast notification system.
 */

class FinanceApp {
  constructor() {
    this.currentView = 'dashboard';
    
    // Pagination & Datatable States
    this.tableState = {
      data: [],
      filteredData: [],
      currentPage: 1,
      pageSize: 10,
      searchQuery: '',
      sortField: 'createdAt',
      sortOrder: 'desc'
    };

    // Deletion State Cache
    this.itemToDelete = null;
    
    // Form Editing State
    this.editingId = null;

    // Charts references for proper garbage collection on view swap
    this.activeCharts = [];

    // Initialize application
    this.init();
  }

  async init() {
    this.initElements();
    this.initClock();
    this.bindEvents();
    
    // Instantiate Excel Uploader module
    this.uploader = new SpreadsheetUploader(this);
    
    // Initial data load
    await this.loadCurrentView();
    
    this.showToast('Selamat Datang', 'Sistem Dashboard FIN-CORE berhasil dimuat.', 'success');
  }

  initElements() {
    this.viewTitle = document.getElementById('currentViewTitle');
    this.mainArea = document.getElementById('mainContentArea');
    this.menuItems = document.querySelectorAll('.menu-item');
    this.timeStr = document.getElementById('currentTimeStr');
    
    // CRUD Modal components
    this.crudModal = document.getElementById('crudModalOverlay');
    this.crudForm = document.getElementById('crudForm');
    this.crudFormBody = document.getElementById('crudFormBody');
    this.crudModalTitle = document.getElementById('crudModalTitle');
    this.closeCrudModalBtn = document.getElementById('closeCrudModal');
    this.cancelCrudBtn = document.getElementById('cancelCrudBtn');
    
    // Delete Confirmation components
    this.deleteModal = document.getElementById('deleteConfirmOverlay');
    this.executeDeleteBtn = document.getElementById('executeDeleteBtn');
    this.cancelDeleteBtn = document.getElementById('cancelDeleteBtn');
    
    // Excel Import components
    this.closeUploadModalBtn = document.getElementById('closeUploadModal');
  }

  bindEvents() {
    // Sidebar Navigation router
    this.menuItems.forEach(item => {
      item.addEventListener('click', (e) => {
        e.preventDefault();
        const nextView = item.getAttribute('data-view');
        this.switchView(nextView);
      });
    });

    // Close CRUD modals
    const hideCrud = () => {
      this.crudModal.classList.remove('active');
      this.editingId = null;
      this.crudForm.reset();
    };
    this.closeCrudModalBtn.addEventListener('click', hideCrud);
    this.cancelCrudBtn.addEventListener('click', hideCrud);

    // CRUD Submission handler
    this.crudForm.addEventListener('submit', (e) => this.handleCrudSubmit(e));

    // Close Deletion confirmation
    const hideDelete = () => {
      this.deleteModal.classList.remove('active');
      this.itemToDelete = null;
    };
    this.cancelDeleteBtn.addEventListener('click', hideDelete);
    this.executeDeleteBtn.addEventListener('click', () => this.executeDelete());
  }

  // Header Real-time Clock
  initClock() {
    const updateTime = () => {
      const now = new Date();
      const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
      const dateString = now.toLocaleDateString('id-ID', options);
      const timeString = now.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      this.timeStr.innerHTML = `${dateString} | ${timeString.replace(/\./g, ':')}`;
    };
    updateTime();
    setInterval(updateTime, 1000);
  }

  // Dynamic View Switcher
  switchView(viewName) {
    if (this.currentView === viewName) return;
    
    // Remove active sidebar class
    this.menuItems.forEach(item => {
      if (item.getAttribute('data-view') === viewName) {
        item.classList.add('active');
      } else {
        item.classList.remove('active');
      }
    });

    // Clean up active charts
    this.activeCharts.forEach(chart => {
      try { chart.destroy(); } catch(e) {}
    });
    this.activeCharts = [];

    // Reset Table States
    this.tableState = {
      data: [],
      filteredData: [],
      currentPage: 1,
      pageSize: 10,
      searchQuery: '',
      sortField: 'createdAt',
      sortOrder: 'desc'
    };

    this.currentView = viewName;
    
    // Set Header Title
    const titles = {
      dashboard: 'Dashboard Ringkasan',
      ar: 'Accounts Receivable (AR)',
      ap: 'Accounts Payable (AP)',
      pymhd: 'Pos-Pos Yang Masih Harus Dibayar (PYMHD)',
      umo: 'Uang Muka Ongkos (UMO)'
    };
    this.viewTitle.innerText = titles[viewName] || 'Dashboard Keuangan';

    this.loadCurrentView();
  }

  // Router dispatcher
  async loadCurrentView() {
    // Show spinner transition
    this.mainArea.innerHTML = `
      <div style="display:flex; justify-content:center; align-items:center; min-height:300px; flex-direction:column; gap:16px;">
        <div style="width: 40px; height: 40px; border: 3px solid rgba(255,255,255,0.05); border-top-color: var(--color-primary); border-radius:50%; animation: spin 1s linear infinite;"></div>
        <span style="font-size:0.9rem; color:var(--text-muted);">Memuat berkas data keuangan...</span>
      </div>
      <style>
        @keyframes spin { to { transform: rotate(360deg); } }
      </style>
    `;

    try {
      if (this.currentView === 'dashboard') {
        await this.renderDashboard();
      } else {
        await this.renderMenuTable();
      }
    } catch (err) {
      console.error(err);
      this.mainArea.innerHTML = `
        <div class="empty-state">
          <i class="fa-solid fa-triangle-exclamation" style="color:var(--color-danger);"></i>
          <h3 class="empty-state-title">Gagal Memuat Halaman</h3>
          <p class="empty-state-desc">${err.message}</p>
        </div>
      `;
    }
  }

  // ==========================================
  // VIEW 1: CENTRAL SUMMARY DASHBOARD
  // ==========================================
  async renderDashboard() {
    // Fetch summary statistics
    const response = await fetch('/api/dashboard/summary');
    if (!response.ok) throw new Error('Gagal menarik data ringkasan dashboard.');
    const summary = await response.json();

    this.mainArea.innerHTML = `
      <!-- Summary Cards Grid -->
      <div class="summary-grid">
        <!-- AR CARD -->
        <div class="premium-card ar-card" id="card-sum-ar">
          <div class="card-header">
            <span class="card-title">Receivables (AR)</span>
            <div class="card-icon"><i class="fa-solid fa-file-invoice-dollar"></i></div>
          </div>
          <div class="card-value">${this.formatCurrency(summary.ar.outstanding)}</div>
          <div class="card-subtext">
            <span>Total AR: ${this.formatCurrency(summary.ar.total)}</span>
            <span class="${summary.ar.overdue > 0 ? 'negative' : ''}">Overdue: ${this.formatCurrency(summary.ar.overdue)}</span>
          </div>
        </div>

        <!-- AP CARD -->
        <div class="premium-card ap-card" id="card-sum-ap">
          <div class="card-header">
            <span class="card-title">Payables (AP)</span>
            <div class="card-icon"><i class="fa-solid fa-file-invoice"></i></div>
          </div>
          <div class="card-value">${this.formatCurrency(summary.ap.unpaid)}</div>
          <div class="card-subtext">
            <span>Total AP: ${this.formatCurrency(summary.ap.total)}</span>
            <span class="${summary.ap.overdue > 0 ? 'negative' : ''}">Overdue: ${this.formatCurrency(summary.ap.overdue)}</span>
          </div>
        </div>

        <!-- PYMHD CARD -->
        <div class="premium-card pymhd-card" id="card-sum-pymhd">
          <div class="card-header">
            <span class="card-title">Accruals (PYMHD)</span>
            <div class="card-icon"><i class="fa-solid fa-clock-rotate-left"></i></div>
          </div>
          <div class="card-value">${this.formatCurrency(summary.pymhd.accrued)}</div>
          <div class="card-subtext">
            <span>Total Accrual: ${this.formatCurrency(summary.pymhd.total)}</span>
            <span class="positive">Paid: ${this.formatCurrency(summary.pymhd.paid)}</span>
          </div>
        </div>

        <!-- UMO CARD -->
        <div class="premium-card umo-card" id="card-sum-umo">
          <div class="card-header">
            <span class="card-title">Advances (UMO)</span>
            <div class="card-icon"><i class="fa-solid fa-wallet"></i></div>
          </div>
          <div class="card-value">${this.formatCurrency(summary.umo.open)}</div>
          <div class="card-subtext">
            <span>Total UMO: ${this.formatCurrency(summary.umo.total)}</span>
            <span class="positive">Settled: ${this.formatCurrency(summary.umo.settled)}</span>
          </div>
        </div>
      </div>

      <!-- Visualization Grid -->
      <div class="dashboard-details-grid">
        <!-- Main Line & Bar Chart -->
        <div class="premium-card chart-section">
          <h2 class="chart-title">
            <i class="fa-solid fa-chart-bar" style="color:var(--color-primary)"></i>
            Tren Keuangan & Pos Transaksi (6 Bulan Terakhir)
          </h2>
          <div id="financialTrendChart"></div>
        </div>

        <!-- Doughnut Composition Chart -->
        <div class="premium-card chart-section">
          <h2 class="chart-title">
            <i class="fa-solid fa-chart-pie" style="color:var(--color-success)"></i>
            Komposisi Portofolio Keuangan
          </h2>
          <div id="portfolioPieChart"></div>
        </div>
      </div>
    `;

    // Render interactive charts
    this.renderTrendChart(summary.trends);
    this.renderPieChart(summary);

    // Make cards clickable to instantly switch views! Beautiful user flow.
    document.getElementById('card-sum-ar').addEventListener('click', () => this.switchView('ar'));
    document.getElementById('card-sum-ap').addEventListener('click', () => this.switchView('ap'));
    document.getElementById('card-sum-pymhd').addEventListener('click', () => this.switchView('pymhd'));
    document.getElementById('card-sum-umo').addEventListener('click', () => this.switchView('umo'));
  }

  renderTrendChart(trends) {
    const categories = trends.map(t => t.label);
    const arData = trends.map(t => t.ar);
    const apData = trends.map(t => t.ap);
    const pymhdData = trends.map(t => t.pymhd);
    const umoData = trends.map(t => t.umo);

    const options = {
      series: [
        { name: 'Receivables (AR)', type: 'column', data: arData },
        { name: 'Payables (AP)', type: 'column', data: apData },
        { name: 'Accruals (PYMHD)', type: 'line', data: pymhdData },
        { name: 'Advances (UMO)', type: 'line', data: umoData }
      ],
      chart: {
        height: 320,
        type: 'line',
        stacked: false,
        background: 'transparent',
        toolbar: { show: false }
      },
      theme: { mode: 'dark' },
      colors: ['#3B82F6', '#10B981', '#F59E0B', '#EF4444'],
      stroke: { width: [0, 0, 3, 3], curve: 'smooth' },
      plotOptions: {
        bar: { columnWidth: '45%', borderRadius: 4 }
      },
      fill: {
        opacity: [0.85, 0.85, 1, 1],
        gradient: {
          inverseColors: false,
          shade: 'dark',
          type: "vertical",
          opacityFrom: 0.85,
          opacityTo: 0.55
        }
      },
      labels: categories,
      markers: { size: 4 },
      xaxis: { type: 'category' },
      yaxis: {
        title: { text: 'Rupiah (Rp)', style: { color: 'var(--text-muted)' } },
        labels: {
          formatter: (value) => {
            if (value >= 1e9) return (value / 1e9).toFixed(1) + ' M';
            if (value >= 1e6) return (value / 1e6).toFixed(1) + ' Jt';
            return this.formatCurrency(value);
          }
        }
      },
      tooltip: {
        shared: true,
        intersect: false,
        y: {
          formatter: (y) => {
            if (typeof y !== "undefined") {
              return this.formatCurrency(y);
            }
            return y;
          }
        }
      },
      legend: {
        position: 'top',
        horizontalAlign: 'center'
      },
      grid: {
        borderColor: 'rgba(255, 255, 255, 0.05)',
        strokeDashArray: 4
      }
    };

    const chart = new ApexCharts(document.querySelector("#financialTrendChart"), options);
    chart.render();
    this.activeCharts.push(chart);
  }

  renderPieChart(summary) {
    const options = {
      series: [
        summary.ar.outstanding,
        summary.ap.unpaid,
        summary.pymhd.accrued,
        summary.umo.open
      ],
      chart: {
        height: 320,
        type: 'donut',
        background: 'transparent'
      },
      labels: ['Outstanding AR', 'Unpaid AP', 'Accrued PYMHD', 'Open UMO'],
      colors: ['#3B82F6', '#10B981', '#F59E0B', '#EF4444'],
      theme: { mode: 'dark' },
      plotOptions: {
        pie: {
          donut: {
            size: '70%',
            labels: {
              show: true,
              total: {
                show: true,
                label: 'Posisi Liabilitas & Aset',
                fontSize: '12px',
                color: '#94A3B8',
                formatter: (w) => {
                  const total = w.globals.seriesTotals.reduce((a, b) => a + b, 0);
                  if (total >= 1e9) return (total / 1e9).toFixed(2) + ' Miliar';
                  if (total >= 1e6) return (total / 1e6).toFixed(2) + ' Juta';
                  return this.formatCurrency(total);
                }
              }
            }
          }
        }
      },
      dataLabels: { show: false },
      legend: { position: 'bottom' },
      stroke: { colors: ['transparent'] },
      grid: { padding: { top: 0, bottom: 0 } }
    };

    const chart = new ApexCharts(document.querySelector("#portfolioPieChart"), options);
    chart.render();
    this.activeCharts.push(chart);
  }

  // ==========================================
  // VIEW 2: DATATABLES & CRUD VIEWS
  // ==========================================
  async renderMenuTable() {
    // 1. Fetch menu specific records
    const response = await fetch(`/api/${this.currentView}`);
    if (!response.ok) throw new Error(`Gagal menarik database ${this.currentView.toUpperCase()}.`);
    
    this.tableState.data = await response.json();
    this.tableState.filteredData = [...this.tableState.data];

    // Compute sub-summary cards for header info in specific lists
    const summaryWidget = this.getMenuSubSummaryHTML();

    this.mainArea.innerHTML = `
      <!-- Specific list statistics indicator -->
      ${summaryWidget}

      <!-- Control / Action Bar -->
      <div class="table-actions-bar">
        <div class="search-box">
          <i class="fa-solid fa-magnifying-glass"></i>
          <input type="text" id="tableSearchInput" placeholder="Cari data..." value="${this.tableState.searchQuery}">
        </div>
        
        <div class="buttons-group">
          <!-- Primary CRUD buttons -->
          <button class="btn btn-primary" id="openAddModalBtn">
            <i class="fa-solid fa-plus"></i> Tambah Manual
          </button>
          <button class="btn btn-success" id="openExcelImportBtn">
            <i class="fa-solid fa-file-excel"></i> Unggah Excel
          </button>
          <button class="btn btn-secondary" id="clearDatabaseBtn" style="border-color: rgba(239, 68, 68, 0.2); color: #EF4444;">
            <i class="fa-solid fa-trash-can"></i> Kosongkan
          </button>
        </div>
      </div>

      <!-- Datatable Area -->
      <div class="table-wrapper">
        <table class="financial-table" id="financeDataTable">
          <!-- Table columns header generated by js -->
          <thead id="tableHeaderElement"></thead>
          <tbody id="tableBodyElement"></tbody>
        </table>
      </div>

      <!-- Pagination Block -->
      <div class="pagination" id="tablePaginationArea"></div>
    `;

    // Hook listeners
    document.getElementById('tableSearchInput').addEventListener('input', (e) => this.handleTableSearch(e.target.value));
    document.getElementById('openAddModalBtn').addEventListener('click', () => this.showCrudModal(false));
    document.getElementById('openExcelImportBtn').addEventListener('click', () => this.uploader.show(this.currentView));
    document.getElementById('clearDatabaseBtn').addEventListener('click', () => this.showClearConfirmModal());

    this.applyFilteringAndSorting();
  }

  getMenuSubSummaryHTML() {
    const data = this.tableState.data;
    if (this.currentView === 'ar') {
      let total = 0, outstanding = 0, overdue = 0;
      data.forEach(item => {
        total += item.amount || 0;
        outstanding += item.balance || 0;
        if (item.status === 'Overdue') overdue += item.balance || 0;
      });
      return `
        <div class="summary-grid" style="margin-bottom: 24px;">
          <div class="premium-card ar-card" style="padding: 16px 20px;">
            <span class="card-title" style="font-size:0.75rem;">Total Tagihan AR</span>
            <div class="card-value" style="font-size:1.35rem; margin: 8px 0 0 0;">${this.formatCurrency(total)}</div>
          </div>
          <div class="premium-card ar-card" style="padding: 16px 20px;">
            <span class="card-title" style="font-size:0.75rem;">Outstanding (Sisa Piutang)</span>
            <div class="card-value" style="font-size:1.35rem; margin: 8px 0 0 0; color:var(--color-primary);">${this.formatCurrency(outstanding)}</div>
          </div>
          <div class="premium-card ar-card" style="padding: 16px 20px;">
            <span class="card-title" style="font-size:0.75rem;">Overdue (Jatuh Tempo)</span>
            <div class="card-value" style="font-size:1.35rem; margin: 8px 0 0 0; color:var(--color-danger);">${this.formatCurrency(overdue)}</div>
          </div>
          <div class="premium-card ar-card" style="padding: 16px 20px;">
            <span class="card-title" style="font-size:0.75rem;">Rasio Pelunasan</span>
            <div class="card-value" style="font-size:1.35rem; margin: 8px 0 0 0; color:var(--color-success);">
              ${total > 0 ? ((total - outstanding) / total * 100).toFixed(1) : 0}%
            </div>
          </div>
        </div>
      `;
    } else if (this.currentView === 'ap') {
      let total = 0, unpaid = 0, overdue = 0;
      data.forEach(item => {
        total += item.amount || 0;
        unpaid += item.balance || 0;
        if (item.status === 'Overdue') overdue += item.balance || 0;
      });
      return `
        <div class="summary-grid" style="margin-bottom: 24px;">
          <div class="premium-card ap-card" style="padding: 16px 20px;">
            <span class="card-title" style="font-size:0.75rem;">Total Tagihan AP</span>
            <div class="card-value" style="font-size:1.35rem; margin: 8px 0 0 0;">${this.formatCurrency(total)}</div>
          </div>
          <div class="premium-card ap-card" style="padding: 16px 20px;">
            <span class="card-title" style="font-size:0.75rem;">Belum Dibayar (Utang)</span>
            <div class="card-value" style="font-size:1.35rem; margin: 8px 0 0 0; color:var(--color-success);">${this.formatCurrency(unpaid)}</div>
          </div>
          <div class="premium-card ap-card" style="padding: 16px 20px;">
            <span class="card-title" style="font-size:0.75rem;">Hutang Overdue</span>
            <div class="card-value" style="font-size:1.35rem; margin: 8px 0 0 0; color:var(--color-danger);">${this.formatCurrency(overdue)}</div>
          </div>
          <div class="premium-card ap-card" style="padding: 16px 20px;">
            <span class="card-title" style="font-size:0.75rem;">Rasio Pembayaran</span>
            <div class="card-value" style="font-size:1.35rem; margin: 8px 0 0 0; color:var(--color-primary);">
              ${total > 0 ? ((total - unpaid) / total * 100).toFixed(1) : 0}%
            </div>
          </div>
        </div>
      `;
    } else if (this.currentView === 'pymhd') {
      let total = 0, accrued = 0, paid = 0;
      data.forEach(item => {
        total += item.amount || 0;
        if (item.status === 'Accrued') accrued += item.amount || 0;
        if (item.status === 'Paid') paid += item.amount || 0;
      });
      return `
        <div class="summary-grid" style="margin-bottom: 24px;">
          <div class="premium-card pymhd-card" style="padding: 16px 20px;">
            <span class="card-title" style="font-size:0.75rem;">Total Accrual (PYMHD)</span>
            <div class="card-value" style="font-size:1.35rem; margin: 8px 0 0 0;">${this.formatCurrency(total)}</div>
          </div>
          <div class="premium-card pymhd-card" style="padding: 16px 20px;">
            <span class="card-title" style="font-size:0.75rem;">Status Accrued (Liabilitas)</span>
            <div class="card-value" style="font-size:1.35rem; margin: 8px 0 0 0; color:var(--color-warning);">${this.formatCurrency(accrued)}</div>
          </div>
          <div class="premium-card pymhd-card" style="padding: 16px 20px;">
            <span class="card-title" style="font-size:0.75rem;">Status Paid (Sudah Dibayar)</span>
            <div class="card-value" style="font-size:1.35rem; margin: 8px 0 0 0; color:var(--color-success);">${this.formatCurrency(paid)}</div>
          </div>
          <div class="premium-card pymhd-card" style="padding: 16px 20px;">
            <span class="card-title" style="font-size:0.75rem;">Jumlah Transaksi</span>
            <div class="card-value" style="font-size:1.35rem; margin: 8px 0 0 0; color:var(--text-main);">${data.length} Transaksi</div>
          </div>
        </div>
      `;
    } else if (this.currentView === 'umo') {
      let total = 0, open = 0, settled = 0;
      data.forEach(item => {
        total += item.amount || 0;
        open += item.settlementBalance || 0;
        settled += item.realizedAmount || 0;
      });
      return `
        <div class="summary-grid" style="margin-bottom: 24px;">
          <div class="premium-card umo-card" style="padding: 16px 20px;">
            <span class="card-title" style="font-size:0.75rem;">Total Penyaluran UMO</span>
            <div class="card-value" style="font-size:1.35rem; margin: 8px 0 0 0;">${this.formatCurrency(total)}</div>
          </div>
          <div class="premium-card umo-card" style="padding: 16px 20px;">
            <span class="card-title" style="font-size:0.75rem;">Outstanding UMO (Sisa Panjar)</span>
            <div class="card-value" style="font-size:1.35rem; margin: 8px 0 0 0; color:var(--color-danger);">${this.formatCurrency(open)}</div>
          </div>
          <div class="premium-card umo-card" style="padding: 16px 20px;">
            <span class="card-title" style="font-size:0.75rem;">Realisasi UMO</span>
            <div class="card-value" style="font-size:1.35rem; margin: 8px 0 0 0; color:var(--color-success);">${this.formatCurrency(settled)}</div>
          </div>
          <div class="premium-card umo-card" style="padding: 16px 20px;">
            <span class="card-title" style="font-size:0.75rem;">Tingkat Penyelesaian (Settlement)</span>
            <div class="card-value" style="font-size:1.35rem; margin: 8px 0 0 0; color:var(--color-primary);">
              ${total > 0 ? (settled / total * 100).toFixed(1) : 0}%
            </div>
          </div>
        </div>
      `;
    }
    return '';
  }

  // Live filter and sorting engine
  handleTableSearch(query) {
    this.tableState.searchQuery = query;
    this.tableState.currentPage = 1;
    this.applyFilteringAndSorting();
  }

  applyFilteringAndSorting() {
    const { searchQuery, sortField, sortOrder, currentPage, pageSize } = this.tableState;
    let data = [...this.tableState.data];

    // 1. Text Search Filter
    if (searchQuery.trim() !== '') {
      const q = searchQuery.toLowerCase().trim();
      data = data.filter(item => {
        if (this.currentView === 'ar') {
          return item.invoiceNo.toLowerCase().includes(q) || item.customerName.toLowerCase().includes(q);
        } else if (this.currentView === 'ap') {
          return item.invoiceNo.toLowerCase().includes(q) || item.supplierName.toLowerCase().includes(q);
        } else if (this.currentView === 'pymhd') {
          return item.referenceNo.toLowerCase().includes(q) || item.expenseCategory.toLowerCase().includes(q) || item.vendorName.toLowerCase().includes(q);
        } else if (this.currentView === 'umo') {
          return item.umoNo.toLowerCase().includes(q) || item.employeeName.toLowerCase().includes(q) || item.description.toLowerCase().includes(q);
        }
        return false;
      });
    }

    // 2. Sorting
    data.sort((a, b) => {
      let valA = a[sortField];
      let valB = b[sortField];
      
      if (typeof valA === 'string') valA = valA.toLowerCase();
      if (typeof valB === 'string') valB = valB.toLowerCase();
      
      if (valA < valB) return sortOrder === 'asc' ? -1 : 1;
      if (valA > valB) return sortOrder === 'asc' ? 1 : -1;
      return 0;
    });

    this.tableState.filteredData = data;

    // 3. Paginate
    const totalRecords = data.length;
    const startIndex = (currentPage - 1) * pageSize;
    const endIndex = Math.min(startIndex + pageSize, totalRecords);
    const paginatedData = data.slice(startIndex, endIndex);

    this.renderTableHeader();
    this.renderTableBody(paginatedData);
    this.renderPagination(totalRecords, startIndex + 1, endIndex);
  }

  // Generate responsive column sorting headers
  renderTableHeader() {
    const th = document.getElementById('tableHeaderElement');
    const makeSortable = (field, text) => {
      const isCurrent = this.tableState.sortField === field;
      const order = isCurrent && this.tableState.sortOrder === 'asc' ? 'desc' : 'asc';
      const icon = isCurrent 
        ? (order === 'asc' ? '<i class="fa-solid fa-sort-down"></i>' : '<i class="fa-solid fa-sort-up"></i>')
        : '<i class="fa-solid fa-sort text-muted" style="opacity:0.3;"></i>';
      
      return `<th style="cursor:pointer;" onclick="app.setSort('${field}')">${text} ${icon}</th>`;
    };

    if (this.currentView === 'ar') {
      th.innerHTML = `
        <tr>
          ${makeSortable('invoiceNo', 'No. Invoice')}
          ${makeSortable('customerName', 'Customer')}
          ${makeSortable('invoiceDate', 'Tanggal')}
          ${makeSortable('dueDate', 'Jatuh Tempo')}
          ${makeSortable('amount', 'Nilai Tagihan')}
          ${makeSortable('balance', 'Sisa Piutang')}
          ${makeSortable('status', 'Status')}
          <th style="width:100px; text-align:center;">Aksi</th>
        </tr>
      `;
    } else if (this.currentView === 'ap') {
      th.innerHTML = `
        <tr>
          ${makeSortable('invoiceNo', 'No. Invoice AP')}
          ${makeSortable('supplierName', 'Supplier')}
          ${makeSortable('invoiceDate', 'Tanggal')}
          ${makeSortable('dueDate', 'Jatuh Tempo')}
          ${makeSortable('amount', 'Nilai Tagihan')}
          ${makeSortable('balance', 'Sisa Hutang')}
          ${makeSortable('status', 'Status')}
          <th style="width:100px; text-align:center;">Aksi</th>
        </tr>
      `;
    } else if (this.currentView === 'pymhd') {
      th.innerHTML = `
        <tr>
          ${makeSortable('referenceNo', 'No. Referensi')}
          ${makeSortable('expenseCategory', 'Kategori Biaya')}
          ${makeSortable('vendorName', 'Vendor')}
          ${makeSortable('period', 'Periode')}
          ${makeSortable('amount', 'Nilai Biaya')}
          ${makeSortable('status', 'Status')}
          <th style="width:100px; text-align:center;">Aksi</th>
        </tr>
      `;
    } else if (this.currentView === 'umo') {
      th.innerHTML = `
        <tr>
          ${makeSortable('umoNo', 'No. UMO')}
          ${makeSortable('requestDate', 'Tgl Pengajuan')}
          ${makeSortable('employeeName', 'Karyawan')}
          ${makeSortable('description', 'Keterangan')}
          ${makeSortable('amount', 'Nilai UMO')}
          ${makeSortable('settlementBalance', 'Sisa Panjar')}
          ${makeSortable('status', 'Status')}
          <th style="width:100px; text-align:center;">Aksi</th>
        </tr>
      `;
    }
  }

  // Populate data items inside tables
  renderTableBody(data) {
    const tbody = document.getElementById('tableBodyElement');
    
    if (data.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="8">
            <div class="empty-state">
              <i class="fa-regular fa-folder-open"></i>
              <h4 class="empty-state-title">Tidak ada data ditemukan</h4>
              <p class="empty-state-desc">Silakan unggah spreadsheet Excel atau tambahkan data manual baru.</p>
            </div>
          </td>
        </tr>
      `;
      return;
    }

    tbody.innerHTML = '';

    data.forEach(item => {
      const tr = document.createElement('tr');
      
      let columnsHTML = '';
      if (this.currentView === 'ar') {
        columnsHTML = `
          <td><strong>${item.invoiceNo}</strong></td>
          <td>${item.customerName}</td>
          <td>${this.formatDate(item.invoiceDate)}</td>
          <td>${this.formatDate(item.dueDate)}</td>
          <td>${this.formatCurrency(item.amount)}</td>
          <td>${this.formatCurrency(item.balance)}</td>
          <td><span class="badge badge-${item.status.toLowerCase()}">${item.status}</span></td>
        `;
      } else if (this.currentView === 'ap') {
        columnsHTML = `
          <td><strong>${item.invoiceNo}</strong></td>
          <td>${item.supplierName}</td>
          <td>${this.formatDate(item.invoiceDate)}</td>
          <td>${this.formatDate(item.dueDate)}</td>
          <td>${this.formatCurrency(item.amount)}</td>
          <td>${this.formatCurrency(item.balance)}</td>
          <td><span class="badge badge-${item.status.toLowerCase()}">${item.status}</span></td>
        `;
      } else if (this.currentView === 'pymhd') {
        columnsHTML = `
          <td><strong>${item.referenceNo}</strong></td>
          <td>${item.expenseCategory}</td>
          <td>${item.vendorName}</td>
          <td>${item.period}</td>
          <td>${this.formatCurrency(item.amount)}</td>
          <td><span class="badge badge-${item.status.toLowerCase()}">${item.status}</span></td>
        `;
      } else if (this.currentView === 'umo') {
        columnsHTML = `
          <td><strong>${item.umoNo}</strong></td>
          <td>${this.formatDate(item.requestDate)}</td>
          <td>${item.employeeName}</td>
          <td><span style="font-size:0.8rem; color:var(--text-muted); line-clamp:1; display:-webkit-box; -webkit-line-clamp:1; -webkit-box-orient:vertical; overflow:hidden;">${item.description}</span></td>
          <td>${this.formatCurrency(item.amount)}</td>
          <td>${this.formatCurrency(item.settlementBalance)}</td>
          <td><span class="badge badge-${item.status.toLowerCase()}">${item.status}</span></td>
        `;
      }

      // Append edit and delete operations buttons
      tr.innerHTML = `
        ${columnsHTML}
        <td>
          <div class="action-btns">
            <button class="action-btn edit" onclick="app.showCrudModal(true, '${item._id}')" title="Edit Data"><i class="fa-solid fa-pencil"></i></button>
            <button class="action-btn delete" onclick="app.showDeleteConfirmModal('${item._id}')" title="Hapus Data"><i class="fa-solid fa-trash"></i></button>
          </div>
        </td>
      `;
      tbody.appendChild(tr);
    });
  }

  renderPagination(totalRecords, startIdx, endIdx) {
    const area = document.getElementById('tablePaginationArea');
    if (totalRecords === 0) {
      area.innerHTML = '';
      return;
    }

    const { currentPage, pageSize } = this.tableState;
    const totalPages = Math.ceil(totalRecords / pageSize);

    area.innerHTML = `
      <div>Menampilkan <strong>${startIdx}</strong> - <strong>${endIdx}</strong> dari <strong>${totalRecords}</strong> data</div>
      <div class="pagination-controls">
        <button class="btn btn-secondary" style="padding: 6px 12px;" ${currentPage === 1 ? 'disabled' : ''} onclick="app.setPage(${currentPage - 1})">
          <i class="fa-solid fa-chevron-left"></i>
        </button>
        <div style="display:flex; align-items:center; padding: 0 10px; font-weight:600;">Halaman ${currentPage} dari ${totalPages}</div>
        <button class="btn btn-secondary" style="padding: 6px 12px;" ${currentPage === totalPages ? 'disabled' : ''} onclick="app.setPage(${currentPage + 1})">
          <i class="fa-solid fa-chevron-right"></i>
        </button>
      </div>
    `;
  }

  setSort(field) {
    const current = this.tableState.sortField;
    const order = this.tableState.sortOrder;
    
    if (current === field) {
      this.tableState.sortOrder = order === 'asc' ? 'desc' : 'asc';
    } else {
      this.tableState.sortField = field;
      this.tableState.sortOrder = 'desc'; // default high numbers/dates first
    }
    this.applyFilteringAndSorting();
  }

  setPage(page) {
    this.tableState.currentPage = page;
    this.applyFilteringAndSorting();
  }

  // ==========================================
  // FORM BUILDER & CRUD MANAGEMENT
  // ==========================================
  async showCrudModal(isEdit = false, recordId = null) {
    this.editingId = recordId;
    this.crudForm.reset();
    
    // Dynamic fields HTML compiler
    let fieldsHTML = '';
    
    if (isEdit) {
      this.crudModalTitle.innerText = `Edit Data ${this.currentView.toUpperCase()}`;
      // Load current object details from state cache
      const record = this.tableState.data.find(r => r._id === recordId);
      if (!record) return;

      if (this.currentView === 'ar') {
        fieldsHTML = `
          <div class="form-group full-width">
            <label>Nomor Invoice</label>
            <input type="text" name="invoiceNo" value="${record.invoiceNo}" required readonly style="opacity: 0.7; cursor: not-allowed;">
          </div>
          <div class="form-group full-width">
            <label>Nama Customer</label>
            <input type="text" name="customerName" value="${record.customerName}" required>
          </div>
          <div class="form-group">
            <label>Tanggal Invoice</label>
            <input type="date" name="invoiceDate" value="${this.formatInputDate(record.invoiceDate)}" required>
          </div>
          <div class="form-group">
            <label>Jatuh Tempo</label>
            <input type="date" name="dueDate" value="${this.formatInputDate(record.dueDate)}" required>
          </div>
          <div class="form-group">
            <label>Nilai Invoice (Rp)</label>
            <input type="number" name="amount" value="${record.amount}" min="0" required>
          </div>
          <div class="form-group">
            <label>Terbayar (Rp)</label>
            <input type="number" name="paidAmount" value="${record.paidAmount || 0}" min="0" required>
          </div>
          <div class="form-group full-width">
            <label>Catatan</label>
            <textarea name="notes" rows="2">${record.notes || ''}</textarea>
          </div>
        `;
      } else if (this.currentView === 'ap') {
        fieldsHTML = `
          <div class="form-group full-width">
            <label>Nomor Invoice Tagihan</label>
            <input type="text" name="invoiceNo" value="${record.invoiceNo}" required readonly style="opacity: 0.7; cursor: not-allowed;">
          </div>
          <div class="form-group full-width">
            <label>Nama Supplier</label>
            <input type="text" name="supplierName" value="${record.supplierName}" required>
          </div>
          <div class="form-group">
            <label>Tanggal Invoice</label>
            <input type="date" name="invoiceDate" value="${this.formatInputDate(record.invoiceDate)}" required>
          </div>
          <div class="form-group">
            <label>Jatuh Tempo</label>
            <input type="date" name="dueDate" value="${this.formatInputDate(record.dueDate)}" required>
          </div>
          <div class="form-group">
            <label>Nilai Tagihan (Rp)</label>
            <input type="number" name="amount" value="${record.amount}" min="0" required>
          </div>
          <div class="form-group">
            <label>Terbayar (Rp)</label>
            <input type="number" name="paidAmount" value="${record.paidAmount || 0}" min="0" required>
          </div>
          <div class="form-group full-width">
            <label>Catatan</label>
            <textarea name="notes" rows="2">${record.notes || ''}</textarea>
          </div>
        `;
      } else if (this.currentView === 'pymhd') {
        fieldsHTML = `
          <div class="form-group full-width">
            <label>Nomor Referensi</label>
            <input type="text" name="referenceNo" value="${record.referenceNo}" required readonly style="opacity: 0.7; cursor: not-allowed;">
          </div>
          <div class="form-group">
            <label>Kategori Biaya</label>
            <input type="text" name="expenseCategory" value="${record.expenseCategory}" required placeholder="Contoh: Beban Sewa, Listrik">
          </div>
          <div class="form-group">
            <label>Nama Vendor</label>
            <input type="text" name="vendorName" value="${record.vendorName}" required>
          </div>
          <div class="form-group">
            <label>Periode</label>
            <input type="text" name="period" value="${record.period}" required placeholder="Contoh: Mei 2026">
          </div>
          <div class="form-group">
            <label>Nilai Biaya (Rp)</label>
            <input type="number" name="amount" value="${record.amount}" min="0" required>
          </div>
          <div class="form-group">
            <label>Status Pembebanan</label>
            <select name="status">
              <option value="Accrued" ${record.status === 'Accrued' ? 'selected' : ''}>Accrued (Liabilitas)</option>
              <option value="Paid" ${record.status === 'Paid' ? 'selected' : ''}>Paid (Sudah Dibayar)</option>
              <option value="Cancelled" ${record.status === 'Cancelled' ? 'selected' : ''}>Cancelled</option>
            </select>
          </div>
          <div class="form-group full-width">
            <label>Catatan</label>
            <textarea name="notes" rows="2">${record.notes || ''}</textarea>
          </div>
        `;
      } else if (this.currentView === 'umo') {
        fieldsHTML = `
          <div class="form-group full-width">
            <label>Nomor UMO</label>
            <input type="text" name="umoNo" value="${record.umoNo}" required readonly style="opacity: 0.7; cursor: not-allowed;">
          </div>
          <div class="form-group full-width">
            <label>Nama Karyawan</label>
            <input type="text" name="employeeName" value="${record.employeeName}" required>
          </div>
          <div class="form-group">
            <label>Tanggal Pengajuan</label>
            <input type="date" name="requestDate" value="${this.formatInputDate(record.requestDate)}" required>
          </div>
          <div class="form-group">
            <label>Nilai UMO (Rp)</label>
            <input type="number" name="amount" value="${record.amount}" min="0" required>
          </div>
          <div class="form-group">
            <label>Realisasi Pengeluaran (Rp)</label>
            <input type="number" name="realizedAmount" value="${record.realizedAmount || 0}" min="0" required>
          </div>
          <div class="form-group full-width">
            <label>Deskripsi Perjalanan / Keterangan</label>
            <textarea name="description" rows="2" required>${record.description}</textarea>
          </div>
          <div class="form-group full-width">
            <label>Catatan Tambahan</label>
            <textarea name="notes" rows="2">${record.notes || ''}</textarea>
          </div>
        `;
      }
    } else {
      this.crudModalTitle.innerText = `Tambah Data ${this.currentView.toUpperCase()} Baru`;
      
      if (this.currentView === 'ar') {
        fieldsHTML = `
          <div class="form-group full-width">
            <label>Nomor Invoice</label>
            <input type="text" name="invoiceNo" required placeholder="Contoh: INV/2026/001">
          </div>
          <div class="form-group full-width">
            <label>Nama Customer</label>
            <input type="text" name="customerName" required placeholder="Contoh: PT Semesta Abadi">
          </div>
          <div class="form-group">
            <label>Tanggal Invoice</label>
            <input type="date" name="invoiceDate" required>
          </div>
          <div class="form-group">
            <label>Jatuh Tempo</label>
            <input type="date" name="dueDate" required>
          </div>
          <div class="form-group">
            <label>Nilai Invoice (Rp)</label>
            <input type="number" name="amount" min="0" required placeholder="0">
          </div>
          <div class="form-group">
            <label>Terbayar (Rp)</label>
            <input type="number" name="paidAmount" value="0" min="0" required placeholder="0">
          </div>
          <div class="form-group full-width">
            <label>Catatan</label>
            <textarea name="notes" rows="2" placeholder="Tulis catatan jika diperlukan..."></textarea>
          </div>
        `;
      } else if (this.currentView === 'ap') {
        fieldsHTML = `
          <div class="form-group full-width">
            <label>Nomor Invoice Tagihan</label>
            <input type="text" name="invoiceNo" required placeholder="Contoh: AP/VENDOR/109">
          </div>
          <div class="form-group full-width">
            <label>Nama Supplier</label>
            <input type="text" name="supplierName" required placeholder="Contoh: CV Citra Global">
          </div>
          <div class="form-group">
            <label>Tanggal Invoice</label>
            <input type="date" name="invoiceDate" required>
          </div>
          <div class="form-group">
            <label>Jatuh Tempo</label>
            <input type="date" name="dueDate" required>
          </div>
          <div class="form-group">
            <label>Nilai Tagihan (Rp)</label>
            <input type="number" name="amount" min="0" required placeholder="0">
          </div>
          <div class="form-group">
            <label>Terbayar (Rp)</label>
            <input type="number" name="paidAmount" value="0" min="0" required placeholder="0">
          </div>
          <div class="form-group full-width">
            <label>Catatan</label>
            <textarea name="notes" rows="2" placeholder="Tulis catatan jika diperlukan..."></textarea>
          </div>
        `;
      } else if (this.currentView === 'pymhd') {
        fieldsHTML = `
          <div class="form-group full-width">
            <label>Nomor Referensi</label>
            <input type="text" name="referenceNo" required placeholder="Contoh: REF-PYMHD-001">
          </div>
          <div class="form-group">
            <label>Kategori Biaya</label>
            <input type="text" name="expenseCategory" required placeholder="Contoh: Beban Sewa, Listrik">
          </div>
          <div class="form-group">
            <label>Nama Vendor</label>
            <input type="text" name="vendorName" required placeholder="Contoh: PT PLN Persero">
          </div>
          <div class="form-group">
            <label>Periode</label>
            <input type="text" name="period" required placeholder="Contoh: Mei 2026">
          </div>
          <div class="form-group">
            <label>Nilai Biaya (Rp)</label>
            <input type="number" name="amount" min="0" required placeholder="0">
          </div>
          <div class="form-group">
            <label>Status Pembebanan</label>
            <select name="status">
              <option value="Accrued" selected>Accrued (Liabilitas)</option>
              <option value="Paid">Paid (Sudah Dibayar)</option>
              <option value="Cancelled">Cancelled</option>
            </select>
          </div>
          <div class="form-group full-width">
            <label>Catatan</label>
            <textarea name="notes" rows="2" placeholder="Tulis catatan jika diperlukan..."></textarea>
          </div>
        `;
      } else if (this.currentView === 'umo') {
        fieldsHTML = `
          <div class="form-group full-width">
            <label>Nomor UMO</label>
            <input type="text" name="umoNo" required placeholder="Contoh: UMO/2026/1029">
          </div>
          <div class="form-group full-width">
            <label>Nama Karyawan</label>
            <input type="text" name="employeeName" required placeholder="Contoh: Eka Saputra">
          </div>
          <div class="form-group">
            <label>Tanggal Pengajuan</label>
            <input type="date" name="requestDate" required>
          </div>
          <div class="form-group">
            <label>Nilai UMO (Rp)</label>
            <input type="number" name="amount" min="0" required placeholder="0">
          </div>
          <div class="form-group">
            <label>Realisasi Pengeluaran (Rp)</label>
            <input type="number" name="realizedAmount" value="0" min="0" required placeholder="0">
          </div>
          <div class="form-group full-width">
            <label>Deskripsi Perjalanan / Keterangan</label>
            <textarea name="description" rows="2" required placeholder="Contoh: Perjalanan dinas logistik ke Surabaya..."></textarea>
          </div>
          <div class="form-group full-width">
            <label>Catatan Tambahan</label>
            <textarea name="notes" rows="2" placeholder="Tulis catatan tambahan..."></textarea>
          </div>
        `;
      }
    }

    this.crudFormBody.innerHTML = fieldsHTML;
    this.crudModal.classList.add('active');
  }

  // Handle manual submit operations (Insert/Update)
  async handleCrudSubmit(e) {
    e.preventDefault();
    const formData = new FormData(this.crudForm);
    const body = {};
    
    formData.forEach((value, key) => {
      // Basic type transformations
      if (['amount', 'paidAmount', 'realizedAmount'].includes(key)) {
        body[key] = parseFloat(value) || 0;
      } else {
        body[key] = value;
      }
    });

    const isEdit = !!this.editingId;
    const url = isEdit ? `/api/${this.currentView}/${this.editingId}` : `/api/${this.currentView}`;
    const method = isEdit ? 'PUT' : 'POST';

    this.showLoadingToast('Menyimpan Data...', 'Mengirim berkas data ke database server');

    try {
      const response = await fetch(url, {
        method: method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });

      const resData = await response.json();
      
      if (!response.ok) {
        throw new Error(resData.error || 'Terjadi kesalahan sistem saat menyimpan data.');
      }

      this.crudModal.classList.remove('active');
      this.editingId = null;
      this.showToast('Data Berhasil Disimpan', isEdit ? 'Perubahan data berhasil disimpan.' : 'Data baru berhasil ditambahkan.', 'success');
      
      await this.loadCurrentView();
    } catch (err) {
      console.error(err);
      this.showToast('Penyimpanan Gagal', err.message, 'danger');
    }
  }

  // ==========================================
  // SINGLE RECORD DELETION FLOW
  // ==========================================
  showDeleteConfirmModal(id) {
    this.itemToDelete = id;
    const record = this.tableState.data.find(r => r._id === id);
    if (!record) return;
    
    let identifier = '';
    if (this.currentView === 'ar' || this.currentView === 'ap') identifier = record.invoiceNo;
    else if (this.currentView === 'pymhd') identifier = record.referenceNo;
    else if (this.currentView === 'umo') identifier = record.umoNo;

    document.getElementById('deleteConfirmTitle').innerText = 'Hapus Data';
    document.getElementById('deleteConfirmMessage').innerHTML = `Apakah Anda yakin ingin menghapus data dengan nomor dokumen <strong>${identifier}</strong>? Tindakan ini tidak dapat dibatalkan.`;
    this.deleteModal.classList.add('active');
  }

  async executeDelete() {
    if (!this.itemToDelete) return;
    this.deleteModal.classList.remove('active');
    
    this.showLoadingToast('Menghapus Data...', 'Mengeluarkan record dari database');

    try {
      const response = await fetch(`/api/${this.currentView}/${this.itemToDelete}`, {
        method: 'DELETE'
      });
      
      if (!response.ok) {
        const resData = await response.json();
        throw new Error(resData.error || 'Gagal menghapus data.');
      }

      this.showToast('Terhapus', 'Data berhasil dibersihkan dari database.', 'success');
      this.itemToDelete = null;
      await this.loadCurrentView();
    } catch (err) {
      console.error(err);
      this.showToast('Gagal Menghapus', err.message, 'danger');
    }
  }

  // ==========================================
  // ENTIRE DATABASE CLEARING FLOW (BULK DELETE)
  // ==========================================
  showClearConfirmModal() {
    this.itemToDelete = 'CLEAR_ALL';
    document.getElementById('deleteConfirmTitle').innerText = 'Kosongkan Database';
    document.getElementById('deleteConfirmMessage').innerHTML = `<strong>PERINGATAN KERAS!</strong> Apakah Anda benar-benar yakin ingin menghapus <strong>SELURUH DATA</strong> pada menu <strong>${this.currentView.toUpperCase()}</strong>?<br><br>Ini akan mengosongkan seluruh isi tabel di database.`;
    this.deleteModal.classList.add('active');
  }

  async executeClearAll() {
    this.deleteModal.classList.remove('active');
    this.showLoadingToast('Mengosongkan Database...', 'Menghapus seluruh record untuk menu ini');

    try {
      const response = await fetch(`/api/${this.currentView}`, {
        method: 'DELETE'
      });
      
      const resData = await response.json();
      
      if (!response.ok) {
        throw new Error(resData.error || 'Gagal membersihkan database.');
      }

      this.showToast('Database Bersih', resData.message || 'Seluruh data berhasil dihapus.', 'success');
      this.itemToDelete = null;
      await this.loadCurrentView();
    } catch (err) {
      console.error(err);
      this.showToast('Gagal Mengosongkan', err.message, 'danger');
    }
  }

  // Dispatcher for the confirmation modal executor
  async handleConfirmExecute() {
    if (this.itemToDelete === 'CLEAR_ALL') {
      await this.executeClearAll();
    } else {
      await this.executeDelete();
    }
  }

  // ==========================================
  // TOAST ALERT ENGINE (SLICK UI ALERTS)
  // ==========================================
  showToast(title, message, type = 'primary') {
    const container = document.getElementById('toastContainer');
    
    // Icon map
    const icons = {
      primary: 'fa-info-circle',
      success: 'fa-circle-check',
      warning: 'fa-triangle-exclamation',
      danger: 'fa-circle-xmark'
    };

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.innerHTML = `
      <div class="toast-icon"><i class="fa-solid ${icons[type] || 'fa-info-circle'}"></i></div>
      <div class="toast-content">
        <span class="toast-title">${title}</span>
        <span class="toast-message">${message}</span>
      </div>
    `;

    container.appendChild(toast);

    // Auto dismiss after 4 seconds with animation
    setTimeout(() => {
      toast.style.animation = 'fadeOut 0.5s forwards';
      setTimeout(() => {
        toast.remove();
      }, 500);
    }, 4000);
  }

  showLoadingToast(title, message) {
    const container = document.getElementById('toastContainer');
    
    // Clear any previous loading toasts to avoid clutter
    const oldLoaders = container.querySelectorAll('.toast-loading');
    oldLoaders.forEach(el => el.remove());

    const toast = document.createElement('div');
    toast.className = `toast toast-loading`;
    toast.style.borderLeftColor = 'var(--color-primary)';
    toast.innerHTML = `
      <div class="toast-icon" style="color:var(--color-primary);"><i class="fa-solid fa-spinner fa-spin"></i></div>
      <div class="toast-content">
        <span class="toast-title">${title}</span>
        <span class="toast-message">${message}</span>
      </div>
    `;

    container.appendChild(toast);
    
    // Store references to close it programmatically if needed, otherwise it auto dismisses in 10s
    setTimeout(() => {
      if (toast.parentNode) {
        toast.style.animation = 'fadeOut 0.5s forwards';
        setTimeout(() => toast.remove(), 500);
      }
    }, 10000);
  }

  // ==========================================
  // UTILITY DATA CONVERTERS
  // ==========================================
  formatCurrency(value) {
    if (value === undefined || value === null || isNaN(value)) return 'Rp 0';
    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      minimumFractionDigits: 0
    }).format(value);
  }

  formatDate(dateVal) {
    if (!dateVal) return '-';
    const date = new Date(dateVal);
    if (isNaN(date.getTime())) return '-';
    
    const months = [
      'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
      'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
    ];
    return `${date.getDate()} ${months[date.getMonth()]} ${date.getFullYear()}`;
  }

  formatInputDate(dateVal) {
    if (!dateVal) return '';
    const date = new Date(dateVal);
    if (isNaN(date.getTime())) return '';
    
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
}

// Instantiate and launch app in global space
document.addEventListener('DOMContentLoaded', () => {
  window.app = new FinanceApp();
  
  // Custom patch for handling execute deletion event on confirmation dialog
  document.getElementById('executeDeleteBtn').addEventListener('click', () => {
    window.app.handleConfirmExecute();
  });
});
