// components/admin/attendance/components/LoadingState.tsx
import { Loader2 } from 'lucide-react';

export function LoadingState() {
  return (
    <div className="flex justify-center items-center py-8">
      <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
    </div>
  );
}
