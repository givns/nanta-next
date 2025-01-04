import React from 'react';
import { AlertCircle, CheckCircle2, Loader2 } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';

interface ProcessingViewProps {
  status: 'idle' | 'loading' | 'success' | 'error';
  message: string;
  details?: string;
  onRetry?: () => void;
  onCancel?: () => void;
}

const ProcessingView: React.FC<ProcessingViewProps> = ({
  status,
  message,
  details,
  onRetry,
  onCancel,
}) => {
  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
      <Card className="w-full max-w-sm bg-white shadow-xl">
        <CardContent className="pt-6">
          <div className="flex flex-col items-center text-center space-y-4">
            {/* Status Icon */}
            <div className="relative">
              {status === 'loading' && (
                <Loader2 className="w-12 h-12 text-primary animate-spin" />
              )}
              {status === 'success' && (
                <div className="animate-scale-up">
                  <CheckCircle2 className="w-12 h-12 text-green-500" />
                </div>
              )}
              {status === 'error' && (
                <div className="animate-bounce">
                  <AlertCircle className="w-12 h-12 text-red-500" />
                </div>
              )}
            </div>

            {/* Message */}
            <div className="space-y-2">
              <h3 className="text-lg font-medium">
                {status === 'loading' && 'กำลังดำเนินการ'}
                {status === 'success' && 'ดำเนินการสำเร็จ'}
                {status === 'error' && 'เกิดข้อผิดพลาด'}
              </h3>
              <p className="text-sm text-gray-500">{message}</p>
              {details && (
                <p className="text-xs text-gray-400 mt-1">{details}</p>
              )}
            </div>

            {/* Actions */}
            <div className="flex gap-3 mt-6 w-full">
              {status === 'error' && onRetry && (
                <button
                  onClick={onRetry}
                  className="flex-1 px-4 py-2 bg-primary text-white rounded-md hover:bg-primary/90 transition-colors"
                >
                  ลองใหม่อีกครั้ง
                </button>
              )}
              {(status === 'error' || status === 'success') && onCancel && (
                <button
                  onClick={onCancel}
                  className="flex-1 px-4 py-2 border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
                >
                  {status === 'success' ? 'ปิด' : 'ยกเลิก'}
                </button>
              )}
            </div>

            {/* Progress Bar for Loading */}
            {status === 'loading' && (
              <div className="w-full h-1 bg-gray-100 rounded-full overflow-hidden">
                <div className="h-full bg-primary animate-progress-indeterminate" />
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

// Add this to your globals.css or app styles
const styles = `
  @keyframes scale-up {
    0% { transform: scale(0.8); opacity: 0; }
    100% { transform: scale(1); opacity: 1; }
  }

  @keyframes progress-indeterminate {
    0% { transform: translateX(-100%); }
    50% { transform: translateX(0); }
    100% { transform: translateX(100%); }
  }

  .animate-scale-up {
    animation: scale-up 0.3s ease-out forwards;
  }

  .animate-progress-indeterminate {
    animation: progress-indeterminate 1.5s infinite ease-in-out;
    width: 50%;
  }
`;

export default ProcessingView;
