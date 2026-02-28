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
- **Inheritance parameter** — Child node otomatis mewarisi parameter parent, bisa di-override per node
- **Shared parameter highlight** — Parameter yang sama antar node ditandai dengan warna yang menarik
- **Duplikasi node** — Copy node tanpa menyertakan child-nya
- **Collapse/expand** — Sembunyikan subtree untuk fokus pada bagian tertentu

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
- **Export PNG** — Ekspor tree sebagai gambar

### 🎨 UI/UX

- **Dark & Light theme** — Toggle tema sesuai preferensi
- **Zoom & Pan** — Navigasi canvas dengan scroll zoom dan drag
- **Smooth page transitions** — Animasi perpindahan halaman
- **Parameter sidebar** — Drag parameter dari sidebar ke node card
- **Input validation** — Validasi hasil eksperimen (format angka, 4 desimal)

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
    ├── main.js             # Entry point utama
    ├── tree.js             # Rendering tree, pan/zoom, drag node
    ├── node.js             # Rendering kartu node
    ├── store.js            # State management & persistence
    ├── modal.js            # Modal edit node + validasi input
    ├── sidebar.js          # Sidebar parameter drag & drop
    ├── links.js            # Shared parameter detection
    ├── export.js           # Export tree ke PNG
    ├── dashboard.js        # Logic dashboard + Chart.js
    ├── style.css           # Stylesheet utama
    └── dashboard.css       # Stylesheet dashboard
```

---

## 🛠️ Tech Stack

| Teknologi                  | Kegunaan                       |
| -------------------------- | ------------------------------ |
| **Vanilla JS**             | Logic aplikasi tanpa framework |
| **Vite**                   | Build tool & dev server        |
| **Chart.js**               | Visualisasi data di dashboard  |
| **html-to-image**          | Export tree ke PNG             |
| **UUID**                   | Generate ID unik untuk node    |
| **File System Access API** | Save/load file langsung        |

---

## 📖 Cara Penggunaan

1. **Buat eksperimen** — Klik `+ Add Root Node` untuk membuat node awal
2. **Tambah parameter** — Edit node atau drag parameter dari sidebar
3. **Buat variasi** — Tambah child node, override parameter yang ingin diubah
4. **Catat hasil** — Isi metrik hasil di bagian Results (format: angka desimal)
5. **Bandingkan** — Buka Dashboard untuk melihat perbandingan visual
6. **Simpan** — Klik Save untuk menyimpan sebagai file JSON

---

## 🎯 Use Case

- **Riset ML/DL** — Tracking eksperimen image captioning, NLP, computer vision
- **Hyperparameter tuning** — Visualisasi ruang pencarian parameter
- **Dokumentasi eksperimen** — Catat dan bandingkan hasil secara terstruktur
- **Presentasi** — Export tree sebagai gambar untuk laporan

---

## 📝 Lisensi

MIT License — Silakan gunakan dan modifikasi sesuai kebutuhan.
