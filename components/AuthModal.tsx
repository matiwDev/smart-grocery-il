import React, { useState } from 'react';
import { X } from 'lucide-react';
import { supabase } from "@/utils/supabase";

export type AuthMode = 'SIGN_IN' | 'SIGN_UP' | 'NONE';

  interface AuthModalProps {
    authMode: AuthMode;
    setAuthMode: (mode: AuthMode) => void;
    onAuthSuccess: (nickname: string) => void;
    t: any;
  }

export function AuthModal({ authMode, setAuthMode, onAuthSuccess, t }: AuthModalProps) {
  const [usernameInput, setUsernameInput] = useState('');
  const [emailInput, setEmailInput] = useState('');
  const [phoneInput, setPhoneInput] = useState('');
  const [passwordInput, setPasswordInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [verificationNotice, setVerificationNotice] = useState('');
  const [isVerifying, setIsVerifying] = useState(false);
  const [verificationCode, setVerificationCode] = useState('');

  if (authMode === 'NONE') return null;

  const isDev = process.env.NODE_ENV === 'development';

  const handleDevLogin = async () => {
    setErrorMsg('');
    setIsLoading(true);
    try {
      const res = await fetch('/api/dev/login', { method: 'POST' });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || 'Dev login failed');

      if (!supabase) throw new Error('Supabase client not configured');
      const { error } = await supabase.auth.signInWithPassword({
        email: body.email,
        password: body.password,
      });
      if (error) throw error;

      onAuthSuccess(body.nickname);
      setAuthMode('NONE');
    } catch (err: any) {
      console.error('Dev login error:', err);
      setErrorMsg(err.message || 'Dev login failed');
    } finally {
      setIsLoading(false);
    }
  };

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setIsLoading(true);
    
    if (supabase) {
      try {
        const verifyData: any = {
          token: verificationCode.trim(),
        };
        
        if (emailInput.trim()) {
          verifyData.email = emailInput.trim();
          verifyData.type = 'signup';
        } else {
          verifyData.phone = phoneInput.trim();
          verifyData.type = 'sms';
        }

        const { data, error } = await supabase.auth.verifyOtp(verifyData);

        if (error) throw error;

        if (data.session && data.user) {
          // Now that the session is live, auth.uid() satisfies the profiles RLS check
          const { error: profileError } = await supabase.from('profiles').upsert({
            id: data.user.id,
            email: emailInput.trim(),
            nickname: usernameInput.trim(),
            phone_number: phoneInput.trim(),
            avatar_url: 'https://res.cloudinary.com/djcksi74n/image/upload/v1782869112/Avatars_01_u3edkv.png',
            selected_skin: 'warm-rose',
          });
          if (profileError) throw profileError;

          onAuthSuccess(usernameInput.trim());
          setAuthMode('NONE');
        }
      } catch (err: any) {
        console.error('Verify OTP error:', err);
        setErrorMsg(err.message || 'Verification failed.');
      } finally {
        setIsLoading(false);
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setVerificationNotice('');
    setIsLoading(true);

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(emailInput.trim())) {
      setErrorMsg('Please enter a valid email address / אנא הזן כתובת אימייל תקינה');
      setIsLoading(false);
      return;
    }

    if (authMode === 'SIGN_UP') {
      const phoneRegex = /^[0-9+\-\s()]{9,15}$/;
      if (!phoneRegex.test(phoneInput.trim())) {
        setErrorMsg('Please enter a valid phone number / אנא הזן מספר טלפון תקין');
        setIsLoading(false);
        return;
      }
    }

    if (passwordInput.length < 6 || !/[a-zA-Z]/.test(passwordInput) || !/[0-9]/.test(passwordInput)) {
      setErrorMsg('Password must be at least 6 characters with letters and numbers / הסיסמה חייבת להכיל לפחות 6 תווים הכוללים אותיות ומספרים');
      setIsLoading(false);
      return;
    }

    let userProfile = {
      nickname: usernameInput.trim(),
      email: authMode === 'SIGN_UP' ? emailInput.trim() : 'user@example.com',
      phone: authMode === 'SIGN_UP' ? phoneInput.trim() : '050-0000000',
      avatar: 'https://res.cloudinary.com/djcksi74n/image/upload/v1782869112/Avatars_01_u3edkv.png',
      id: '00000000-0000-0000-0000-000000000000'
    };

    if (authMode === 'SIGN_IN') {
       userProfile.email = emailInput.trim();
    }

    if (supabase) {
      try {
        if (authMode === 'SIGN_UP') {
          const { data: authData, error: authError } = await supabase.auth.signUp({
            email: emailInput.trim(),
            password: passwordInput.trim(),
            options: {
              data: {
                phone: phoneInput.trim(),
                nickname: usernameInput.trim()
              }
            }
          });
          
          if (authError) throw authError;

          if (authData.user) {
            userProfile.id = authData.user.id;

            if (!authData.session) {
              // No session yet (email confirmation required) — the profiles RLS check
              // needs auth.uid(), so the profile row is created after OTP verification instead.
              setVerificationNotice(t.verificationNotice || 'Please verify your email to log in');
              setIsVerifying(true);
              setIsLoading(false);
              return;
            }

            // Auto-confirm is enabled and we already have a session — safe to write now.
            const { error: profileError } = await supabase.from('profiles').upsert({
              id: authData.user.id,
              email: emailInput.trim(),
              nickname: usernameInput.trim(),
              phone_number: phoneInput.trim(),
              avatar_url: userProfile.avatar,
              selected_skin: 'warm-rose'
            });

            if (profileError) throw profileError;
          }
        } else {
          const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
            email: emailInput.trim(),
            password: passwordInput.trim(),
          });
          
          if (authError) {
            if (authError.message.includes('Invalid login credentials') || authError.status === 400) {
              throw new Error('User account does not exist. Please sign up first / החשבון אינו קיים. אנא הרשם תחילה');
            }
            throw authError;
          }
          
          if (authData.user) {
            userProfile.id = authData.user.id;
            const { data: profile, error: profileError } = await supabase
              .from('profiles')
              .select('*')
              .eq('id', authData.user.id)
              .single();
              
            if (profileError && profileError.code !== 'PGRST116') throw profileError;
            
            if (profile) {
              userProfile = {
                ...userProfile,
                nickname: profile.nickname || userProfile.nickname,
                phone: profile.phone_number || userProfile.phone,
                avatar: profile.avatar_url || userProfile.avatar,
              };
            }
          }
        }
        onAuthSuccess(userProfile.nickname);
        setAuthMode('NONE');
      } catch (err: any) {
        console.error('Auth error:', err);
        
        if (err.code === '23505' && err.message.includes('nickname')) {
          setErrorMsg('This Nickname is already taken inside your household / כינוי זה כבר תפוס בקבוצה זו');
        } else if (err.message && (err.message.includes('does not exist') || err.message.includes('already registered'))) {
           setErrorMsg(err.message);
        } else {
           setErrorMsg(err.message || 'Authentication failed.');
        }
      } finally {
        setIsLoading(false);
      }
    } else {
      // Offline / no DB fallback
      onAuthSuccess(userProfile.nickname);
      setAuthMode('NONE');
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-slate-900 border border-slate-800 shadow-2xl rounded-3xl w-full max-w-md overflow-hidden relative">
        <button 
          onClick={() => setAuthMode('NONE')}
          className="absolute top-4 end-4 text-slate-400 hover:text-white transition-colors p-3 -m-3"
        >
          <X className="w-5 h-5" />
        </button>
        
        <div className="p-8">
          <h2 className="text-2xl font-bold text-white mb-6 text-center">
            {authMode === 'SIGN_IN' ? t.authModalTitleIn : t.authModalTitleUp}
          </h2>
          
          {errorMsg && (
            <div className="bg-rose-500/10 border border-rose-500/20 text-rose-400 p-3 rounded-xl mb-4 text-sm text-center">
              {errorMsg}
            </div>
          )}

          {isDev && !isVerifying && (
            <button
              type="button"
              onClick={handleDevLogin}
              disabled={isLoading}
              className="w-full mb-4 bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border border-amber-500/30 border-dashed rounded-xl py-2.5 text-sm font-semibold transition-colors disabled:opacity-50"
            >
              {isLoading ? '...' : '⚡ Dev Login (skips email, local only)'}
            </button>
          )}

          {isVerifying ? (
            <form onSubmit={handleVerify} className="space-y-4 mt-6">
              <div className="bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 p-3 rounded-xl mb-6 text-sm text-center font-medium">
                {verificationNotice}
              </div>
              
              <div>
                <label className="block text-sm font-medium text-slate-400 mb-1 text-center">
                  {t.enterVerificationCode || "Enter 6-digit code"}
                </label>
                <input 
                  type="text" 
                  required
                  maxLength={6}
                  value={verificationCode}
                  onChange={(e) => setVerificationCode(e.target.value.replace(/\D/g, ''))}
                  className="w-full text-center tracking-widest text-2xl font-mono min-h-[56px] bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all"
                  dir="ltr"
                />
              </div>
              
              <button 
                type="submit"
                disabled={isLoading || verificationCode.length !== 6}
                className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-3 rounded-xl transition-colors mt-6 shadow-lg shadow-indigo-500/20 disabled:opacity-50"
              >
                {isLoading ? '...' : (t.verify || 'Verify')}
              </button>
            </form>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              {authMode === 'SIGN_UP' && (
                 <div>
                   <label className="block text-sm font-medium text-slate-400 mb-1">
                     {t.nicknameLabel}
                   </label>
                   <input 
                     type="text" 
                     required
                     value={usernameInput}
                     onChange={(e) => setUsernameInput(e.target.value)}
                     className="w-full min-h-[44px] bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all"
                     dir="auto"
                   />
                 </div>
              )}
              
              <div>
                <label className="block text-sm font-medium text-slate-400 mb-1">{t.emailLabel}</label>
                <input 
                  type="email" 
                  required
                  value={emailInput}
                  onChange={(e) => setEmailInput(e.target.value)}
                  className="w-full min-h-[44px] bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all"
                  dir="ltr"
                />
              </div>
              
              {authMode === 'SIGN_UP' && (
                 <div>
                   <label className="block text-sm font-medium text-slate-400 mb-1">{t.phoneLabel}</label>
                   <input 
                     type="tel" 
                     required
                     placeholder={t.phonePlaceholder}
                     value={phoneInput}
                     onChange={(e) => setPhoneInput(e.target.value)}
                     className="w-full min-h-[44px] bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all"
                     dir="ltr"
                   />
                 </div>
              )}
              
              <div>
                <label className="block text-sm font-medium text-slate-400 mb-1">{t.passwordLabel}</label>
                <input 
                  type="password" 
                  required
                  value={passwordInput}
                  onChange={(e) => setPasswordInput(e.target.value)}
                  className="w-full min-h-[44px] bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all"
                  dir="ltr"
                />
              </div>
              
              <button 
                type="submit"
                disabled={isLoading}
                className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-3 rounded-xl transition-colors mt-6 shadow-lg shadow-indigo-500/20 disabled:opacity-50"
              >
                {isLoading ? '...' : t.submit}
              </button>
            </form>
          )}
          
          <div className="mt-6 text-center">
            <button 
              onClick={() => {
                setAuthMode(authMode === 'SIGN_IN' ? 'SIGN_UP' : 'SIGN_IN');
                setErrorMsg('');
              }}
              className="text-sm text-indigo-400 hover:text-indigo-300 transition-colors font-medium"
            >
              {authMode === 'SIGN_IN' ? t.switchToSignUp : t.switchToSignIn}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
