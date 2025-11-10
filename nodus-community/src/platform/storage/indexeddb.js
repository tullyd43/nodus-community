// Minimal IndexedDB wrapper for caching grid state
const DB_NAME = "nodus-grid-cache";
const DB_VERSION = 1;
const STORE_NAME = "grids";
const KV_STORE = "kv";

function openDB() {
	return new Promise((resolve, reject) => {
		// Open without specifying a version to avoid VersionError when
		// the on-disk DB has been upgraded by a previous run. We'll
		// bump the version explicitly if we detect missing stores.
		const req = indexedDB.open(DB_NAME);

		req.onupgradeneeded = (e) => {
			const db = e.target.result;
			if (!db.objectStoreNames.contains(STORE_NAME)) {
				db.createObjectStore(STORE_NAME, { keyPath: "gridId" });
			}
			if (!db.objectStoreNames.contains(KV_STORE)) {
				db.createObjectStore(KV_STORE, { keyPath: "key" });
			}
		};

		req.onsuccess = (e) => {
			const db = e.target.result;
			// If a previous version of the DB exists without the needed stores,
			// perform a version bump to create them.
			if (
				!db.objectStoreNames.contains(STORE_NAME) ||
				!db.objectStoreNames.contains(KV_STORE)
			) {
				const newVersion = db.version + 1;
				db.close();
				const req2 = indexedDB.open(DB_NAME, newVersion);
				req2.onupgradeneeded = (ev) => {
					const db2 = ev.target.result;
					if (!db2.objectStoreNames.contains(STORE_NAME)) {
						db2.createObjectStore(STORE_NAME, {
							keyPath: "gridId",
						});
					}
					if (!db2.objectStoreNames.contains(KV_STORE)) {
						db2.createObjectStore(KV_STORE, { keyPath: "key" });
					}
				};
				req2.onsuccess = (ev) => resolve(ev.target.result);
				req2.onerror = (ev) =>
					reject(
						ev.target.error || new Error("IndexedDB upgrade error")
					);
				return;
			}

			resolve(db);
		};

		req.onerror = (e) =>
			reject(e.target.error || new Error("IndexedDB open error"));
	});
}

async function getStore(mode = "readonly") {
	const db = await openDB();
	const tx = db.transaction(STORE_NAME, mode);
	const store = tx.objectStore(STORE_NAME);
	return { db, tx, store };
}

export async function getGrid(gridId) {
	try {
		const { tx, store } = await getStore("readonly");
		return await new Promise((resolve, reject) => {
			const req = store.get(gridId);
			req.onsuccess = () => resolve(req.result || null);
			req.onerror = () =>
				reject(req.error || new Error("getGrid failed"));
		});
	} catch (err) {
		console.warn("[indexeddb] getGrid error:", err);
		return null;
	}
}

export async function getKV(key) {
	try {
		const db = await openDB();
		const tx = db.transaction(KV_STORE, "readonly");
		const store = tx.objectStore(KV_STORE);
		return await new Promise((resolve, reject) => {
			const req = store.get(key);
			req.onsuccess = () => resolve(req.result ? req.result.value : null);
			req.onerror = () => reject(req.error || new Error("getKV failed"));
		});
	} catch (err) {
		console.warn("[indexeddb] getKV error:", err);
		return null;
	}
}

export async function setKV(key, value) {
	try {
		const db = await openDB();
		const tx = db.transaction(KV_STORE, "readwrite");
		const store = tx.objectStore(KV_STORE);
		const record = { key, value, updatedAt: Date.now() };
		return await new Promise((resolve, reject) => {
			const req = store.put(record);
			req.onsuccess = () => resolve(record);
			req.onerror = () => reject(req.error || new Error("setKV failed"));
		});
	} catch (err) {
		console.warn("[indexeddb] setKV error:", err);
		return null;
	}
}

export async function saveGrid(gridId, state) {
	try {
		const { db, tx, store } = await getStore("readwrite");
		const record = {
			gridId,
			state,
			widgets: state.widgets || [],
			updatedAt: Date.now(),
		};

		return await new Promise((resolve, reject) => {
			const req = store.put(record);
			req.onsuccess = () => resolve(record);
			req.onerror = () =>
				reject(req.error || new Error("saveGrid failed"));
		});
	} catch (err) {
		console.warn("[indexeddb] saveGrid error:", err);
		return null;
	}
}

export async function deleteGrid(gridId) {
	try {
		const { db, tx, store } = await getStore("readwrite");
		return await new Promise((resolve, reject) => {
			const req = store.delete(gridId);
			req.onsuccess = () => resolve(true);
			req.onerror = () =>
				reject(req.error || new Error("deleteGrid failed"));
		});
	} catch (err) {
		console.warn("[indexeddb] deleteGrid error:", err);
		return false;
	}
}

export async function getAllGrids() {
	try {
		const { db, tx, store } = await getStore("readonly");
		return await new Promise((resolve, reject) => {
			const req = store.getAll();
			req.onsuccess = () => resolve(req.result || []);
			req.onerror = () =>
				reject(req.error || new Error("getAllGrids failed"));
		});
	} catch (err) {
		console.warn("[indexeddb] getAllGrids error:", err);
		return [];
	}
}

export default { getGrid, saveGrid, deleteGrid, getAllGrids };
