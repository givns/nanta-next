interface ProcessingState {
  status: 'idle' | 'loading' | 'success' | 'error';
  message: string;
}

export const renderProcessingView = () => (
  <div className="flex flex-col items-center justify-center p-4">
    {processingState.status === 'loading' && (
      <>
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        <p className="mt-4 text-lg">{processingState.message}</p>
      </>
    )}

    {processingState.status === 'success' && (
      <div className="text-center">
        <div className="text-green-500 mx-auto mb-4">
          <AlertCircle size={32} />
        </div>
        <p className="text-lg font-semibold">{processingState.message}</p>
      </div>
    )}

    {processingState.status === 'error' && (
      <div className="text-center">
        <div className="text-red-500 mx-auto mb-4">
          <AlertCircle size={32} />
        </div>
        <p className="text-lg font-semibold text-red-600">
          {processingState.message}
        </p>
        <button
          onClick={() => setStep('info')}
          className="mt-4 px-4 py-2 bg-primary text-white rounded-md hover:bg-primary-dark"
        >
          ลองใหม่อีกครั้ง
        </button>
      </div>
    )}
  </div>
);
