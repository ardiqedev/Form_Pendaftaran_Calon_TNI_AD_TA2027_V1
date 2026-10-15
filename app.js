/* Form Pendaftaran Calon TNI AD TA 2027 — operator, multi-step */
const API_URL =
  "https://script.google.com/macros/s/AKfycbx14hftFNHZ2Cj9-X8p8njP2rKm9eGmHOhEi2jp5u7r0EAstIl2Ohs-QTmtzJdwF5fCFQ/exec"; // Tempel URL Web App Apps Script setelah deploy.
const state = { step: 0, refs: {}, rapor: {} };
const panels = [...document.querySelectorAll("[data-panel]")];
const stepTitles = [
  "Data diri calon",
  "Data keluarga",
  "Informasi pendaftaran",
  "Nilai rapor",
  "Periksa data",
];
const form = document.getElementById("candidate-form");
const alertBox = document.getElementById("form-alert");
const scoreSubjects = ["BAHASA INDONESIA", "BAHASA INGGRIS", "MATEMATIKA"];
const scoreClasses = ["X", "XI", "XII"];
const semesters = ["I", "II"];

function field(name) {
  return form.elements.namedItem(name);
}
function normalizeCategory(value) {
  return String(value || "")
    .trim()
    .toUpperCase()
    .replace(/[\s-]+/g, "_");
}

function setOptions(select, values) {
  const placeholder =
    select.dataset.placeholder ||
    (select.options[0] ? select.options[0].textContent : "Pilih opsi");

  select.replaceChildren(new Option(placeholder, ""));

  values.forEach((item) => {
    const opt = document.createElement("option");

    if (typeof item === "string") {
      opt.value = item;
      opt.textContent = item;
    } else {
      // Backend idealnya mengirim value=KODE_OPSI dan label=LABEL_OPSI.
      opt.value =
        item.value ?? item.code ?? item.KODE_OPSI ?? item.LABEL_OPSI ?? "";
      opt.textContent = item.label ?? item.LABEL_OPSI ?? item.value ?? "";
    }

    if (opt.value) select.appendChild(opt);
  });
}

function localRefFallback(category) {
  // Fallback terbatas untuk pilihan yang telah dikonfirmasi.
  const known = {
    JENIS_PENDAFTARAN: ["CABA", "CATA"],
    KRITERIA_PRESTASI_NASIONAL: [
      "KRITERIA 1 NASIONAL",
      "KRITERIA 2 NASIONAL",
      "KRITERIA 3 NASIONAL",
    ],
  };

  return known[normalizeCategory(category)] || [];
}

async function loadReferences() {
  const selects = [...document.querySelectorAll("[data-ref]")];

  try {
    if (!API_URL) throw new Error("API_URL belum diisi.");

    const response = await fetch(`${API_URL}?action=references`, {
      method: "GET",
      cache: "no-store",
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status} saat mengambil referensi.`);
    }

    const result = await response.json();

    if (!result.ok || !result.data || typeof result.data !== "object") {
      throw new Error(result.error || "Respons referensi tidak sesuai format.");
    }

    state.refs = result.data;
  } catch (error) {
    console.error("Referensi gagal dimuat dari Apps Script:", error);
    state.refs = {};
  }

  // Pencocokan kategori dilakukan tanpa membedakan huruf besar/kecil,
  // spasi, dan tanda hubung. Nama kategori tetap harus sesuai secara makna.
  const refsByNormalizedCategory = {};
  Object.entries(state.refs).forEach(([key, value]) => {
    refsByNormalizedCategory[normalizeCategory(key)] = value;
  });

  selects.forEach((select) => {
    const category = normalizeCategory(select.dataset.ref);
    const options =
      refsByNormalizedCategory[category] || localRefFallback(category);

    if (options.length) {
      setOptions(select, options);
      select.dataset.refStatus = "loaded";
    } else {
      const placeholder =
        select.dataset.placeholder ||
        (select.options[0] ? select.options[0].textContent : "Pilih opsi");
      select.replaceChildren(new Option(placeholder, ""));

      const opt = new Option(
        "Opsi belum tersedia — periksa kategori di REFERENSI",
        "",
      );
      opt.disabled = true;
      select.appendChild(opt);
      select.dataset.refStatus = "missing";

      console.warn(
        `Kategori REFERENSI "${select.dataset.ref}" tidak ditemukan. ` +
          "Pastikan nilainya sama dengan kolom KATEGORI di spreadsheet.",
      );
    }
  });
}
function buildYears() {
  const select = document.getElementById("tahun-lulus");
  if (!select || select.dataset.yearsBuilt === "true") return;
  select.dataset.yearsBuilt = "true";
  const current = new Date().getFullYear();
  for (let year = current + 1; year >= current - 30; year--) {
    const opt = document.createElement("option");
    opt.value = String(year);
    opt.textContent = String(year);
    select.appendChild(opt);
  }
}
function buildRapor() {
  const container = document.getElementById("rapor-container");
  container.innerHTML = "";
  scoreClasses.forEach((cls) =>
    semesters.forEach((semester) => {
      const card = document.createElement("div");
      card.className = "score-card";
      const title = document.createElement("div");
      title.className = "score-title";
      title.innerHTML = `<strong>Kelas ${cls} · Semester ${semester}</strong><span>Nilai P dan K per mata pelajaran</span>`;
      const table = document.createElement("table");
      table.className = "score-table";
      table.innerHTML =
        "<thead><tr><th>Mata pelajaran</th><th>Nilai P</th><th>Nilai K</th></tr></thead>";
      const tbody = document.createElement("tbody");
      scoreSubjects.forEach((subject) => {
        const key = `${cls}|${semester}|${subject}`;
        const tr = document.createElement("tr");
        tr.innerHTML = `<td>${subject}</td><td><input type="number" min="0" max="100" step="any" inputmode="decimal" aria-label="${subject} nilai P" data-score="${key}|P"></td><td><input type="number" min="0" max="100" step="any" inputmode="decimal" aria-label="${subject} nilai K" data-score="${key}|K"></td>`;
        tbody.appendChild(tr);
      });
      table.appendChild(tbody);
      card.append(title, table);
      container.appendChild(card);
    }),
  );
}
function setConditionalField(wrapper, show, required = false) {
  wrapper.classList.toggle("hidden", !show);
  wrapper.querySelectorAll("input,select,textarea").forEach((el) => {
    el.required = show && required;
    if (!show) {
      el.value = "";
      el.classList.remove("invalid");
    }
  });
}
function updateConditionals() {
  const withGuardian = String(field("TINGGAL_BERSAMA").value || "")
    .toLowerCase()
    .includes("wali");
  document
    .querySelectorAll("#wali-section input, #wali-section textarea")
    .forEach((el) => {
      const wrap = el.closest(".field");
      if (wrap) wrap.classList.toggle("hidden", !withGuardian);
      el.required = withGuardian && el.name === "NAMA_WALI";
      if (!withGuardian) el.value = "";
    });
  ["PEKERJAAN_BAPAK", "PEKERJAAN_IBU"].forEach((name) => {
    const val = String(field(name).value || "").toLowerCase();
    const show = /tni|polri|asn|pns/.test(val);
    const section = field(name).closest(".subsection");
    section.querySelectorAll(".conditional-job").forEach((w) => {
      w.classList.toggle("hidden", !show);
      w.querySelectorAll("input").forEach((i) => {
        i.required = show;
        if (!show) i.value = "";
      });
    });
  });
  const skill = field("MEMILIKI_KEAHLIAN").value === "Ya";
  document
    .getElementById("detail-keahlian-wrap")
    .classList.toggle("hidden", !skill);
  if (!skill) field("DETAIL_KEAHLIAN").value = "";
  document.querySelectorAll("[data-other-target]").forEach((sel) => {
    const target = document.getElementById(sel.dataset.otherTarget);
    const other = /lainnya|lain-lain/i.test(sel.value);
    target.classList.toggle("hidden", !other);
    if (!other) target.value = "";
  });
}
function showStep(step) {
  state.step = Math.max(0, Math.min(step, panels.length - 1));
  panels.forEach((p, i) => p.classList.toggle("active", i === state.step));
  document.querySelectorAll(".step-pill").forEach((b, i) => {
    b.classList.toggle("active", i === state.step);
    b.classList.toggle("done", i < state.step);
  });
  document.getElementById("step-kicker").textContent =
    `LANGKAH ${state.step + 1} DARI ${panels.length}`;
  document.getElementById("step-title").textContent = stepTitles[state.step];
  document.getElementById("progress-percent").textContent =
    `${Math.round(((state.step + 1) / panels.length) * 100)}%`;
  document.getElementById("progress-bar").style.width =
    `${((state.step + 1) / panels.length) * 100}%`;
  document.getElementById("prev-btn").disabled = state.step === 0;
  document
    .getElementById("next-btn")
    .classList.toggle("hidden", state.step === panels.length - 1);
  document
    .getElementById("save-btn")
    .classList.toggle("hidden", state.step !== panels.length - 1);
  alertBox.classList.add("hidden");
  if (state.step === 4) renderReview();
  window.scrollTo({ top: 0, behavior: "smooth" });
}
function validateStep(step) {
  const panel = panels[step];
  let firstInvalid = null;
  panel.querySelectorAll("input,select,textarea").forEach((el) => {
    if (el.disabled || el.closest(".hidden") || el.type === "checkbox") return;
    const invalid = !el.checkValidity();
    el.classList.toggle("invalid", invalid);
    if (invalid && !firstInvalid) firstInvalid = el;
    if (
      ["NIK", "NOMOR_KK"].includes(el.name) &&
      el.value &&
      !/^\d{16}$/.test(el.value)
    ) {
      el.classList.add("invalid");
      firstInvalid = firstInvalid || el;
    }
  });
  if (firstInvalid) {
    alertBox.textContent =
      "Periksa kembali kolom yang wajib diisi atau formatnya belum benar.";
    alertBox.classList.remove("hidden");
    firstInvalid.focus();
    return false;
  }
  return true;
}
function collectData() {
  const data = {};
  [...form.elements].forEach((el) => {
    if (!el.name || el.dataset.score !== undefined) return;
    if (el.id === "jurusan-lain" && !el.classList.contains("hidden")) {
      data.JURUSAN = el.value.trim();
      return;
    }
    if (el.id === "suku-lain" && !el.classList.contains("hidden")) {
      data.SUKU = el.value.trim();
      return;
    }
    if (el.name) data[el.name] = el.value.trim();
  });
  data.NAMA_LENGKAP = (data.NAMA_LENGKAP || "").toUpperCase();
  [
    "TEMPAT_LAHIR",
    "NAMA_SEKOLAH",
    "ALAMAT_SEKOLAH",
    "SUKU",
    "ALAMAT_CALON",
    "NAMA_BAPAK_KANDUNG",
    "NAMA_IBU_KANDUNG",
    "NAMA_WALI",
    "PEKERJAAN_WALI",
    "PANGKAT_BAPAK",
    "JABATAN_BAPAK",
    "KESATUAN_BAPAK",
    "PANGKAT_IBU",
    "JABATAN_IBU",
    "KESATUAN_IBU",
    "ALAMAT_BAPAK",
    "ALAMAT_IBU",
    "ALAMAT_WALI",
    "NAMA_KAKEK_AYAH",
    "NAMA_NENEK_AYAH",
    "ALAMAT_KAKEK_NENEK_AYAH",
    "NAMA_KAKEK_IBU",
    "NAMA_NENEK_IBU",
    "ALAMAT_KAKEK_NENEK_IBU",
    "PANGKAT_BABINSA",
    "NAMA_BABINSA",
    "KODIM_DOMISILI",
  ].forEach((k) => {
    if (data[k]) data[k] = data[k].toUpperCase();
  });
  data.NOMOR_KK = String(data.NOMOR_KK || "");
  data.NIK = String(data.NIK || "");
  data.NOMOR_BPJS = String(data.NOMOR_BPJS || "");
  data.NILAI_RAPORT = [];
  document.querySelectorAll("[data-score]").forEach((el) => {
    const [kelas, semester, mata_pelajaran, jenis] =
      el.dataset.score.split("|");
    let record = data.NILAI_RAPORT.find(
      (x) =>
        x.KELAS === kelas &&
        x.SEMESTER === semester &&
        x.MATA_PELAJARAN === mata_pelajaran,
    );
    if (!record) {
      record = {
        KELAS: kelas,
        SEMESTER: semester,
        MATA_PELAJARAN: mata_pelajaran,
        NILAI_P: "",
        NILAI_K: "",
      };
      data.NILAI_RAPORT.push(record);
    }
    record[jenis === "P" ? "NILAI_P" : "NILAI_K"] = el.value;
  });
  return data;
}
function renderReview() {
  const d = collectData();
  const groups = [
    [
      "Identitas calon",
      [
        "NAMA_LENGKAP",
        "TEMPAT_LAHIR",
        "TANGGAL_LAHIR",
        "NIK",
        "NOMOR_KK",
        "NOMOR_BPJS",
        "PENDIDIKAN_UMUM",
        "NAMA_SEKOLAH",
      ],
    ],
    [
      "Kontak dan domisili",
      [
        "ALAMAT_CALON",
        "NOMOR_HP_CALON",
        "NOMOR_HP_ORANG_TUA_WALI",
        "EMAIL_CALON",
        "KODIM_DOMISILI",
      ],
    ],
    [
      "Keluarga",
      [
        "NAMA_BAPAK_KANDUNG",
        "PEKERJAAN_BAPAK",
        "NAMA_IBU_KANDUNG",
        "PEKERJAAN_IBU",
        "NAMA_WALI",
        "NAMA_KAKEK_AYAH",
        "NAMA_NENEK_AYAH",
      ],
    ],
    [
      "Pendaftaran",
      [
        "JENIS_PENDAFTARAN",
        "JUMLAH_PENDAFTARAN_TNI",
        "KRITERIA_PRESTASI_NASIONAL",
        "MOTIVASI_CALON",
        "HOBI_CALON",
        "MEMILIKI_KEAHLIAN",
      ],
    ],
  ];
  const labels = {
    NAMA_LENGKAP: "Nama lengkap",
    TEMPAT_LAHIR: "Tempat lahir",
    TANGGAL_LAHIR: "Tanggal lahir",
    NIK: "NIK",
    NOMOR_KK: "Nomor KK",
    NOMOR_BPJS: "Nomor BPJS",
    PENDIDIKAN_UMUM: "Pendidikan",
    NAMA_SEKOLAH: "Sekolah",
    ALAMAT_CALON: "Alamat calon",
    NOMOR_HP_CALON: "HP calon",
    NOMOR_HP_ORANG_TUA_WALI: "HP orang tua/wali",
    EMAIL_CALON: "Email",
    KODIM_DOMISILI: "Kodim",
    NAMA_BAPAK_KANDUNG: "Nama ayah",
    PEKERJAAN_BAPAK: "Pekerjaan ayah",
    NAMA_IBU_KANDUNG: "Nama ibu",
    PEKERJAAN_IBU: "Pekerjaan ibu",
    NAMA_WALI: "Nama wali",
    NAMA_KAKEK_AYAH: "Kakek dari ayah",
    NAMA_NENEK_AYAH: "Nenek dari ayah",
    JENIS_PENDAFTARAN: "Jenis pendaftaran",
    JUMLAH_PENDAFTARAN_TNI: "Pendaftaran TNI ke-",
    KRITERIA_PRESTASI_NASIONAL: "Prestasi",
    MOTIVASI_CALON: "Motivasi",
    HOBI_CALON: "Hobi",
    MEMILIKI_KEAHLIAN: "Keahlian",
  };
  const root = document.getElementById("review-summary");
  root.innerHTML = "";
  groups.forEach(([title, keys]) => {
    const box = document.createElement("div");
    box.className = "review-group";
    const h = document.createElement("h4");
    h.textContent = title;
    box.appendChild(h);
    keys.forEach((k) => {
      const row = document.createElement("div");
      row.className = "review-row";
      const a = document.createElement("span");
      a.textContent = labels[k] || k;
      const b = document.createElement("strong");
      b.textContent = d[k] || "—";
      row.append(a, b);
      box.appendChild(row);
    });
    root.appendChild(box);
  });
  const count = d.NILAI_RAPORT.filter(
    (x) => x.NILAI_P !== "" || x.NILAI_K !== "",
  ).length;
  const box = document.createElement("div");
  box.className = "review-group";
  box.innerHTML = `<h4>Nilai rapor</h4><div class="review-row"><span>Pasangan nilai diisi</span><strong>${count} dari 18 mata pelajaran/semester</strong></div>`;
  root.appendChild(box);
}
function showToast(message, error = false) {
  const toast = document.getElementById("toast");
  toast.textContent = message;
  toast.classList.toggle("error", error);
  toast.classList.remove("hidden");
  setTimeout(() => toast.classList.add("hidden"), 5000);
}
async function saveCandidate(data) {
  if (!API_URL) {
    showToast(
      "Form siap diuji tampilan, tetapi URL Apps Script belum dipasang. Isi API_URL di app.js.",
      true,
    );
    return;
  }
  const saveBtn = document.getElementById("save-btn");
  saveBtn.disabled = true;
  saveBtn.textContent = "Menyimpan...";
  document.getElementById("save-status").textContent = "Mengirim data...";
  try {
    const res = await fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({ action: "createCandidate", data }),
    });
    const result = await res.json();
    if (!result.ok) throw new Error(result.error || "Penyimpanan gagal.");
    document.getElementById("save-status").textContent = "Tersimpan";
    showToast(
      `Pendaftaran berhasil disimpan. Nomor: ${result.nomor_pendaftaran || "dibuat backend"}`,
    );
    form.reset();
    document.querySelectorAll("[data-score]").forEach((x) => (x.value = ""));
    showStep(0);
  } catch (err) {
    showToast(err.message || "Tidak dapat menghubungi backend.", true);
    document.getElementById("save-status").textContent = "Belum tersimpan";
  } finally {
    saveBtn.disabled = false;
    saveBtn.textContent = "Simpan pendaftaran";
  }
}
document.getElementById("next-btn").addEventListener("click", () => {
  if (!validateStep(state.step)) return;
  showStep(state.step + 1);
});
document
  .getElementById("prev-btn")
  .addEventListener("click", () => showStep(state.step - 1));
document.querySelectorAll(".step-pill").forEach((btn) =>
  btn.addEventListener("click", () => {
    const target = Number(btn.dataset.step);
    if (target <= state.step || validateStep(state.step)) showStep(target);
  }),
);
form.addEventListener("input", (e) => {
  if (e.target.classList.contains("invalid") && e.target.checkValidity())
    e.target.classList.remove("invalid");
});
form.addEventListener("change", updateConditionals);
form.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!validateStep(4)) return;
  if (!document.getElementById("confirm-data").checked) {
    alertBox.textContent =
      "Centang konfirmasi pemeriksaan data sebelum menyimpan.";
    alertBox.classList.remove("hidden");
    return;
  }
  const data = collectData();
  await saveCandidate(data);
});
(async function init() {
  buildYears();
  buildRapor();
  await loadReferences();
  updateConditionals();
  showStep(0);
})();
