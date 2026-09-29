/**
 * Backup Self-Check Test
 *
 * Verifies that exportDb -> importDb round-trip preserves apiKeys
 * permissions and createdBy fields.
 *
 * Run with: node src/lib/db/backupSelfCheck.mjs
 */

import { exportDb, importDb, getApiKeys, createApiKey, deleteApiKey } from "./index.js";
import { initDb } from "./index.js";

const TEST_KEY_NAME = "__backup_selfcheck_test__";
const TEST_PERMISSIONS = "read,write,admin";
const TEST_CREATED_BY = "test-user-123";

async function cleanup() {
  const keys = await getApiKeys();
  for (const k of keys) {
    if (k.name === TEST_KEY_NAME) {
      await deleteApiKey(k.id);
    }
  }
}

async function run() {
  await initDb();
  await cleanup();

  // Create test key with specific permissions and createdBy
  const testKey = await createApiKey(TEST_KEY_NAME, "test-machine", {
    tokenLimit: 1000,
    resetInterval: "never",
    allowedModels: "*",
    rpmLimit: 0,
    tpmLimit: 0,
    ipWhitelist: "",
    expiresAt: null,
    systemPrompt: "",
    permissions: TEST_PERMISSIONS,
    createdBy: TEST_CREATED_BY,
  });
  console.log("Created test key:", testKey.id, testKey.key);

  // Export
  const exported = await exportDb({ apiKeys: true });
  const exportedKey = exported.apiKeys.find(k => k.name === TEST_KEY_NAME);
  if (!exportedKey) {
    console.error("FAIL: Exported key not found");
    process.exit(1);
  }
  console.log("Exported key permissions:", exportedKey.permissions);
  console.log("Exported key createdBy:", exportedKey.createdBy);

  if (exportedKey.permissions !== TEST_PERMISSIONS) {
    console.error("FAIL: permissions not preserved in export. Expected:", TEST_PERMISSIONS, "Got:", exportedKey.permissions);
    process.exit(1);
  }
  if (exportedKey.createdBy !== TEST_CREATED_BY) {
    console.error("FAIL: createdBy not preserved in export. Expected:", TEST_CREATED_BY, "Got:", exportedKey.createdBy);
    process.exit(1);
  }

  // Delete the key to simulate fresh import
  await deleteApiKey(testKey.id);

  // Import
  await importDb(exported);

  // Verify imported key
  const importedKeys = await getApiKeys();
  const importedKey = importedKeys.find(k => k.name === TEST_KEY_NAME);
  if (!importedKey) {
    console.error("FAIL: Imported key not found");
    process.exit(1);
  }
  console.log("Imported key permissions:", importedKey.permissions);
  console.log("Imported key createdBy:", importedKey.createdBy);

  if (importedKey.permissions !== TEST_PERMISSIONS) {
    console.error("FAIL: permissions not preserved after import. Expected:", TEST_PERMISSIONS, "Got:", importedKey.permissions);
    process.exit(1);
  }
  if (importedKey.createdBy !== TEST_CREATED_BY) {
    console.error("FAIL: createdBy not preserved after import. Expected:", TEST_CREATED_BY, "Got:", importedKey.createdBy);
    process.exit(1);
  }

  await cleanup();
  console.log("SUCCESS: Backup round-trip preserves permissions and createdBy");
}

run().catch(err => {
  console.error("ERROR:", err);
  process.exit(1);
});