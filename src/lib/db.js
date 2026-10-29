// Các thao tác Firestore dùng chung
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
  limit as qLimit,
  serverTimestamp,
  writeBatch,
  increment,
  deleteDoc,
} from 'firebase/firestore';
import { db } from '../firebase.js';
import { periodFields, todayISO } from './utils.js';
import { BANK_CRITERION, DEFAULT_QUESTION_POINTS } from './constants.js';

export const col = (name) => collection(db, name);
export const ref = (name, id) => doc(db, name, id);
export const listOf = (snap) => snap.docs.map((d) => ({ id: d.id, ...d.data() }));

export async function fetchWhere(name, filters = [], max) {
  const cons = filters.filter(([, , v]) => v !== '' && v !== undefined && v !== null).map(([f, op, v]) => where(f, op, v));
  if (max) cons.push(qLimit(max));
  return listOf(await getDocs(query(col(name), ...cons)));
}

export async function fetchByIds(name, ids) {
  const snaps = await Promise.all([...new Set(ids)].map((id) => getDoc(ref(name, id))));
  const map = {};
  snaps.forEach((s) => {
    if (s.exists()) map[s.id] = { id: s.id, ...s.data() };
  });
  return map;
}

// ----- Duyệt câu hỏi: cập nhật trạng thái + cộng/trừ điểm thi đua vào bản ghi tổng hợp tháng -----
// Điểm ngân hàng câu hỏi gom theo người + tháng (records/nh_{uid}_{yyyy-mm}) để bảng xếp hạng đọc ít dữ liệu.
function bankRecordId(uid, month) {
  return `nh_${uid}_${month}`;
}

export async function reviewQuestions(questions, decision, reviewer, settings, note = '') {
  const pts = settings?.questionPoints || DEFAULT_QUESTION_POINTS;
  const today = todayISO();
  const p = periodFields(today);
  // Chia nhỏ batch (tối đa 500 thao tác/batch)
  for (let i = 0; i < questions.length; i += 200) {
    const batch = writeBatch(db);
    const deltas = new Map(); // gộp điểm theo bản ghi tổng hợp: rid → { points, count, author }
    const addDelta = (uid, name, month, points, count) => {
      const rid = bankRecordId(uid, month);
      const d = deltas.get(rid) || { points: 0, count: 0, uid, name, month };
      d.points += points;
      d.count += count;
      deltas.set(rid, d);
    };
    for (const q of questions.slice(i, i + 200)) {
      const wasApproved = q.status === 'approved';
      const update = {
        status: decision,
        reviewNote: decision === 'rejected' ? note : '',
        reviewedBy: reviewer.uid,
        reviewedByName: reviewer.name,
        reviewedAt: serverTimestamp(),
      };
      if (decision === 'approved' && !wasApproved) {
        const points = Number(pts[q.level] ?? 1);
        update.points = points;
        update.approvedMonth = p.month;
        addDelta(q.authorId, q.authorName, p.month, points, 1);
      }
      if (decision !== 'approved' && wasApproved && q.approvedMonth) {
        addDelta(q.authorId, q.authorName, q.approvedMonth, -Number(q.points ?? pts[q.level] ?? 1), -1);
        update.points = 0;
        update.approvedMonth = '';
      }
      batch.update(ref('questions', q.id), update);
    }
    for (const [rid, d] of deltas) {
      const [y, m] = d.month.split('-');
      batch.set(
        ref('records', rid),
        {
          category: BANK_CRITERION.id,
          userId: d.uid,
          userName: d.name || '',
          title: `Câu hỏi được duyệt vào ngân hàng – tháng ${Number(m)}/${y}`,
          ...periodFields(`${d.month}-01`),
          status: 'approved',
          createdBy: reviewer.uid,
          createdByName: reviewer.name,
          points: increment(d.points),
          count: increment(d.count),
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
    }
    await batch.commit();
  }
}

export async function deleteQuestion(q) {
  if (q.status === 'approved' && q.approvedMonth) {
    const batch = writeBatch(db);
    batch.set(
      ref('records', bankRecordId(q.authorId, q.approvedMonth)),
      { points: increment(-Number(q.points || 0)), count: increment(-1), updatedAt: serverTimestamp() },
      { merge: true }
    );
    batch.delete(ref('questions', q.id));
    await batch.commit();
  } else {
    await deleteDoc(ref('questions', q.id));
  }
}

// Bộ nhớ tạm trong phiên làm việc, tránh đọc lại khi chuyển trang
const memo = new Map();
export async function cached(key, loader, ttlMs = 5 * 60 * 1000) {
  const hit = memo.get(key);
  if (hit && Date.now() - hit.t < ttlMs) return hit.v;
  const v = await loader();
  memo.set(key, { v, t: Date.now() });
  return v;
}
export const invalidate = (prefix) => {
  for (const k of memo.keys()) if (k.startsWith(prefix)) memo.delete(k);
};
