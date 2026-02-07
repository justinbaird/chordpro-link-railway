/**
 * Persistent file storage using IndexedDB
 * Stores ChordPro file contents locally for persistence across sessions
 */

const DB_NAME = 'chordpro-files';
const DB_VERSION = 1;
const STORE_NAME = 'files';

interface FileRecord {
  id: string;
  sessionId: string;
  filename: string;
  title: string;
  content: string;
  uploadedAt: number;
}

let db: IDBDatabase | null = null;

function openDB(): Promise<IDBDatabase> {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('IndexedDB not available'));
  }

  if (db) {
    return Promise.resolve(db);
  }

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      db = request.result;
      resolve(db);
    };

    request.onupgradeneeded = (event) => {
      const database = (event.target as IDBOpenDBRequest).result;
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        const store = database.createObjectStore(STORE_NAME, { keyPath: 'id' });
        store.createIndex('sessionId', 'sessionId', { unique: false });
        store.createIndex('uploadedAt', 'uploadedAt', { unique: false });
      }
    };
  });
}

export async function storeFile(
  id: string,
  sessionId: string,
  filename: string,
  title: string,
  content: string
): Promise<void> {
  const database = await openDB();
  const transaction = database.transaction([STORE_NAME], 'readwrite');
  const store = transaction.objectStore(STORE_NAME);

  const record: FileRecord = {
    id,
    sessionId,
    filename,
    title,
    content,
    uploadedAt: Date.now(),
  };

  return new Promise((resolve, reject) => {
    const request = store.put(record);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

export async function getFile(id: string): Promise<FileRecord | null> {
  const database = await openDB();
  const transaction = database.transaction([STORE_NAME], 'readonly');
  const store = transaction.objectStore(STORE_NAME);

  return new Promise((resolve, reject) => {
    const request = store.get(id);
    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error);
  });
}

export async function getFilesBySession(sessionId: string): Promise<FileRecord[]> {
  const database = await openDB();
  const transaction = database.transaction([STORE_NAME], 'readonly');
  const store = transaction.objectStore(STORE_NAME);
  const index = store.index('sessionId');

  return new Promise((resolve, reject) => {
    const request = index.getAll(sessionId);
    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => reject(request.error);
  });
}

export async function deleteFile(id: string): Promise<void> {
  const database = await openDB();
  const transaction = database.transaction([STORE_NAME], 'readwrite');
  const store = transaction.objectStore(STORE_NAME);

  return new Promise((resolve, reject) => {
    const request = store.delete(id);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

export async function deleteFilesBySession(sessionId: string): Promise<void> {
  const database = await openDB();
  const transaction = database.transaction([STORE_NAME], 'readwrite');
  const store = transaction.objectStore(STORE_NAME);
  const index = store.index('sessionId');

  return new Promise((resolve, reject) => {
    const request = index.openCursor(IDBKeyRange.only(sessionId));
    request.onsuccess = (event) => {
      const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result;
      if (cursor) {
        cursor.delete();
        cursor.continue();
      } else {
        resolve();
      }
    };
    request.onerror = () => reject(request.error);
  });
}

export async function migrateFilesToNewSession(oldSessionId: string, newSessionId: string): Promise<void> {
  const database = await openDB();
  const transaction = database.transaction([STORE_NAME], 'readwrite');
  const store = transaction.objectStore(STORE_NAME);
  const index = store.index('sessionId');

  return new Promise((resolve, reject) => {
    const request = index.openCursor(IDBKeyRange.only(oldSessionId));
    request.onsuccess = (event) => {
      const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result;
      if (cursor) {
        const record = cursor.value;
        record.sessionId = newSessionId;
        cursor.update(record);
        cursor.continue();
      } else {
        resolve();
      }
    };
    request.onerror = () => reject(request.error);
  });
}
