// Logic trộn đề (thuần JS, không phụ thuộc giao diện)
import { PART_ORDER } from './examExport.js';
import { shuffle } from './utils.js';

// Mã đề: liên tiếp (101, 102…) hoặc ngẫu nhiên 3 chữ số không trùng (132, 209, 357…)
function versionCodes(count, startCode, random) {
  if (!random) return Array.from({ length: count }, (_, i) => String(Number(startCode) + i));
  const set = new Set();
  while (set.size < count) set.add(101 + Math.floor(Math.random() * 899));
  return [...set].sort((a, b) => a - b).map(String);
}

// Sinh các mã đề: trộn thứ tự câu trong từng phần, trộn phương án A–D, trộn thứ tự ý a–d của câu Đúng/Sai
export function makeVersions(questions, { count, startCode, shuffleQuestions, shuffleOptions, shuffleStatements, randomCodes }) {
  const byType = PART_ORDER.map((t) => questions.filter((q) => q.type === t));
  const codes = versionCodes(count, startCode, randomCodes);
  return codes.map((code) => {
    const items = [];
    byType.forEach((list) => {
      const ordered = shuffleQuestions ? shuffle(list) : list;
      ordered.forEach((q) => {
        const perm = (q.type === 'mcq' && shuffleOptions) || (q.type === 'tf' && shuffleStatements) ? shuffle([0, 1, 2, 3]) : [0, 1, 2, 3];
        items.push({ id: q.id, perm });
      });
    });
    return { code, items };
  });
}

// Phân bổ tự động: chia số câu cần lấy của từng mức độ lần lượt cho các chuyên đề còn câu
export function distribute(targets, topics, availableOf) {
  const out = {};
  for (const [level, need] of Object.entries(targets)) {
    let left = Number(need) || 0;
    const caps = topics.map((t) => ({ t, cap: availableOf(t, level), n: 0 }));
    while (left > 0 && caps.some((c) => c.n < c.cap)) {
      for (const c of caps) {
        if (left <= 0) break;
        if (c.n < c.cap) {
          c.n++;
          left--;
        }
      }
    }
    caps.forEach((c) => c.n && (out[`${c.t}|${level}`] = c.n));
    if (left > 0) out.__short = (out.__short || 0) + left;
  }
  return out;
}

