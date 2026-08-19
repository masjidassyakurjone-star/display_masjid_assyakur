/* ==========================================================================
   COMBINED.JS - ENGINE SIGNAGE MASJID ASSYAKUR V2.8 (FIXED NAVIGASI SINKRON)
   ========================================================================== */

/* ==========================================================================
   BAGIAN 1: SISTEM DATABASE JADWAL SHOLAT INTERNAL & ALARM (AUDIO MP3)
   ========================================================================== */
function ambilJadwalHariIni(dateObj) {
    const tahun = "2026";
    const bulan = String(dateObj.getMonth() + 1).padStart(2, '0');
    const tanggal = String(dateObj.getDate()).padStart(2, '0');
    const keyTanggal = `${tahun}-${bulan}-${tanggal}`; 

    if (typeof DATABASE_JADWAL_TAHUNAN !== 'undefined' && DATABASE_JADWAL_TAHUNAN[keyTanggal]) {
        return DATABASE_JADWAL_TAHUNAN[keyTanggal];
    }
    return { imsak: "04:44", fajr: "04:54", dhuhr: "12:18", asr: "15:43", magrib: "18:21", isya: "19:35" };
}

let isAlarmAdzanPlay = false;
let isAlarmIqamahPlay = false;

function pancingIzinAudioBrowser() {
    console.log("Izin audio berhasil dipancing melalui interaksi pengguna.");
    const dummyAudio = new Audio('BEEP PENDEK.mp3');
    dummyAudio.volume = 0; 
    dummyAudio.play().catch(() => {});
}

function putarAudioMp3(fileUtama, fileSambungan = null) {
    const audio = new Audio(`${fileUtama}`);
    audio.play().then(() => {
        console.log(`Berhasil memutar audio: ${fileUtama}`);
        if (fileSambungan) {
            audio.onended = () => {
                const audioSambungan = new Audio(`${fileSambungan}`);
                audioSambungan.play().catch(e => console.error(e));
            };
        }
    }).catch(e => console.error(e));
}

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

    let jd = Math.floor(kustomSore.getTime() / 86400000) + 2440589;
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

    let indeksBulan = Math.max(0, Math.min(11, m - 1));

    return `${d} ${namaBulanHijriyah[indeksBulan]} ${y} H`;
}

/* ==========================================================================
   BAGIAN 2: ENGINE REFRESH CLOCK & COUNTDOWN (REAL-TIME JADWAL)
   ========================================================================== */
const SPREADSHEET_ID = '1Jene5qNwgCTYkPAZhlbeRIEVnZvJl6Ktze0pp1upbsk'; 
const API_KEY = 'AIzaSyA8jJH40UHIUsfSmnR6vWPP0mqnN3S5QuY'; 

let dataSlides = []; // Retained for compatibility with existing data pipeline; not used by current visual modes.
let currentSlideIndex = 0;
let slideTimeout;
let scrollInterval;

let dataMasjidJeda = { SUBUH: 12, DZUHUR: 10, ASHAR: 10, MAGHRIB: 7, ISYA: 10 }; 
let isModeSholatBerlangsung = false;
let isModeMenungguIqamah = false;

/* ========================================================================
   MODE DISPLAY JUMAT
   Standby 1 menit -> Info Sholat Jumat 15 detik -> Standby 1 menit -> ulang.
   Data diambil dari cache Google Sheets yang sama dengan engine sebelumnya.
   ======================================================================== */
let isModeInfoJumat = false;
let modeInfoJumatTimeout = null;
let modeStandbyJumatTimeout = null;
const DURASI_STANDBY_JUMAT = 60 * 1000;

// Urutan Mode Info Jumat:
// 3 detik layer masuk -> 3 detik teks masuk -> 30 detik tampil -> 3 detik fade out.
const DURASI_LAYER_MASUK_JUMAT = 3 * 1000;
const DURASI_TEKS_MASUK_JUMAT = 3 * 1000;
const DURASI_TAHAN_JUMAT = 30 * 1000;
const DURASI_FADE_OUT_JUMAT = 3 * 1000;

// Siklus KAS setelah Info Jumat
const JEDA_SEBELUM_KAS = 5 * 1000;
const DURASI_KAS_FADE_IN = 3 * 1000;
const DURASI_KAS_JUDUL = 10 * 1000;
const DURASI_KAS_FADE_OUT = 3 * 1000;
const DURASI_TABEL_KAS_FADE_IN = 3 * 1000;
const DURASI_TABEL_KAS_TAMPIL = 30 * 1000;
const DURASI_TABEL_KAS_FADE_OUT = 3 * 1000;
let modeKasTimeout = null;
let modeKasTahap = null;

// Waktu sampai mulai fade-out: 3 + 3 + 30 = 36 detik.
const DURASI_INFO_JUMAT =
    DURASI_LAYER_MASUK_JUMAT +
    DURASI_TEKS_MASUK_JUMAT +
    DURASI_TAHAN_JUMAT;

let DAFTAR_GAMBAR_LOKAL = [];

let globalImageIndex = 0;      
let globalTextIndex = 0;       
let menggunakanSlideA = true;

setInterval(() => {
    const sekarang = new Date();
    const jam = sekarang.getHours();     
    const menit = sekarang.getMinutes(); 
    const detik = sekarang.getSeconds(); 
    const sekarangDetik = (jam * 3600) + (menit * 60) + detik;
    
    if (document.getElementById('clock-time')) {
        document.getElementById('clock-time').innerText = `${String(jam).padStart(2, '0')}:${String(menit).padStart(2, '0')}:${String(detik).padStart(2, '0')}`;
    }

    if (document.getElementById('clock-date')) {
        document.getElementById('clock-date').innerText = sekarang.toLocaleDateString('id-ID', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
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

    let sholatBerikutnya = null;
    for (let i = 0; i < daftarSholat.length; i++) {
        let tParts = daftarSholat[i].waktu.split(':');
        let targetDetik = (parseInt(tParts[0]) * 3600) + (parseInt(tParts[1]) * 60);
        if (targetDetik > sekarangDetik) {
            sholatBerikutnya = { nama: daftarSholat[i].nama, waktuStr: daftarSholat[i].waktu, targetDetik: targetDetik, isBesok: false };
            break;
        }
    }
    if (!sholatBerikutnya) {
        let tParts = jadwalBesok.fajr.split(':');
        sholatBerikutnya = { nama: 'SUBUH', waktuStr: jadwalBesok.fajr, targetDetik: (parseInt(tParts[0]) * 3600) + (parseInt(tParts[1]) * 60) + 86400, isBesok: true };
    }

    const elLabel = document.getElementById('countdown-title');
    const elSholatJam = document.getElementById('countdown-sholat-jam');
    const elCounterTime = document.getElementById('countdown-time-counter');

    let sisaDetik = sholatBerikutnya.targetDetik - sekarangDetik;

    if (elLabel) {
        elLabel.innerText = sholatBerikutnya.isBesok ? 'SUBUH' : sholatBerikutnya.nama;
    }
    if (elSholatJam) {
        elSholatJam.innerText = sholatBerikutnya.waktuStr;
    }
    if (elCounterTime) {
        let jamSisa = String(Math.floor(sisaDetik / 3600));
        let menitSisa = String(Math.floor((sisaDetik % 3600) / 60)).padStart(2, '0');
        let detikSisa = String(sisaDetik % 60).padStart(2, '0');
        elCounterTime.innerText = `${jamSisa}:${menitSisa}:${detikSisa}`;
    }

    if (sisaDetik === 7 && !sholatBerikutnya.isBesok && !isAlarmAdzanPlay) {
        isAlarmAdzanPlay = true;
        triggerAlarm('adzan');
        setTimeout(() => { isAlarmAdzanPlay = false; }, 10000);
    }

    if (isModeSholatBerlangsung) return; 

    let iqamahAktif = null;
    for (let i = 0; i < daftarSholat.length; i++) {
        let tParts = daftarSholat[i].waktu.split(':');
        let adzanDetik = (parseInt(tParts[0]) * 3600) + (parseInt(tParts[1]) * 60);
        let jedaMenit = dataMasjidJeda[daftarSholat[i].nama] || 10;
        let batasIqamahDetik = jedaMenit * 60;

        if (sekarangDetik >= adzanDetik && sekarangDetik < adzanDetik + batasIqamahDetik) {
            iqamahAktif = {
                nama: daftarSholat[i].nama,
                sisaDetik: (adzanDetik + batasIqamahDetik) - sekarangDetik
            };
            break;
        }
    }

    if (iqamahAktif) {
        isModeMenungguIqamah = true;
        let mIqamah = String(Math.floor(iqamahAktif.sisaDetik / 60)).padStart(2, '0');
        let sIqamah = String(iqamahAktif.sisaDetik % 60).padStart(2, '0');

        tampilkanInterupsiIqamahPapan(iqamahAktif.nama, `${mIqamah}:${sIqamah}`);

        if (iqamahAktif.sisaDetik === 7 && !isAlarmIqamahPlay) {
            isAlarmIqamahPlay = true;
            triggerAlarm('iqamah');
            setTimeout(() => { isAlarmIqamahPlay = false; }, 10000);
        }

        if (iqamahAktif.sisaDetik <= 1) {
            setTimeout(() => {
                aktifkanModeStandbySholat();
            }, 1000);
        }
    } else {
        if (isModeMenungguIqamah) {
            isModeMenungguIqamah = false;
            bangunStrukturSlideAntrian();
        }
    }
}, 1000);

function tampilkanInterupsiIqamahPapan(namaSholat, stringWaktu) {
    if (slideTimeout) clearTimeout(slideTimeout);
    if (scrollInterval) clearInterval(scrollInterval);

    const slideA = document.getElementById('slide-A');
    const slideB = document.getElementById('slide-B');
    if (!slideA || !slideB) return;

    const htmlIqamahMenyolok = `
        <div class="iqamah-overlay">
            <img src="bg-masjid.jpg" class="iqamah-bg" alt="">
            <div class="iqamah-shade"></div>
            <div class="iqamah-content">
                <div class="iqamah-label">MENUNGGU IQAMAH</div>
                <div class="iqamah-prayer">${namaSholat}</div>
                <div class="iqamah-counter">${stringWaktu}</div>
                <div class="iqamah-hadith">
                    <div class="iqamah-arabic">لاَ يُرَدُّ الدُّعَاءُ بَيْنَ الأَذَانِ وَالإِقَامَةِ</div>
                    <div class="iqamah-translation">"Doa antara adzan dan iqamah tidak akan ditolak."</div>
                </div>
            </div>
        </div>
    `;

    const target = slideA.classList.contains('active') ? slideA :
                   slideB.classList.contains('active') ? slideB : slideA;
    target.innerHTML = htmlIqamahMenyolok;
    if (!target.classList.contains('active')) {
        slideA.classList.remove('active');
        slideB.classList.remove('active');
        target.classList.add('active');
    }
}

function aktifkanModeStandbySholat() {
    if (isModeSholatBerlangsung) return;

    isModeSholatBerlangsung = true;
    isModeMenungguIqamah = false;

    const slideA = document.getElementById('slide-A');
    const slideB = document.getElementById('slide-B');
    if (!slideA || !slideB) return;

    if (slideTimeout) clearTimeout(slideTimeout);
    if (scrollInterval) clearInterval(scrollInterval);

    const htmlStandby = `
        <div class="sholat-standby">
            <div class="sholat-standby-text">
                Selamat menunaikan ibadah Sholat berjamaah,<br>
                luruskan dan rapatkan shaf untuk kesempurnaan sholat,<br>
                matikan/silentkan hp dan hal mengganggu lainnya.
            </div>
        </div>
    `;

    slideA.innerHTML = htmlStandby;
    slideB.innerHTML = "";
    slideB.classList.remove('active');
    slideA.classList.add('active');

    setTimeout(() => {
        isModeSholatBerlangsung = false;
        bangunStrukturSlideAntrian();
    }, 600000);
}

/* ========================================================================
   MODE INFO SHOLAT JUMAT
   ======================================================================== */

function escapeHtmlJumat(nilai) {
    return String(nilai ?? '-').replace(/[&<>'"]/g, karakter => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        "'": '&#39;',
        '"': '&quot;'
    }[karakter]));
}

function ambilDataInfoJumat() {
    const dataJumat = cacheDataSheetGlobal?.[0]?.values || [];

    return {
        tanggal: (dataJumat[0] && dataJumat[0][1]) ? dataJumat[0][1] : '-',
        khatib:  (dataJumat[1] && dataJumat[1][1]) ? dataJumat[1][1] : '-',
        imam:    (dataJumat[2] && dataJumat[2][1]) ? dataJumat[2][1] : '-',
        muadzin: (dataJumat[3] && dataJumat[3][1]) ? dataJumat[3][1] : '-'
    };
}

function renderModeInfoJumat() {
    const overlay = document.getElementById('jumat-mode-overlay');
    const content = document.getElementById('jumat-mode-content');
    if (!overlay || !content) return;

    const data = ambilDataInfoJumat();

    content.innerHTML = `
        <div class="jumat-title">Informasi Sholat Jumat</div>
        <div class="jumat-date">${escapeHtmlJumat(data.tanggal)}</div>
        <table class="jumat-table">
            <tbody>
                <tr class="jumat-row-1">
                    <td>Khatib</td><td>:</td><td>${escapeHtmlJumat(data.khatib)}</td>
                </tr>
                <tr class="jumat-row-2">
                    <td>Imam</td><td>:</td><td>${escapeHtmlJumat(data.imam)}</td>
                </tr>
                <tr class="jumat-row-3">
                    <td>Muadzin</td><td>:</td><td>${escapeHtmlJumat(data.muadzin)}</td>
                </tr>
            </tbody>
        </table>
    `;
}

function tampilkanModeInfoJumat() {
    const overlay = document.getElementById('jumat-mode-overlay');
    if (!overlay) return;

    if (modeStandbyJumatTimeout) {
        clearTimeout(modeStandbyJumatTimeout);
        modeStandbyJumatTimeout = null;
    }

    /* Jangan menimpa mode iqamah/sholat yang lebih penting. */
    if (isModeSholatBerlangsung || isModeMenungguIqamah) {
        jadwalkanModeInfoJumat(15000);
        return;
    }

    isModeInfoJumat = true;
    renderModeInfoJumat();
    overlay.classList.add('active');
    overlay.setAttribute('aria-hidden', 'false');

    if (modeInfoJumatTimeout) clearTimeout(modeInfoJumatTimeout);
    modeInfoJumatTimeout = setTimeout(() => {
        sembunyikanModeInfoJumat();
    }, DURASI_INFO_JUMAT);
}

function sembunyikanModeInfoJumat() {
    const overlay = document.getElementById('jumat-mode-overlay');
    if (!overlay) return;

    if (modeInfoJumatTimeout) {
        clearTimeout(modeInfoJumatTimeout);
        modeInfoJumatTimeout = null;
    }

    isModeInfoJumat = false;
    overlay.classList.remove('active');
    overlay.setAttribute('aria-hidden', 'true');

    // Setelah fade-out Jumat selesai, beri jeda 5 detik lalu masuk Mode KAS.
    if (modeStandbyJumatTimeout) clearTimeout(modeStandbyJumatTimeout);
    modeStandbyJumatTimeout = setTimeout(() => {
        modeStandbyJumatTimeout = null;
        mulaiSiklusKasSetelahJumat();
    }, DURASI_FADE_OUT_JUMAT);
}

function escapeHtmlKas(nilai) {
    return String(nilai ?? '-').replace(/[&<>"']/g, karakter => ({
        '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
    }[karakter]));
}

function ambilDataKasMode() {
    const rows = cacheDataSheetGlobal?.[1]?.values || [];
    let saldoAwal = 'Rp 0', saldoAkhir = 'Rp 0';
    let masuk = 0, keluar = 0;
    for (let i=1; i<rows.length; i++) {
        const r=rows[i] || [];
        const ket=String(r[1] ?? '').toUpperCase().trim();
        if (ket.includes('SALDO AWAL')) saldoAwal = formatMataUangAman(r[4], false);
        masuk += r[2] ? bersihkanAngka(r[2]) : 0;
        keluar += r[3] ? bersihkanAngka(r[3]) : 0;
        if (r[4] && String(r[4]).trim() !== '' && String(r[4]).trim() !== '0') saldoAkhir = formatMataUangAman(r[4], false);
    }
    return { rows, saldoAwal, saldoAkhir, masuk: 'Rp ' + masuk.toLocaleString('id-ID'), keluar: 'Rp ' + keluar.toLocaleString('id-ID') };
}

function renderKasJudul() {
    const c = document.getElementById('kas-mode-content');
    if (!c) return;

    const d = ambilDataKasMode();

    c.innerHTML = `
        <div class="kas-stage-finance">
            <div class="kas-balance-screen">

                <div class="kas-balance-header">
                    <span>PAPAN INFORMASI MASJID</span>
                </div>

                <div class="kas-balance-label">SALDO KAS</div>

                <div class="kas-balance-box kas-balance-opening">
                    <div class="kas-balance-caption">Saldo Jumat Lalu</div>
                    <div class="kas-balance-value">${escapeHtmlKas(d.saldoAwal)}</div>
                </div>

                <div class="kas-balance-flow">
                    <div class="kas-balance-box kas-balance-in">
                        <div class="kas-balance-caption">Masuk</div>
                        <div class="kas-balance-value">${escapeHtmlKas(d.masuk)}</div>
                    </div>

                    <div class="kas-balance-box kas-balance-out">
                        <div class="kas-balance-caption">Keluar</div>
                        <div class="kas-balance-value">${escapeHtmlKas(d.keluar)}</div>
                    </div>
                </div>

                <div class="kas-balance-box kas-balance-final">
                    <div class="kas-balance-caption">SALDO SEKARANG</div>
                    <div class="kas-balance-value">${escapeHtmlKas(d.saldoAkhir)}</div>
                </div>

            </div>
        </div>
    `;
}

function renderTabelKasMode() {
    const c=document.getElementById('kas-mode-content'); if(!c) return;
    const d=ambilDataKasMode();
    let body='';
    for(let i=1;i<d.rows.length;i++) {
        const r=d.rows[i]||[];
        body += `<tr><td>${escapeHtmlKas(r[0]||'-')}</td><td>${escapeHtmlKas(r[1]||'-')}</td><td>${escapeHtmlKas(formatMataUangAman(r[2],true))}</td><td>${escapeHtmlKas(formatMataUangAman(r[3],true))}</td><td>${escapeHtmlKas(formatMataUangAman(r[4],true))}</td></tr>`;
    }
    c.innerHTML=`<div class="kas-stage-table"><div class="kas-table-wrap">
        <div class="kas-table-title">LAPORAN KAS MASJID</div>
        <div class="kas-table-scroll"><table class="kas-table"><thead><tr><th>TGL</th><th>URAIAN TRANSAKSI</th><th>MASUK</th><th>KELUAR</th><th>SALDO</th></tr></thead><tbody>${body}</tbody></table></div>
    </div></div>`;
}

function sembunyikanModeKas(callback) {
    const o=document.getElementById('kas-mode-overlay'); if(!o){ if(callback) callback(); return; }
    o.classList.remove('active'); o.setAttribute('aria-hidden','true');
    setTimeout(()=>{ if(callback) callback(); }, DURASI_KAS_FADE_OUT);
}

function mulaiModeKas() {
    const o=document.getElementById('kas-mode-overlay'); if(!o) return;
    if(modeKasTimeout) clearTimeout(modeKasTimeout);
    modeKasTahap='keuangan'; renderKasJudul();
    o.classList.remove('kas-table-stage'); o.classList.add('active'); o.setAttribute('aria-hidden','false');
    modeKasTimeout=setTimeout(()=>{
        sembunyikanModeKas(()=>{
            setTimeout(()=>mulaiModeTabelKas(), 0);
        });
    }, DURASI_KAS_FADE_IN + DURASI_KAS_JUDUL);
}

function mulaiModeTabelKas() {
    const o=document.getElementById('kas-mode-overlay'); if(!o) return;
    if(modeKasTimeout) clearTimeout(modeKasTimeout);
    modeKasTahap='tabel'; renderTabelKasMode();
    // reset transition supaya fade-in tabel berlangsung 3 detik
    o.classList.remove('active');
    void o.offsetWidth;
    o.classList.add('active'); o.setAttribute('aria-hidden','false');

    // Mesin scroll tabel KAS: gunakan area tabel yang sudah ada,
    // bukan membuat slider/papan baru. Jika tabel pendek, diam.
    setTimeout(() => {
        aktifkanAutoScrollTabelKas(DURASI_TABEL_KAS_TAMPIL);
    }, DURASI_TABEL_KAS_FADE_IN);

    modeKasTimeout=setTimeout(()=>{
        hentikanAutoScrollTabelKas();
        sembunyikanModeKas(()=>{
            modeKasTimeout=setTimeout(()=>jadwalkanModeInfoJumat(DURASI_STANDBY_JUMAT), DURASI_TABEL_KAS_FADE_OUT);
        });
    }, DURASI_TABEL_KAS_FADE_IN + DURASI_TABEL_KAS_TAMPIL);
}

let kasTableScrollAnimation = null;
let kasTableScrollTimer = null;

function hentikanAutoScrollTabelKas() {
    if (kasTableScrollTimer) {
        clearTimeout(kasTableScrollTimer);
        kasTableScrollTimer = null;
    }
    if (kasTableScrollAnimation) {
        cancelAnimationFrame(kasTableScrollAnimation);
        kasTableScrollAnimation = null;
    }
}

function aktifkanAutoScrollTabelKas(durasiTampil) {
    hentikanAutoScrollTabelKas();

    // Tunggu layout/fade-in selesai agar clientHeight dan scrollHeight akurat.
    kasTableScrollTimer = setTimeout(() => {
        const area = document.querySelector('#kas-mode-overlay.active .kas-table-scroll');
        if (!area) return;

        const jarak = area.scrollHeight - area.clientHeight;
        if (jarak <= 2) return;

        area.scrollTop = 0;

        const jedaAwal = 2000;
        const jedaAkhir = 2000;
        const durasiScroll = Math.max(1000, durasiTampil - jedaAwal - jedaAkhir);

        kasTableScrollTimer = setTimeout(() => {
            const mulai = performance.now();

            function langkahScroll(sekarang) {
                const progres = Math.min((sekarang - mulai) / durasiScroll, 1);
                area.scrollTop = jarak * progres;

                if (progres < 1 && document.body.contains(area)) {
                    kasTableScrollAnimation = requestAnimationFrame(langkahScroll);
                } else {
                    kasTableScrollAnimation = null;
                }
            }

            kasTableScrollAnimation = requestAnimationFrame(langkahScroll);
        }, jedaAwal);
    }, 50);
}

function mulaiSiklusKasSetelahJumat() {
    if(modeKasTimeout) clearTimeout(modeKasTimeout);
    modeKasTimeout=setTimeout(()=>mulaiModeKas(), JEDA_SEBELUM_KAS);
}

function jadwalkanModeInfoJumat(durasi = DURASI_STANDBY_JUMAT) {
    if (modeStandbyJumatTimeout) clearTimeout(modeStandbyJumatTimeout);

    modeStandbyJumatTimeout = setTimeout(() => {
        modeStandbyJumatTimeout = null;
        tampilkanModeInfoJumat();
    }, durasi);
}

function mulaiSiklusModeInfoJumat() {
    if (modeStandbyJumatTimeout) clearTimeout(modeStandbyJumatTimeout);
    if (modeInfoJumatTimeout) clearTimeout(modeInfoJumatTimeout);

    /*
     * Untuk tahap pengujian, siklus aktif setiap hari:
     * 60 detik standby -> 15 detik info Jumat.
     * Setelah tampilan disetujui, pembatas hanya hari Jumat
     * dapat ditambahkan tanpa mengubah mesin datanya.
     */
    jadwalkanModeInfoJumat(DURASI_STANDBY_JUMAT);
}

/* ==========================================================================
   BAGIAN 3: PIPELINE MATRIX DATA INTERFACE GOOGLE SHEETS
   ========================================================================== */
window.addEventListener('DOMContentLoaded', () => {
    tampilkanDataDariCacheLokal();
    muatDataGoogleSheets();
    setInterval(muatDataGoogleSheets, 5 * 60 * 1000);
    mulaiSiklusModeInfoJumat();
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
            if (isModeInfoJumat) renderModeInfoJumat();
            if (!isModeSholatBerlangsung && !isModeMenungguIqamah && dataSlides.length === 0) {
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
        if (isModeInfoJumat) renderModeInfoJumat();
        if (!isModeSholatBerlangsung && !isModeMenungguIqamah && dataSlides.length === 0) {
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

function bangunStrukturSlideAntrian() {
    if (isModeSholatBerlangsung || isModeMenungguIqamah || !cacheDataSheetGlobal) return;

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
        if (keterangan.includes("SALDO AWAL")) { saldoAwal = formatMataUangAman(baris[4], false); }
        totalPemasukan += baris[2] ? bersihkanAngka(baris[2]) : 0;
        totalPengeluaran += baris[3] ? bersihkanAngka(baris[3]) : 0;
        if (baris[4] && baris[4].trim() !== "" && baris[4].trim() !== "0") { saldoAkhir = formatMataUangAman(baris[4], false); }
    }

    DAFTAR_GAMBAR_LOKAL = [];
    for (let i = 0; i < dataInfoLain.length; i++) {
        const isiTeks = dataInfoLain[i][0] ? dataInfoLain[i][0].trim() : "";
        if (isiTeks.match(/\.(jpg|jpeg|png)$/i)) {
            DAFTAR_GAMBAR_LOKAL.push(isiTeks);
        }
    }
    DAFTAR_GAMBAR_LOKAL.sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));

    const canvasTextMurni = dataInfoLain.map(row => row[0]).filter(teks => teks && !teks.trim().match(/\.(jpg|jpeg|png)$/i));

    dataSlides = [];

    tambahkanItemGambarDinamis();
    tambahkanItemTeksDinamis(canvasTextMurni);

    let tglJmt = (dataJumat[0] && dataJumat[0][1]) ? dataJumat[0][1] : '-';
    let khtJmt = (dataJumat[1] && dataJumat[1][1]) ? dataJumat[1][1] : '-';
    let immJmt = (dataJumat[2] && dataJumat[2][1]) ? dataJumat[2][1] : '-';
    let bilJmt = (dataJumat[3] && dataJumat[3][1]) ? dataJumat[3][1] : '-';
    
    dataSlides.push({
        tipe: 'TEKS_JUMAT',
        durasi: 15000,
        html: `
            <div class="jumat-stage">
                <div class="jumat-content">
                    <div class="judul-jumat-besar">PETUGAS JUMAT</div>
                    <div class="tanggal-jumat-besar">${tglJmt}</div>
                    <table class="tabel-jumat-tv">
                        <tr><td>KHATIB</td><td>:</td><td>${khtJmt}</td></tr>
                        <tr><td>IMAM</td><td>:</td><td>${immJmt}</td></tr>
                        <tr><td>MUADZIN</td><td>:</td><td>${bilJmt}</td></tr>
                    </table>
                </div>
            </div>
        `
    });

    dataSlides.push({
        tipe: 'SALDO_JUMAT',
        durasi: 15000,
        html: `
            <div class="padded-slide-inner" style="justify-content: space-between; padding: 1.5vh 2vw; height: 100%;">
                <div style="background: rgba(0,0,0,0.25); border: 0.18vh solid rgba(229,193,88,0.3); border-radius: 1vh; width: 100%; padding: 1vh; text-align: center;">
                    <span style="font-size: 1.8vh; color: #a2bcae; display: block; font-weight: 600;">Saldo Jumat Lalu</span>
                    <strong style="font-size: 2.8vh; color: #ffffff; font-weight: 700; margin-top: 0.3vh; display: block; white-space: nowrap;">${saldoAwal}</strong>
                </div>
                <div style="display: flex; gap: 1.5vw; width: 100%;">
                    <div style="flex: 1; background: rgba(46, 204, 113, 0.1); border: 0.18vh solid rgba(46, 204, 113, 0.4); border-radius: 1vh; padding: 1vh; text-align: center; display: flex; flex-direction: column; justify-content: center;">
                        <span style="font-size: 1.6vh; color: #2ecc71; display: block; font-weight: 600; margin-bottom: 0.3vh;">Masuk</span>
                        <strong style="font-size: 2.1vh; color: #ffffff; font-weight: 700; display: block; white-space: nowrap;">${"Rp " + totalPemasukan.toLocaleString('id-ID')}</strong>
                    </div>
                    <div style="flex: 1; background: rgba(231, 76, 60, 0.1); border: 0.18vh solid rgba(231, 76, 60, 0.4); border-radius: 1vh; padding: 1vh; text-align: center; display: flex; flex-direction: column; justify-content: center;">
                        <span style="font-size: 1.6vh; color: #e74c3c; display: block; font-weight: 600; margin-bottom: 0.3vh;">Keluar</span>
                        <strong style="font-size: 2.1vh; color: #ffffff; font-weight: 700; display: block; white-space: nowrap;">${"Rp " + totalPengeluaran.toLocaleString('id-ID')}</strong>
                    </div>
                </div>
                <div style="background: linear-gradient(180deg, rgba(11,48,28,0.95) 0%, rgba(5,25,14,0.98) 100%); border: 0.25vh solid #e5c158; border-radius: 1.2vh; width: 100%; padding: 1.3vh; text-align: center;">
                    <span style="font-size: 2vh; color: #e5c158; display: block; font-weight: 600;">SALDO SEKARANG</span>
                    <strong style="font-size: 3.5vh; color: #ffffff; font-weight: 800; margin-top: 0.3vh; display: block; white-space: nowrap;">${saldoAkhir}</strong>
                </div>
            </div>
        `
    });

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
            durasi: 25000,
            html: `
                <div class="padded-slide-inner" style="padding: 1.5vh 2vw;">
                    <div style="font-size:2.2vh; color:#e5c158; border-bottom:0.18vh dashed rgba(229,193,88,0.4); padding-bottom:0.5vh; margin-bottom:1vh; font-weight:700; text-align:center; line-height: 1.2;">
                        LAPORAN KAS MASJID
                    </div>
                    <div class="scrollable-content table-responsive">
                        <table class="table-kas">
                            <thead><tr><th>TGL</th><th>URAIAN TRANSAKSI</th><th>MASUK</th><th>KELUAR</th><th>SALDO</th></tr></thead>
                            <tbody>${tableRowsHtml}</tbody>
                        </table>
                    </div>
                </div>
            `
        });    
    }

}

function tambahkanItemGambarDinamis() {
    if (DAFTAR_GAMBAR_LOKAL.length === 0) return;
    const namaFileGambar = DAFTAR_GAMBAR_LOKAL[globalImageIndex % DAFTAR_GAMBAR_LOKAL.length];
    const urlGambarGithubTV = `https://raw.githubusercontent.com/verypriasetia/masjid-assyakur/main/image/${namaFileGambar}`;
    
    dataSlides.push({
        tipe: 'IMAGE_STRETCH',
        durasi: 15000,
        html: `<img src="${urlGambarGithubTV}" class="slide-stretched-img" onerror="this.onerror=null; this.src='logo.png';">`
    });
    globalImageIndex++;
}

function tambahkanItemTeksDinamis(teksMurni) {
    if (teksMurni.length === 0) {
        dataSlides.push({
            tipe: 'TEKS_PENGUMUMAN',
            durasi: 15000,
            html: `<div class="padded-slide-inner" style="justify-content:center; align-items:center;"><div class="scrollable-content info-text-content" style="padding-top:1vh; text-align: left; white-space: pre-wrap;">Masjid Assyakur Desa Jone Paser</div></div>`
        });
        return;
    }
    const teksTampil = teksMurni[globalTextIndex % teksMurni.length];
    dataSlides.push({
        tipe: 'TEKS_PENGUMUMAN',
        durasi: 15000,
        html: `
            <div class="padded-slide-inner" style="justify-content: center; align-items: flex-start; padding-left: 3vw; padding-right: 3vw;">
                <div class="scrollable-content info-text-content" style="padding-top:1vh; text-align: left; white-space: pre-wrap; width: 100%;">${teksTampil}</div>
            </div>
        `
    });
    globalTextIndex = (globalTextIndex + 1) % teksMurni.length;
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


