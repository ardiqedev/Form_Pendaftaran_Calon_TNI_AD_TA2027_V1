/* Form Pendaftaran Calon TNI AD TA 2027 — operator, multi-step */
const API_URL =
  "https://script.google.com/macros/s/AKfycbwr_P8MtWYD0pc2Zm6vOQ4JkNPNEZ6rdLIPZTwInbT9B-YPj2N9wA_zcSnUpWI4ajGEhQ/exec"; // Tempel URL Web App Apps Script setelah deploy.
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
  if (!select) {
    console.warn("setOptions: elemen select tidak ditemukan.");
    return;
  }

  const placeholder =
    select.dataset.placeholder ||
    (select.options[0] ? select.options[0].textContent : "Pilih opsi");

  // Lindungi dropdown dari data yang bukan array.
  if (!Array.isArray(values)) {
    console.warn("setOptions: values bukan array.", {
      select: select.name || select.id,
      values,
    });

    values = [];
  }

  select.replaceChildren(new Option(placeholder, ""));

  values.forEach((item) => {
    if (item == null) return;

    const opt = document.createElement("option");

    if (typeof item === "string" || typeof item === "number") {
      opt.value = String(item);
      opt.textContent = String(item);
    } else if (typeof item === "object") {
      opt.value = String(
        item.value ?? item.code ?? item.KODE_OPSI ?? item.LABEL_OPSI ?? "",
      );

      opt.textContent = String(
        item.label ?? item.LABEL_OPSI ?? item.value ?? item.code ?? "",
      );
    } else {
      return;
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
  const selects = [...document.querySelectorAll("select[data-ref]")];
  const controller = new AbortController();

  // Batasi waktu tunggu request maksimal 15 detik.
  const timeoutId = setTimeout(() => {
    controller.abort();
  }, 15000);

  try {
    if (!API_URL) {
      throw new Error("API_URL belum diisi.");
    }

    const response = await fetch(`${API_URL}?action=references`, {
      method: "GET",
      cache: "no-store",
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status} saat mengambil referensi.`);
    }

    const result = await response.json();

    if (
      !result.ok ||
      !result.data ||
      typeof result.data !== "object" ||
      Array.isArray(result.data)
    ) {
      throw new Error(result.error || "Respons referensi tidak sesuai format.");
    }

    state.refs = result.data;
  } catch (error) {
    if (error.name === "AbortError") {
      console.error(
        "Request referensi dibatalkan karena melewati batas waktu 15 detik.",
      );
    } else {
      console.error("Referensi gagal dimuat dari Apps Script:", error);
    }

    // Gunakan fallback lokal jika referensi backend gagal dimuat.
    state.refs = {};
  } finally {
    clearTimeout(timeoutId);
  }

  // Normalisasi kategori tanpa membedakan huruf besar/kecil,
  // spasi, dan tanda hubung.
  const refsByNormalizedCategory = {};

  Object.entries(state.refs).forEach(([key, value]) => {
    refsByNormalizedCategory[normalizeCategory(key)] = value;
  });

  // Isi seluruh dropdown referensi.

  // Isi seluruh dropdown referensi.
  selects.forEach((select) => {
    if (!(select instanceof HTMLSelectElement)) {
      console.warn("Elemen referensi bukan SELECT yang valid:", select);
      return;
    }

    const category = normalizeCategory(select.dataset.ref);

    const options =
      refsByNormalizedCategory[category] || localRefFallback(category);

    if (Array.isArray(options) && options.length > 0) {
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

/* =========================================
   EDIT / LANJUTKAN PENDAFTARAN LAMA
========================================= */

state.editMode = false;
state.editRegistration = null;

const saveBtn = document.getElementById("save-btn");

if (saveBtn) {
  saveBtn.textContent = "Simpan Perubahan";
}

function initEditRegistration() {
  const loginButton = document.getElementById("login-registration-btn");

  if (!loginButton || loginButton.dataset.editListenerAttached === "true") {
    return;
  }

  loginButton.addEventListener("click", searchExistingRegistration);
  loginButton.dataset.editListenerAttached = "true";
}

async function searchExistingRegistration() {
  const input = document.getElementById("login-nomor-registrasi");
  const button = document.getElementById("login-registration-btn");
  const status = document.getElementById("login-registration-message");

  if (!input || !button || !status) {
    console.error("Elemen pencarian pendaftaran tidak ditemukan.", {
      input: !!input,
      button: !!button,
      status: !!status,
    });
    return;
  }

  const nomor = input.value.trim().toUpperCase();

  if (!/^TNIAD-\d{4}-\d{6}$/.test(nomor)) {
    status.textContent = "Format nomor registrasi belum benar.";
    return;
  }

  button.disabled = true;
  status.textContent = "Mencari data pendaftaran...";

  try {
    const response = await fetch(API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "text/plain;charset=utf-8",
      },
      body: JSON.stringify({
        action: "getCandidateForEdit",
        nomor_pendaftaran: nomor,
      }),
    });

    const result = await response.json();

    if (!response.ok || !result.ok || !result.data) {
      throw new Error(
        result.error?.message ||
          result.error ||
          result.message ||
          "Data pendaftaran tidak ditemukan.",
      );
    }

    const data = result.data;

    if (!data.calon || !data.pendaftaran) {
      throw new Error("Data calon atau pendaftaran tidak lengkap.");
    }

    // Pastikan referensi dan opsi dropdown sudah tersedia.
    if (!registrationInitialized) {
      buildYears();
      buildRapor();
      await loadReferences();
      updateConditionals();
      registrationInitialized = true;
    }

    fillExistingRegistration(data);

    state.editMode = true;
    state.editRegistration = {
      ID_CALON: data.calon.ID_CALON,
      ID_PENDAFTARAN: data.pendaftaran.ID_PENDAFTARAN,
      NOMOR_PENDAFTARAN: data.pendaftaran.NOMOR_PENDAFTARAN,
    };

    if (welcomePage) welcomePage.hidden = true;

    const editPanel = document.getElementById("edit-registration-panel");
    if (editPanel) editPanel.hidden = true;

    if (registrationIntro) registrationIntro.hidden = false;
    if (registrationFormCard) registrationFormCard.hidden = false;

    showStep(0);

    status.textContent = "Data berhasil dimuat.";
    showToast("Data lama berhasil dimuat. Periksa sebelum mengedit.");
  } catch (error) {
    console.error("Pencarian pendaftaran gagal:", error);
    status.textContent = error.message || "Pencarian gagal.";
  } finally {
    button.disabled = false;
  }
}

function fillExistingRegistration(data) {
  const calon = data.calon || {};
  const pendaftaran = data.pendaftaran || {};
  console.log("DATA KELUARGA:", {
    provinsi: calon.PROVINSI_BAPAK,
    kabupaten: calon.KABUPATEN_KOTA_BAPAK,
    alamat: calon.ALAMAT_BAPAK,
  });

  console.log(
    "INPUT KABUPATEN BAPAK:",
    document.getElementById("kabupaten-bapak")?.value,
  );

  // Gabungkan data calon dan pendaftaran.
  const combined = { ...calon, ...pendaftaran };

  Object.entries(combined).forEach(([name, value]) => {
    const control = field(name);

    if (!control || control.dataset.score !== undefined) return;
    if (control.disabled || control.type === "file") return;

    const normalizedValue = String(value ?? "");

    if (control instanceof HTMLSelectElement) {
      const optionExists = [...control.options].some(
        (option) => option.value === normalizedValue,
      );

      if (normalizedValue && !optionExists) {
        control.add(new Option(normalizedValue, normalizedValue));
      }
    }

    control.value = normalizedValue;
  });

  // Isi nilai rapor.
  document.querySelectorAll("[data-score]").forEach((input) => {
    const [kelas, semester, mapel, jenis] = input.dataset.score.split("|");

    const row = (data.NILAI_RAPORT || []).find(
      (item) =>
        String(item.KELAS).toUpperCase() === kelas &&
        String(item.SEMESTER).toUpperCase() === semester &&
        String(item.MATA_PELAJARAN).toUpperCase() === mapel,
    );

    input.value = row ? String(jenis === "P" ? row.NILAI_P : row.NILAI_K) : "";
  });

  // Pulihkan field tambahan "Lainnya".
  [
    ["JURUSAN", "jurusan-lain"],
    ["SUKU", "suku-lain"],
  ].forEach(([name, id]) => {
    const select = field(name);
    const input = document.getElementById(id);

    if (!select || !input) return;

    const nilai = String(calon[name] || "");

    const exists = [...select.options].some((option) => option.value === nilai);

    if (nilai && !exists) {
      select.value = "Lainnya";
      input.value = nilai;
      input.classList.remove("hidden");
    }
  });

  // Perbarui visibilitas field kondisional.
  updateConditionals();

  // Pulihkan autocomplete alamat calon.
  window.pulihkanWilayahCalon?.(
    calon.PROVINSI_CALON || "",
    calon.KABUPATEN_KOTA_CALON || "",
  );

  // Pulihkan autocomplete alamat keluarga.
  // Pulihkan autocomplete alamat keluarga dari data backend.
  ["BAPAK", "IBU", "WALI"].forEach((jenis) => {
    const suffix = jenis.toLowerCase();

    const provinsi = calon[`PROVINSI_${jenis}`] || "";

    const kabupaten = calon[`KABUPATEN_KOTA_${jenis}`] || "";

    const provinsiInput = document.getElementById(`provinsi-${suffix}`);

    const kabupatenInput = document.getElementById(`kabupaten-${suffix}`);

    if (provinsiInput) provinsiInput.value = provinsi;
    if (kabupatenInput) kabupatenInput.value = kabupaten;

    window.pulihkanWilayahKeluarga?.[jenis]?.(provinsi, kabupaten);
  });

  // Bersihkan status validasi lama.
  form.querySelectorAll(".invalid").forEach((el) => {
    el.classList.remove("invalid");
  });
}

// Inisialisasi panel pencarian.
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initEditRegistration);
} else {
  initEditRegistration();
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

        tr.innerHTML = `
          <td>${subject}</td>
          <td>
            <input
              type="text"
              inputmode="decimal"
              autocomplete="off"
              placeholder="Contoh: 80,9"
              aria-label="${subject} nilai P"
              data-score="${key}|P"
              data-score-decimal
            >
          </td>
          <td>
            <input
              type="text"
              inputmode="decimal"
              autocomplete="off"
              placeholder="Contoh: 80,9"
              aria-label="${subject} nilai K"
              data-score="${key}|K"
              data-score-decimal
            >
          </td>
        `;

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
  // =====================================
  // 1. TINGGAL BERSAMA / WALI
  // =====================================

  const tinggalField = field("TINGGAL_BERSAMA");

  const tinggalValue = String(tinggalField?.value || "")
    .trim()
    .toLowerCase();

  const tinggalLabel = String(
    tinggalField?.selectedOptions?.[0]?.textContent || "",
  )
    .trim()
    .toLowerCase();

  const withGuardian =
    tinggalValue.includes("wali") || tinggalLabel.includes("wali");

  document
    .querySelectorAll(
      "#wali-section input, #wali-section select, #wali-section textarea",
    )
    .forEach((el) => {
      const wrapper = el.closest(".field");

      if (wrapper) {
        wrapper.classList.toggle("hidden", !withGuardian);
      }

      el.required = withGuardian && el.name === "NAMA_WALI";

      if (!withGuardian) {
        el.value = "";
        el.classList.remove("invalid");
      }
    });

  // =====================================
  // 2. PEKERJAAN AYAH, IBU, DAN WALI
  // =====================================

  const jobConfigs = [
    {
      name: "PEKERJAAN_BAPAK",
      wrapId: "pekerjaan-bapak-lainnya-wrap",
      inputId: "pekerjaan-bapak-lainnya",
      guardianOnly: false,
    },
    {
      name: "PEKERJAAN_IBU",
      wrapId: "pekerjaan-ibu-lainnya-wrap",
      inputId: "pekerjaan-ibu-lainnya",
      guardianOnly: false,
    },
    {
      name: "PEKERJAAN_WALI",
      wrapId: "pekerjaan-wali-lainnya-wrap",
      inputId: "pekerjaan-wali-lainnya",
      guardianOnly: true,
    },
  ];

  jobConfigs.forEach((config) => {
    const select = field(config.name);
    if (!select) return;

    const value = String(select.value || "")
      .trim()
      .toLowerCase();
    const label = String(select.selectedOptions?.[0]?.textContent || "")
      .trim()
      .toLowerCase();

    const isOther =
      /lainnya|lain-lain/.test(value) || /lainnya|lain-lain/.test(label);

    const wrapper = document.getElementById(config.wrapId);
    const input = document.getElementById(config.inputId);

    const allowed = !config.guardianOnly || withGuardian;

    const showOther = isOther && allowed;

    if (wrapper) {
      wrapper.classList.toggle("hidden", !showOther);
    }

    if (input) {
      input.required = showOther;

      if (!showOther) {
        input.value = "";
        input.classList.remove("invalid");
      }
    }

    // Tampilkan detail pangkat, jabatan, dan kesatuan
    // untuk pekerjaan TNI / POLRI / ASN / PNS.
    const jobText = `${value} ${label}`;
    const showJobDetails = allowed && /tni|polri|asn|pns/.test(jobText);

    const section = select.closest(".subsection");

    if (section) {
      section.querySelectorAll(".conditional-job").forEach((fieldWrap) => {
        fieldWrap.classList.toggle("hidden", !showJobDetails);

        fieldWrap.querySelectorAll("input").forEach((inputField) => {
          inputField.required = showJobDetails;

          if (!showJobDetails) {
            inputField.value = "";
            inputField.classList.remove("invalid");
          }
        });
      });
    }
  });

  // =====================================
  // 3. DETAIL KEAHLIAN
  // =====================================

  const memilikiKeahlian = field("MEMILIKI_KEAHLIAN");
  const detailKeahlianWrap = document.getElementById("detail-keahlian-wrap");
  const detailKeahlian = field("DETAIL_KEAHLIAN");

  if (memilikiKeahlian && detailKeahlianWrap && detailKeahlian) {
    const skill = String(memilikiKeahlian.value).toLowerCase() === "ya";

    detailKeahlianWrap.classList.toggle("hidden", !skill);
    detailKeahlian.required = skill;

    if (!skill) {
      detailKeahlian.value = "";
      detailKeahlian.classList.remove("invalid");
    }
  }

  // =====================================
  // 4. FIELD TAMBAHAN: JURUSAN / SUKU
  // =====================================

  document.querySelectorAll("[data-other-target]").forEach((select) => {
    const target = document.getElementById(select.dataset.otherTarget);
    if (!target) return;

    const other = /lainnya|lain-lain/i.test(
      `${select.value} ${select.selectedOptions?.[0]?.textContent || ""}`,
    );

    target.classList.toggle("hidden", !other);
    target.required = other;

    if (!other) {
      target.value = "";
      target.classList.remove("invalid");
    }
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

    data[el.name] = el.value.trim();
  });

  // =====================================
  // 1. NORMALISASI HURUF KAPITAL
  // =====================================

  data.NAMA_LENGKAP = (data.NAMA_LENGKAP || "").toUpperCase();

  [
    "TEMPAT_LAHIR",
    "NAMA_SEKOLAH",
    "ALAMAT_SEKOLAH",
    "SUKU",

    // ALAMAT CALON
    "ALAMAT_CALON",
    "PROVINSI_CALON",
    "KABUPATEN_KOTA_CALON",
    "KECAMATAN_CALON",
    "KELURAHAN_DESA_CALON",
    "RT_CALON",
    "RW_CALON",

    // DATA KELUARGA
    "NAMA_BAPAK_KANDUNG",
    "NAMA_IBU_KANDUNG",
    "NAMA_WALI",
    "PANGKAT_BAPAK",
    "JABATAN_BAPAK",
    "KESATUAN_BAPAK",
    "PANGKAT_IBU",
    "JABATAN_IBU",
    "KESATUAN_IBU",
    "ALAMAT_BAPAK",
    "ALAMAT_IBU",
    "ALAMAT_WALI",
    "PANGKAT_WALI",
    "JABATAN_WALI",
    "KESATUAN_WALI",

    // KELUARGA DARI AYAH
    "NAMA_KAKEK_AYAH",
    "NAMA_NENEK_AYAH",
    "ALAMAT_KAKEK_NENEK_AYAH",

    // KELUARGA DARI IBU
    "NAMA_KAKEK_IBU",
    "NAMA_NENEK_IBU",
    "ALAMAT_KAKEK_NENEK_IBU",

    // ALAMAT TERSTRUKTUR KELUARGA
    "PROVINSI_BAPAK",
    "KABUPATEN_KOTA_BAPAK",
    "KECAMATAN_BAPAK",
    "KELURAHAN_DESA_BAPAK",
    "RT_BAPAK",
    "RW_BAPAK",

    "PROVINSI_IBU",
    "KABUPATEN_KOTA_IBU",
    "KECAMATAN_IBU",
    "KELURAHAN_DESA_IBU",
    "RT_IBU",
    "RW_IBU",

    "PROVINSI_WALI",
    "KABUPATEN_KOTA_WALI",
    "KECAMATAN_WALI",
    "KELURAHAN_DESA_WALI",
    "RT_WALI",
    "RW_WALI",

    // DATA PEMBINA
    "PANGKAT_BABINSA",
    "NAMA_BABINSA",
    "KODIM_DOMISILI",
  ].forEach((key) => {
    if (data[key]) {
      data[key] = String(data[key]).toUpperCase();
    }
  });

  // =====================================
  // 2. PEKERJAAN LAINNYA
  // AYAH / IBU / WALI
  // =====================================

  const jobConfigs = [
    {
      name: "PEKERJAAN_BAPAK",
      inputId: "pekerjaan-bapak-lainnya",
    },
    {
      name: "PEKERJAAN_IBU",
      inputId: "pekerjaan-ibu-lainnya",
    },
    {
      name: "PEKERJAAN_WALI",
      inputId: "pekerjaan-wali-lainnya",
    },
  ];

  jobConfigs.forEach((config) => {
    const select = field(config.name);
    if (!select) return;

    const value = String(select.value || "")
      .trim()
      .toLowerCase();

    const label = String(select.selectedOptions?.[0]?.textContent || "")
      .trim()
      .toLowerCase();

    const isOther =
      /lainnya|lain-lain/.test(value) || /lainnya|lain-lain/.test(label);

    if (!isOther) return;

    const input = document.getElementById(config.inputId);

    data[config.name] = String(input?.value || "")
      .trim()
      .toUpperCase();
  });

  // =====================================
  // 3. PERTAHANKAN NOMOR SEBAGAI TEKS
  // =====================================

  data.NOMOR_KK = String(data.NOMOR_KK || "");
  data.NIK = String(data.NIK || "");
  data.NOMOR_BPJS = String(data.NOMOR_BPJS || "");

  // Angka desimal: dukung koma maupun titik
  data.TINGGI_BADAN_CM = String(data.TINGGI_BADAN_CM ?? "")
    .trim()
    .replace(",", ".");

  data.BERAT_BADAN_KG = String(data.BERAT_BADAN_KG ?? "")
    .trim()
    .replace(",", ".");

  // =====================================
  // 4. KUMPULKAN NILAI RAPOR
  // =====================================

  data.NILAI_RAPORT = [];

  document.querySelectorAll("[data-score]").forEach((el) => {
    const [kelas, semester, mata_pelajaran, jenis] =
      el.dataset.score.split("|");

    let record = data.NILAI_RAPORT.find(
      (item) =>
        item.KELAS === kelas &&
        item.SEMESTER === semester &&
        item.MATA_PELAJARAN === mata_pelajaran,
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

    record[jenis === "P" ? "NILAI_P" : "NILAI_K"] = String(
      el.value ?? "",
    ).trim();
  });

  // =====================================
  // 5. PASTIKAN ALAMAT TERSIMPAN TERSTRUKTUR
  // =====================================

  const alamatConfigs = [
    {
      suffix: "CALON",
      kolomAlamat: "ALAMAT_CALON",
    },
    {
      suffix: "BAPAK",
      kolomAlamat: "ALAMAT_BAPAK",
    },
    {
      suffix: "IBU",
      kolomAlamat: "ALAMAT_IBU",
    },
    {
      suffix: "WALI",
      kolomAlamat: "ALAMAT_WALI",
    },
  ];

  alamatConfigs.forEach(({ suffix, kolomAlamat }) => {
    const kolomWilayah = [
      `PROVINSI_${suffix}`,
      `KABUPATEN_KOTA_${suffix}`,
      `KECAMATAN_${suffix}`,
      `KELURAHAN_DESA_${suffix}`,
      `RT_${suffix}`,
      `RW_${suffix}`,
    ];

    // Simpan setiap bagian alamat secara terpisah.
    kolomWilayah.forEach((key) => {
      data[key] = String(data[key] || "")
        .trim()
        .toUpperCase();
    });

    // ALAMAT_* tetap dipertahankan untuk kompatibilitas.
    // Kolom ini tidak lagi menjadi satu-satunya sumber alamat.
    data[kolomAlamat] = String(data[kolomAlamat] || "")
      .trim()
      .toUpperCase();
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
      "Keluarga dari Ayah",
      [
        "NAMA_BAPAK_KANDUNG",
        "PEKERJAAN_BAPAK",
        "PANGKAT_BAPAK",
        "JABATAN_BAPAK",
        "KESATUAN_BAPAK",
        "ALAMAT_BAPAK",
        "NAMA_KAKEK_AYAH",
        "NAMA_NENEK_AYAH",
        "ALAMAT_KAKEK_NENEK_AYAH",
      ],
    ],
    [
      "Keluarga dari Ibu",
      [
        "NAMA_IBU_KANDUNG",
        "PEKERJAAN_IBU",
        "PANGKAT_IBU",
        "JABATAN_IBU",
        "KESATUAN_IBU",
        "ALAMAT_IBU",
        "NAMA_KAKEK_IBU",
        "NAMA_NENEK_IBU",
        "ALAMAT_KAKEK_NENEK_IBU",
      ],
    ],
    [
      "Wali",
      [
        "NAMA_WALI",
        "PEKERJAAN_WALI",
        "PANGKAT_WALI",
        "JABATAN_WALI",
        "KESATUAN_WALI",
        "ALAMAT_WALI",
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
        "DETAIL_KEAHLIAN",
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
    PANGKAT_BAPAK: "Pangkat ayah",
    JABATAN_BAPAK: "Jabatan ayah",
    KESATUAN_BAPAK: "Kesatuan ayah",
    ALAMAT_BAPAK: "Alamat ayah",

    NAMA_IBU_KANDUNG: "Nama ibu",
    PEKERJAAN_IBU: "Pekerjaan ibu",
    PANGKAT_IBU: "Pangkat ibu",
    JABATAN_IBU: "Jabatan ibu",
    KESATUAN_IBU: "Kesatuan ibu",
    ALAMAT_IBU: "Alamat ibu",

    NAMA_KAKEK_AYAH: "Nama kakek dari ayah",
    NAMA_NENEK_AYAH: "Nama nenek dari ayah",
    ALAMAT_KAKEK_NENEK_AYAH: "Alamat kakek dan nenek dari ayah",

    NAMA_KAKEK_IBU: "Nama kakek dari ibu",
    NAMA_NENEK_IBU: "Nama nenek dari ibu",
    ALAMAT_KAKEK_NENEK_IBU: "Alamat kakek dan nenek dari ibu",

    NAMA_WALI: "Nama wali",
    PEKERJAAN_WALI: "Pekerjaan wali",
    PANGKAT_WALI: "Pangkat wali",
    JABATAN_WALI: "Jabatan wali",
    KESATUAN_WALI: "Kesatuan wali",
    ALAMAT_WALI: "Alamat wali",

    JENIS_PENDAFTARAN: "Jenis pendaftaran",
    JUMLAH_PENDAFTARAN_TNI: "Pendaftaran TNI ke-",
    KRITERIA_PRESTASI_NASIONAL: "Prestasi",
    MOTIVASI_CALON: "Motivasi",
    HOBI_CALON: "Hobi",
    MEMILIKI_KEAHLIAN: "Keahlian",
    DETAIL_KEAHLIAN: "Detail keahlian",
  };

  const root = document.getElementById("review-summary");
  root.innerHTML = "";

  groups.forEach(([title, keys]) => {
    const box = document.createElement("div");
    box.className = "review-group";

    const h = document.createElement("h4");
    h.textContent = title;
    box.appendChild(h);

    keys.forEach((key) => {
      const row = document.createElement("div");
      row.className = "review-row";

      const label = document.createElement("span");
      label.textContent = labels[key] || key;

      const value = document.createElement("strong");
      value.textContent = d[key] || "—";

      row.append(label, value);
      box.appendChild(row);
    });

    root.appendChild(box);
  });

  const count = d.NILAI_RAPORT.filter(
    (item) => item.NILAI_P !== "" || item.NILAI_K !== "",
  ).length;

  const scoreBox = document.createElement("div");
  scoreBox.className = "review-group";
  scoreBox.innerHTML =
    `<h4>Nilai rapor</h4>` +
    `<div class="review-row">` +
    `<span>Pasangan nilai diisi</span>` +
    `<strong>${count} dari 18 mata pelajaran/semester</strong>` +
    `</div>`;

  root.appendChild(scoreBox);
}

/* =========================================
   AUTOCOMPLETE ALAMAT CALON
========================================= */

function initAlamatCalon() {
  const provinsiInput = document.getElementById("provinsi-calon");
  const provinsiOptions = document.getElementById("provinsi-calon-options");

  const kabupatenInput = document.getElementById("kabupaten-calon");
  const kabupatenOptions = document.getElementById("kabupaten-calon-options");
  const kabupatenInfo = document.getElementById("kabupaten-calon-info");

  const kecamatanInput = document.getElementById("kecamatan-calon");
  const kelurahanInput = document.getElementById("kelurahan-calon");
  const rtInput = document.getElementById("rt-calon");
  const rwInput = document.getElementById("rw-calon");

  const alamatHidden = document.querySelector('[name="ALAMAT_CALON"]');

  if (
    !provinsiInput ||
    !provinsiOptions ||
    !kabupatenInput ||
    !kabupatenOptions ||
    !kabupatenInfo ||
    !kecamatanInput ||
    !kelurahanInput ||
    !rtInput ||
    !rwInput ||
    !alamatHidden ||
    !window.WilayahIndonesia
  ) {
    console.error(
      "Inisialisasi alamat calon gagal: elemen atau dataset tidak ditemukan.",
    );
    return;
  }

  let provinsiTerpilih = null;
  let kabupatenTerpilih = null;

  // Pulihkan state wilayah saat data lama dimuat untuk diedit.
  function pulihkanWilayahCalon(provinsi, kabupaten) {
    const namaProvinsi = String(provinsi || "").trim();
    const namaKabupaten = String(kabupaten || "").trim();

    provinsiTerpilih = null;
    kabupatenTerpilih = null;

    if (!namaProvinsi) {
      kabupatenInput.disabled = true;
      kabupatenInput.placeholder = "Pilih provinsi terlebih dahulu";
      return;
    }

    const daftarProvinsi = window.WilayahIndonesia.cariProvinsi(namaProvinsi);

    provinsiTerpilih =
      daftarProvinsi.find(
        (item) => item.nama.toUpperCase() === namaProvinsi.toUpperCase(),
      ) || null;

    // Jika provinsi cocok dengan dataset, gunakan objek aslinya.
    if (provinsiTerpilih) {
      provinsiInput.value = provinsiTerpilih.nama;
    } else {
      // Tetap pertahankan nama provinsi dari data lama.
      provinsiInput.value = namaProvinsi;
    }

    kabupatenInput.value = namaKabupaten;
    kabupatenInput.disabled = false;
    kabupatenInput.placeholder = "Ketik kabupaten/kota...";

    if (provinsiTerpilih?.kode === "35" && namaKabupaten) {
      const daftarKabupaten = window.WilayahIndonesia.cariKabupatenKota(
        namaKabupaten,
        provinsiTerpilih.kode,
      );

      kabupatenTerpilih =
        daftarKabupaten.find(
          (item) => item.nama.toUpperCase() === namaKabupaten.toUpperCase(),
        ) || null;

      kabupatenInfo.textContent = kabupatenTerpilih
        ? "Kabupaten/kota terpilih."
        : "Data lama dipertahankan. Periksa kembali kabupaten/kota.";
    } else {
      kabupatenInfo.textContent =
        "Data lama dipertahankan. Dataset autocomplete provinsi ini belum tersedia.";
    }

    perbaruiAlamat();
  }

  function tutupOptions(container) {
    container.classList.add("hidden");
    container.replaceChildren();
  }

  function tampilkanOptions(container, daftar, saatPilih) {
    container.replaceChildren();

    if (!daftar.length) {
      const empty = document.createElement("div");
      empty.className = "autocomplete-empty";
      empty.textContent = "Wilayah tidak ditemukan.";

      container.appendChild(empty);
      container.classList.remove("hidden");
      return;
    }

    daftar.forEach((wilayah) => {
      const button = document.createElement("button");

      button.type = "button";
      button.className = "autocomplete-option";
      button.textContent = wilayah.nama;

      button.addEventListener("click", () => {
        saatPilih(wilayah);
        tutupOptions(container);
        perbaruiAlamat();
      });

      container.appendChild(button);
    });

    container.classList.remove("hidden");
  }

  /* =====================================
     SUSUN ALAMAT GABUNGAN
  ===================================== */

  /* =====================================
     SUSUN ALAMAT GABUNGAN
  ===================================== */

  function perbaruiAlamat() {
    alamatHidden.value = [
      kelurahanInput.value.trim(),
      kecamatanInput.value.trim(),
      rtInput.value.trim() ? `RT ${rtInput.value.trim()}` : "",
      rwInput.value.trim() ? `RW ${rwInput.value.trim()}` : "",
      kabupatenInput.value.trim(),
      provinsiInput.value.trim(),
    ]
      .filter(Boolean)
      .join(", ")
      .toUpperCase();
  }

  /* =====================================
     PILIH PROVINSI
  ===================================== */

  function pilihProvinsi(wilayah) {
    provinsiTerpilih = wilayah;
    kabupatenTerpilih = null;

    provinsiInput.value = wilayah.nama;

    kabupatenInput.value = "";
    kabupatenInput.disabled = false;
    kabupatenInput.placeholder = "Ketik kabupaten/kota...";

    kabupatenInfo.textContent =
      wilayah.kode === "35"
        ? "Pilih kabupaten/kota dari saran yang tersedia."
        : "Dataset kabupaten/kota belum tersedia untuk provinsi ini. Ketik nama secara manual.";

    tutupOptions(provinsiOptions);
    tutupOptions(kabupatenOptions);

    perbaruiAlamat();
  }

  /* =====================================
     AUTOCOMPLETE PROVINSI
  ===================================== */

  provinsiInput.addEventListener("input", () => {
    const query = provinsiInput.value.trim();

    provinsiTerpilih = null;
    kabupatenTerpilih = null;

    kabupatenInput.value = "";
    kabupatenInput.disabled = true;
    kabupatenInput.placeholder = "Pilih provinsi terlebih dahulu";

    kabupatenInfo.textContent = "Pilih provinsi terlebih dahulu.";

    perbaruiAlamat();

    tampilkanOptions(
      provinsiOptions,
      window.WilayahIndonesia.cariProvinsi(query),
      pilihProvinsi,
    );
  });

  provinsiInput.addEventListener("focus", () => {
    tampilkanOptions(
      provinsiOptions,
      window.WilayahIndonesia.cariProvinsi(provinsiInput.value),
      pilihProvinsi,
    );
  });

  /* =====================================
     AUTOCOMPLETE KABUPATEN / KOTA
  ===================================== */

  function cariKabupatenKota() {
    if (!provinsiTerpilih) {
      tutupOptions(kabupatenOptions);
      return;
    }

    // Dataset autocomplete kabupaten/kota yang tersedia
    // saat ini hanya mencakup Provinsi Jawa Timur (kode 35).
    if (provinsiTerpilih.kode !== "35") {
      tutupOptions(kabupatenOptions);
      kabupatenInfo.textContent = "Ketik nama kabupaten/kota secara manual.";
      return;
    }

    tampilkanOptions(
      kabupatenOptions,
      window.WilayahIndonesia.cariKabupatenKota(
        kabupatenInput.value,
        provinsiTerpilih.kode,
      ),
      (wilayah) => {
        kabupatenTerpilih = wilayah;
        kabupatenInput.value = wilayah.nama;
        kabupatenInfo.textContent = "Kabupaten/kota terpilih.";
      },
    );
  }

  kabupatenInput.addEventListener("input", () => {
    kabupatenTerpilih = null;
    perbaruiAlamat();
    cariKabupatenKota();
  });

  kabupatenInput.addEventListener("focus", () => {
    cariKabupatenKota();
  });

  /* =====================================
     INPUT KECAMATAN, KELURAHAN, RT, RW
  ===================================== */

  [kecamatanInput, kelurahanInput, rtInput, rwInput].forEach((input) => {
    input.addEventListener("input", perbaruiAlamat);
  });

  /* =====================================
     TUTUP SARAN SAAT KLIK DI LUAR
  ===================================== */

  document.addEventListener("click", (event) => {
    if (
      !provinsiOptions.contains(event.target) &&
      event.target !== provinsiInput
    ) {
      tutupOptions(provinsiOptions);
    }

    if (
      !kabupatenOptions.contains(event.target) &&
      event.target !== kabupatenInput
    ) {
      tutupOptions(kabupatenOptions);
    }
  });

  /* =====================================
     PASTIKAN ALAMAT TERBARU SEBELUM SUBMIT
  ===================================== */

  const candidateForm = alamatHidden.form;

  if (candidateForm) {
    candidateForm.addEventListener("submit", () => {
      perbaruiAlamat();
    });
  }

  perbaruiAlamat();
  window.pulihkanWilayahCalon = pulihkanWilayahCalon;
}

/* =========================================
   AUTOCOMPLETE ALAMAT KELUARGA
   BAPAK / IBU / WALI
========================================= */

function initAlamatKeluarga() {
  if (!window.WilayahIndonesia) {
    console.error("Dataset WilayahIndonesia belum dimuat.");
    return;
  }

  const wilayah = window.WilayahIndonesia;

  ["BAPAK", "IBU", "WALI"].forEach((jenis) => {
    const suffix = jenis.toLowerCase();

    const provinsiInput = document.getElementById(`provinsi-${suffix}`);
    const provinsiOptions = document.getElementById(
      `provinsi-${suffix}-options`,
    );

    const kabupatenInput = document.getElementById(`kabupaten-${suffix}`);
    const kabupatenOptions = document.getElementById(
      `kabupaten-${suffix}-options`,
    );
    const info = document.getElementById(`kabupaten-${suffix}-info`);

    const kecamatan = document.getElementById(`kecamatan-${suffix}`);

    const kelurahan = document.getElementById(`kelurahan-${suffix}`);
    const rt = document.getElementById(`rt-${suffix}`);
    const rw = document.getElementById(`rw-${suffix}`);

    const output = document.querySelector(`[name="ALAMAT_${jenis}"]`);

    const elemenAlamat = {
      provinsiInput,
      provinsiOptions,
      kabupatenInput,
      kabupatenOptions,
      info,
      kecamatan,
      kelurahan,
      rt,
      rw,
      output,
    };

    const elemenHilang = Object.entries(elemenAlamat)
      .filter(([, element]) => !element)
      .map(([nama]) => nama);

    if (elemenHilang.length > 0) {
      console.warn(`Elemen alamat ${jenis} tidak ditemukan:`, elemenHilang);
      return;
    }

    let provinsiTerpilih = null;
    let kabupatenTerpilih = null;

    // =====================================
    // TUTUP AUTOCOMPLETE
    // =====================================

    function tutup(container) {
      container.classList.add("hidden");
      container.replaceChildren();
    }

    // =====================================
    // TAMPILKAN AUTOCOMPLETE
    // =====================================

    function tampilkan(container, daftar, saatPilih) {
      container.replaceChildren();

      if (!daftar || daftar.length === 0) {
        const empty = document.createElement("div");

        empty.className = "autocomplete-empty";
        empty.textContent = "Wilayah tidak ditemukan.";

        container.appendChild(empty);
        container.classList.remove("hidden");
        return;
      }

      daftar.forEach((item) => {
        const button = document.createElement("button");

        button.type = "button";
        button.className = "autocomplete-option";
        button.textContent = item.nama;

        button.addEventListener("click", () => {
          saatPilih(item);
          tutup(container);
          perbaruiAlamat();
        });

        container.appendChild(button);
      });

      container.classList.remove("hidden");
    }

    // =====================================
    // SUSUN ALAMAT GABUNGAN
    // =====================================

    function perbaruiAlamat() {
      output.value = [
        kelurahan.value.trim(),
        kecamatan.value.trim(),
        rt.value.trim() ? `RT ${rt.value.trim()}` : "",
        rw.value.trim() ? `RW ${rw.value.trim()}` : "",
        kabupatenInput.value.trim(),
        provinsiInput.value.trim(),
      ]
        .filter(Boolean)
        .join(", ")
        .toUpperCase();
    }

    // =====================================
    // PILIH PROVINSI
    // =====================================

    function pilihProvinsi(item) {
      provinsiTerpilih = item;
      kabupatenTerpilih = null;

      provinsiInput.value = item.nama;

      kabupatenInput.value = "";
      kabupatenInput.disabled = false;
      kabupatenInput.placeholder = "Ketik kabupaten/kota...";

      info.textContent =
        item.kode === "35"
          ? "Pilih kabupaten/kota dari saran yang tersedia."
          : "Dataset kabupaten/kota belum tersedia untuk provinsi ini. Ketik nama secara manual.";

      tutup(provinsiOptions);
      tutup(kabupatenOptions);

      perbaruiAlamat();
    }

    // =====================================
    // AUTOCOMPLETE PROVINSI
    // =====================================

    function cariProvinsi() {
      tampilkan(
        provinsiOptions,
        wilayah.cariProvinsi(provinsiInput.value.trim()),
        pilihProvinsi,
      );
    }

    provinsiInput.addEventListener("focus", cariProvinsi);

    provinsiInput.addEventListener("input", () => {
      // Reset provinsi terpilih ketika teks diedit.
      provinsiTerpilih = null;
      kabupatenTerpilih = null;

      kabupatenInput.value = "";
      kabupatenInput.disabled = true;
      kabupatenInput.placeholder = "Pilih provinsi terlebih dahulu";

      info.textContent = "Pilih provinsi terlebih dahulu.";

      tutup(kabupatenOptions);
      perbaruiAlamat();
      cariProvinsi();
    });

    // =====================================
    // AUTOCOMPLETE KABUPATEN / KOTA
    // =====================================

    function cariKabupaten() {
      if (!provinsiTerpilih) {
        tutup(kabupatenOptions);
        info.textContent = "Pilih provinsi terlebih dahulu.";
        return;
      }

      // Dataset kabupaten/kota yang tersedia:
      // Provinsi Jawa Timur, kode 35.
      if (provinsiTerpilih.kode !== "35") {
        tutup(kabupatenOptions);
        info.textContent = "Ketik nama kabupaten/kota secara manual.";
        return;
      }

      tampilkan(
        kabupatenOptions,
        wilayah.cariKabupatenKota(
          kabupatenInput.value.trim(),
          provinsiTerpilih.kode,
        ),
        (item) => {
          kabupatenTerpilih = item;
          kabupatenInput.value = item.nama;

          info.textContent = "Kabupaten/kota terpilih.";
          tutup(kabupatenOptions);
        },
      );
    }

    kabupatenInput.addEventListener("focus", () => {
      if (!provinsiTerpilih) return;
      cariKabupaten();
    });

    kabupatenInput.addEventListener("input", () => {
      kabupatenTerpilih = null;

      perbaruiAlamat();

      if (!provinsiTerpilih) {
        tutup(kabupatenOptions);
        info.textContent = "Pilih provinsi terlebih dahulu.";
        return;
      }

      if (provinsiTerpilih.kode !== "35") {
        tutup(kabupatenOptions);
        info.textContent = "Ketik nama kabupaten/kota secara manual.";
        return;
      }

      cariKabupaten();
    });

    // =====================================
    // INPUT DETAIL ALAMAT, RT, DAN RW
    // =====================================

    [kecamatan, kelurahan, rt, rw].forEach((input) => {
      input.addEventListener("input", perbaruiAlamat);
    });

    // =====================================
    // TUTUP SARAN SAAT KLIK DI LUAR
    // =====================================

    document.addEventListener("click", (event) => {
      if (
        !provinsiOptions.contains(event.target) &&
        event.target !== provinsiInput
      ) {
        tutup(provinsiOptions);
      }

      if (
        !kabupatenOptions.contains(event.target) &&
        event.target !== kabupatenInput
      ) {
        tutup(kabupatenOptions);
      }
    });

    // =====================================
    // INISIALISASI AWAL — DUKUNG MODE EDIT
    // =====================================

    const namaProvinsiAwal = provinsiInput.value.trim();
    const namaKabupatenAwal = kabupatenInput.value.trim();

    if (namaProvinsiAwal) {
      const daftarProvinsi = wilayah.cariProvinsi(namaProvinsiAwal);

      const provinsiCocok = daftarProvinsi.find(
        (item) => item.nama.toLowerCase() === namaProvinsiAwal.toLowerCase(),
      );

      if (provinsiCocok) {
        provinsiTerpilih = provinsiCocok;
        kabupatenInput.disabled = false;
        kabupatenInput.placeholder = "Ketik kabupaten/kota...";

        info.textContent =
          provinsiCocok.kode === "35"
            ? "Pilih kabupaten/kota dari saran yang tersedia."
            : "Ketik nama kabupaten/kota secara manual.";

        // Pulihkan kabupaten/kota yang sudah tersimpan.
        if (namaKabupatenAwal) {
          if (provinsiCocok.kode === "35") {
            const daftarKabupaten = wilayah.cariKabupatenKota(
              namaKabupatenAwal,
              provinsiCocok.kode,
            );

            const kabupatenCocok = daftarKabupaten.find(
              (item) =>
                item.nama.toLowerCase() === namaKabupatenAwal.toLowerCase(),
            );

            if (kabupatenCocok) {
              kabupatenTerpilih = kabupatenCocok;
              kabupatenInput.value = kabupatenCocok.nama;
              info.textContent = "Kabupaten/kota terpilih.";
            }
          } else {
            // Untuk provinsi yang belum ada dalam dataset,
            // pertahankan kabupaten/kota dari data lama.
            kabupatenInput.value = namaKabupatenAwal;
          }
        }
      }
    }

    if (!provinsiTerpilih) {
      kabupatenInput.disabled = true;
      kabupatenInput.placeholder = "Pilih provinsi terlebih dahulu";
      info.textContent = "Pilih provinsi terlebih dahulu.";
    }

    // =====================================
    // RESTORE WILAYAH — MODE EDIT
    // =====================================

    function pulihkanWilayah(provinsi, kabupaten) {
      const namaProvinsi = String(provinsi || "").trim();
      const namaKabupaten = String(kabupaten || "").trim();

      provinsiInput.value = namaProvinsi;
      kabupatenInput.value = namaKabupaten;

      provinsiTerpilih = null;
      kabupatenTerpilih = null;

      const daftarProvinsi = wilayah.cariProvinsi(namaProvinsi);

      const provinsiCocok = daftarProvinsi.find(
        (item) => item.nama.toLowerCase() === namaProvinsi.toLowerCase(),
      );

      if (provinsiCocok) {
        provinsiTerpilih = provinsiCocok;
        kabupatenInput.disabled = false;
        kabupatenInput.placeholder = "Ketik kabupaten/kota...";

        if (provinsiCocok.kode === "35") {
          const daftarKabupaten = wilayah.cariKabupatenKota(
            namaKabupaten,
            provinsiCocok.kode,
          );

          const kabupatenCocok = daftarKabupaten.find(
            (item) => item.nama.toLowerCase() === namaKabupaten.toLowerCase(),
          );

          if (kabupatenCocok) {
            kabupatenTerpilih = kabupatenCocok;
            kabupatenInput.value = kabupatenCocok.nama;
          }
        }

        info.textContent =
          provinsiCocok.kode === "35"
            ? "Kabupaten/kota terpilih."
            : "Ketik nama kabupaten/kota secara manual.";
      } else {
        kabupatenInput.disabled = true;
        kabupatenInput.placeholder = "Pilih provinsi terlebih dahulu";
        info.textContent = "Pilih provinsi terlebih dahulu.";
      }

      tutup(provinsiOptions);
      tutup(kabupatenOptions);
      perbaruiAlamat();
    }

    // Daftarkan fungsi untuk masing-masing anggota keluarga.
    window.pulihkanWilayahKeluarga = window.pulihkanWilayahKeluarga || {};

    window.pulihkanWilayahKeluarga[jenis] = pulihkanWilayah;

    // Inisialisasi alamat gabungan.
    perbaruiAlamat();
  });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initAlamatKeluarga);
} else {
  initAlamatKeluarga();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initAlamatCalon);
} else {
  initAlamatCalon();
}

function showToast(message, error = false) {
  const toast = document.getElementById("toast");
  toast.textContent = message;
  toast.classList.toggle("error", error);
  toast.classList.remove("hidden");
  setTimeout(() => toast.classList.add("hidden"), 5000);
}

/* =========================================
   HALAMAN PENDAFTARAN BERHASIL
========================================= */

function showRegistrationSuccess(result) {
  const registrationData = result.data || result;

  const nomorPendaftaran =
    registrationData.nomor_pendaftaran || "Belum tersedia";

  const namaCalon = registrationData.nama_lengkap || "Nama tidak tersedia";

  const successPage = document.createElement("section");
  successPage.id = "registration-success-page";
  successPage.className = "registration-success-page";

  successPage.innerHTML = `
    <div class="success-icon" aria-hidden="true">✓</div>

    <h2>Selamat Datang!</h2>

    <p class="success-message">
      Pendaftaran berhasil disimpan ke database.
      Simpan nomor pendaftaran berikut untuk referensi.
    </p>

    <div class="success-badge">
      Pendaftaran Berhasil
    </div>

    <div class="success-number">
      <span>NOMOR PENDAFTARAN</span>
      <strong id="success-registration-number"></strong>
    </div> 

    <div class="success-id">
      <span>NAMA CALON</span>
      <strong id="success-candidate-name"></strong>
    </div>

    
    <div class="success-reminder">
      <strong>📌 Penting! Simpan Nomor Pendaftaran Anda</strong>
      <p>
        Simpan dan ingat nomor pendaftaran di atas. Gunakan nomor
        tersebut untuk mencari kembali dan memperbarui data
        pendaftaran Anda di kemudian hari.
      </p>
      <small>
        Jangan sampai nomor pendaftaran Anda hilang.
      </small>
    </div>


    <button type="button" id="new-registration-btn">
      + Pendaftaran Baru
    </button>
  `;

  // Hindari membuat panel sukses ganda.
  document.getElementById("registration-success-page")?.remove();

  registrationFormCard.after(successPage);

  document.getElementById("success-registration-number").textContent =
    nomorPendaftaran;

  document.getElementById("success-candidate-name").textContent = namaCalon;

  // Sembunyikan formulir, tetap pada halaman yang sama.
  registrationIntro.hidden = true;
  registrationFormCard.hidden = true;
  successPage.hidden = false;

  document
    .getElementById("new-registration-btn")
    .addEventListener("click", () => {
      // Hapus tampilan sukses.
      successPage.remove();

      // Reset data formulir.
      form.reset();

      document.querySelectorAll("[data-score]").forEach((input) => {
        input.value = "";
      });

      state.step = 0;
      state.rapor = {};
      state.editMode = false;
      state.editRegistration = null;

      // Reset kondisi dan tampilan formulir.
      alertBox.classList.add("hidden");
      document.getElementById("save-status").textContent = "Belum disimpan";

      updateConditionals();
      showStep(0);

      // Sembunyikan formulir.
      registrationIntro.hidden = true;
      registrationFormCard.hidden = true;

      // Kembali ke halaman awal.
      const welcomePage = document.getElementById("welcome-page");

      if (welcomePage) {
        welcomePage.hidden = false;
      }

      // Bersihkan nomor registrasi dan pesan pencarian.
      const registrationInput = document.getElementById(
        "login-nomor-registrasi",
      );

      if (registrationInput) {
        registrationInput.value = "";
      }

      const registrationMessage = document.getElementById(
        "login-registration-message",
      );

      if (registrationMessage) {
        registrationMessage.textContent = "";
      }

      window.scrollTo({ top: 0, behavior: "smooth" });
    });

  window.scrollTo({ top: 0, behavior: "smooth" });
}

async function saveCandidate(data) {
  if (!API_URL) {
    showToast("URL Apps Script belum dipasang. Isi API_URL di app.js.", true);
    return;
  }

  const saveBtn = document.getElementById("save-btn");
  const saveStatus = document.getElementById("save-status");
  const isEdit = state.editMode === true;

  saveBtn.disabled = true;
  saveBtn.textContent = isEdit ? "Menyimpan perubahan..." : "Menyimpan...";
  saveStatus.textContent = isEdit ? "Memperbarui data..." : "Mengirim data...";

  try {
    const payload = isEdit
      ? {
          action: "updateCandidate",
          ID_CALON: state.editRegistration.ID_CALON,
          ID_PENDAFTARAN: state.editRegistration.ID_PENDAFTARAN,
          NOMOR_PENDAFTARAN: state.editRegistration.NOMOR_PENDAFTARAN,
          data,
        }
      : {
          action: "createCandidate",
          data,
        };

    const res = await fetch(API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "text/plain;charset=utf-8",
      },
      body: JSON.stringify(payload),
    });

    const result = await res.json();

    if (!res.ok || !result.ok) {
      throw new Error(
        result.error?.message ||
          result.error ||
          result.message ||
          (isEdit ? "Pembaruan data gagal." : "Penyimpanan gagal."),
      );
    }

    saveStatus.textContent = isEdit ? "Perubahan tersimpan" : "Tersimpan";

    showRegistrationSuccess(result);

    showToast(
      isEdit
        ? "Perubahan pendaftaran berhasil disimpan."
        : "Pendaftaran berhasil disimpan.",
    );
  } catch (err) {
    console.error("Penyimpanan pendaftaran gagal:", err);

    showToast(err.message || "Tidak dapat menghubungi backend.", true);

    saveStatus.textContent = "Belum tersimpan";
  } finally {
    saveBtn.disabled = false;
    saveBtn.textContent = state.editMode
      ? "Simpan Perubahan"
      : "Simpan pendaftaran";
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

/* =========================================
   WELCOME PAGE
========================================= */

const welcomePage = document.getElementById("welcome-page");
const registrationIntro = document.getElementById("registration-intro");
const registrationFormCard = document.getElementById("registration-form-card");
const startRegistrationBtn = document.getElementById("start-registration-btn");

let registrationInitialized = false;

startRegistrationBtn.addEventListener("click", async () => {
  if (registrationInitialized) return;

  startRegistrationBtn.disabled = true;
  startRegistrationBtn.textContent = "Menyiapkan formulir...";

  try {
    console.log("[Pendaftaran] Mulai persiapan formulir");

    buildYears();
    console.log("[Pendaftaran] buildYears berhasil");

    buildRapor();
    console.log("[Pendaftaran] buildRapor berhasil");

    await loadReferences();
    console.log("[Pendaftaran] loadReferences berhasil");

    updateConditionals();
    showStep(0);

    welcomePage.hidden = true;
    registrationIntro.hidden = false;
    registrationFormCard.hidden = false;

    registrationInitialized = true;
    console.log("[Pendaftaran] Formulir siap");
  } catch (error) {
    console.error("[Pendaftaran] Gagal menyiapkan formulir:", error);

    startRegistrationBtn.disabled = false;
    startRegistrationBtn.innerHTML = "Coba Lagi <span>→</span>";

    showToast("Formulir belum berhasil disiapkan. Silakan coba lagi.", true);
  }
});

function pulihkanWilayahKeluarga() {
  if (!window.WilayahIndonesia) {
    console.error("Dataset WilayahIndonesia belum dimuat.");
    return;
  }

  ["BAPAK", "IBU", "WALI"].forEach((jenis) => {
    const suffix = jenis.toLowerCase();
    const provinsiInput = document.getElementById(`provinsi-${suffix}`);
    const kabupatenInput = document.getElementById(`kabupaten-${suffix}`);

    if (!provinsiInput || !kabupatenInput) return;

    const namaProvinsi = provinsiInput.value.trim();
    const namaKabupaten = kabupatenInput.value.trim();

    if (!namaProvinsi) {
      kabupatenInput.disabled = true;
      return;
    }

    const daftarProvinsi = window.WilayahIndonesia.cariProvinsi(namaProvinsi);

    const provinsiCocok = daftarProvinsi.find(
      (item) => item.nama.toLowerCase() === namaProvinsi.toLowerCase(),
    );

    if (provinsiCocok) {
      kabupatenInput.disabled = false;
      kabupatenInput.placeholder = "Ketik kabupaten/kota...";

      // Pertahankan nilai lama; jangan kosongkan kabupaten saat edit.
      kabupatenInput.value = namaKabupaten;
    }
  });
}
