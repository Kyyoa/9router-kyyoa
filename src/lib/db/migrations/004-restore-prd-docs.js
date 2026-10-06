export default {
  version: 4,
  name: "restore prd docs scope",
  up(db) {
    // Fork menghidupkan lagi PRD Writer (lebih baik: + wawancara 3 ronde).
    // Migration 003 pernah prune scope prdDocs — scope itu shared kv, jadi
    // tidak ada DDL yang perlu dikembalikan; cukup no-op agar versi naik
    // dan riwayat migrasi tetap lurus.
    try {
      db.exec(
        "CREATE TABLE IF NOT EXISTS kv(scope TEXT NOT NULL, key TEXT NOT NULL, value TEXT, PRIMARY KEY(scope, key))"
      );
    } catch {}
  },
};
