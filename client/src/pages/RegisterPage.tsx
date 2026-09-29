import { useNavigate } from 'react-router-dom';
import { CredentialsForm } from '../components/CredentialsForm';
import { useAuth } from '../auth/AuthProvider';

export function RegisterPage() {
  const { register } = useAuth();
  const navigate = useNavigate();

  return (
    <CredentialsForm
      title="Create an account"
      submitLabel="Create account"
      passwordHint="At least 8 characters."
      onSubmit={async (credentials) => {
        await register(credentials);
        void navigate('/', { replace: true });
      }}
      footer={{ prompt: 'Already have an account?', linkText: 'Sign in', to: '/login' }}
    />
  );
}
