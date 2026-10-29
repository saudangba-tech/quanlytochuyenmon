import { useCallback, useEffect, useState } from 'react';
import { cached, fetchWhere, invalidate } from './db.js';
import { MEMBER_ROLES } from './constants.js';

// Danh sách thành viên đang hoạt động của tổ (đọc 1 lần / 5 phút)
export function useMembers({ includeAll = false } = {}) {
  const [all, setAll] = useState([]);
  const [loading, setLoading] = useState(true);
  const load = useCallback(async (force = false) => {
    if (force) invalidate('users');
    setLoading(true);
    try {
      const list = await cached('users', () => fetchWhere('users'));
      list.sort((a, b) => (a.name || '').localeCompare(b.name || '', 'vi'));
      setAll(list);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    load();
  }, [load]);
  const members = includeAll ? all : all.filter((u) => MEMBER_ROLES.includes(u.role));
  return { members, loading, reload: () => load(true) };
}
