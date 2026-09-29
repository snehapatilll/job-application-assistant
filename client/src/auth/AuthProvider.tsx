import { createContext, useContext, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError, apiRequest } from '../lib/api';
import type { User } from '../lib/types';

interface Credentials {
  email: string;
  password: string;
}

interface AuthContextValue {
  user: User | null;
  /** True only while the initial session check is in flight. */
  isLoading: boolean;
  login: (credentials: Credentials) => Promise<void>;
  register: (credentials: Credentials) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const ME_QUERY_KEY = ['auth', 'me'] as const;

/**
 * Because the session cookie is httpOnly, the page cannot inspect it to find
 * out whether it is signed in — it has to ask the server. This query is that
 * question, and its result is the app's source of truth for auth state.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();

  const { data, isPending } = useQuery({
    queryKey: ME_QUERY_KEY,
    queryFn: async (): Promise<User | null> => {
      try {
        const { user } = await apiRequest<{ user: User }>('GET', '/api/auth/me');
        return user;
      } catch (err) {
        // A 401 is the normal "not signed in" answer, not a failure.
        if (err instanceof ApiError && err.isUnauthenticated) return null;
        throw err;
      }
    },
    // Signing in or out updates this cache directly, so background refetching
    // would only add requests without changing the answer.
    staleTime: Infinity,
    retry: false,
  });

  const loginMutation = useMutation({
    mutationFn: (credentials: Credentials) =>
      apiRequest<{ user: User }>('POST', '/api/auth/login', credentials),
    onSuccess: ({ user }) => {
      queryClient.setQueryData(ME_QUERY_KEY, user);
    },
  });

  const registerMutation = useMutation({
    mutationFn: (credentials: Credentials) =>
      apiRequest<{ user: User }>('POST', '/api/auth/register', credentials),
    onSuccess: ({ user }) => {
      queryClient.setQueryData(ME_QUERY_KEY, user);
    },
  });

  const logoutMutation = useMutation({
    mutationFn: () => apiRequest<null>('POST', '/api/auth/logout'),
    onSuccess: () => {
      queryClient.setQueryData(ME_QUERY_KEY, null);
      // Drop every cached resume and analysis so the next user of this browser
      // never sees the previous one's data.
      queryClient.removeQueries();
    },
  });

  const value: AuthContextValue = {
    user: data ?? null,
    isLoading: isPending,
    login: async (credentials) => {
      await loginMutation.mutateAsync(credentials);
    },
    register: async (credentials) => {
      await registerMutation.mutateAsync(credentials);
    },
    logout: async () => {
      await logoutMutation.mutateAsync();
    },
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (context === null) {
    throw new Error('useAuth must be used inside an AuthProvider');
  }
  return context;
}
