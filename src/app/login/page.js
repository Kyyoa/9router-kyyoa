"use client";

import { useState, useEffect } from "react";
import { Card, Button, Input } from "@/shared/components";

export default function LoginPage() {
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [resetHint, setResetHint] = useState("");
  const [retryAfter, setRetryAfter] = useState(0);
  const [loading, setLoading] = useState(false);
  const [hasPassword, setHasPassword] = useState(null);
  const [authMode, setAuthMode] = useState("password");
  const [ssoType, setSsoType] = useState("oidc");
  const [oidcConfigured, setOidcConfigured] = useState(false);
  const [oidcLoginLabel, setOidcLoginLabel] = useState("Sign in with OIDC");
  const [samlConfigured, setSamlConfigured] = useState(false);
  const [samlLoginLabel, setSamlLoginLabel] = useState("Sign in with SAML SSO");
  const [mustChange, setMustChange] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showKeyLogin, setShowKeyLogin] = useState(false);
  const [apiKey, setApiKey] = useState("");
  const [showApiKey, setShowApiKey] = useState(false);
  const [noAccess, setNoAccess] = useState(false);

  // A key that signed in but holds no permission would bounce between /login and
  // the dashboard, so it stays here and can sign out instead.
  const handleSignOut = async () => {
    setLoading(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } catch {
      // The cookie may already be gone; the reload below settles the state.
    }
    window.location.assign("/login");
  };

  // Countdown for rate-limit
  useEffect(() => {
    if (retryAfter <= 0) return;
    const id = setInterval(() => setRetryAfter((s) => (s > 0 ? s - 1 : 0)), 1000);
    return () => clearInterval(id);
  }, [retryAfter]);

  useEffect(() => {
    async function checkAuth() {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);
      const baseUrl = typeof window !== "undefined" ? window.location.origin : "";

      try {
        const res = await fetch(`${baseUrl}/api/auth/status`, {
          signal: controller.signal,
        });
        clearTimeout(timeoutId);

        if (res.ok) {
          const data = await res.json();
          if (data.authenticated === true || data.requireLogin === false) {
            if (data.role === "apikey" && !data.homePath) {
              setNoAccess(true);
              setHasPassword(!!data.hasPassword);
              return;
            }
            window.location.assign(data.homePath || "/dashboard");
            return;
          }
          setHasPassword(!!data.hasPassword);
          setAuthMode(data.authMode || "password");
          setSsoType(data.ssoType || "oidc");
          setOidcConfigured(data.oidcConfigured === true);
          setOidcLoginLabel(data.oidcLoginLabel || "Sign in with OIDC");
          setSamlConfigured(data.samlConfigured === true);
          setSamlLoginLabel(data.samlLoginLabel || "Sign in with SAML SSO");
        } else {
          setHasPassword(true);
        }
      } catch {
        clearTimeout(timeoutId);
        setHasPassword(true);
      }
    }
    checkAuth();
  }, []);

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    setResetHint("");

    try {
      const payload = showKeyLogin ? { apiKey: apiKey.trim() } : { password };
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        const data = await res.json();
        if (data.mustChangePassword) {
          setMustChange(true);
          return;
        }
        if (typeof window !== "undefined") {
          sessionStorage.setItem("9router:justLoggedIn", "true");
        }
        if (data.role === "apikey" && !data.homePath) {
          setNoAccess(true);
          setHasPassword(true);
          return;
        }
        window.location.assign(data.homePath || "/dashboard");
      } else {
        const data = await res.json();
        setError(data.error || (showKeyLogin ? "Invalid API Key" : "Invalid password"));
        if (data.resetHint) setResetHint(data.resetHint);
        if (data.retryAfter) setRetryAfter(Number(data.retryAfter));
      }
    } catch {
      setError("An error occurred. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleSetNewPassword = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword: password, newPassword }),
      });
      if (res.ok) {
        if (typeof window !== "undefined") {
          sessionStorage.setItem("9router:justLoggedIn", "true");
        }
        window.location.assign("/dashboard");
      } else {
        const data = await res.json();
        setError(data.error || "Failed to set password");
      }
    } catch {
      setError("An error occurred. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleOidcLogin = () => {
    window.location.href = "/api/auth/oidc/start";
  };

  const handleSamlLogin = () => {
    window.location.href = "/api/auth/saml/start";
  };

  const isSsoEnabled = ["sso", "oidc", "saml", "both"].includes(authMode);
  const activeSsoType = ssoType || (authMode === "saml" ? "saml" : "oidc");
  const samlAvailable = isSsoEnabled && activeSsoType === "saml" && samlConfigured;
  const oidcAvailable = isSsoEnabled && activeSsoType === "oidc" && oidcConfigured;
  const ssoAvailable = samlAvailable || oidcAvailable;
  const passwordAvailable = authMode === "password" || authMode === "both" || !ssoAvailable;

  // Show loading state while checking password
  if (hasPassword === null) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-bg p-4">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
          <p className="text-text-muted mt-4 font-mono text-xs">Connecting to 9Router...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-bg p-4 relative overflow-hidden select-none">
      {/* Background ambient lighting */}
      <div className="landing-grid absolute inset-0 pointer-events-none opacity-40" aria-hidden="true" />
      <div
        className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[520px] h-[360px] bg-gradient-to-tr from-emerald-500/10 via-primary/15 to-cyan-500/10 blur-[100px] rounded-full pointer-events-none"
        aria-hidden="true"
      />

      <div className="relative z-10 w-full max-w-[420px]">
        {/* Brand Header */}
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-br from-surface to-surface-2 border border-border/80 shadow-lg shadow-black/20 mb-3.5 relative group">
            <div className="absolute inset-0 rounded-2xl bg-primary/10 blur-sm group-hover:bg-primary/20 transition-colors" />
            <span className="material-symbols-outlined text-[28px] text-primary relative z-10">
              hub
            </span>
          </div>

          <div className="flex items-center justify-center gap-2 mb-1.5">
            <h1 className="text-2xl font-bold tracking-tight text-text-main font-mono">
              9Router
            </h1>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-semibold uppercase tracking-wider bg-primary/10 text-primary border border-primary/25">
              Kyyoa
            </span>
          </div>

          <p className="text-xs text-text-muted">
            {noAccess
              ? "This API key holds no dashboard permissions"
              : showKeyLogin
              ? "Sign in with your assigned API Key credentials"
              : "Sign in to access your autonomous AI router"}
          </p>
        </div>

        {/* Main Login Card */}
        <div className="relative">
          <Card className="p-6 sm:p-7 shadow-2xl shadow-black/30 border border-border/70 backdrop-blur-xl bg-card/95">
            {noAccess ? (
              <div className="flex flex-col gap-4 text-center">
                <div className="p-3 rounded-xl bg-danger/10 border border-danger/20 text-danger text-xs">
                  Ask the owner of this instance to grant dashboard permissions for your key.
                </div>
                <Button type="button" variant="primary" className="w-full" loading={loading} onClick={handleSignOut}>
                  Sign out
                </Button>
              </div>
            ) : mustChange ? (
              <form onSubmit={handleSetNewPassword} className="flex flex-col gap-4">
                <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-500 text-xs text-center">
                  Set a new password before accessing the dashboard remotely.
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-medium text-text-main">New password</label>
                  <div className="relative">
                    <Input
                      type={showNewPassword ? "text" : "password"}
                      placeholder="Enter new password"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      required
                      autoFocus
                      icon="lock"
                    />
                    <button
                      type="button"
                      onClick={() => setShowNewPassword((prev) => !prev)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-main transition-colors"
                      tabIndex={-1}
                    >
                      <span className="material-symbols-outlined text-[18px]">
                        {showNewPassword ? "visibility_off" : "visibility"}
                      </span>
                    </button>
                  </div>
                  {error && <p className="text-xs text-danger mt-1">{error}</p>}
                </div>
                <Button type="submit" variant="primary" className="w-full" loading={loading} disabled={!newPassword}>
                  Set password
                </Button>
              </form>
            ) : (
              <div className="flex flex-col gap-4">
                {/* SSO Buttons if enabled */}
                {samlAvailable && (
                  <Button type="button" variant="primary" className="w-full" onClick={handleSamlLogin}>
                    {samlLoginLabel}
                  </Button>
                )}

                {oidcAvailable && (
                  <Button type="button" variant="primary" className="w-full" onClick={handleOidcLogin}>
                    {oidcLoginLabel}
                  </Button>
                )}

                {ssoAvailable && passwordAvailable && (
                  <div className="relative my-1">
                    <div className="absolute inset-0 flex items-center">
                      <div className="w-full border-t border-border/60" />
                    </div>
                    <div className="relative flex justify-center text-[10px] uppercase tracking-wider">
                      <span className="bg-card px-2 text-text-muted">or continue with</span>
                    </div>
                  </div>
                )}

                {passwordAvailable && (
                  <>
                    {showKeyLogin ? (
                      /* API Key Login Form */
                      <form onSubmit={handleLogin} className="flex flex-col gap-4">
                        <div className="flex flex-col gap-1.5">
                          <label className="text-xs font-medium text-text-main flex items-center justify-between">
                            <span>API Key</span>
                            <span className="text-[10px] text-text-muted">sk-...</span>
                          </label>
                          <div className="relative">
                            <Input
                              type={showApiKey ? "text" : "password"}
                              placeholder="Paste your 9Router API key"
                              value={apiKey}
                              onChange={(e) => setApiKey(e.target.value)}
                              required
                              autoFocus
                              icon="key"
                              className="font-mono text-xs"
                            />
                            <button
                              type="button"
                              onClick={() => setShowApiKey((prev) => !prev)}
                              className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-main transition-colors"
                              tabIndex={-1}
                            >
                              <span className="material-symbols-outlined text-[18px]">
                                {showApiKey ? "visibility_off" : "visibility"}
                              </span>
                            </button>
                          </div>
                          {error && <p className="text-xs text-danger mt-1">{error}</p>}
                          <p className="text-[11px] text-text-muted leading-relaxed">
                            Sign in using an assigned API key to access authorized features.
                          </p>
                        </div>

                        <Button
                          type="submit"
                          variant="primary"
                          className="w-full mt-1"
                          loading={loading}
                          disabled={retryAfter > 0 || !apiKey.trim()}
                        >
                          {retryAfter > 0 ? `Wait ${retryAfter}s` : "Login with API Key"}
                        </Button>

                        <button
                          type="button"
                          onClick={() => {
                            setShowKeyLogin(false);
                            setError("");
                          }}
                          className="flex items-center justify-center gap-1.5 text-xs text-text-muted hover:text-text-main transition-all cursor-pointer py-1.5 px-3 rounded-lg hover:bg-surface-2 border border-transparent hover:border-border/40 mt-1"
                        >
                          <span className="material-symbols-outlined text-[15px]">lock</span>
                          <span>Back to password login</span>
                        </button>
                      </form>
                    ) : (
                      /* Password Login Form */
                      <form onSubmit={handleLogin} className="flex flex-col gap-4">
                        {isSsoEnabled && !ssoAvailable && (
                          <p className="text-xs text-amber-500 text-center">
                            {activeSsoType === "saml" ? "SAML SSO" : "OIDC"} login is enabled, but configuration is incomplete. Password login is still available.
                          </p>
                        )}

                        <div className="flex flex-col gap-1.5">
                          <div className="flex items-center justify-between">
                            <label className="text-xs font-medium text-text-main">Password</label>
                            <button
                              type="button"
                              onClick={() => {
                                setPassword("kyyoa123");
                                setError("");
                              }}
                              className="text-[10px] font-mono text-primary/80 hover:text-primary transition-colors hover:underline cursor-pointer"
                              title="Click to fill default password"
                            >
                              fill default
                            </button>
                          </div>

                          <div className="relative">
                            <Input
                              type={showPassword ? "text" : "password"}
                              placeholder="Enter dashboard password"
                              value={password}
                              onChange={(e) => setPassword(e.target.value)}
                              required
                              autoFocus={!oidcAvailable}
                              icon="lock"
                            />
                            <button
                              type="button"
                              onClick={() => setShowPassword((prev) => !prev)}
                              className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-main transition-colors"
                              tabIndex={-1}
                            >
                              <span className="material-symbols-outlined text-[18px]">
                                {showPassword ? "visibility_off" : "visibility"}
                              </span>
                            </button>
                          </div>

                          {error && <p className="text-xs text-danger mt-1">{error}</p>}

                          {retryAfter > 0 && (
                            <p className="text-xs text-amber-500 font-mono">
                              Locked. Retry in {retryAfter}s.
                            </p>
                          )}

                          {resetHint && (
                            <p className="text-[11px] text-text-muted">
                              Forgot password? Run <code className="bg-surface px-1 py-0.5 rounded text-[10px]">9router</code> CLI → <b>Settings</b> → <b>Reset Password</b>.
                            </p>
                          )}
                        </div>

                        <Button
                          type="submit"
                          variant="primary"
                          className="w-full mt-1"
                          loading={loading}
                          disabled={retryAfter > 0 || !password}
                        >
                          {retryAfter > 0 ? `Wait ${retryAfter}s` : "Login"}
                        </Button>

                        <div className="flex items-center justify-center gap-1.5 text-[11px] text-text-muted pt-1">
                          <span>Default password is</span>
                          <code className="font-mono text-text-main bg-surface-2 px-1.5 py-0.5 rounded text-[10px] border border-border/40">
                            kyyoa123
                          </code>
                        </div>

                        <button
                          type="button"
                          onClick={() => {
                            setShowKeyLogin(true);
                            setError("");
                          }}
                          className="flex items-center justify-center gap-1.5 text-xs text-text-muted hover:text-primary transition-all cursor-pointer py-1.5 px-3 rounded-lg hover:bg-surface-2 border border-transparent hover:border-border/40 mt-1"
                        >
                          <span className="material-symbols-outlined text-[15px] text-primary/80">key</span>
                          <span>Have an API key? Sign in with it</span>
                        </button>
                      </form>
                    )}
                  </>
                )}
              </div>
            )}
          </Card>
        </div>

        {/* Footer info */}
        <div className="text-center mt-6">
          <a
            href="https://github.com/Kyyoa/9router-kyyoa"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-xs text-text-muted hover:text-primary transition-colors"
          >
            <span className="material-symbols-outlined text-[14px]">star</span>
            <span>Kyyoa · 9router-kyyoa</span>
          </a>
        </div>
      </div>
    </div>
  );
}
