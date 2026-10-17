'use strict';

const SaveSystem = {
    DB_NAME: 'pdl_saves',
    DB_VERSION: 1,
    STORE: 'game_state',
    db: null,
    // The signed-in account this page-load booted with, sanitized for key
    // use (null = signed out / no auth layer). Resolved ONCE in init()
    // from localStorage markers — never from a live network call — so the
    // whole boot is synchronous and consistent. All save slots are
    // namespaced by it: profile_v1, progress_v3 and career_v1 for account
    // A can never leak into account B's session (guest vs email etc.).
    _uid: null,
    // Set to the FIRST account that adopts the pre-auth legacy save. Later
    // accounts (guest, a second email…) must start FRESH, not inherit it.
    _legacyOwner: null,

    async init() {
        this._uid = this.readAuthUidSync();
        try { this._legacyOwner = localStorage.getItem('pdl_legacy_owner') || null; } catch (e) { this._legacyOwner = null; }
        try {
            this.db = await this._openDB();
            if (navigator.storage && navigator.storage.persist) {
                try { await navigator.storage.persist(); } catch (e) {}
            }
        } catch (e) {
            console.warn('IndexedDB unavailable, falling back to localStorage:', e);
            this.db = null;
        }
    },

    /* Reads the persisted Firebase session WITHOUT the auth SDK (the SDK
       scripts load after this file, and init() must stay synchronous).

       Two markers, both written by the sign-in flow itself:
         · 'rla_uid'                  — ours (auth.js, every auth change)
         · 'firebase:authUser:*[DEFAULT]' — the compat SDK's LOCAL
           persistence record (covers sessions created before auth.js
           started writing its own marker).
       The uid is sanitized before it may become part of a storage key. */
    readAuthUidSync() {
        let raw = null;
        try { raw = localStorage.getItem('rla_uid'); } catch (e) { raw = null; }
        if (!raw) {
            try {
                for (let i = 0; i < localStorage.length; i++) {
                    const k = localStorage.key(i);
                    if (k && k.lastIndexOf('firebase:authUser', 0) === 0 && k.slice(-9) === '[DEFAULT]') {
                        try {
                            const v = JSON.parse(localStorage.getItem(k) || 'null');
                            if (v && typeof v.uid === 'string') { raw = v.uid; break; }
                        } catch (e) {}
                    }
                }
            } catch (e) {}
        }
        return this._sanitizeUid(raw);
    },

    _sanitizeUid(raw) {
        const s = String(raw || '').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 64);
        return s.length ? s : null;
    },

    // Storage key for the ACTIVE account's slot. Signed-out / auth-less
    // boots keep the bare legacy keys (100% backward compatible).
    nsKey(key) { return this._uid ? this._uid + '|' + key : key; },

    _openDB() {
        return new Promise((resolve, reject) => {
            if (!window.indexedDB) { reject('IndexedDB not supported'); return; }
            const req = indexedDB.open(this.DB_NAME, this.DB_VERSION);
            req.onupgradeneeded = (e) => {
                const db = e.target.result;
                if (!db.objectStoreNames.contains(this.STORE)) {
                    db.createObjectStore(this.STORE, { keyPath: 'id' });
                }
            };
            req.onsuccess = (e) => resolve(e.target.result);
            req.onerror = (e) => reject(e.target.error);
        });
    },

    async _read(key) {
        if (this.db) {
            try {
                const result = await new Promise((resolve, reject) => {
                    const tx = this.db.transaction(this.STORE, 'readonly');
                    const store = tx.objectStore(this.STORE);
                    const req = store.get(key);
                    req.onsuccess = (e) => resolve(e.target.result ? e.target.result.data : null);
                    req.onerror = (e) => reject(e.target.error);
                });
                if (result !== null && result !== undefined) return result;
            } catch (e) {
                console.warn('IndexedDB load failed, trying localStorage:', e);
            }
        }
        try {
            const raw = localStorage.getItem('pdl_' + key);
            return raw ? JSON.parse(raw) : null;
        } catch (e) { return null; }
    },

    async _write(key, data) {
        const payload = { id: key, data, version: 1, timestamp: Date.now() };
        if (this.db) {
            try {
                return await new Promise((resolve, reject) => {
                    const tx = this.db.transaction(this.STORE, 'readwrite');
                    const store = tx.objectStore(this.STORE);
                    const req = store.put(payload);
                    req.onsuccess = () => resolve(true);
                    req.onerror = (e) => reject(e.target.error);
                });
            } catch (e) {
                console.warn('IndexedDB save failed, using localStorage:', e);
            }
        }
        try {
            localStorage.setItem('pdl_' + key, JSON.stringify(data));
            return true;
        } catch (e) { return false; }
    },

    async load(key) {
        const mine = await this._read(this.nsKey(key));
        if (mine !== null && mine !== undefined) return mine;
        // ONE-TIME LEGACY ADOPTION: the first account ever signed in on a
        // device inherits the pre-auth local save (so linking an account
        // never looks like progress loss). Every LATER account on the same
        // device — a guest, a second driver — starts fresh instead of
        // silently wearing the first account's identity. That inheritance
        // was exactly the "guest logged in with my name and avatar" bug.
        if (!this._uid || this._legacyOwner) return null;
        const legacy = await this._read(key);
        if (legacy === null || legacy === undefined) return null;
        await this._write(this.nsKey(key), legacy);
        try { localStorage.setItem('pdl_legacy_owner', this._uid); } catch (e) {}
        return legacy;
    },

    async save(key, data) {
        return this._write(this.nsKey(key), data);
    },

    async delete(key) {
        const k = this.nsKey(key);
        if (this.db) {
            try {
                await new Promise((resolve, reject) => {
                    const tx = this.db.transaction(this.STORE, 'readwrite');
                    tx.objectStore(this.STORE).delete(k);
                    tx.oncomplete = () => resolve(true);
                    tx.onerror = (e) => reject(e.target.error);
                });
            } catch (e) {}
        }
        try { localStorage.removeItem('pdl_' + k); } catch (e) {}
    }
};
