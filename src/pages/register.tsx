import RegisterForm from '../components/RegisterForm';
import { useAuth } from '@/hooks/useAuth';
import LoadingProgress from '@/components/LoadingProgress';
import router from 'next/router';
export default function RegisterPage() {
  const { isLoading, needsRegistration, user } = useAuth({
    required: true,
    allowRegistration: true, // Important: allows this page to be accessed during registration
  });

  if (isLoading) {
    return <LoadingProgress />;
  }

  // If user is already registered, redirect to home
  if (user && !needsRegistration) {
    router.replace('/');
    return null;
  }

  // Show registration form only if registration is needed
  if (!needsRegistration) {
    return <div>Invalid access</div>;
  }
  return (
    <div className="leave-request-page">
      <RegisterForm />
    </div>
  );
}
