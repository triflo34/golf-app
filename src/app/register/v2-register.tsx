"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/components/auth-provider";

export function V2Register() {
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const { refresh } = useAuth();

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    const res = await fetch("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password, display_name: displayName }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({ error: "Sign up failed" }));
      setError(data.error ?? "Sign up failed");
      setLoading(false);
      return;
    }
    await refresh();
    const next = new URLSearchParams(window.location.search).get("next");
    router.push(next && next.startsWith("/") && !next.startsWith("//") ? next : "/");
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--v2-bg)] px-4 text-[var(--v2-fg)]">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <h1 className="text-4xl font-bold text-[var(--v2-accent)]">
            The Match
          </h1>
          <p className="mt-1 text-sm text-[var(--v2-muted)]">Join the league</p>
        </div>

        <form
          onSubmit={handleRegister}
          className="space-y-4 rounded-2xl border border-[var(--v2-border)] bg-[var(--v2-surface)] p-6 shadow-2xl shadow-black/50"
        >
          <h2 className="text-xl font-semibold text-white">Create Account</h2>

          {error && (
            <div className="rounded-lg bg-[var(--v2-danger-bg)] p-3 text-sm text-[var(--v2-red-text)]">
              {error}
            </div>
          )}

          <div>
            <label className="mb-1 block text-sm font-medium text-[var(--v2-muted)]">
              Username
            </label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="e.g. tristan23"
              autoComplete="username"
              className="w-full rounded-lg border border-[var(--v2-border)] bg-[var(--v2-surface-2)] px-3 py-2.5 text-white placeholder-[var(--v2-muted)] focus:border-[var(--v2-accent)] focus:outline-none focus:ring-2 focus:ring-[var(--v2-accent)]/40"
              required
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-[var(--v2-muted)]">
              Display Name{" "}
              <span className="font-normal text-[var(--v2-muted)]/70">
                (optional)
              </span>
            </label>
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="e.g. Tristan"
              className="w-full rounded-lg border border-[var(--v2-border)] bg-[var(--v2-surface-2)] px-3 py-2.5 text-white placeholder-[var(--v2-muted)] focus:border-[var(--v2-accent)] focus:outline-none focus:ring-2 focus:ring-[var(--v2-accent)]/40"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-[var(--v2-muted)]">
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
              minLength={4}
              className="w-full rounded-lg border border-[var(--v2-border)] bg-[var(--v2-surface-2)] px-3 py-2.5 text-white placeholder-[var(--v2-muted)] focus:border-[var(--v2-accent)] focus:outline-none focus:ring-2 focus:ring-[var(--v2-accent)]/40"
              required
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-[var(--v2-accent)] py-2.5 font-semibold text-black hover:bg-[var(--v2-accent-soft)] disabled:opacity-50"
          >
            {loading ? "Creating account…" : "Create Account"}
          </button>

          <p className="text-center text-sm text-[var(--v2-muted)]">
            Already have an account?{" "}
            <Link
              href="/login"
              className="font-medium text-[var(--v2-accent)] hover:underline"
            >
              Sign in
            </Link>
          </p>
        </form>
      </div>
    </div>
  );
}
