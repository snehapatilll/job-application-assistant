import { useLocation, useNavigate } from 'react-router-dom';
import { CredentialsForm } from '../components/CredentialsForm';
import { useAuth } from '../auth/AuthProvider';

export function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  // ProtectedRoute records where the user was headed before being redirected.
  const from = (location.state as { from?: string } | null)?.from ?? '/';

  return (
    <CredentialsForm
      title="Sign in"
      submitLabel="Sign in"
      onSubmit={async (credentials) => {
        await login(credentials);
        void navigate(from, { replace: true });
      }}
      footer={{ prompt: 'No account yet?', linkText: 'Create one', to: '/register' }}
    />
  );
}
