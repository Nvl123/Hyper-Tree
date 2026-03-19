# 🌳 HyperTree

**HyperTree** adalah aplikasi web interaktif untuk memvisualisasikan dan mengelola **hyperparameter eksperimen machine learning** dalam bentuk pohon (tree). Dirancang untuk mempermudah perbandingan eksperimen, pelacakan hasil, dan eksplorasi ruang hyperparameter secara visual.

![Vite](https://img.shields.io/badge/Vite-5.x-646CFF?logo=vite&logoColor=white)
![Chart.js](https://img.shields.io/badge/Chart.js-4.x-FF6384?logo=chartdotjs&logoColor=white)
![JavaScript](https://img.shields.io/badge/JavaScript-ES6+-F7DF1E?logo=javascript&logoColor=black)

---

## ✨ Fitur Utama

### 🧪 Tree Eksperimen

- **Buat node root & child** — Bangun hierarki eksperimen dengan parameter yang diwariskan dari parent ke child
- **Drag & drop node** — Geser node secara bebas di canvas, koneksi garis mengikuti secara otomatis (seperti Figma/draw.io)
- **Expand/Collapse** — Sembunyikan atau tampilkan subtree untuk fokus pada bagian tertentu
- **Search Node** — Cari node berdasarkan nama atau nilai hyperparameter dengan mudah
- **Grid System** — Toggle grid background untuk membantu perataan node secara manual
- **Analysis Tools** — Menu analitik interaktif yang mencakup:
  - 👯 **Cek Kemiripan**: Hitung dan urutkan persentase kesamaan hyperparameter antar semua node.
  - 🔍 **Cek Unik**: Validasi otomatis untuk memastikan tidak ada duplikasi konfigurasi di tree Anda.
  - ⚖ **Compare 2 Nodes**: Bandingkan dua node spesifik untuk melihat perbedaan parameternya.

### 📊 Dashboard Analitik

- **Tabel hasil eksperimen** — Ranking otomatis dengan medali 🥇🥈🥉
- **Line chart** — Perbandingan metrik antar eksperimen
- **Radar chart** — Profil eksperimen dalam bentuk spider web
- **Bar chart** — Ranking per metrik secara visual
- **Dual-Axis Line Charts** — Analisis korelasi langsung antara Evals vs Akurasi dan Evals vs Loss
- **Bubble Chart 3D** — Eksplorasi performa eksperimen 3 dimensi (Evals, Accuracy, dan Loss)
- **Filter sidebar** — Pilih eksperimen & metrik yang ingin dibandingkan
- **Sort** — Urutkan berdasarkan metrik tertentu (ascending/descending)

### 📏 Metrik yang Didukung

`BLEU 1-4` · `METEOR` · `ROUGE-L` · `CIDEr` · `SPICE` · `Loss` · `Accuracy`

### 💾 File Management

- **Save/Load JSON** — Simpan tree ke file JSON dan buka kembali
- **Save to same file** — Langsung overwrite file yang sedang dibuka (File System Access API)
- **Export PNG** — Ekspor tree sebagai gambar (canvas capture)
- **Export CSV** — Ekspor semua data eksperimen, hyperparameter, dan hasil ke file CSV untuk analisis lanjut di Excel/Spreadsheet

### 🎨 UI/UX

- **Dark & Light theme** — Toggle tema sesuai preferensi
- **Zoom & Pan** — Navigasi canvas dengan scroll zoom dan drag
- **Smooth page transitions** — Animasi perpindahan halaman yang premium
- **Parameter sidebar** — Drag parameter dari sidebar ke node card untuk mempermudah input
- **Input validation** — Validasi otomatis hasil eksperimen (format angka, auto-format 4 desimal)

---

## 🚀 Cara Menjalankan

### Prasyarat

- [Node.js](https://nodejs.org/) (v16+)
- npm

### Instalasi

```bash
# Clone repository
git clone https://github.com/Nvl123/Hyper-Tree.git
cd Hyper-Tree

# Install dependencies
npm install

# Jalankan dev server
npm run dev
```

Buka browser di `http://localhost:5173`

### Build Produksi

```bash
npm run build
npm run preview
```

---

## 📁 Struktur Proyek

```
Hyper-Tree/
├── index.html              # Halaman utama (tree editor)
├── dashboard.html          # Halaman dashboard analitik
├── vite.config.js          # Konfigurasi Vite (multi-page)
├── package.json
└── src/
    ├── main.js             # Entry point utama & event binding
    ├── tree.js             # Rendering tree, pan/zoom, drag node
    ├── node.js             # Rendering kartu node (HTML factory)
    ├── store.js            # State management, persistence (localStorage/File)
    ├── modal.js            # Modal edit node, inheritance logic UI, validasi
    ├── sidebar.js          # Sidebar parameter drag & drop logic
    ├── links.js            # Deteksi shared parameter & penggambaran koneksi
    ├── export.js           # Logic Export tree ke PNG dan CSV
    ├── dashboard.js        # Logic dashboard, Chart.js implementation
    ├── style.css           # Stylesheet utama & design system
    └── dashboard.css       # Stylesheet khusus dashboard
```

---

## 🛠️ Tech Stack

| Teknologi                  | Kegunaan                             |
| -------------------------- | ------------------------------------ |
| **Vanilla JS**             | Logic aplikasi performa tinggi       |
| **Vite**                   | Build tool modern & dev server       |
| **Chart.js**               | Visualisasi data metrik di dashboard |
| **html-to-image**          | Library untuk menangkap gambar canvas|
| **UUID**                   | Identifikasi unik untuk setiap node  |
| **File System Access API** | Akses file sistem native (browser)   |

---

## 📖 Cara Penggunaan

1. **Buat eksperimen** — Klik `+ Add Root Node` untuk memulai pohon baru
2. **Tambah parameter** — Edit node secara manual atau drag dari sidebar parameter
3. **Bangun hierarki** — Tambah child node; tentukan parameter mana yang ingin di-override dari parent
4. **Analisis Langsung** — Gunakan menu `Analysis Tools` untuk mengecek keunikan konfigurasi, menghitung kemiripan persentase antar eksperimen, atau membandingkan 2 node spesifik.
5. **Catat hasil** — Masukkan angka hasil di modal edit untuk melihat ranking di dashboard
6. **Eksplorasi** — Pindah ke halaman Dashboard untuk visualisasi performa mendalam
7. **Ekspor** — Gunakan `Export PNG` untuk gambar atau `Export CSV` untuk data tabular

---

## 🎯 Use Case

- **Eksperimen Deep Learning** — Dokumentasikan pencarian hyperparameter (LR, Epochs, Batch Size)
- **Benchmarking Model** — Bandingkan hasil metrik NLP/Vision antar model dengan struktur yang jelas
- **Tingkatkan Reproduksibilitas** — Simpan konfigurasi eksperimen lengkap dalam satu file JSON
- **Presentasi Hasil** — Buat grafik perbandingan dan pohon eksperimen untuk laporan/paper

---

## 📝 Lisensi

MIT License — Silakan gunakan dan modifikasi sesuai kebutuhan.
