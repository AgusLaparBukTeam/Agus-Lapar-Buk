export type AppLanguage = "id" | "en";

export const LANGUAGE_STORAGE_KEY = "gateguard.language";
export const LANGUAGE_CHANGE_EVENT = "gateguard.language.change";

/**
 * Indonesian copy favours warehouse vocabulary people already use. Product names,
 * acronyms, technical protocols, and commonly adopted operational words remain English.
 */
export const terms = {
  id: {
    home: "Beranda",
    overview: "Ringkasan",
    recents: "Terakhir dibuka",
    operations: "Operasional",
    workQueue: "Antrean kerja",
    shipments: "Pengiriman",
    documents: "Dokumen",
    parties: "Pihak terkait",
    products: "Produk & komoditas",
    transport: "Transportasi",
    releaseDecisions: "Keputusan pelepasan",
    assurance: "Jaminan proses",
    documentChecks: "Pemeriksaan dokumen",
    requirements: "Persyaratan",
    assuranceChecks: "Pemeriksaan jaminan",
    exceptions: "Pengecualian",
    partyScreening: "Penyaringan pihak",
    dangerousGoods: "Barang berbahaya",
    observe: "Pemantauan",
    analytics: "Analitik",
    observability: "Observability",
    activityLog: "Log aktivitas",
    integrate: "Integrasi",
    connections: "Koneksi",
    webhooks: "Webhooks",
    processingJobs: "Proses latar belakang",
    governance: "Tata kelola",
    rulePacks: "Paket aturan",
    referenceData: "Data referensi",
    manage: "Kelola",
    workspaceSettings: "Pengaturan ruang kerja",
    people: "Pengguna",
    rolesPermissions: "Peran & izin",
    security: "Keamanan",
    notifications: "Notifikasi",
    organizationWorkspace: "Ruang kerja organisasi",
    search: "Cari",
    searchGateGuard: "Cari di GateGuard",
    searchPlaceholder: "Cari halaman, pengiriman, dokumen...",
    navigate: "Jelajahi GateGuard",
    results: "hasil",
    noResults: "Tidak ada data atau halaman yang cocok.",
    close: "Tutup",
    signOut: "Keluar",
    unread: "belum dibaca",
    noNotifications: "Tidak ada notifikasi operasional baru.",
    language: "Bahasa",
    indonesian: "Bahasa Indonesia",
    english: "English",
    checkShipmentDocuments: "Periksa dokumen pengiriman",
    checkShipmentDescription: "Tambahkan tiga dokumen wajib. GateGuard membandingkan informasi sebelum dokumen dilepas.",
    deliveryOrder: "Surat Jalan",
    packingList: "Daftar kemasan",
    fileTypes: "PDF, JPG, atau PNG",
    documentsReady: "Dokumen siap diperiksa",
    addAllDocuments: "Tambahkan ketiga dokumen untuk melanjutkan",
    uploadCompareReview: "Unggah, baca, bandingkan, lalu tinjau hasilnya.",
    checkingDocuments: "Memeriksa dokumen...",
    checkDocuments: "Periksa dokumen",
    readingDocuments: "Dokumen sedang dibaca dan dibandingkan. Hasil akan tampil setelah pemeriksaan selesai.",
  },
  en: {
    home: "Home",
    overview: "Overview",
    recents: "Recents",
    operations: "Operations",
    workQueue: "Work queue",
    shipments: "Shipments",
    documents: "Documents",
    parties: "Parties",
    products: "Products & commodities",
    transport: "Transport",
    releaseDecisions: "Release decisions",
    assurance: "Assurance",
    documentChecks: "Document checks",
    requirements: "Requirements",
    assuranceChecks: "Assurance checks",
    exceptions: "Exceptions",
    partyScreening: "Party screening",
    dangerousGoods: "Dangerous goods",
    observe: "Observe",
    analytics: "Analytics",
    observability: "Observability",
    activityLog: "Activity log",
    integrate: "Integrate",
    connections: "Connections",
    webhooks: "Webhooks",
    processingJobs: "Processing jobs",
    governance: "Governance",
    rulePacks: "Rule packs",
    referenceData: "Reference data",
    manage: "Manage",
    workspaceSettings: "Workspace settings",
    people: "People",
    rolesPermissions: "Roles & permissions",
    security: "Security",
    notifications: "Notifications",
    organizationWorkspace: "Organization workspace",
    search: "Search",
    searchGateGuard: "Search GateGuard",
    searchPlaceholder: "Search pages, shipments, documents...",
    navigate: "Navigate GateGuard",
    results: "results",
    noResults: "No matching workspace records or pages.",
    close: "Close",
    signOut: "Sign out",
    unread: "unread",
    noNotifications: "No new operational notifications.",
    language: "Language",
    indonesian: "Bahasa Indonesia",
    english: "English",
    checkShipmentDocuments: "Check shipment documents",
    checkShipmentDescription: "Add the three required documents. GateGuard compares the information before release.",
    deliveryOrder: "Delivery order",
    packingList: "Packing list",
    fileTypes: "PDF, JPG, or PNG",
    documentsReady: "Documents are ready",
    addAllDocuments: "Add all three documents to continue",
    uploadCompareReview: "Upload, read, compare, then review.",
    checkingDocuments: "Checking documents...",
    checkDocuments: "Check documents",
    readingDocuments: "We are reading and comparing the documents. The result will appear when the check is complete.",
  },
} as const;

export type LocaleKey = keyof typeof terms.id;

export function languageSnapshot(): AppLanguage {
  if (typeof window === "undefined") return "id";
  return window.localStorage.getItem(LANGUAGE_STORAGE_KEY) === "en" ? "en" : "id";
}

export function setLanguage(language: AppLanguage) {
  window.localStorage.setItem(LANGUAGE_STORAGE_KEY, language);
  window.dispatchEvent(new Event(LANGUAGE_CHANGE_EVENT));
}

export function subscribeToLanguage(callback: () => void) {
  window.addEventListener(LANGUAGE_CHANGE_EVENT, callback);
  return () => window.removeEventListener(LANGUAGE_CHANGE_EVENT, callback);
}

export function translate(language: AppLanguage, key: LocaleKey) {
  return terms[language][key];
}
