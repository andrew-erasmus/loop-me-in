import { useEffect, useRef, useState, type ReactNode } from 'react';
import { faCalendarDays } from '@fortawesome/free-solid-svg-icons';
import { ApiError } from '@date-calendar/core';
import { useJoinSpace, useMe } from '../../hooks/useAuth.js';
import { baseUrl } from '../../lib/api.js';
import Icon from '../ui/Icon.js';

/**
 * Everything above the calendar: is anyone signed in, and if they arrived on an
 * invite link, have they been let into the space yet.
 *
 * Reads `?join=` and `?auth_error=` straight off the URL rather than adding a
 * router — two query parameters handled in one place does not justify the
 * dependency, and both are stripped once acted on so a refresh is clean.
 */

function readParam(name: string): string | null {
  return new URLSearchParams(window.location.search).get(name);
}

function stripParam(name: string): void {
  const url = new URL(window.location.href);
  url.searchParams.delete(name);
  window.history.replaceState({}, '', url.pathname + url.search + url.hash);
}

export default function AuthGate({ children }: { children: ReactNode }) {
  const { data: me, isLoading, error, refetch } = useMe();
  const joinSpace = useJoinSpace();

  const [joinCode, setJoinCode] = useState<string | null>(() => readParam('join'));
  // Read once on mount: the parameter is stripped from the URL immediately
  // below, so there is never a second value to pick up.
  const [authError] = useState<string | null>(() => readParam('auth_error'));
  const [joinError, setJoinError] = useState<string | null>(null);

  useEffect(() => {
    if (authError) stripParam('auth_error');
  }, [authError]);

  // Redeem an invite as soon as there is a session to redeem it against. The
  // ref guards against StrictMode's double-invoke and any re-render racing a
  // second POST of the same single-use code.
  const redeeming = useRef(false);
  useEffect(() => {
    if (!me || !joinCode || redeeming.current) return;
    redeeming.current = true;

    joinSpace.mutate(joinCode, {
      onError: (mutationError) => {
        setJoinError(
          mutationError instanceof ApiError
            ? mutationError.message
            : 'That invite link could not be used.',
        );
      },
      onSettled: () => {
        stripParam('join');
        setJoinCode(null);
        redeeming.current = false;
      },
    });
  }, [me, joinCode, joinSpace]);

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-sm text-moss-400">Loading…</p>
      </div>
    );
  }

  const unauthorized = error instanceof ApiError && error.status === 401;

  if (unauthorized || !me) {
    return (
      <SignInScreen
        joinCode={joinCode}
        error={authError ?? (error && !unauthorized ? error.message : null)}
        isServerError={Boolean(error) && !unauthorized}
        onRetry={() => void refetch()}
      />
    );
  }

  return (
    <>
      {joinError && (
        <div
          role="alert"
          className="flex items-center gap-3 border-b border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-900"
        >
          <span className="flex-1">{joinError}</span>
          <button
            type="button"
            onClick={() => setJoinError(null)}
            className="rounded px-2 py-0.5 text-xs font-medium hover:bg-amber-100"
          >
            Dismiss
          </button>
        </div>
      )}
      {children}
    </>
  );
}

interface SignInScreenProps {
  joinCode: string | null;
  error: string | null;
  isServerError: boolean;
  onRetry: () => void;
}

function SignInScreen({ joinCode, error, isServerError, onRetry }: SignInScreenProps) {
  // Carry the invite code through Google and back — the server stashes it in a
  // short-lived cookie, since an OAuth round trip has nowhere else to put it.
  //
  // Built from `baseUrl` rather than a hardcoded `/api/...` path: when the API
  // is on its own domain (split-origin production), a relative path would
  // point at the *web* app's own domain, which has no such route and 404s.
  const signInUrl = joinCode
    ? `${baseUrl}/auth/google?join=${encodeURIComponent(joinCode)}`
    : `${baseUrl}/auth/google`;

  return (
    <div className="flex h-full items-center justify-center bg-moss-50 px-6">
      <div className="w-full max-w-sm rounded-2xl bg-white p-9 text-center shadow-xl shadow-moss-950/5 ring-1 ring-moss-950/5">
        <div className="mx-auto mb-6 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary">
          <Icon icon={faCalendarDays} size="lg" className="h-6 w-6 text-white" />
        </div>

        <h1 className="display text-2xl leading-tight text-moss-950">
          {joinCode ? "You've been invited" : 'Your shared calendar'}
        </h1>
        <p className="mt-1.5 text-sm text-moss-500">
          {joinCode
            ? 'Sign in to join the calendar you were invited to.'
            : 'One calendar, two people, and a list of things to do together.'}
        </p>

        {error && (
          <p
            role="alert"
            className="mt-4 rounded-md bg-red-50 px-3 py-2 text-left text-sm text-red-700"
          >
            {error}
          </p>
        )}

        <a
          href={signInUrl}
          className="mt-7 flex w-full items-center justify-center gap-2.5 rounded-xl border border-moss-200 px-4 py-3 text-sm font-semibold text-moss-800 shadow-sm transition hover:border-moss-300 hover:bg-moss-50"
        >
          <GoogleMark />
          Continue with Google
        </a>

        {isServerError && (
          <button
            type="button"
            onClick={onRetry}
            className="mt-3 text-xs font-medium text-moss-500 underline-offset-2 hover:underline"
          >
            Try again
          </button>
        )}
      </div>
    </div>
  );
}

/** Google's four-colour G. */
function GoogleMark() {
  return (
    <svg viewBox="0 0 18 18" className="h-4 w-4" aria-hidden>
      <path
        fill="#4285F4"
        d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62Z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18Z"
      />
      <path
        fill="#FBBC05"
        d="M3.97 10.72a5.4 5.4 0 0 1 0-3.44V4.95H.96a9 9 0 0 0 0 8.1l3.01-2.33Z"
      />
      <path
        fill="#EA4335"
        d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.59C13.46.89 11.43 0 9 0A9 9 0 0 0 .96 4.95l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58Z"
      />
    </svg>
  );
}
