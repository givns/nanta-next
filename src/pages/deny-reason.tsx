// pages/deny-reason.tsx

const DenyReasonPage = () => {
  return (
    <div className="container mx-auto p-4">
      <h1 className="text-2xl font-bold mb-4">ระบุเหตุผลในการไม่อนุมัติ</h1>
      <form onSubmit={(e) => e.preventDefault()}>
        <div>
          <label htmlFor="denialReason">Reason for Denial</label>
          <textarea
            className="w-full p-2 border rounded mb-4"
            rows={4}
            placeholder="กรุณาระบุเหตุผล..."
            required
          />
        </div>
        <button
          type="submit"
          className="w-full p-2 bg-red-500 text-white rounded"
        >
          ยืนยัน
        </button>
      </form>
    </div>
  );
};

export default DenyReasonPage;
