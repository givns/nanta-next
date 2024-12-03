// components/common/ErrorView.tsx

interface ErrorViewProps {
  error: Error | string;
  onRetry?: () => void;
  onOverride?: (address: string) => void;
}

export const ErrorView: React.FC<ErrorViewProps> = ({
  error,
  onRetry,
  onOverride,
}) => (
  <div className="p-4 text-center">
    <p className="text-red-600 mb-4">
      {typeof error === 'string' ? error : error.message}
    </p>
    {onRetry && (
      <button
        onClick={onRetry}
        className="px-4 py-2 bg-primary text-white rounded hover:bg-primary-dark"
      >
        ลองใหม่อีกครั้ง
      </button>
    )}
    {onOverride && (
      <button
        onClick={() => {
          const address = prompt('กรุณาระบุสถานที่');
          if (address) onOverride(address);
        }}
        className="px-4 py-2 ml-2 bg-gray-500 text-white rounded hover:bg-gray-600"
      >
        ระบุสถานที่เอง
      </button>
    )}
  </div>
);
