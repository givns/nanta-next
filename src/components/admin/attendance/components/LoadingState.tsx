import { Loader2 } from 'lucide-react';

export function LoadingState() {
  return (
    <div className="flex justify-center items-center py-8">
      <Loader2 className="h-8 w-8 animate-spin text-gray-500" />
      <span className="ml-2 text-gray-500">Loading...</span>
    </div>
  );
}
