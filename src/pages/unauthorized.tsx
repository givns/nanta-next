// pages/unauthorized.tsx
import { Button } from '@/components/ui/button';
import { useRouter } from 'next/router';

export default function UnauthorizedPage() {
  const router = useRouter();

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="max-w-md w-full px-6 py-8 bg-white shadow-md rounded-lg">
        <h1 className="text-xl font-semibold text-gray-900 text-center mb-4">
          ไม่สามารถเข้าถึงได้
        </h1>
        <p className="mt-2 text-gray-600 text-center">
          คุณไม่มีสิทธิ์ในการเข้าถึงส่วนนี้
        </p>
        <div className="mt-6 text-center">
          <Button
            variant="outline"
            onClick={() => router.push('/')}
            className="mx-auto"
          >
            กลับสู่หน้าหลัก
          </Button>
        </div>
      </div>
    </div>
  );
}
