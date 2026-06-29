"use client";

import React, { useState } from "react";
import { signIn } from "next-auth/react";
import { motion, AnimatePresence } from "motion/react";
import { 
  X, 
  Mail, 
  Lock, 
  User, 
  Eye, 
  EyeOff, 
  AlertCircle, 
  CheckCircle2, 
  ArrowRight, 
  ArrowLeft 
} from "lucide-react";

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  lang: "he" | "en";
  onAuthSuccess?: (userName: string) => void;
}

const DICTIONARY = {
  he: {
    signIn: "התחברות",
    signUp: "יצירת חשבון",
    emailLabel: "כתובת אימייל",
    emailPlaceholder: "name@example.com",
    passwordLabel: "סיסמה מאובטחת",
    passwordPlaceholder: "••••••••",
    nameLabel: "שם מלא",
    namePlaceholder: "ישראל ישראלי",
    googleButton: "המשך באמצעות Google",
    rememberMe: "זכור אותי במכשיר זה",
    forgotPassword: "שכחת סיסמה?",
    termsText: "בהמשך התהליך, הנך מסכים ל",
    termsLink: "תנאי השימוש",
    and: "וכן ל",
    privacyLink: "מדיניות הפרטיות",
    submitSignIn: "התחבר למערכת",
    submitSignUp: "צור חשבון חדש",
    errorEmailInvalid: "אנא הזן כתובת אימייל תקינה",
    errorPasswordTooShort: "הסיסמה חייבת להכיל 6 תווים לפחות",
    errorNameRequired: "אנא הזן שם מלא",
    successSignIn: "התחברת בהצלחה! ברוך הבא.",
    successSignUp: "החשבון נוצר בהצלחה! ברוך הבא.",
    orSeparator: "או המשך באמצעות אימייל",
  },
  en: {
    signIn: "Sign In",
    signUp: "Create Account",
    emailLabel: "Email Address",
    emailPlaceholder: "name@example.com",
    passwordLabel: "Secure Password",
    passwordPlaceholder: "••••••••",
    nameLabel: "Full Name",
    namePlaceholder: "John Doe",
    googleButton: "Continue with Google",
    rememberMe: "Remember me on this device",
    forgotPassword: "Forgot password?",
    termsText: "By continuing, you agree to our ",
    termsLink: "Terms of Service",
    and: " and ",
    privacyLink: "Privacy Policy",
    submitSignIn: "Sign In to Account",
    submitSignUp: "Create New Account",
    errorEmailInvalid: "Please enter a valid email address",
    errorPasswordTooShort: "Password must be at least 6 characters",
    errorNameRequired: "Please enter your full name",
    successSignIn: "Successfully signed in! Welcome back.",
    successSignUp: "Account created successfully! Welcome.",
    orSeparator: "or continue with email",
  }
};

export default function AuthModal({ isOpen, onClose, lang, onAuthSuccess }: AuthModalProps) {
  const t = DICTIONARY[lang];
  const isRTL = lang === "he";

  const [activeTab, setActiveTab] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);

  // States for dynamic UX simulation
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  if (!isOpen) return null;

  const handleTabChange = (tab: "signin" | "signup") => {
    setActiveTab(tab);
    setError(null);
    setSuccess(null);
  };

  const validateForm = () => {
    if (!email || !email.includes("@")) {
      setError(t.errorEmailInvalid);
      return false;
    }
    if (!password || password.length < 6) {
      setError(t.errorPasswordTooShort);
      return false;
    }
    if (activeTab === "signup" && !name.trim()) {
      setError(t.errorNameRequired);
      return false;
    }
    return true;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (!validateForm()) return;

    setIsLoading(true);

    try {
      const res = await signIn("credentials", {
        email,
        password,
        redirect: false,
      });

      setIsLoading(false);

      if (res?.error) {
        setError(lang === "he" ? "פרטי התחברות שגויים או שגיאה במערכת" : "Invalid credentials or system error");
      } else {
        const displayName = activeTab === "signup" ? name : email.split("@")[0];
        setSuccess(activeTab === "signup" ? t.successSignUp : t.successSignIn);
        
        if (onAuthSuccess) {
          setTimeout(() => {
            onAuthSuccess(displayName);
            onClose();
          }, 1500);
        } else {
          setTimeout(() => {
            onClose();
          }, 1500);
        }
      }
    } catch (err: any) {
      setIsLoading(false);
      setError(err?.message || "Something went wrong");
    }
  };

  const handleGoogleSignIn = async () => {
    setIsLoading(true);
    setError(null);
    setSuccess(null);

    try {
      await signIn("google");
    } catch (err: any) {
      setIsLoading(false);
      setError(err?.message || "Google Sign-In failed");
    }
  };

  return (
    <AnimatePresence>
      <div 
        id="auth-modal-overlay"
        className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4"
        onClick={onClose}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 15 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 15 }}
          transition={{ duration: 0.2, ease: "easeOut" }}
          onClick={(e) => e.stopPropagation()}
          className="relative w-full max-w-md bg-[var(--panel)] border border-[var(--panel-border)] rounded-2xl shadow-2xl overflow-hidden backdrop-blur-xl flex flex-col"
          dir={isRTL ? "rtl" : "ltr"}
        >
          {/* Accent Line */}
          <div className="absolute top-0 right-0 left-0 h-[3px] bg-gradient-to-r from-[var(--primary)] to-[var(--accent)] z-20"></div>

          {/* Modal Header */}
          <div className="flex items-center justify-between p-5 border-b border-[var(--panel-border)] shrink-0">
            <h3 className="text-base font-bold text-[var(--text-highlight)]">
              {activeTab === "signin" ? t.signIn : t.signUp}
            </h3>
            <button
              onClick={onClose}
              className="p-1 rounded-lg hover:bg-[var(--background)] border border-transparent hover:border-[var(--panel-border)] text-[var(--text-muted)] hover:text-[var(--text)] transition-all cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="p-6 overflow-y-auto scrollbar-thin">
            {/* Elegant Premium Tab Selectors */}
            <div className="grid grid-cols-2 bg-[var(--background)] border border-[var(--panel-border)] p-1 rounded-xl mb-6">
              <button
                onClick={() => handleTabChange("signin")}
                className={`py-2 rounded-lg text-xs font-bold transition-all duration-200 cursor-pointer ${
                  activeTab === "signin"
                    ? "bg-[var(--primary)] text-[var(--text-highlight)] shadow-sm"
                    : "text-[var(--text-muted)] hover:text-[var(--text)]"
                }`}
              >
                {t.signIn}
              </button>
              <button
                onClick={() => handleTabChange("signup")}
                className={`py-2 rounded-lg text-xs font-bold transition-all duration-200 cursor-pointer ${
                  activeTab === "signup"
                    ? "bg-[var(--primary)] text-[var(--text-highlight)] shadow-sm"
                    : "text-[var(--text-muted)] hover:text-[var(--text)]"
                }`}
              >
                {t.signUp}
              </button>
            </div>

            {/* Error & Success Messages */}
            {error && (
              <motion.div 
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className="mb-4 p-3 bg-red-500/10 border border-red-500/20 text-red-400 text-xs rounded-lg flex items-center gap-2"
              >
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{error}</span>
              </motion.div>
            )}

            {success && (
              <motion.div 
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className="mb-4 p-3 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs rounded-lg flex items-center gap-2"
              >
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>{success}</span>
              </motion.div>
            )}

            {/* Prominent 'Continue with Google' Social Button */}
            <button
              type="button"
              onClick={handleGoogleSignIn}
              disabled={isLoading}
              className="w-full h-11 bg-[var(--background)] hover:bg-[var(--panel-border)]/20 border border-[var(--panel-border)] rounded-xl text-xs font-bold text-[var(--text-highlight)] transition-all flex items-center justify-center gap-2.5 shadow-sm cursor-pointer disabled:opacity-50"
            >
              {/* Google SVG Logo */}
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" fill="#FBBC05" />
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" fill="#EA4335" />
              </svg>
              <span>{t.googleButton}</span>
            </button>

            {/* Separator */}
            <div className="flex items-center my-5">
              <div className="flex-1 h-px bg-[var(--panel-border)]/50"></div>
              <span className="px-3 text-[10px] text-[var(--text-muted)] font-mono uppercase tracking-wider">
                {t.orSeparator}
              </span>
              <div className="flex-1 h-px bg-[var(--panel-border)]/50"></div>
            </div>

            {/* Core Form */}
            <form onSubmit={handleSubmit} className="space-y-4">
              {activeTab === "signup" && (
                <div>
                  <label className="block text-[11px] font-bold text-[var(--text-muted)] uppercase tracking-wider mb-1.5">
                    {t.nameLabel}
                  </label>
                  <div className="relative">
                    <User className="absolute start-3 top-2.5 w-4 h-4 text-[var(--text-muted)]" />
                    <input
                      type="text"
                      disabled={isLoading}
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder={t.namePlaceholder}
                      className="w-full h-9 bg-[var(--background)] border border-[var(--panel-border)] rounded-xl text-xs text-[var(--text)] placeholder-[var(--text-muted)] focus:outline-none focus:border-[var(--primary)] focus:ring-1 focus:ring-[var(--primary)]/30 transition-all ps-9 pe-4"
                    />
                  </div>
                </div>
              )}

              <div>
                <label className="block text-[11px] font-bold text-[var(--text-muted)] uppercase tracking-wider mb-1.5">
                  {t.emailLabel}
                </label>
                <div className="relative">
                  <Mail className="absolute start-3 top-2.5 w-4 h-4 text-[var(--text-muted)]" />
                  <input
                    type="email"
                    disabled={isLoading}
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder={t.emailPlaceholder}
                    className="w-full h-9 bg-[var(--background)] border border-[var(--panel-border)] rounded-xl text-xs text-[var(--text)] placeholder-[var(--text-muted)] focus:outline-none focus:border-[var(--primary)] focus:ring-1 focus:ring-[var(--primary)]/30 transition-all ps-9 pe-4"
                  />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-[11px] font-bold text-[var(--text-muted)] uppercase tracking-wider">
                    {t.passwordLabel}
                  </label>
                  {activeTab === "signin" && (
                    <button
                      type="button"
                      className="text-[10px] text-[var(--primary)] hover:underline font-bold"
                    >
                      {t.forgotPassword}
                    </button>
                  )}
                </div>
                <div className="relative">
                  <Lock className="absolute start-3 top-2.5 w-4 h-4 text-[var(--text-muted)]" />
                  <input
                    type={showPassword ? "text" : "password"}
                    disabled={isLoading}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder={t.passwordPlaceholder}
                    className="w-full h-9 bg-[var(--background)] border border-[var(--panel-border)] rounded-xl text-xs text-[var(--text)] placeholder-[var(--text-muted)] focus:outline-none focus:border-[var(--primary)] focus:ring-1 focus:ring-[var(--primary)]/30 transition-all ps-9 pe-9"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute end-3 top-2.5 text-[var(--text-muted)] hover:text-[var(--text)] transition-colors"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {activeTab === "signin" && (
                <div className="flex items-center gap-2 pt-1">
                  <input
                    type="checkbox"
                    id="remember-me-checkbox"
                    checked={rememberMe}
                    onChange={(e) => setRememberMe(e.target.checked)}
                    className="w-4 h-4 rounded border-[var(--panel-border)] bg-[var(--background)] text-[var(--primary)] focus:ring-[var(--primary)]/30"
                  />
                  <label htmlFor="remember-me-checkbox" className="text-[11px] text-[var(--text-muted)] select-none cursor-pointer">
                    {t.rememberMe}
                  </label>
                </div>
              )}

              {/* Terms and Conditions Notice for Sign Up */}
              {activeTab === "signup" && (
                <p className="text-[10px] text-[var(--text-muted)] leading-relaxed pt-1">
                  {t.termsText}
                  <a href="#" className="text-[var(--primary)] hover:underline font-semibold">{t.termsLink}</a>
                  {t.and}
                  <a href="#" className="text-[var(--primary)] hover:underline font-semibold">{t.privacyLink}</a>
                </p>
              )}

              {/* Submit Button */}
              <button
                type="submit"
                disabled={isLoading}
                className="w-full h-11 bg-[var(--primary)] hover:bg-[var(--primary-hover)] text-white text-xs font-bold rounded-xl transition-all flex items-center justify-center gap-2 shadow-lg shadow-[var(--primary-glow)] cursor-pointer disabled:opacity-50"
              >
                {isLoading ? (
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
                ) : (
                  <>
                    <span>{activeTab === "signin" ? t.submitSignIn : t.submitSignUp}</span>
                    {isRTL ? <ArrowLeft className="w-4 h-4" /> : <ArrowRight className="w-4 h-4" />}
                  </>
                )}
              </button>
            </form>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
