# USER GUIDE & SYSTEM AUDIT REPORT (CMOMS ERP)
**Aplikasi Monitoring Desain Internal & Eksternal (Creative & Marketing Operations Management System)**  
*Dokumentasi Lengkap End-to-End Hasil Audit Aplikasi, Penelusuran Workflow, Ekstraksi Screenshot Aktual & Pembuatan User Guide PPTX*

---

## 1. Executive Summary & Inventory Metrik

| Metrik Audit | Nilai Aktual | Keterangan |
| :--- | :---: | :--- |
| **TOTAL MODULES** | **9 Modul Utama** | Dashboard, Mockup Pipeline, Motion Pipeline, Approved Archive (Mockup & Motion), Workload & Capacity, Reports & Analytics, Master Data Clients, Master Data Users, Master Data Content Types, Holiday Calendar, Audit Trail |
| **TOTAL ROLES** | **7 Peran Pengguna** | `ADMIN`, `TEAM_LEAD`, `STRATEGIC_PIC`, `DESIGNER` (Graphic Designer), `MOTION_PIC`, `REQUESTER` (Account Executive), `OPERATOR` |
| **TOTAL WORKFLOWS** | **7 Alur Utama** | Intake Request, Triage & Assign, Start & Execution, Submit Output, Review & Revision Loop, Handover to Operator, Automatic Time-Based Archiving |
| **TOTAL SCREENSHOTS** | **83 Tangkapan Layar** | Terkategori ke dalam 13 folder modul (`screenshots/01-login` s/d `screenshots/13-other`) |
| **TOTAL SLIDES** | **49 Slide Widescreen (16:9)** | Terdistribusi dalam file presentasi master `ERP_User_Guide_Complete.pptx` |
| **TOTAL FITUR TERDOKUMENTASI** | **34 Fitur Fungsional** | Termasuk inovasi terbaru: Kanban Approved Archive 5-Minggu, Diskusi Chat Kanan-Kiri, dan Matriks Kapasitas Harian |

---

## 2. Peta Modul & Matriks Peran Pengguna (RBAC)

### 2.1. Daftar 9 Modul Teridentifikasi
1. **Executive Dashboard**: Ringkasan metrik volume harian/bulanan, status live, grafik KPI, dan peringatan keterlambatan SLA.
2. **Task Management (Mockup Pipeline)**: Pusat kendali desain grafis statis (Feed, Story, Banner, Key Visual) dengan Tampilan Kanban dan Tabel.
3. **Motion Graphics Pipeline**: Pusat produksi video animasi berorientasi platform (TikTok, Reels, YouTube) dengan sistem routing studio Jakarta/Bandung.
4. **Approved Archive (Mockup & Motion)**: Arsip historis otomatis berbasis waktu (*time-based Kanban*) dengan pembagian **Week 1 s/d Week 5** berdasarkan `approved_at`.
5. **Team Workload & Capacity Intelligence**: Matriks pemantauan kapasitas harian desainer grafis (5–7 poin) dan motion PIC (7 poin) dengan indikator occupancy % dan alarm overload.
6. **Reports & Analytics Engine**: Mesin kalkulasi Service Level Agreement (SLA), rasio permintaan vs output, dan kontribusi pivot brand.
7. **Master Data Management**: Manajemen terpadu untuk Klien/Brand, Format Konten & Bobot Kesulitan Bawaan, serta Kalender Hari Libur Nasional.
8. **User Management & Invitation**: Pengelolaan akun tim, penentuan peran, batas kuota poin harian, dan pembuatan tautan undangan aktivasi (*Invite Link*).
9. **System Audit Trail**: Perekam jejak aktivitas sistem secara permanen (*immutable log*) untuk investigasi kronologis data lama vs baru.

### 2.2. Matriks Hak Akses & Peran Pengguna (7 Roles)

| Role Code | Label Pengguna | Akses Halaman | Wewenang Aksi Utama |
| :--- | :--- | :--- | :--- |
| **`ADMIN`** | System Admin | Seluruh Sistem | Kontrol penuh, kelola user, master data, konfigurasi kuota, override status, audit trail. |
| **`TEAM_LEAD`** | Team Lead | Seluruh Sistem | Triage tiket, penugasan desainer (Assign), atur bobot kesulitan, approval, handover video, undo status. |
| **`STRATEGIC_PIC`** | Tim Strategi | Dashboard, Task Management, Capacity | Menyusun konsep, validasi brand guideline, sign-off tiket berkategori 'Requires Strategic'. |
| **`DESIGNER`** | Graphic Designer | Dashboard, Task Management, Capacity | Menerima tugas, klik Start Work, unggah link Google Drive (Submit), eksekusi revisi. |
| **`MOTION_PIC`** | Motion Designer | Dashboard, Motion Pipeline, Capacity | Produksi animasi/video, input tautan render final, revisi video per platform tayang. |
| **`REQUESTER`** | Account Executive (AE) | Dashboard, Task Management, Motion | Buat tiket baru (+ New Task), kirim brief, pantau progres, chat diskusi, Approve/Revise. |
| **`OPERATOR`** | Tim Live Stream | Penerima Target Handover | Menerima video approved, unduh render output, tandai status siar menjadi Completed. |

---

## 3. Akun Pengguna Uji Coba Terverifikasi

| # | Nama Akun | Email | Kata Sandi Demo | Peran Sistem |
| :-: | :--- | :--- | :--- | :--- |
| 1 | System Admin | `admin@orbiz.id` | `admin123` | `ADMIN` |
| 2 | Alfie Rahman | `alfie@orbiz.id` | `alfie123` | `TEAM_LEAD` |
| 3 | Ira Kusuma | `ira@orbiz.id` | `ira123` | `STRATEGIC_PIC` |
| 4 | Mahes Wardana | `mahes@orbiz.id` | `mahes123` | `STRATEGIC_PIC` |
| 5 | Nadya Aulia | `nadya@orbiz.id` | `nadya123` | `DESIGNER` |
| 6 | Yusuf Pratama | `yusuf@orbiz.id` | `yusuf123` | `DESIGNER` |
| 7 | Badriyah Sari | `bad@orbiz.id` | `bad123` | `DESIGNER` |
| 8 | Jova Dirgantara | `jova@orbiz.id` | `jova123` | `MOTION_PIC` |
| 9 | Bima Saputra | `bima@orbiz.id` | `bima123` | `MOTION_PIC` |
| 10 | Sarah Amelia | `sarah@orbiz.id` | `sarah123` | `REQUESTER` |
| 11 | Reza Firmansyah | `reza@orbiz.id` | `reza123` | `REQUESTER` |
| 12 | Sam Operator | `sam@orbiz.id` | `sam123` | `OPERATOR` |

---

## 4. Struktur Organisasi Folder Tangkapan Layar (`screenshots/`)

Folder screenshot telah disusun rapi berdasarkan modul:
```text
screenshots/
├── 01-login/              # Tangkapan layar autentikasi, quick login demo & form input
├── 02-dashboard/          # Dashboard utama, KPI cards, sidebar navigasi & topbar
├── 03-request/            # Papan Mockup pipeline, form create task, & modal detail
├── 04-strategic/          # Tiket konsep strategis & audit log alur strategi
├── 05-design/             # Modal penugasan (Assign), Start Work, & Submit Design
├── 06-motion/             # Papan Motion Pipeline, Form Standalone Video, & Render specs
├── 07-kanban/             # Tampilan Kanban vs Table view & kartu berbobot prioritas
├── 08-chat/               # Tab Discussion / Chat interaktif dengan gelembung kanan-kiri
├── 09-notification/       # Panel notifikasi lonceng header & unread badges
├── 10-approval/           # Tombol Approve Design, Form Request Revision & reason notes
├── 11-archive/            # Kanban Approved Archive 5-Minggu & filter bulan/tahun
├── 12-profile/            # Menu profil pengguna & manajemen sesi
└── 13-other/              # Workload matrix, SLA reports, User/Client/Holiday master data
```

---

## 5. Distribusi 49 Slide pada Presentasi Master (`ERP_User_Guide_Complete.pptx`)

- **Slide 01**: Halaman Sampul Resmi (Cover User Guide & Identitas Sistem)
- **Slide 02**: Peran (Role) dalam Aplikasi & Matriks Hak Akses Halaman
- **Slide 03**: Akun Pengguna & Kredensial Uji Coba (Fitur Quick Demo Login)
- **Slide 04**: Peta Alur Bisnis End-to-End (7 Tahapan Siklus Hidup Permintaan)
- **Slide 05**: Autentikasi Pengguna (Langkah Login & Keamanan Sesi)
- **Slide 06**: Dashboard Utama & Ringkasan KPI Operasional Real-Time
- **Slide 07**: Navigasi Menu Sidebar & Header Kontrol Aplikasi
- **Slide 08**: Task Management (Pengenalan Pusat Kendali Desain Statis)
- **Slide 09**: Navigasi Tampilan Task Management (Kanban View vs Table View)
- **Slide 10**: Fitur Pencarian Cepat, Filter Multi-Kriteria & Ekspor Excel/CSV
- **Slide 11**: Cara Membuat Task Baru (Create New Task & Opsi Strategic)
- **Slide 12**: Alur Kerja Desain — Langkah 1: Penugasan Desainer (Assign Task)
- **Slide 13**: Alur Kerja Desain — Langkah 2: Memulai Pengerjaan (Start Work & SLA)
- **Slide 14**: Alur Kerja Desain — Langkah 3: Mengirimkan Hasil Desain (Submit Design)
- **Slide 15**: Alur Kerja Desain — Langkah 4: Review, Persetujuan & Permintaan Revisi
- **Slide 16**: Alur Kerja Desain — Langkah 5: Penanganan Revisi (Revision History)
- **Slide 17**: Fitur Khusus: Batal Status (Undo Status Workflow Protection)
- **Slide 18**: Melihat Detail & Riwayat Tugas (Task Detail Modal & Audit Trail)
- **Slide 19**: Motion Pipeline (Pengenalan Modul Produksi Video & Animasi)
- **Slide 20**: Navigasi Papan Kanban Motion Pipeline (6 Tahapan Alur)
- **Slide 21**: Fitur Pencarian & Filter Khusus Motion Graphics
- **Slide 22**: Cara Membuat Tugas Motion Baru (Standalone & Turunan Desain)
- **Slide 23**: Alur Kerja Motion — Langkah 2 & 3: Memulai & Mengirimkan Hasil Render
- **Slide 24**: Alur Kerja Motion — Langkah 4: Review, Persetujuan & Revisi Motion
- **Slide 25**: Alur Kerja Motion — Langkah 5: Handover Video ke Tim Operator
- **Slide 26**: Melihat Detail Motion Task & Akses Tautan Render Output
- **Slide 27**: Approved Archive (Pengenalan Pusat Arsip Tugas Selesai)
- **Slide 28**: Struktur Kanban 5-Minggu (Distribusi Historis Berbasis `approved_at`)
- **Slide 29**: Filter Periode Arsip (Bulan/Tahun) & Ekspor Data Historis CSV
- **Slide 30**: Kolaborasi Tim: Fitur Diskusi & Chat Real-Time per Request
- **Slide 31**: Pusat Notifikasi Sistem & Tindak Lanjut Perubahan Status
- **Slide 32**: Workload & Capacity Intelligence (Monitoring Batas Poin 5–7 Pts)
- **Slide 33**: Reports & Analytics Engine (SLA Performance & Tren Permintaan)
- **Slide 34**: Pusat Pengelolaan Data Master Aplikasi (Admin & Settings)
- **Slide 35**: Data Master: User Management (Kelola User, Peran & Batas Poin)
- **Slide 36**: Data Master: Clients / Brands (Pengelolaan Brand & Status Inactive)
- **Slide 37**: Data Master: Content Types (Pengaturan Format & Kesulitan Bawaan)
- **Slide 38**: Data Master: Holiday Calendar (Kalender Libur & Mesin Otomasi SLA)
- **Slide 39**: Data Master: Audit Trail Sistem (Perekam Jejak Aktivitas "CCTV")
- **Slide 40**: Panduan Berbasis Peran: Requester / AE & Strategic PIC
- **Slide 41**: Panduan Berbasis Peran: Graphic Designer & Motion PIC
- **Slide 42**: Panduan Berbasis Peran: Team Lead, Operator & System Admin
- **Slide 43**: Skenario Praktis 1 & 2: Pembuatan Request Baru & Penanganan Revisi
- **Slide 44**: Skenario Praktis 3 & 4: Penugasan Tim Seimbang & Komunikasi Chat
- **Slide 45**: Skenario Praktis 5 & 6: Handover Video ke Operator & Penelusuran Arsip
- **Slide 46**: Panduan Pemecahan Masalah (Troubleshooting Guide)
- **Slide 47**: Praktik Terbaik Penggunaan Sistem (Operational Best Practices)
- **Slide 48**: Lembar Pintas Cepat (Quick Reference Cheat Sheet)
- **Slide 49**: Penutup & Saluran Dukungan Resmi (Documentation Sign-Off)

---

## 6. Temuan Audit Sistem & Catatan Operasional

1. **Pemisahan Jalur Arsip vs Papan Aktif**: Fitur **Approved Archive Kanban** berhasil menyelesaikan masalah overload pada status Approved. Papan kerja aktif hanya berfokus pada tiket yang memerlukan tindakan (`Unassigned` s/d `In Review`).
2. **Kalkulasi Hari Kerja SLA**: Mesin SLA terbukti mengecualikan Sabtu-Minggu dan tanggal merah di `Holiday Calendar`, sehingga durasi pengerjaan mencerminkan jam kerja nyata agensi.
3. **Penyelarasan Kapasitas Harian**: Peringatan **Overload** otomatis menyala saat akumulasi poin desainer melampaui kuota harian (5–7 poin), mencegah ketimpangan beban kerja.
4. **Keamanan Riwayat Obrolan**: Seluruh chat diskusi tersimpan di dalam record tiket sehingga instruksi brief tidak tercecer pada aplikasi perpesanan luar.
