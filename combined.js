/* ==========================================================================
   BAGIAN 1: SISTEM DATABASE JADWAL SHOLAT INTERNAL & ALARM (AUDIO MP3)
   ========================================================================== */
function ambilJadwalHariIni(dateObj) {
    const tahun = dateObj.getFullYear();
    const bulan = String(dateObj.getMonth() + 1).padStart(2, '0');
    const tanggal = String(dateObj.getDate()).padStart(2, '0');
    const keyTanggal = `${tahun}-${bulan}-${tanggal}`; 

    if (typeof DATABASE_JADWAL_TAHUNAN !== 'undefined' && DATABASE_JADWAL_TAHUNAN[keyTanggal]) {
        return DATABASE_JADWAL_TAHUNAN[keyTanggal];
    }
    return { imsak: "04:44", fajr: "04:54", dhuhr: "12:18", asr: "15:43", magrib: "18:21", isya: "19:35" };
}

// Variabel penanda (flag) agar audio hanya berbunyi tepat satu kali
let isAlarmAdzanPlay = false;
let isAlarmIqamahPlay = false;

// Fungsi pemicu interaksi untuk memancing izin audio browser
function pancingIzinAudioBrowser() {
    console.log("Izin audio berhasil dipancing melalui interaksi pengguna.");
    const dummyAudio = new Audio('audio/BEEP PENDEK.mp3');
    dummyAudio.volume = 0; 
    dummyAudio.play().catch(() => {});
}

// Fungsi untuk memutar file MP3 secara berurutan atau tunggal
function putarAudioMp3(fileUtama, fileSambungan = null) {
    const audio = new Audio(`audio/${fileUtama}`);
    audio.play().then(() => {
        console.log(`Berhasil memutar audio: ${fileUtama}`);
        if (fileSambungan) {
            audio.onended = () => {
                const audioSambungan = new Audio(`audio/${fileSambungan}`);
                audioSambungan.play().then(() => {
                    console.log(`Berhasil memutar sambungan: ${fileSambungan}`);
                }).catch(e => {
                    console.error(`Gagal memutar audio sambungan (${fileSambungan}):`, e);
                });
            };
        }
    }).catch(e => {
        console.error(`Gagal memutar audio utama (${fileUtama}):`, e);
    });
}

// Mengubah triggerAlarm agar menerima tipe event ('adzan' atau 'iqamah')
function triggerAlarm(tipe) {
    if (tipe === 'adzan') {
        console.log("Memicu jalannya alarm 7 detik sebelum Adzan...");
        putarAudioMp3('BEEP PENDEK.mp3', 'BEEP PANJANG.mp3');
    } else if (tipe === 'iqamah') {
        console.log("Memicu jalannya alarm 7 detik sebelum Iqamah...");
        putarAudioMp3('BEEP PENDEK.mp3');
    }
}

/* ==========================================================================
   SISTEM ALGORITMA PERHITUNGAN TANGGAL HIJRIYAH DINAMIS (PASCA MAGHRIB)
   ========================================================================== */
function hitungHijriyahOtomatis(dateObj) {
    let kustomSore = new Date(dateObj.getTime());
    const jadwalHariIni = ambilJadwalHariIni(dateObj);
    
    if (jadwalHariIni && jadwalHariIni.magrib) {
        let partsMagrib = jadwalHariIni.magrib.split(':');
        let jamMagrib = parseInt(partsMagrib[0], 10);
        let menitMagrib = parseInt(partsMagrib[1], 10);
        
        let detikMagribHariIni = (jamMagrib * 3600) + (menitMagrib * 60);
        let detikSekarang = (dateObj.getHours() * 3600) + (dateObj.getMinutes() * 60) + dateObj.getSeconds();
        
        if (detikSekarang >= detikMagribHariIni) {
            kustomSore.setDate(kustomSore.getDate() + 1);
        }
    }

    // Setelan indeks penanggalan hilal (Silakan ubah angka 2440588 ini jika ingin bergeser +/- hari)
    let jd = Math.floor(kustomSore.getTime() / 86400000) + 2440588;
    let l = jd - 1948440 + 10632;
    let n = Math.floor((l - 1) / 10631);
    l = l - 10631 * n + 354;
    let j = Math.floor((10985 - l) / 5316) * Math.floor((50 * l) / 17719) + Math.floor(l / 5670) * Math.floor((43 * l) / 15238);
    l = l - Math.floor((30 - j) / 15) * Math.floor((17719 * j) / 50) - Math.floor(j / 16) * Math.floor((15238 * j) / 43) + 29;
    
    let m = Math.floor((24 * l) / 709);
    let d = l - Math.floor((709 * m) / 24);
    let y = 30 * n + j - 30;

    const namaBulanHijriyah = [
        "Muharram", "Safar", "Rabi'ul Awwal", "Rabi'ul Akhir", 
        "Jumadil Awwal", "Jumadil Akhir", "Rajab", "Sya'ban", 
        "Ramadhan", "Syawwal", "Dzulqa'dah", "Dzulhijjah"
    ];

    return `${d} ${namaBulanHijriyah[m - 1]} ${y} H`;
}

/* ==========================================================================
   BAGIAN 2: ENGINE REFRESH CLOCK & COUNTDOWN (REAL-TIME JADWAL)
   ========================================================================== */
const SPREADSHEET_ID = '1Jene5qNwgCTYkPAZhlbeRIEVnZvJl6Ktze0pp1upbsk'; 
const API_KEY = 'AIzaSyA8jJH40UHIUsfSmnR6vWPP0mqnN3S5QuY'; 

let dataSlides = [];
let currentSlideIndex = 0;
let slideTimeout;
let scrollInterval;

let dataMasjidJeda = { SUBUH: 12, DZUHUR: 10, ASHAR: 10, MAGHRIB: 7, ISYA: 10 }; 
let isModeSholatBerlangsung = false;

// Indeks Global Tracker untuk perputaran dinamis silih-berganti
const MAKSIMAL_GAMBAR_LOKAL = 10; 
let globalImageIndex = 0;  // Melacak urutan gambar ascending (0 sampai 9)
let globalTextIndex = 0;   // Melacak urutan baris teks info ascending

setInterval(() => {
    if (isModeSholatBerlangsung) {
        updateHanyaJamUtama();
        return;
    }

    const sekarang = new Date();
    
    let jam = String(sekarang.getHours()).padStart(2, '0');
    let menit = String(sekarang.getMinutes()).padStart(2, '0');
    let detik = String(sekarang.getSeconds()).padStart(2, '0');
    if (document.getElementById('clock-time')) {
        document.getElementById('clock-time').innerText = `${jam}:${menit}:${detik}`;
    }

    const opsiHari = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
    if (document.getElementById('clock-date')) {
        document.getElementById('clock-date').innerText = sekarang.toLocaleDateString('id-ID', opsiHari);
    }

    if (document.getElementById('clock-hijri')) {
        document.getElementById('clock-hijri').innerText = hitungHijriyahOtomatis(sekarang);
    }

    const jadwalHariIni = ambilJadwalHariIni(sekarang);
    const besok = new Date();
    besok.setDate(sekarang.getDate() + 1);
    const jadwalBesok = ambilJadwalHariIni(besok);

    const daftarSholat = [
        { nama: 'SUBUH', waktu: jadwalHariIni.fajr },
        { nama: 'DZUHUR', waktu: jadwalHariIni.dhuhr },
        { nama: 'ASHAR', waktu: jadwalHariIni.asr },
        { nama: 'MAGHRIB', waktu: jadwalHariIni.magrib },
        { nama: 'ISYA', waktu: jadwalHariIni.isya }
    ];

    let sholatActive = null;
    let waktuSekarangDetik = (sekarang.getHours() * 3600) + (sekarang.getMinutes() * 60) + sekarang.getSeconds();

    for (let i = 0; i < daftarSholat.length; i++) {
        let tParts = daftarSholat[i].waktu.split(':');
        let targetDetik = (parseInt(tParts[0]) * 3600) + (parseInt(tParts[1]) * 60);
        let mIqamahConfig = dataMasjidJeda[daftarSholat[i].nama] || 10; 
        let batasIqamahDetik = mIqamahConfig * 60;

        if (targetDetik + batasIqamahDetik > waktuSekarangDetik) {
            sholatActive = { 
                nama: daftarSholat[i].nama, 
                waktuStr: daftarSholat[i].waktu, 
                targetDetik: targetDetik, 
                batasIqamahDetik: batasIqamahDetik,
                isBesok: false 
            };
            break;
        }
    }

    if (!sholatActive) {
        let tParts = jadwalBesok.fajr.split(':');
        sholatActive = { 
            nama: 'SUBUH', 
            waktuStr: jadwalBesok.fajr, 
            targetDetik: (parseInt(tParts[0]) * 3600) + (parseInt(tParts[1]) * 60) + 86400, 
            batasIqamahDetik: 15 * 60,
            isBesok: true 
        };
    }

    let sisaDetik = sholatActive.targetDetik - waktuSekarangDetik;

    const elLabel = document.getElementById('countdown-title');
    const elWaktu = document.getElementById('countdown-time');
    const elCountdown = document.getElementById('countdown-timer');

    if (elWaktu) elWaktu.innerText = sholatActive.waktuStr;

    if (sisaDetik <= 0 && !sholatActive.isBesok) {
        isAlarmAdzanPlay = false;

        if (elWaktu) elWaktu.style.setProperty('display', 'none', 'important');
        if (elLabel) {
            elLabel.innerHTML = 'MENUNGGU IQAMAH';
            elLabel.style.color = '#ff5252';
        }
        
        let sisaIqamah = sholatActive.batasIqamahDetik + sisaDetik;
        let mIqamah = String(Math.floor(sisaIqamah / 60)).padStart(2, '0');
        let sIqamah = String(sisaIqamah % 60).padStart(2, '0');
        
        if (elCountdown) {
            elCountdown.innerText = `${mIqamah}:${sIqamah}`;
            elCountdown.style.borderColor = '#ff5252';
            elCountdown.style.background = 'rgba(255, 0, 0, 0.2)';
        }

        if (sisaIqamah <= 7 && sisaIqamah > 0 && !isAlarmIqamahPlay) {
            isAlarmIqamahPlay = true;
            triggerAlarm('iqamah');
        }

        if (sisaIqamah <= 0) {
            isAlarmIqamahPlay = false;
            aktifkanModeStandbySholat(sholatActive.nama);
        }
    } else {
        if (elWaktu) elWaktu.style.setProperty('display', 'inline-block'); 
        if (elLabel) {
            elLabel.innerHTML = `WAKTU SHOLAT <span style="color:#e5c158;">${sholatActive.isBesok ? 'SUBUH (BESOK)' : sholatActive.nama}</span>`;
            elLabel.style.color = '#e5c158';
        }

        let jamSisa = String(Math.floor(sisaDetik / 3600)).padStart(2, '0');
        let menitSisa = String(Math.floor((sisaDetik % 3600) / 60)).padStart(2, '0');
        let detikSisa = String(sisaDetik % 60).padStart(2, '0');

        if (elCountdown) {
            elCountdown.innerText = `-${jamSisa}:${menitSisa}:${detikSisa}`;
            elCountdown.style.borderColor = '#ff5252';
            elCountdown.style.background = 'rgba(255, 0, 0, 0.15)';
        }

        if (sisaDetik <= 7 && sisaDetik > 0 && !sholatActive.isBesok && !isAlarmAdzanPlay) {
            isAlarmAdzanPlay = true;
            triggerAlarm('adzan');
        }
    }
}, 1000);

function updateHanyaJamUtama() {
    const ClinicalNow = new Date();
    let jam = String(ClinicalNow.getHours()).padStart(2, '0');
    let menit = String(ClinicalNow.getMinutes()).padStart(2, '0');
    let detik = String(ClinicalNow.getSeconds()).padStart(2, '0');
    if (document.getElementById('clock-time')) {
        document.getElementById('clock-time').innerText = `${jam}:${menit}:${detik}`;
    }
}

function aktifkanModeStandbySholat(namaSholat) {
    isModeSholatBerlangsung = true;
    let overlay = document.getElementById('sholat-standby-overlay');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'sholat-standby-overlay';
        document.body.appendChild(overlay);
    }
    overlay.innerHTML = `
        <div class="standby-container">
            <div class="standby-text-utama">SHOLAT BERJAMAAH ${namaSholat} SEGERA DIMULAI</div>
            <div class="standby-text-sub">"Luruskan dan rapatkan shaf, sesungguhnya rapinya shaf termasuk kesempurnaan sholat."</div>
            <div class="standby-text-sub-2">Mohon nonaktifkan atau senyapkan suara handphone/gadget Anda.</div>
        </div>
    `;
    overlay.classList.add('active');
    clearTimeout(slideTimeout);
    clearInterval(scrollInterval);

    setTimeout(() => {
        overlay.classList.remove('active');
        isModeSholatBerlangsung = false;
        inisialisasiPerputaranPapan();
    }, 900000); 
}

/* ==========================================================================
   BAGIAN 3: PIPELINE MATRIX DUA KONTEN DINAMIS (SILIH-BERGANTI PAS)
   ========================================================================== */
window.addEventListener('DOMContentLoaded', () => {
    tampilkanDataDariCacheLokal();
    muatDataGoogleSheets();
    setInterval(muatDataGoogleSheets, 5 * 60 * 1000); 
});

let cacheDataSheetGlobal = null;

async function muatDataGoogleSheets() {
    try {
        const ranges = ["SHOLAT JUMAT!A1:B4", "KEUANGAN!A1:E50", "RUNNING TEXT!A1:A30", "INFOUPDATE LAINNYA!A1:A10"];
        const url = `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values:batchGet?ranges=${ranges.map(encodeURIComponent).join('&ranges=')}&key=${API_KEY}`;
        
        const respon = await fetch(url);
        if (!respon.ok) throw new Error('Respon Jaringan Lemah');
        const hasil = await respon.json();
        if (hasil.valueRanges) {
            localStorage.setItem('cache_display_masjid', JSON.stringify(hasil.valueRanges));
            cacheDataSheetGlobal = hasil.valueRanges;
            if (!isModeSholatBerlangsung && dataSlides.length === 0) {
                bangunStrukturSlideAntrian();
            }
        }
    } catch (error) {
        console.error("Gagal sinkronisasi data Google Sheets, memakai cache:", error);
        tampilkanDataDariCacheLokal();
    }
}

function tampilkanDataDariCacheLokal() {
    const cacheData = localStorage.getItem('cache_display_masjid');
    if (cacheData) {
        cacheDataSheetGlobal = JSON.parse(cacheData);
        if (!isModeSholatBerlangsung && dataSlides.length === 0) {
            bangunStrukturSlideAntrian();
        }
    } else {
        cacheDataSheetGlobal = [
            { values: [["Tanggal","Belum Sinkron"],["Khatib","-"],["Imam","-"],["Bilal","-"]] },
            { values: [["Tanggal","Keterangan","Masuk","Keluar","Saldo"],["-","Saldo Awal","0","0","0"]] },
            { values: [["Selamat Datang di Masjid Assyakur - Desa Jone Paser"]] },
            { values: [["Menunggu pemuatan data Google Sheets pertama..."]] }
        ];
        bangunStrukturSlideAntrian();
    }
}

// Logika pembentukan antrian dinamis: 1 Loop = Sholat Jumat + Saldo + Tabel + 2 Gambar + 2 Teks
function bangunStrukturSlideAntrian() {
    if (!cacheDataSheetGlobal) return;

    const dataJumat = cacheDataSheetGlobal[0].values || [];
    const dataKeuangan = cacheDataSheetGlobal[1].values || [];
    const dataRunningText = cacheDataSheetGlobal[2].values || [];
    const dataInfoLain = cacheDataSheetGlobal[3].values || [];

    if (dataRunningText.length > 0) {
        const kumpulanTeks = dataRunningText.map(row => row[0]).filter(teks => teks && teks.trim() !== "").join("   •   ");
        if (document.getElementById('running-text')) {
            document.getElementById('running-text').innerText = kumpulanTeks + "   •   ";
        }
    }

    let saldoAwal = "Rp 0";
    let totalPemasukan = 0, totalPengeluaran = 0, saldoAkhir = "Rp 0";
    for (let i = 1; i < dataKeuangan.length; i++) {
        const baris = dataKeuangan[i]; if (!baris) continue;
        
        const keterangan = baris[1] ? baris[1].toUpperCase().trim() : "";
        if (keterangan.includes("SALDO AWAL")) {
            saldoAwal = formatMataUangAman(baris[4], false); 
        }

        totalPemasukan += baris[2] ? bersihkanAngka(baris[2]) : 0;
        totalPengeluaran += baris[3] ? bersihkanAngka(baris[3]) : 0;
        if (baris[4] && baris[4].trim() !== "" && baris[4].trim() !== "0") {
            saldoAkhir = formatMataUangAman(baris[4], false);
        }
    }

    dataSlides = [];

    // 1. SHOLAT JUMAT (10 DETIK BERSIH)
    let tglJmt = (dataJumat[0] && dataJumat[0][1]) ? dataJumat[0][1] : '-';
    let khtJmt = (dataJumat[1] && dataJumat[1][1]) ? dataJumat[1][1] : '-';
    let immJmt = (dataJumat[2] && dataJumat[2][1]) ? dataJumat[2][1] : '-';
    let bilJmt = (dataJumat[3] && dataJumat[3][1]) ? dataJumat[3][1] : '-';
    
    dataSlides.push({
        tipe: 'TEKS_JUMAT',
        durasi: 10000, 
        html: `
            <div class="padded-slide-inner" style="font-family:'Times New Roman', Times, serif !important; color:#ffffff !important; padding-top:4vh;">
                <div style="font-size:5.5vh; color:#ffffff !important; text-align:center; font-weight:bold; margin-bottom:0.5vh; line-height:1.0;">PENGUMUMAN SHOLAT JUMAT</div>
                <div style="font-size:4vh; color:#ffffff !important; text-align:center; font-weight:bold; margin-bottom:5vh; line-height:1.0;">${tglJmt}</div>
                <div class="scrollable-content" style="overflow:hidden; display:flex; justify-content:center; width:100%;">
                    <table style="font-family:'Times New Roman', Times, serif !important; font-size:4.5vh; color:#ffffff !important; border-collapse:collapse; width:90%; margin:0 auto; line-height:1.1;">
                        <tr><td style="width:35%; padding:0.8vh 0; font-weight:bold; text-align:left;">Khatib Jumat</td><td style="width:5%; text-align:center;">:</td><td style="width:60%;">${khtJmt}</td></tr>
                        <tr><td style="padding:0.8vh 0; font-weight:bold; text-align:left;">Imam Sholat</td><td style="text-align:center;">:</td><td>${immJmt}</td></tr>
                        <tr><td style="padding:0.8vh 0; font-weight:bold; text-align:left;">Bilal / Muadzin</td><td style="text-align:center;">:</td><td>${bilJmt}</td></tr>
                    </table>
                </div>
            </div>
        `
    });

    // 2. SALDO MASJID (10 DETIK BERSIH)
    let pmsknStr = "Rp " + totalPemasukan.toLocaleString('id-ID');
    let pglrnStr = "Rp " + totalPengeluaran.toLocaleString('id-ID');

    dataSlides.push({
        tipe: 'SALDO_JUMAT',
        durasi: 10000, 
        html: `
            <div class="padded-slide-inner" style="justify-content: space-between; padding: 2vh 2vw; height: 100%;">
                <div style="background: rgba(0,0,0,0.25); border: 0.18vh solid rgba(229,193,88,0.3); border-radius: 1vh; width: 100%; padding: 1.5vh; text-align: center;">
                    <span style="font-size: 2vh; color: #a2bcae; display: block; font-weight: 600;">Saldo Jumat Lalu</span>
                    <strong style="font-size: 3.5vh; color: #ffffff; font-weight: 700; margin-top: 0.5vh; display: block;">${saldoAwal}</strong>
                </div>
                <div style="display: flex; gap: 1.5vw; width: 100%;">
                    <div style="flex: 1; background: rgba(46, 204, 113, 0.1); border: 0.18vh solid rgba(46, 204, 113, 0.4); border-radius: 1vh; padding: 1.5vh; text-align: center;">
                        <span style="font-size: 2vh; color: #2ecc71; display: block; font-weight: 600;">Penerimaan</span>
                        <strong style="font-size: 3.5vh; color: #ffffff; font-weight: 700; margin-top: 0.5vh; display: block;">${pmsknStr}</strong>
                    </div>
                    <div style="flex: 1; background: rgba(231, 76, 60, 0.1); border: 0.18vh solid rgba(231, 76, 60, 0.4); border-radius: 1vh; padding: 1.5vh; text-align: center;">
                        <span style="font-size: 2vh; color: #e74c3c; display: block; font-weight: 600;">Pengeluaran</span>
                        <strong style="font-size: 3.5vh; color: #ffffff; font-weight: 700; margin-top: 0.5vh; display: block;">${pglrnStr}</strong>
                    </div>
                </div>
                <div style="background: linear-gradient(180deg, rgba(11,48,28,0.95) 0%, rgba(5,25,14,0.98) 100%); border: 0.25vh solid #e5c158; border-radius: 1.2vh; width: 100%; padding: 2.2vh; text-align: center;">
                    <span style="font-size: 2.2vh; color: #e5c158; display: block; font-weight: 600;">SALDO SEKARANG</span>
                    <strong style="font-size: 5.5vh; color: #ffffff; font-weight: 800; margin-top: 0.5vh; display: block;">${saldoAkhir}</strong>
                </div>
            </div>
        `
    });

    // 3. TABEL DETAIL KAS KEUANGAN (20 DETIK BERSIH)
    let tableRowsHtml = "";
    for (let i = 1; i < dataKeuangan.length; i++) {
        const baris = dataKeuangan[i]; if (!baris || baris.length === 0) continue;
        tableRowsHtml += `
            <tr>
                <td class="text-center">${baris[0] || '-'}</td>
                <td>${baris[1] || '-'}</td>
                <td class="text-right">${formatMataUangAman(baris[2], true)}</td>
                <td class="text-right">${formatMataUangAman(baris[3], true)}</td>
                <td class="text-right" style="font-weight:600; color:#e5c158;">${formatMataUangAman(baris[4], true)}</td>
            </tr>
        `;
    }
    if (tableRowsHtml !== "") {
        dataSlides.push({
            tipe: 'TABEL_KAS',
            durasi: 20000, 
            html: `
                <div class="padded-slide-inner">
                    <div style="font-size:3vh; color:#e5c158; border-bottom:0.18vh dashed rgba(229,193,88,0.4); padding-bottom:1vh; margin-bottom:2vh; font-weight:700; text-align:center;">LAPORAN KAS KEUANGAN MASJID</div>
                    <div class="scrollable-content table-responsive">
                        <table class="table-kas">
                            <thead><tr><th>TANGGAL</th><th>KETERANGAN REKENING</th><th>MASUK</th><th>KELUAR</th><th>SALDO</th></tr></thead>
                            <tbody>${tableRowsHtml}</tbody>
                        </table>
                    </div>
                </div>
            `
        });
    }

    // Ekstraksi total baris teks info Google Sheet
    let totalTeksValid = [];
    for (let i = 0; i < dataInfoLain.length; i++) {
        const isiTeks = dataInfoLain[i][0];
        if (isiTeks && isiTeks.trim() !== "") {
            totalTeksValid.push(isiTeks);
        }
    }

    // PENGUNCIAN METRIKS: MENYISIPKAN HANYA 2 GAMBAR DAN 2 TEKS PADA SIKLUS INI
    // Menyisipkan Gambar ke-1 & Teks ke-1
    tambahkanItemGambarDinamis();
    tambahkanItemTeksDinamis(totalTeksValid);

    // Menyisipkan Gambar ke-2 & Teks ke-2
    tambahkanItemGambarDinamis();
    tambahkanItemTeksDinamis(totalTeksValid);

    inisialisasiPerputaranPapan();
}

// Fungsi pembantu penanganan giliran Gambar Ascending
function tambahkanItemGambarDinamis() {
    const noGambarTampil = globalImageIndex + 1;
    dataSlides.push({
        tipe: 'IMAGE_STRETCH',
        durasi: 10000, // 10 Detik Bersih
        html: `<img src="image/${noGambarTampil}.jpg" class="slide-stretched-img" onerror="this.src='image/1.jpg';">`
    });
    // Geser urutan gambar berikutnya untuk putaran selanjutnya (jika lewat dari batas maksimum, reset ke 1)
    globalImageIndex = (globalImageIndex + 1) % MAKSIMAL_GAMBAR_LOKAL;
}

// Fungsi pembantu penanganan giliran baris teks Google Sheet Ascending
function tambahkanItemTeksDinamis(arrayTeks) {
    if (arrayTeks.length === 0) {
        // Jika data di spreadsheet kosong, pasang teks fallback standby
        dataSlides.push({
            tipe: 'TEKS_PENGUMUMAN',
            durasi: 10000,
            html: `<div class="padded-slide-inner" style="justify-content:center; align-items:center;"><div class="scrollable-content info-text-content" style="padding-top:2vh;">Masjid Assyakur Desa Jone Paser</div></div>`
        });
        return;
    }
    
    const teksTampil = arrayTeks[globalTextIndex];
    dataSlides.push({
        tipe: 'TEKS_PENGUMUMAN',
        durasi: 10000, // 10 Detik Bersih
        html: `
            <div class="padded-slide-inner" style="justify-content:center; align-items:center;">
                <div class="scrollable-content info-text-content" style="padding-top:2vh;">${teksTampil}</div>
            </div>
        `
    });
    // Geser urutan baris teks info berikutnya untuk putaran selanjutnya (jika mentok bawah, reset ke atas)
    globalTextIndex = (globalTextIndex + 1) % arrayTeks.length;
}

function bersihkanAngka(teks) {
    if (!teks) return 0;
    let stringTeks = teks.toString().trim();
    if (stringTeks.includes(',')) stringTeks = stringTeks.split(',')[0];
    let clean = stringTeks.replace(/[^0-9]/g, '');
    return clean ? parseInt(clean, 10) : 0;
}

function formatMataUangAman(teks, sembunyikanJikaNol = false) {
    if (!teks || teks === "0" || teks === "-" || teks.toString().trim() === "") return sembunyikanJikaNol ? "-" : "Rp 0";
    let angka = bersihkanAngka(teks);
    if (angka === 0) return sembunyikanJikaNol ? "-" : "Rp 0";
    return "Rp " + angka.toLocaleString('id-ID');
}

function inisialisasiPerputaranPapan() {
    clearTimeout(slideTimeout);
    clearInterval(scrollInterval);
    if (dataSlides.length === 0) return;
    currentSlideIndex = 0;
    jalankanSiklusSlider();
}

function jalankanSiklusSlider() {
    const wadahPapan = document.getElementById('papan-slide-container');
    if (!wadahPapan || isModeSholatBerlangsung) return;

    let targetSlide = dataSlides[currentSlideIndex];

    // Bersihkan isi container dan injeksikan elemen slide baru tanpa class active terlebih dahulu
    wadahPapan.innerHTML = `<div class="slide">${targetSlide.html}</div>`;
    const elemenSlideBaru = wadahPapan.querySelector('.slide');

    // EFEK FADE IN (3 DETIK): Dijalankan sesaat setelah elemen di-render di dokumen HTML
    setTimeout(() => {
        if (elemenSlideBaru) elemenSlideBaru.classList.add('active');
    }, 50);

    // Memicu kelancaran auto-scroll di tengah masa tayang bersih
    setTimeout(() => {
        aktifkanAutoScrollKonten(targetSlide.durasi); 
    }, 1500);

    // EFEK FADE OUT (3 DETIK): Dipicu tepat ketika durasi bersih tampil konten sudah habis
    slideTimeout = setTimeout(() => {
        clearInterval(scrollInterval);
        
        // Menghapus kelas active untuk memicu transisi Opacity -> 0 (Fade Out) selama 3 detik halus
        if (elemenSlideBaru) elemenSlideBaru.classList.remove('active');

        // Tunggu transisi Fade Out selesai secara fisik (3000ms) sebelum memuat siklus halaman berikutnya
        slideTimeout = setTimeout(() => {
            currentSlideIndex++;
            
            // Jika satu putaran penuh antrian slide selesai, susun ulang antrian untuk mengambil 2 pasang data berikutnya
            if (currentSlideIndex >= dataSlides.length) {
                bangunStrukturSlideAntrian();
            } else {
                jalankanSiklusSlider();
            }
        }, 3000);

    }, targetSlide.durasi); 
}

function aktifkanAutoScrollKonten(waktuTersisaMilidetik) {
    const elemenScroll = document.querySelector('.scrollable-content');
    if (!elemenScroll || isModeSholatBerlangsung) return;

    const totalJarakScroll = elemenScroll.scrollHeight - elemenScroll.clientHeight;
    
    if (totalJarakScroll > 0) {
        elemenScroll.scrollTop = 0; 
        const jedaAwal = 2000;
        const jedaAkhir = 2000;
        const durasiScrollAktif = waktuTersisaMilidetik - jedaAwal - jedaAkhir;

        if (durasiScrollAktif > 0) {
            setTimeout(() => {
                let waktuMulai = null;
                function langkahScroll(timestamp) {
                    if (isModeSholatBerlangsung) return;
                    if (!waktuMulai) waktuMulai = timestamp;
                    let waktuBerjalan = timestamp - waktuMulai;
                    let kemajuanProgres = Math.min(waktuBerjalan / durasiScrollAktif, 1);
                    
                    elemenScroll.scrollTop = kemajuanProgres * totalJarakScroll;
                    
                    if (waktuBerjalan < durasiScrollAktif) {
                        scrollInterval = requestAnimationFrame(langkahScroll);
                    }
                }
                scrollInterval = requestAnimationFrame(langkahScroll);
            }, jedaAwal);
        }
    }
}

document.addEventListener('dblclick', () => {
    pancingIzinAudioBrowser();

    if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen().catch(err => {
            console.error(`Gagal mengaktifkan Full Screen: ${err.message}`);
        });
    } else {
        if (document.exitFullscreen) document.exitFullscreen();
    }
});