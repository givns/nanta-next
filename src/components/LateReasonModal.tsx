// LateReasonModal.tsx
import React, { useState } from 'react';

interface LateReasonModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (reason: string) => void;
}

const LateReasonModal: React.FC<LateReasonModalProps> = ({
  isOpen,
  onClose,
  onSubmit,
}) => {
  const [reason, setReason] = useState('');

  if (!isOpen) return null;

  const handleSubmit = () => {
    onSubmit(reason);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full flex justify-center items-center">
      <div className="bg-white p-6 rounded-lg shadow-lg w-full max-w-md">
        <h2 className="text-xl font-semibold mb-4">
          กรุณาระบุเหตุผลการเข้างานสาย
        </h2>
        <textarea
          className="w-full p-2 border rounded mb-4"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={3}
        />
        <div className="flex justify-end">
          <button
            className="px-4 py-2 bg-gray-200 rounded mr-2"
            onClick={onClose}
          >
            ยกเลิก
          </button>
          <button
            className="px-4 py-2 bg-blue-500 text-white rounded"
            onClick={handleSubmit}
          >
            ยืนยัน
          </button>
        </div>
      </div>
    </div>
  );
};

export default LateReasonModal;
