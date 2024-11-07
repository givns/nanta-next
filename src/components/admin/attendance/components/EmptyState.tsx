// components/admin/attendance/components/EmptyState.tsx

import { Users } from 'lucide-react';

export function EmptyState() {
  return (
    <div className="text-center py-12">
      <Users className="mx-auto h-12 w-12 text-gray-400" />
      <h3 className="mt-2 text-sm font-medium text-gray-900">
        No Records Found
      </h3>
      <p className="mt-1 text-sm text-gray-500">
        No attendance records found for the selected filters.
      </p>
    </div>
  );
}
