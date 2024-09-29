import React, { useState, useEffect } from 'react';

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
  const [isValid, setIsValid] = useState(false);

  useEffect(() => {
    const wordCount = reason
      .trim()
      .split(/\s+/)
      .filter((word) => word.length > 0).length;
    setIsValid(wordCount >= 2);
  }, [reason]);

  if (!isOpen) return null;

  const commonReasons = ['รถติด', 'ป่วย', 'เหตุสุดวิสัย'];

  const handleSubmit = () => {
    if (isValid) {
      onSubmit(reason);
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full flex justify-center items-center">
      <div className="bg-white p-6 rounded-lg shadow-lg w-full max-w-md">
        <h2 className="text-xl font-semibold mb-4">คุณเข้างานสาย</h2>
        <p className="mb-4">กรุณาระบุเหตุผลการเข้างานสายของคุณ:</p>
        <div className="mb-4">
          {commonReasons.map((reasonText) => (
            <button
              key={reasonText}
              onClick={() => setReason(reasonText)}
              className="mr-2 mb-2 px-3 py-1 bg-gray-200 rounded-full"
            >
              {reasonText}
            </button>
          ))}
        </div>
        <textarea
          className="w-full p-2 border rounded mb-4"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={3}
          placeholder="กรุณาระบุเหตุผล"
        />
        {!isValid && (
          <p className="text-red-500 mb-2">กรุณาใส่เหตุผลเพื่อการพิจารณา</p>
        )}
        <div className="flex justify-end">
          <button
            className="px-4 py-2 bg-gray-200 rounded mr-2"
            onClick={onClose}
          >
            ยกเลิก
          </button>
          <button
            className={`px-4 py-2 ${
              isValid
                ? 'bg-blue-500 text-white'
                : 'bg-gray-300 text-gray-500 cursor-not-allowed'
            } rounded`}
            onClick={handleSubmit}
            disabled={!isValid}
          >
            ยืนยัน
          </button>
        </div>
      </div>
    </div>
  );
};

export default LateReasonModal;
