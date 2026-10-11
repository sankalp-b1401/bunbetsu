import React, { useState } from "react";
import {
  Mail,
  Lock,
  Eye,
  EyeOff,
  ArrowRight,
  CheckCircle2,
  AlertCircle,
  X,
} from "lucide-react";
import {
  supabase,
  isSupabaseConfigured,
  buildAuthUserFromSession,
} from "../../lib/supabase";
import { AuthUser } from "../../types/bunbetsu";

interface AuthPageProps {
  onLoginSuccess: (user: AuthUser) => void;
  onContinueAsGuest?: () => void;
  onBackToLanding?: () => void;
}

export const AuthPage: React.FC<AuthPageProps> = ({
  onLoginSuccess,
  onContinueAsGuest,
  onBackToLanding,
}) => {
  const [authMode, setAuthMode] = useState<"login" | "signup">("login");
  const [showPassword, setShowPassword] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [pendingConfirmation, setPendingConfirmation] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [showForgotModal, setShowForgotModal] = useState(false);
  const [resetEmail, setResetEmail] = useState("");
  const [resetSent, setResetSent] = useState(false);
  const [resetError, setResetError] = useState<string | null>(null);

  // Handle form submit (real Supabase signup & login)
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setPendingConfirmation(false);

    if (!isSupabaseConfigured) {
      setErrorMessage(
        "Supabase is not configured. Please set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY in .env"
      );
      return;
    }

    setIsLoading(true);

    try {
      if (authMode === "signup") {
        if (!firstName.trim() || !lastName.trim()) {
          setErrorMessage("Please enter both your first and last name.");
          setIsLoading(false);
          return;
        }

        // Call supabase.auth.signUp with user metadata containing first_name and last_name
        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: {
            data: {
              first_name: firstName.trim(),
              last_name: lastName.trim(),
            },
            emailRedirectTo: `${window.location.origin}/`,
          },
        });

        if (error) {
          setErrorMessage(error.message);
          setIsLoading(false);
          return;
        }

        // Treat email-confirmation-required signup as pending confirmation, NOT as an authenticated session
        if (data.user && !data.session) {
          setPendingConfirmation(true);
          setToastMessage(
            `Verification email sent to ${email.trim()}. Please verify your email before logging in.`
          );
          setTimeout(() => setToastMessage(null), 6000);
          setIsLoading(false);
          return;
        }

        // Only call onLoginSuccess callback when a valid session exists
        if (data.session && data.user) {
          const authUser = await buildAuthUserFromSession(data.user);
          if (authUser) {
            onLoginSuccess(authUser);
          }
        }
      } else {
        // Login mode: call supabase.auth.signInWithPassword
        const { data, error } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });

        if (error) {
          setErrorMessage(error.message);
          setIsLoading(false);
          return;
        }

        // Only call onLoginSuccess callback when a valid session exists
        if (data.session && data.user) {
          const authUser = await buildAuthUserFromSession(data.user);
          if (authUser) {
            onLoginSuccess(authUser);
          }
        } else {
          setErrorMessage("Unable to establish an authenticated session. Please verify your credentials.");
        }
      }
    } catch (err: any) {
      setErrorMessage(
        err?.message || "An unexpected error occurred during authentication."
      );
    } finally {
      setIsLoading(false);
    }
  };


  // Handle Forgot Password submit via supabase.auth.resetPasswordForEmail
  const handleSendReset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetEmail.trim()) return;
    setResetError(null);

    if (!isSupabaseConfigured) {
      setResetError(
        "Supabase is not configured. Please set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY in .env"
      );
      return;
    }

    setResetSent(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(
        resetEmail.trim(),
        {
          redirectTo: `${window.location.origin}/`,
        }
      );

      if (error) {
        setResetError(error.message);
        setResetSent(false);
        return;
      }

      setResetSent(false);
      setShowForgotModal(false);
      setToastMessage(`Password reset link dispatched to ${resetEmail.trim()}`);
      setTimeout(() => setToastMessage(null), 5000);
    } catch (err: any) {
      setResetError(err?.message || "Failed to dispatch password reset email.");
      setResetSent(false);
    }
  };

  return (
    <div className="min-h-screen sm:h-screen w-full bg-[#F4F7F4] flex flex-col justify-center items-center py-4 px-4 sm:px-6 relative font-sans overflow-y-auto">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed top-4 right-4 z-50 flex items-center gap-2 bg-[#0D3820] text-white px-3.5 py-2 rounded-xl shadow-xl text-xs font-semibold animate-in fade-in slide-in-from-top-2">
          <CheckCircle2 className="w-4 h-4 text-[#70D000] shrink-0" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Centered Auth Container: Large Logo Above + Centered Card */}
      <div className="w-full max-w-[420px] mx-auto flex flex-col items-center">
        {/* Bunbetsu Logo Above Auth Panel */}
        <div className="mb-3 sm:mb-4 flex justify-center items-center">
          <img
            src="/bunbetsu-logo.png"
            alt="Bünbetsu"
            className={`h-9 sm:h-10 w-auto object-contain select-none drop-shadow-xs ${
              onBackToLanding ? "cursor-pointer hover:opacity-85 transition" : ""
            }`}
            onClick={onBackToLanding}
            title={onBackToLanding ? "Back to home" : "Bunbetsu"}
          />
        </div>

        {/* Centered Authentication Card */}
        <div className="w-full bg-white rounded-2xl p-5 sm:p-6 shadow-[0_4px_30px_rgba(0,0,0,0.03)] border border-[#E3ECE1] transition-all">
          {/* Card Header */}
          <div className="text-center space-y-0.5 mb-4">
            <h2 className="font-heading font-bold text-xl sm:text-2xl text-[#103822] tracking-tight">
              Welcome to Bunbetsu
            </h2>
            <p className="text-xs text-[#5A6E62]">
              {authMode === "login"
                ? "Sign in to plan cleaner, more sustainable events."
                : "Create an account to plan cleaner, more sustainable events."}
            </p>
          </div>

          {/* Error Banner */}
          {errorMessage && (
            <div className="mb-3 p-2.5 rounded-xl bg-red-50 border border-red-200 text-xs text-red-700 flex items-start gap-2 animate-in fade-in">
              <AlertCircle className="w-4 h-4 shrink-0 text-red-600 mt-0.5" />
              <span className="leading-tight">{errorMessage}</span>
            </div>
          )}

          {/* Pending Email Confirmation Banner */}
          {pendingConfirmation && (
            <div className="mb-3 p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-[#0D4421] space-y-1 animate-in fade-in">
              <div className="font-bold flex items-center gap-1.5 text-xs text-[#0D4421]">
                <CheckCircle2 className="w-4 h-4 text-[#70D000] shrink-0" />
                <span>Verification Email Sent</span>
              </div>
              <p className="text-[11px] text-[#2C5237] leading-relaxed">
                A verification link was dispatched to{" "}
                <span className="font-semibold text-[#0B3A1C]">{email}</span>.
                Please verify your email address to complete registration before logging in.
              </p>
            </div>
          )}

          {/* Email & Password Form */}
          <form onSubmit={handleSubmit} className="space-y-2.5">
            {/* First Name & Last Name in the same line for Signup mode */}
            {authMode === "signup" && (
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-semibold text-[#183E28] mb-1">
                    First name
                  </label>
                  <input
                    type="text"
                    required
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    placeholder="First name"
                    disabled={isLoading}
                    className="w-full px-3 py-2 rounded-xl border border-[#D5E1D4] focus:outline-none focus:border-[#0D4421] focus:ring-2 focus:ring-[#70D000]/25 text-xs text-[#113821] placeholder:text-[#95A79B] transition bg-white disabled:opacity-60"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[#183E28] mb-1">
                    Last name
                  </label>
                  <input
                    type="text"
                    required
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    placeholder="Last name"
                    disabled={isLoading}
                    className="w-full px-3 py-2 rounded-xl border border-[#D5E1D4] focus:outline-none focus:border-[#0D4421] focus:ring-2 focus:ring-[#70D000]/25 text-xs text-[#113821] placeholder:text-[#95A79B] transition bg-white disabled:opacity-60"
                  />
                </div>
              </div>
            )}

            {/* Email address */}
            <div>
              <label className="block text-xs font-semibold text-[#183E28] mb-1">
                Email address
              </label>
              <div className="relative flex items-center">
                <Mail className="w-3.5 h-3.5 text-[#7C9083] absolute left-3 pointer-events-none" />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@university.edu"
                  disabled={isLoading}
                  className="w-full pl-9 pr-3 py-2 rounded-xl border border-[#D5E1D4] focus:outline-none focus:border-[#0D4421] focus:ring-2 focus:ring-[#70D000]/25 text-xs text-[#113821] placeholder:text-[#95A79B] transition bg-white disabled:opacity-60"
                />
              </div>
            </div>

            {/* Password */}
            <div>
              <label className="block text-xs font-semibold text-[#183E28] mb-1">
                Password
              </label>
              <div className="relative flex items-center">
                <Lock className="w-3.5 h-3.5 text-[#7C9083] absolute left-3 pointer-events-none" />
                <input
                  type={showPassword ? "text" : "password"}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your password"
                  disabled={isLoading}
                  className="w-full pl-9 pr-9 py-2 rounded-xl border border-[#D5E1D4] focus:outline-none focus:border-[#0D4421] focus:ring-2 focus:ring-[#70D000]/25 text-xs text-[#113821] placeholder:text-[#95A79B] transition bg-white disabled:opacity-60"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 p-0.5 text-[#7C9083] hover:text-[#113821] transition cursor-pointer"
                  title={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? (
                    <Eye className="w-3.5 h-3.5" />
                  ) : (
                    <EyeOff className="w-3.5 h-3.5" />
                  )}
                </button>
              </div>
            </div>

            {/* Forgot password link */}
            {authMode === "login" && (
              <div className="text-right">
                <button
                  type="button"
                  onClick={() => {
                    setResetEmail(email.trim());
                    setResetError(null);
                    setShowForgotModal(true);
                  }}
                  className="text-[11px] font-bold text-[#0D4421] hover:underline cursor-pointer transition"
                >
                  Forgot password?
                </button>
              </div>
            )}

            {/* Primary Action Button: Login / Create account */}
            <button
              type="submit"
              disabled={isLoading}
              className="w-full mt-1.5 py-2.5 rounded-xl bg-[#094120] hover:bg-[#073419] active:bg-[#052712] text-white font-bold text-xs flex items-center justify-center gap-2 shadow-sm hover:shadow transition-all cursor-pointer font-sans disabled:opacity-60"
            >
              <span>{authMode === "login" ? "Login" : "Create account"}</span>
              {isLoading ? (
                <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <ArrowRight className="w-3.5 h-3.5 text-white stroke-[2.5]" />
              )}
            </button>
          </form>

          {/* Bottom Toggle Link */}
          <div className="mt-3.5 text-center text-xs text-[#5E7265]">
            {authMode === "login" ? (
              <span>
                Don&apos;t have an account?{" "}
                <button
                  type="button"
                  onClick={() => {
                    setAuthMode("signup");
                    setErrorMessage(null);
                    setPendingConfirmation(false);
                  }}
                  className="font-bold text-[#094120] underline hover:text-[#062D15] cursor-pointer"
                >
                  Create account
                </button>
              </span>
            ) : (
              <span>
                Already have an account?{" "}
                <button
                  type="button"
                  onClick={() => {
                    setAuthMode("login");
                    setErrorMessage(null);
                    setPendingConfirmation(false);
                  }}
                  className="font-bold text-[#094120] underline hover:text-[#062D15] cursor-pointer"
                >
                  Login
                </button>
              </span>
            )}
          </div>

          {/* Optional Fast Demo Bypass Link */}
          {onContinueAsGuest && (
            <div className="mt-2.5 pt-2 border-t border-[#E1EBE0]/60 text-center">
              <button
                type="button"
                onClick={onContinueAsGuest}
                className="text-[11px] font-semibold text-[#667267] hover:text-[#094120] hover:underline cursor-pointer"
              >
                Use as guest →
              </button>
            </div>
          )}
        </div>

        {onBackToLanding && (
          <button
            type="button"
            onClick={onBackToLanding}
            className="mt-3 text-xs text-[#5A6E62] hover:text-[#094120] transition flex items-center gap-1 cursor-pointer font-medium hover:underline"
          >
            ← Back to home
          </button>
        )}
      </div>

      {/* FORGOT PASSWORD MODAL */}
      {showForgotModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/45 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl shadow-2xl border border-[#E1E8DE] w-full max-w-md overflow-hidden p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-heading text-base font-bold text-[#103822]">
                Reset your password
              </h3>
              <button
                type="button"
                onClick={() => {
                  setShowForgotModal(false);
                  setResetError(null);
                }}
                className="p-1 rounded-md text-[#667267] hover:text-[#202820] hover:bg-neutral-100 transition cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-xs text-[#5A6E62] leading-relaxed">
              Enter your institutional email address and we&apos;ll dispatch a
              password reset link to your inbox.
            </p>

            {resetError && (
              <div className="p-2.5 rounded-xl bg-red-50 border border-red-200 text-xs text-red-700 flex items-start gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 text-red-600 mt-0.5" />
                <span className="leading-tight">{resetError}</span>
              </div>
            )}

            <form onSubmit={handleSendReset} className="space-y-3.5">
              <input
                type="email"
                required
                value={resetEmail}
                onChange={(e) => setResetEmail(e.target.value)}
                placeholder="you@university.edu"
                disabled={resetSent}
                className="w-full px-3.5 py-2.5 rounded-xl border border-[#D5E1D4] focus:outline-none focus:border-[#0D4421] text-xs sm:text-sm text-[#113821] disabled:opacity-60"
              />
              <button
                type="submit"
                disabled={resetSent}
                className="w-full py-2.5 rounded-xl bg-[#094120] text-white font-bold text-xs hover:bg-[#073419] transition cursor-pointer flex items-center justify-center gap-2 disabled:opacity-60"
              >
                {resetSent ? (
                  <span>Sending reset link...</span>
                ) : (
                  <span>Send Reset Link</span>
                )}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
