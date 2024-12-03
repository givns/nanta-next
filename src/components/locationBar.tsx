// components/LocationBar.tsx

import { useLocationContext } from '@/hooks/useLocationContext';

export function LocationBar() {
  const { data, status, error, isStale, getLocation } = useLocationContext();

  if (status === 'error') {
    return (
      <div className="bg-red-50 p-2 flex justify-between items-center">
        <span className="text-red-700">{error}</span>
        <button
          onClick={() => getLocation({ force: true })}
          className="text-red-600 text-sm"
        >
          ลองใหม่
        </button>
      </div>
    );
  }

  if (isStale) {
    return (
      <div className="bg-yellow-50 p-2 flex justify-between items-center">
        <span className="text-yellow-700">ตำแหน่งอาจไม่เป็นปัจจุบัน</span>
        <button
          onClick={() => getLocation({ force: true })}
          className="text-yellow-600 text-sm"
        >
          รีเฟรช
        </button>
      </div>
    );
  }

  return (
    <div className="bg-gray-50 p-2">
      <span className="text-gray-600">
        {data?.address || 'กำลังระบุตำแหน่ง...'}
      </span>
    </div>
  );
}
