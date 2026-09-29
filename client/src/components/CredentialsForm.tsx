import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { ApiError } from '../lib/api';

interface Props {
  title: string;
  submitLabel: string;
  /** Rejects with an ApiError, whose `details` map onto the fields. */
  onSubmit: (credentials: { email: string; password: string }) => Promise<void>;
  footer: { prompt: string; linkText: string; to: string };
  /** Shown under the password field on the register form. */
  passwordHint?: string;
}

const inputClass =
  'mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900 outline-none transition focus:border-slate-900 focus:ring-2 focus:ring-slate-900/10';

/** Shared sign-in / sign-up form. */
export function CredentialsForm({
  title,
  submitLabel,
  onSubmit,
  footer,
  passwordHint,
}: Props) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    setFieldErrors({});
    setFormError('');
    setIsSubmitting(true);

    try {
      await onSubmit({ email, password });
    } catch (err) {
      if (err instanceof ApiError) {
        // The server returns per-field messages for validation failures and a
        // single message for everything else (wrong password, email taken).
        setFieldErrors(err.details);
        if (Object.keys(err.details).length === 0) setFormError(err.message);
      } else {
        setFormError('Could not reach the server. Please try again.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-6">
      <div className="w-full max-w-sm">
        <h1 className="text-2xl font-semibold text-slate-900">{title}</h1>
        <p className="mt-1 text-sm text-slate-500">
          Score your resume against any job description.
        </p>

        <form onSubmit={(e) => void handleSubmit(e)} noValidate className="mt-6 space-y-4">
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-slate-700">
              Email
            </label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={inputClass}
              aria-invalid={fieldErrors.email !== undefined}
              aria-describedby={fieldErrors.email === undefined ? undefined : 'email-error'}
            />
            {fieldErrors.email !== undefined && (
              <p id="email-error" className="mt-1 text-sm text-red-600">
                {fieldErrors.email}
              </p>
            )}
          </div>

          <div>
            <label htmlFor="password" className="block text-sm font-medium text-slate-700">
              Password
            </label>
            <input
              id="password"
              type="password"
              autoComplete={submitLabel === 'Sign in' ? 'current-password' : 'new-password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={inputClass}
              aria-invalid={fieldErrors.password !== undefined}
              aria-describedby={fieldErrors.password === undefined ? undefined : 'password-error'}
            />
            {fieldErrors.password === undefined
              ? passwordHint !== undefined && (
                  <p className="mt-1 text-sm text-slate-500">{passwordHint}</p>
                )
              : (
                  <p id="password-error" className="mt-1 text-sm text-red-600">
                    {fieldErrors.password}
                  </p>
                )}
          </div>

          {formError !== '' && (
            <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
              {formError}
            </p>
          )}

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full rounded-lg bg-slate-900 px-4 py-2 font-medium text-white transition hover:bg-slate-800 disabled:opacity-60"
          >
            {isSubmitting ? 'Please wait…' : submitLabel}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-slate-600">
          {footer.prompt}{' '}
          <Link to={footer.to} className="font-medium text-slate-900 underline">
            {footer.linkText}
          </Link>
        </p>
      </div>
    </div>
  );
}
