import {team} from './team-client.js?v=2.1.0';
/** Local-first transactional storage. Original attachments are kept as Blobs, never localStorage/base64. */
const DB_NAME = 'activity-log-v1';
let connection;
export const MAX_FILE = 50 * 1024 * 1024;
export const uid = () => crypto.randomUUID();
export function openDB() {
  if (connection) return connection;
  connection = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      db.createObjectStore('records', { keyPath: 'id' });
      db.createObjectStore('files', { keyPath: 'id' });
    };
    req.onsuccess = () => { const db = req.result; db.onversionchange = () => db.close(); resolve(db); };
    req.onerror = () => { connection = null; reject(req.error); };
    req.onblocked = () => { connection = null; reject(new Error('资料库正在升级，请关闭其他打开的本网站标签页后重试。')); };
  });
  return connection;
}
async function read(store, key) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readonly');
    const req = key === undefined ? tx.objectStore(store).getAll() : tx.objectStore(store).get(key);
    req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error);
  });
}
export const localRecords = () => read('records');
export const allRecords = () => team.connected ? team.listRecords() : localRecords();
export const localFile = id => read('files', id);
export const getFile = (id,thumb=false) => team.connected ? team.getFile(id,thumb) : localFile(id);
async function transaction(fn) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(['records','files'], 'readwrite');
    tx.oncomplete = () => { resolve(); window.dispatchEvent(new Event('activity-db-change')); };
    tx.onabort = tx.onerror = () => reject(tx.error || new Error('无法保存，空间可能不足。请先备份资料。'));
    try { fn(tx.objectStore('records'), tx.objectStore('files')); } catch (e) { tx.abort(); reject(e); }
  });
}
export async function saveRecord(record, files = [], removed = [], options = {}) {
  if(!team.connected)throw new Error('共享服务尚未连接；请保留本机草稿后重试。');
  return team.saveRecord(record,files,removed,options);
}
export async function deleteRecord(record,password) {
  if(!team.connected)throw new Error('共享服务尚未连接，未执行删除。');
  return team.deleteRecord(record,password);
}
export function isImage(a) { return /^image\//.test(a.type) || /\.(png|jpe?g|gif|webp|avif|bmp)$/i.test(a.name); }
export function mimeFor(file) {
  const ext = file.name.split('.').pop().toLowerCase();
  return file.type || ({jpg:'image/jpeg',jpeg:'image/jpeg',png:'image/png',webp:'image/webp',gif:'image/gif',avif:'image/avif',pdf:'application/pdf',txt:'text/plain',md:'text/plain',csv:'text/csv',json:'application/json',mp4:'video/mp4',webm:'video/webm',mp3:'audio/mpeg',wav:'audio/wav',svg:'image/svg+xml'}[ext] || 'application/octet-stream');
}
export async function prepareFile(file) {
  if (file.size > MAX_FILE) throw new Error(`「${file.name}」超过单个文件 50 MB 限制。`);
  const type = mimeFor(file), id = uid();
  const data = { id, name: file.name.slice(0, 255), size: file.size, type, blob: file.slice(0, file.size, type), thumbnail: null };
  if (isImage(data)) {
    let bitmap;
    try {
      bitmap = await createImageBitmap(file);
      const scale = Math.min(1, 1200 / Math.max(bitmap.width, bitmap.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(bitmap.width * scale)); canvas.height = Math.max(1, Math.round(bitmap.height * scale));
      canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      data.thumbnail = await new Promise(resolve => canvas.toBlob(resolve, 'image/webp', .86));
    } catch { /* An unsupported image is kept losslessly; the viewer provides an error fallback. */ }
    finally { bitmap?.close(); }
  }
  return data;
}
export const metadata = ({id, name, type, size}) => ({id, name, type, size});
export const blobToData = blob => new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = () => reject(reader.error); reader.readAsDataURL(blob); });
export function dataToBlob(data, type) {
  if (typeof data !== 'string' || !/^data:[^,]*;base64,/.test(data)) throw new Error('备份中含有无效附件。');
  const raw = atob(data.slice(data.indexOf(',') + 1));
  if (raw.length > MAX_FILE) throw new Error('备份附件超过 50 MB 限制。');
  const bytes = new Uint8Array(raw.length); for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return new Blob([bytes], {type});
}
export function validateRecord(r) {
  const str = (x, max) => typeof x === 'string' && x.length <= max;
  if (!r || !str(r.id, 100) || !r.id || !str(r.title,120) || !r.title.trim() || !str(r.work,10000) || !r.work.trim() || !/^\d{4}-\d{2}-\d{2}$/.test(r.date) || !Number.isFinite(Date.parse(r.date)) || new Date(r.date).toISOString().slice(0,10) !== r.date || !Array.isArray(r.people) || !r.people.length || r.people.length > 100 || !r.people.every(p => str(p,100) && p.trim()) || !Array.isArray(r.attachments) || r.attachments.length > 100) throw new Error('备份记录结构无效或字段超限，未导入任何数据。');
  for (const a of r.attachments) if (!a || !str(a.id,100) || !a.id || !str(a.name,255) || !a.name || !str(a.type,150) || !Number.isSafeInteger(a.size) || a.size < 0 || a.size > MAX_FILE) throw new Error('备份附件信息无效。');
  return { id:r.id, title:r.title, work:r.work, date:r.date, people:[...new Set(r.people)], attachments:r.attachments.map(metadata), time:/^\d{2}:\d{2}$/.test(r.time) ? r.time : '', category:str(r.category,50) ? r.category : '其他', location:str(r.location,200) ? r.location : '', notes:str(r.notes,10000) ? r.notes : '', starred:r.starred === true, createdAt:str(r.createdAt,40) ? r.createdAt : new Date().toISOString(), updatedAt:str(r.updatedAt,40) ? r.updatedAt : new Date().toISOString(), ...(typeof r.importFingerprint==='string'?{importFingerprint:r.importFingerprint}:{}) };
}
export async function importBackup(payload) {
  if (!payload || payload.app !== 'Activity-Log' || payload.version !== 1 || !Array.isArray(payload.records) || payload.records.length > 10000 || !Array.isArray(payload.files) || payload.files.length > 20000) throw new Error('不是有效的 Activity Log 完整备份文件。');
  const records = payload.records.map(validateRecord);
  const oldRecordIDs = new Set(), oldFileIDs = new Set();
  for (const r of records) { if (oldRecordIDs.has(r.id)) throw new Error('备份中存在重复记录 ID。'); oldRecordIDs.add(r.id); }
  const fileMap = new Map();
  for (const f of payload.files) { if (!f || typeof f.id !== 'string' || oldFileIDs.has(f.id)) throw new Error('备份附件 ID 无效或重复。'); oldFileIDs.add(f.id); fileMap.set(f.id,f); }
  const restored = [], used = new Set();
  for (const r of records) {
    r.id = uid();
    for (const a of r.attachments) {
      if (used.has(a.id)) throw new Error('多个记录引用了同一个附件 ID，备份结构无效。'); used.add(a.id);
      const f = fileMap.get(a.id); if (!f) throw new Error(`备份缺失附件「${a.name}」，未导入任何数据。`);
      const blob = dataToBlob(f.data, a.type);
      if (blob.size !== a.size) throw new Error(`「${a.name}」文件大小校验失败。`);
      a.id = uid();
      restored.push({...a, blob, thumbnail: null});
    }
  }
  // Merge as independent copies: never overwrite existing records or attachments.
  if(!team.connected)throw new Error('共享服务尚未连接，未导入任何记录。');
  await team.importRecords(records,restored);
  return records.length;
}
