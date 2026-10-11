import React, { useState } from "react";
import {
  Mail,
  Lock,
  Eye,
  EyeOff,
  ArrowRight,
  CheckCircle2,
  X,
} from "lucide-react";

interface AuthPageProps {
  onLoginSuccess: (user: {
    name: string;
    email: string;
    role?: string;
  }) => void;
  onContinueAsGuest?: () => void;
}

export const AuthPage: React.FC<AuthPageProps> = ({
  onLoginSuccess,
  onContinueAsGuest,
}) => {
  const [authMode, setAuthMode] = useState<"login" | "signup">("login");
  const [showPassword, setShowPassword] = useState(false);
  const [email, setEmail] = useState("you@university.edu");
  const [password, setPassword] = useState("••••••••••••");
  const [fullName, setFullName] = useState("Alex S.");
  const [isLoading, setIsLoading] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [showForgotModal, setShowForgotModal] = useState(false);
  const [resetEmail, setResetEmail] = useState("");
  const [resetSent, setResetSent] = useState(false);

  // Handle form submit
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    // Simulate snappy authentication flow
    setTimeout(() => {
      setIsLoading(false);
      onLoginSuccess({
        name:
          authMode === "signup" && fullName.trim()
            ? fullName.trim()
            : "Alex S.",
        email: email.trim() || "you@university.edu",
        role: "Sustainability Lead",
      });
    }, 450);
  };

  // Handle Google Social Sign-in
  const handleGoogleSignIn = () => {
    setIsLoading(true);
    setTimeout(() => {
      setIsLoading(false);
      onLoginSuccess({
        name: "Alex S.",
        email: "alex.s@university.edu",
        role: "Sustainability Lead",
      });
    }, 400);
  };

  // Handle Forgot Password submit
  const handleSendReset = (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetEmail.trim()) return;
    setResetSent(true);
    setTimeout(() => {
      setResetSent(false);
      setShowForgotModal(false);
      setToastMessage(`Password reset link dispatched to ${resetEmail}`);
      setTimeout(() => setToastMessage(null), 4000);
    }, 1200);
  };

  return (
    <div className="min-h-screen w-full bg-[#F4F7F4] flex flex-col justify-center items-center py-10 sm:py-16 px-4 sm:px-6 relative font-sans">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed top-5 right-5 z-50 flex items-center gap-2 bg-[#0D3820] text-white px-4 py-2.5 rounded-xl shadow-xl text-xs font-semibold animate-in fade-in slide-in-from-top-2">
          <CheckCircle2 className="w-4 h-4 text-[#70D000]" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Centered Auth Container: Large Logo Above + Centered Card */}
      <div className="w-full max-w-[460px] mx-auto flex flex-col items-center">
        {/* Large Bunbetsu Logo Above Auth Panel */}
        <div className="mb-6 sm:mb-8 flex justify-center items-center">
          <img
            src="/bunbetsu-logo.png"
            alt="Bünbetsu"
            className="h-12 sm:h-14 md:h-16 w-auto object-contain select-none drop-shadow-xs"
          />
        </div>

        {/* Centered Authentication Card */}
        <div className="w-full bg-white rounded-2xl sm:rounded-3xl p-6 sm:p-9 shadow-[0_4px_30px_rgba(0,0,0,0.03)] border border-[#E3ECE1] transition-all">
          {/* Card Header */}
          <div className="text-center space-y-1">
            <h2 className="font-heading font-bold text-2xl sm:text-[27px] text-[#103822] tracking-tight">
              Welcome to Bunbetsu
            </h2>
            <p className="text-xs sm:text-sm text-[#5A6E62]">
              {authMode === "login"
                ? "Sign in to plan cleaner, more sustainable events."
                : "Create an account to plan cleaner, more sustainable events."}
            </p>
          </div>

          {/* Segmented Pill Tabs: Login | Create account */}
          <div className="grid grid-cols-2 p-1 rounded-xl bg-white border border-[#E1EBE0] gap-1 mt-6">
            <button
              type="button"
              onClick={() => setAuthMode("login")}
              className={`py-2 rounded-lg text-xs sm:text-sm font-semibold transition-all cursor-pointer ${
                authMode === "login"
                  ? "bg-[#EAF5E7] text-[#0D4421] border border-[#70D000]/30 shadow-2xs"
                  : "text-[#5F7366] hover:text-[#103822] border border-transparent"
              }`}
            >
              Login
            </button>
            <button
              type="button"
              onClick={() => setAuthMode("signup")}
              className={`py-2 rounded-lg text-xs sm:text-sm font-semibold transition-all cursor-pointer ${
                authMode === "signup"
                  ? "bg-[#EAF5E7] text-[#0D4421] border border-[#70D000]/30 shadow-2xs"
                  : "text-[#5F7366] hover:text-[#103822] border border-transparent"
              }`}
            >
              Create account
            </button>
          </div>

          {/* Continue with Google Button */}
          <button
            type="button"
            onClick={handleGoogleSignIn}
            disabled={isLoading}
            className="w-full mt-4 sm:mt-5 py-2.5 sm:py-3 px-4 rounded-xl border border-[#D7E3D6] hover:bg-neutral-50/80 active:bg-neutral-100 transition flex items-center justify-center gap-2.5 text-xs sm:text-sm font-semibold text-[#1F2937] shadow-2xs cursor-pointer select-none"
          >
            <svg className="w-4.5 h-4.5 shrink-0" viewBox="0 0 24 24">
              <path
                fill="#4285F4"
                d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.66-5.17 3.66-9.17z"
              />
              <path
                fill="#34A853"
                d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.25v3.15C3.26 21.36 7.33 24 12 24z"
              />
              <path
                fill="#FBBC05"
                d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.13-1.55.38-2.27V6.58H1.25C.45 8.18 0 9.99 0 12s.45 3.82 1.25 5.42l4.03-3.15z"
              />
              <path
                fill="#EA4335"
                d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.33 0 3.26 2.64 1.25 6.58l4.03 3.15c.95-2.83 3.6-4.98 6.72-4.98z"
              />
            </svg>
            <span>Continue with Google</span>
          </button>

          {/* OR Divider */}
          <div className="relative my-4.5 sm:my-5 flex items-center justify-center">
            <div className="w-full border-t border-[#E1EBE0]" />
            <span className="absolute bg-white px-3 text-[11px] font-medium text-[#7D9183] uppercase tracking-wider">
              OR
            </span>
          </div>

          {/* Email & Password Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Optional Name field in Signup mode */}
            {authMode === "signup" && (
              <div>
                <label className="block text-xs font-semibold text-[#183E28] mb-1.5">
                  Full name
                </label>
                <input
                  type="text"
                  required
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Alex S."
                  className="w-full px-3.5 py-2.5 sm:py-3 rounded-xl border border-[#D5E1D4] focus:outline-none focus:border-[#0D4421] focus:ring-2 focus:ring-[#70D000]/25 text-xs sm:text-sm text-[#113821] placeholder:text-[#95A79B] transition bg-white"
                />
              </div>
            )}

            {/* Email address */}
            <div>
              <label className="block text-xs font-semibold text-[#183E28] mb-1.5">
                Email address
              </label>
              <div className="relative flex items-center">
                <Mail className="w-4 h-4 text-[#7C9083] absolute left-3.5 pointer-events-none" />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@university.edu"
                  className="w-full pl-10 pr-3.5 py-2.5 sm:py-3 rounded-xl border border-[#D5E1D4] focus:outline-none focus:border-[#0D4421] focus:ring-2 focus:ring-[#70D000]/25 text-xs sm:text-sm text-[#113821] placeholder:text-[#95A79B] transition bg-white"
                />
              </div>
            </div>

            {/* Password */}
            <div>
              <label className="block text-xs font-semibold text-[#183E28] mb-1.5">
                Password
              </label>
              <div className="relative flex items-center">
                <Lock className="w-4 h-4 text-[#7C9083] absolute left-3.5 pointer-events-none" />
                <input
                  type={showPassword ? "text" : "password"}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your password"
                  className="w-full pl-10 pr-10 py-2.5 sm:py-3 rounded-xl border border-[#D5E1D4] focus:outline-none focus:border-[#0D4421] focus:ring-2 focus:ring-[#70D000]/25 text-xs sm:text-sm text-[#113821] placeholder:text-[#95A79B] transition bg-white"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3.5 p-0.5 text-[#7C9083] hover:text-[#113821] transition cursor-pointer"
                  title={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? (
                    <Eye className="w-4 h-4" />
                  ) : (
                    <EyeOff className="w-4 h-4" />
                  )}
                </button>
              </div>
            </div>

            {/* Forgot password link */}
            {authMode === "login" && (
              <div className="text-right pt-0.5">
                <button
                  type="button"
                  onClick={() => {
                    setResetEmail(email !== "you@university.edu" ? email : "");
                    setShowForgotModal(true);
                  }}
                  className="text-xs font-bold text-[#0D4421] hover:underline cursor-pointer transition"
                >
                  Forgot password?
                </button>
              </div>
            )}

            {/* Primary Action Button: Login / Create account */}
            <button
              type="submit"
              disabled={isLoading}
              className="w-full mt-2 py-3 sm:py-3.5 rounded-xl bg-[#094120] hover:bg-[#073419] active:bg-[#052712] text-white font-bold text-xs sm:text-sm flex items-center justify-center gap-2 shadow-sm hover:shadow transition-all cursor-pointer font-sans"
            >
              <span>{authMode === "login" ? "Login" : "Create account"}</span>
              {isLoading ? (
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <ArrowRight className="w-4 h-4 text-white stroke-[2.5]" />
              )}
            </button>
          </form>

          {/* Bottom Toggle Link */}
          <div className="mt-5 sm:mt-6 text-center text-xs text-[#5E7265]">
            {authMode === "login" ? (
              <span>
                Don&apos;t have an account?{" "}
                <button
                  type="button"
                  onClick={() => setAuthMode("signup")}
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
                  onClick={() => setAuthMode("login")}
                  className="font-bold text-[#094120] underline hover:text-[#062D15] cursor-pointer"
                >
                  Login
                </button>
              </span>
            )}
          </div>

          {/* Optional Fast Demo Bypass Link */}
          {onContinueAsGuest && (
            <div className="mt-4 pt-3 border-t border-[#E1EBE0]/60 text-center">
              <button
                type="button"
                onClick={onContinueAsGuest}
                className="text-[11px] font-semibold text-[#667267] hover:text-[#094120] hover:underline cursor-pointer"
              >
                Explore campus planner as Guest →
              </button>
            </div>
          )}
        </div>
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
                onClick={() => setShowForgotModal(false)}
                className="p-1 rounded-md text-[#667267] hover:text-[#202820] hover:bg-neutral-100 transition cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-xs text-[#5A6E62] leading-relaxed">
              Enter your institutional email address and we&apos;ll dispatch a
              password reset link to your inbox.
            </p>
            <form onSubmit={handleSendReset} className="space-y-3.5">
              <input
                type="email"
                required
                value={resetEmail}
                onChange={(e) => setResetEmail(e.target.value)}
                placeholder="you@university.edu"
                className="w-full px-3.5 py-2.5 rounded-xl border border-[#D5E1D4] focus:outline-none focus:border-[#0D4421] text-xs sm:text-sm text-[#113821]"
              />
              <button
                type="submit"
                disabled={resetSent}
                className="w-full py-2.5 rounded-xl bg-[#094120] text-white font-bold text-xs hover:bg-[#073419] transition cursor-pointer flex items-center justify-center gap-2"
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
