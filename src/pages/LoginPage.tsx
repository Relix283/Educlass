import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { motion } from 'motion/react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { BookOpen, AlertCircle, Loader2 } from 'lucide-react';
import { supabase } from '@/src/lib/supabase';
import { useAuth } from '@/src/context/AuthContext';

const loginSchema = z.object({
  email: z.string().email('Format email tidak valid'),
  password: z.string().min(6, 'Password minimal 6 karakter'),
});

export default function LoginPage() {
  const { user, refreshProfile } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  const from = (location.state as any)?.from?.pathname || '/dashboard';

  // Redirect if already logged in
  useEffect(() => {
    if (user) {
      navigate(from, { replace: true });
    }
  }, [user, navigate, from]);

  const { register, handleSubmit, formState: { errors } } = useForm({
    resolver: zodResolver(loginSchema),
  });

  const onSubmit = async (data: any) => {
    setLoading(true);
    setError(null);
    try {
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: data.email,
        password: data.password,
      });
      if (signInError) throw signInError;
      navigate(from, { replace: true });
    } catch (err: any) {
      if (err.message?.includes('Failed to fetch')) {
        setError('Gagal menghubungi server. Periksa URL Supabase di Secrets.');
      } else {
        setError(err.message || 'Gagal masuk. Periksa kembali akun Anda.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex bg-white">
      {/* Left: Illustration */}
      <div className="hidden lg:flex flex-col justify-center items-center w-1/2 bg-indigo-600 p-12 text-white relative overflow-hidden">
        <div className="absolute top-0 right-0 -mr-20 -mt-20 w-96 h-96 bg-indigo-500/50 rounded-full blur-3xl"></div>
        <div className="absolute bottom-0 left-0 -ml-20 -mb-20 w-80 h-80 bg-blue-500/40 rounded-full blur-3xl"></div>
        
        <motion.div
           initial={{ opacity: 0, x: -20 }}
           animate={{ opacity: 1, x: 0 }}
           transition={{ duration: 0.6 }}
           className="relative z-10 text-center"
        >
          <div className="inline-block p-5 bg-white/10 backdrop-blur-lg rounded-[2rem] border border-white/20 mb-8 shadow-2xl">
            <BookOpen className="w-16 h-16" />
          </div>
          <h2 className="text-5xl font-black mb-6 tracking-tighter leading-[0.95]">Kembali Beraktivitas <br /> Bersama EduClass</h2>
          <p className="text-xl text-indigo-100 max-w-lg mx-auto font-medium">
            Platform terbaik untuk mengelola pembelajaran digital dengan cara yang elegan dan profesional.
          </p>
        </motion.div>
      </div>

      {/* Right: Form */}
      <div className="w-full lg:w-1/2 flex items-center justify-center p-8 bg-slate-50 lg:bg-white">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-md p-10 bg-white lg:p-0 rounded-3xl shadow-xl lg:shadow-none border border-slate-100 lg:border-0"
        >
          <div className="mb-10 lg:text-left text-center">
            <div className="lg:hidden inline-flex items-center gap-3 mb-6 justify-center">
              <div className="bg-indigo-600 p-2 rounded-xl text-white shadow-lg shadow-indigo-100">
                <BookOpen className="w-6 h-6" />
              </div>
              <span className="text-2xl font-black tracking-tight text-slate-900">EduClass</span>
            </div>
            <h1 className="text-3xl font-black text-slate-900 mb-3 tracking-tight">Selamat Datang</h1>
            <p className="text-slate-500 font-medium">Masuk ke akun Anda untuk melanjutkan aktivitas.</p>
          </div>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
            {error && (
              <div className="p-4 bg-rose-50 border border-rose-100 text-rose-600 rounded-2xl text-[11px] font-black uppercase tracking-widest flex items-start gap-3">
                <AlertCircle className="w-5 h-5 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <div>
              <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Email Akun</label>
              <input
                {...register('email')}
                className="w-full px-5 py-4 bg-slate-50 border border-slate-100 rounded-2xl focus:ring-4 focus:ring-indigo-100 focus:border-indigo-600 transition-all outline-none font-medium text-slate-700"
                placeholder="email@example.com"
              />
              {errors.email && <p className="mt-2 text-[10px] text-rose-500 font-black uppercase tracking-widest">{errors.email.message as string}</p>}
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Password</label>
                <a href="#" className="text-[10px] font-black text-indigo-600 uppercase tracking-widest hover:underline">Lupa?</a>
              </div>
              <div className="relative">
                <input
                  {...register('password')}
                  type={showPassword ? 'text' : 'password'}
                  className="w-full px-5 py-4 bg-slate-50 border border-slate-100 rounded-2xl focus:ring-4 focus:ring-indigo-100 focus:border-indigo-600 transition-all outline-none font-medium text-slate-700"
                  placeholder="••••••••"
                />
                <button 
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-5 top-1/2 -translate-y-1/2 text-[10px] font-black text-indigo-400 uppercase tracking-widest hover:text-indigo-600 transition-colors"
                >
                  {showPassword ? 'Sembunyi' : 'Lihat'}
                </button>
              </div>
              {errors.password && <p className="mt-2 text-[10px] text-rose-500 font-black uppercase tracking-widest">{errors.password.message as string}</p>}
            </div>

            <button
              disabled={loading}
              type="submit"
              className="w-full py-4 bg-indigo-600 text-white rounded-2xl font-black uppercase tracking-widest text-xs hover:bg-indigo-700 transition-all shadow-xl shadow-indigo-100 disabled:opacity-70 disabled:cursor-wait flex items-center justify-center gap-3 active:scale-[0.98]"
            >
              {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Masuk Sekarang'}
            </button>
          </form>

          <p className="mt-10 text-center text-slate-500 text-sm font-medium">
            Belum punya akun?{' '}
            <Link to="/register" className="text-indigo-600 font-black hover:underline uppercase tracking-widest text-[11px]">Daftar Akun</Link>
          </p>
        </motion.div>
      </div>
    </div>
  );
}
