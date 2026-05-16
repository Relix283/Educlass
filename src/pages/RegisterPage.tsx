import React, { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '@/src/lib/supabase';
import { BookOpen, AlertCircle, Loader2, School, GraduationCap, User, CheckCircle2, ChevronDown, PlusCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useAuth } from '@/src/context/AuthContext';

export default function RegisterPage() {
  const { register, handleSubmit, watch, setValue, formState: { errors } } = useForm<any>({
    defaultValues: {
      role: 'murid',
      isWaliKelas: 'false',
      classId: '',
      level: 'X',
      department: 'PPLG',
      classNameSuffix: 'A',
      fullName: '',
      email: '',
      username: '',
      mataPelajaran: '',
      password: ''
    }
  });

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [classes, setClasses] = useState<any[]>([]);
  const [isCreatingClass, setIsCreatingClass] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  
  const navigate = useNavigate();
  const { user, refreshProfile } = useAuth();

  // Redirect if already logged in
  useEffect(() => {
    if (user) {
      navigate('/dashboard', { replace: true });
    }
  }, [user, navigate]);

  const selectedRole = watch('role');
  const watchWaliKelas = watch('isWaliKelas');
  const isGuru = selectedRole === 'guru';
  const isWaliKelas = watchWaliKelas === 'true';

  // Reset isCreatingClass if role changes to murid
  useEffect(() => {
    if (selectedRole === 'murid') {
      setIsCreatingClass(false);
    }
  }, [selectedRole]);

  useEffect(() => {
    const fetchClasses = async () => {
      try {
        const { data, error: fetchError } = await supabase.from('classes').select('*').order('full_name');
        if (fetchError) throw fetchError;
        if (data) setClasses(data);
      } catch (err: any) {
        console.error('Initial fetch classes error:', err);
        if (err.message?.includes('Failed to fetch')) {
          setError('Koneksi terputus (Failed to fetch). Periksa VITE_SUPABASE_URL di Secrets dan pastikan koneksi internet stabil.');
        }
      }
    };
    fetchClasses();
  }, []);

  const onSubmit = async (data: any) => {
    setLoading(true);
    setError(null);
    try {
      console.log('Attempting registration for:', data.email);
      // 1. Sign Up User
      const { data: authData, error: signUpError } = await supabase.auth.signUp({
        email: data.email,
        password: data.password,
        options: {
          data: {
            full_name: data.fullName,
            username: data.username,
            role: data.role,
            is_wali_kelas: isGuru ? isWaliKelas : false,
          }
        }
      });

      if (signUpError) {
        console.error('SignUp Error Object:', signUpError);
        throw signUpError;
      }
      if (!authData.user) throw new Error('Registrasi gagal. Cek kembali data Anda.');

      let finalClassId = data.classId;

      // 2. Handle New Class Creation for Wali Kelas
      if (isGuru && isWaliKelas && isCreatingClass) {
        try {
          const { data: newClass, error: classError } = await supabase
            .from('classes')
            .insert({ 
              level: data.level,
              department: data.department,
              class_name: data.classNameSuffix
            })
            .select()
            .single();
          
          if (classError) {
            console.error('Class Creation Error:', classError);
            if (classError.message.includes('ROW-LEVEL SECURITY')) {
              throw new Error('Gagal membuat kelas: Kebijakan RLS membatasi akses. Buka supabase_schema.sql dan terapkan policy RLS yang diperlukan di Supabase SQL Editor Anda.');
            }
            throw classError;
          }
          finalClassId = newClass.id;
        } catch (clsErr: any) {
          throw new Error('GAGAL MEMBUAT KELAS: ' + (clsErr.message || 'Terjadi kesalahan tidak dikenal.'));
        }
      }

      // 3. Create Profile
      const { error: profileError } = await supabase.from('profiles').insert({
        id: authData.user.id,
        full_name: data.fullName,
        username: data.username,
        role: data.role,
        mata_pelajaran: isGuru ? data.mataPelajaran : null,
        is_wali_kelas: isGuru ? isWaliKelas : false,
        class_id: (data.role === 'murid' || (isGuru && isWaliKelas)) ? finalClassId : null
      });

      if (profileError) {
        console.error('Profile insertion error:', profileError);
        if (profileError.message.includes('ROW-LEVEL SECURITY')) {
          setError("Akun dibuat, tapi profil gagal disimpan. Cek kebijakan RLS tabel 'profiles'.");
          return;
        }
        throw profileError;
      }

      await refreshProfile();
      navigate('/dashboard');
    } catch (err: any) {
      console.error('Detailed Registration Error:', err);
      if (err.message?.includes('Failed to fetch')) {
        setError('Gagal menghubungi server (Failed to fetch). Pastikan URL Supabase Anda benar dan tidak ada adblocker yang memblokir permintaan.');
      } else {
        setError(err.message || 'Terjadi kesalahan saat mendaftar.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex bg-white font-sans text-slate-900">
      {/* Left: Branding */}
      <div className="hidden lg:flex flex-col justify-center items-center w-1/3 bg-indigo-600 p-12 text-white relative overflow-hidden">
        <div className="absolute top-0 right-0 -mr-20 -mt-20 w-80 h-80 bg-indigo-500/50 rounded-full blur-3xl"></div>
        <div className="absolute bottom-0 left-0 -ml-20 -mb-20 w-80 h-80 bg-blue-500/40 rounded-full blur-3xl"></div>
        <div className="relative z-10 text-center">
          <motion.div 
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="inline-block p-6 bg-white/10 backdrop-blur-xl rounded-[2.5rem] border border-white/20 mb-8 shadow-2xl"
          >
            <School className="w-16 h-16" />
          </motion.div>
          <h2 className="text-4xl font-black mb-6 tracking-tighter leading-tight">Digitalisasi Kelas <br /> Lebih Mudah</h2>
          <p className="text-lg text-indigo-100 font-medium opacity-90 max-w-sm mx-auto leading-relaxed">
            Satu platform untuk semua kebutuhan manajemen kelas Anda secara terintegrasi.
          </p>
        </div>
      </div>

      {/* Right: Form Section */}
      <div className="w-full lg:w-2/3 flex items-center justify-center p-6 bg-slate-50/30 overflow-y-auto">
        <motion.div
           initial={{ opacity: 0, y: 20 }}
           animate={{ opacity: 1, y: 0 }}
           className="w-full max-w-2xl bg-white p-8 md:p-12 rounded-[2.5rem] shadow-[0_32px_64px_-16px_rgba(0,0,0,0.08)] border border-slate-100"
        >
          <div className="mb-10 flex items-center justify-between">
            <div className="lg:block hidden">
              <h1 className="text-3xl font-black text-slate-900 tracking-tight">Daftar Sekarang</h1>
              <p className="text-slate-500 font-medium mt-1">Lengkapi data diri untuk memulai pengalaman EduClass.</p>
            </div>
            {/* Mobile Brand */}
            <div className="lg:hidden flex items-center gap-3">
              <div className="bg-indigo-600 p-2 rounded-xl text-white">
                <School className="w-6 h-6" />
              </div>
              <span className="text-xl font-black tracking-tight">EduClass</span>
            </div>
          </div>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-8">
            <AnimatePresence mode="wait">
              {error && (
                <motion.div 
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="p-4 bg-rose-50 border border-rose-100 text-rose-600 rounded-2xl text-[11px] font-black uppercase tracking-widest flex items-start gap-4 mb-4"
                >
                  <AlertCircle className="w-5 h-5 shrink-0" />
                  <span>{error}</span>
                </motion.div>
              )}
            </AnimatePresence>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-10">
              {/* Profile Information */}
              <section className="space-y-6">
                <h3 className="text-[10px] font-black text-indigo-600 uppercase tracking-[0.2em] mb-4">Informasi Profil</h3>
                
                <div className="space-y-4">
                  <div>
                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 px-1">Nama Lengkap</label>
                    <input
                      {...register('fullName', { required: 'Nama lengkap wajib diisi' })}
                      className="w-full px-5 py-4 bg-slate-50 border border-slate-100 rounded-2xl focus:ring-4 focus:ring-indigo-100 focus:border-indigo-600 transition-all outline-none font-bold text-slate-700"
                      placeholder="Masukkan nama lengkap"
                    />
                    {errors.fullName && <p className="mt-2 text-[9px] text-rose-500 font-black uppercase tracking-widest px-1">{errors.fullName.message as string}</p>}
                  </div>

                  <div>
                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 px-1">Email Aktif</label>
                    <input
                      {...register('email', { required: 'Email wajib diisi' })}
                      type="email"
                      className="w-full px-5 py-4 bg-slate-50 border border-slate-100 rounded-2xl focus:ring-4 focus:ring-indigo-100 focus:border-indigo-600 transition-all outline-none font-bold text-slate-700"
                      placeholder="email@sekolah.com"
                    />
                    {errors.email && <p className="mt-2 text-[9px] text-rose-500 font-black uppercase tracking-widest px-1">{errors.email.message as string}</p>}
                  </div>

                  <div>
                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 px-1">Username</label>
                    <input
                      {...register('username', { required: 'Username wajib diisi' })}
                      className="w-full px-5 py-4 bg-slate-50 border border-slate-100 rounded-2xl focus:ring-4 focus:ring-indigo-100 focus:border-indigo-600 transition-all outline-none font-bold text-slate-700"
                      placeholder="username_unik"
                    />
                    {errors.username && <p className="mt-2 text-[9px] text-rose-500 font-black uppercase tracking-widest px-1">{errors.username.message as string}</p>}
                  </div>

                  <div>
                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 px-1">Password</label>
                    <div className="relative">
                      <input
                        {...register('password', { required: 'Password wajib diisi', minLength: { value: 6, message: 'Minimal 6 karakter' } })}
                        type={showPassword ? 'text' : 'password'}
                        className="w-full px-5 py-4 bg-slate-50 border border-slate-100 rounded-2xl focus:ring-4 focus:ring-indigo-100 focus:border-indigo-600 transition-all outline-none font-bold text-slate-700"
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
                    {errors.password && <p className="mt-2 text-[9px] text-rose-500 font-black uppercase tracking-widest px-1">{errors.password.message as string}</p>}
                  </div>
                </div>
              </section>

              {/* Role & Role Logic */}
              <section className="space-y-8">
                <h3 className="text-[10px] font-black text-indigo-600 uppercase tracking-[0.2em] mb-4">Level Akses</h3>

                {/* Primary Role Selector */}
                <div className="grid grid-cols-2 gap-3 p-1.5 bg-slate-100/50 rounded-3xl border border-slate-100">
                  <label className="cursor-pointer relative flex-1">
                    <input type="radio" {...register('role')} value="murid" className="peer absolute opacity-0" />
                    <div className="p-4 border-2 border-transparent rounded-2xl flex flex-col items-center gap-2 peer-checked:border-indigo-600 peer-checked:bg-white peer-checked:shadow-xl transition-all hover:bg-white/50">
                      <GraduationCap className="w-6 h-6 text-slate-400 peer-checked:text-indigo-600" />
                      <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest peer-checked:text-indigo-600">Siswa</span>
                    </div>
                  </label>
                  <label className="cursor-pointer relative flex-1">
                    <input type="radio" {...register('role')} value="guru" className="peer absolute opacity-0" />
                    <div className="p-4 border-2 border-transparent rounded-2xl flex flex-col items-center gap-2 peer-checked:border-indigo-600 peer-checked:bg-white peer-checked:shadow-xl transition-all hover:bg-white/50">
                      <User className="w-6 h-6 text-slate-400 peer-checked:text-indigo-600" />
                      <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest peer-checked:text-indigo-600">Guru</span>
                    </div>
                  </label>
                </div>

                <AnimatePresence mode="popLayout">
                  {/* Teacher Specific Questions */}
                  {isGuru && (
                    <motion.div 
                      key="guru-logic"
                      initial={{ opacity: 0, x: 20 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: 20 }}
                      className="space-y-6"
                    >
                      <div>
                        <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 px-1">Mata Pelajaran yang Diajar</label>
                        <input
                          {...register('mataPelajaran', { required: isGuru ? 'Mata pelajaran wajib diisi' : false })}
                          className="w-full px-5 py-4 bg-slate-50 border border-slate-100 rounded-2xl focus:ring-4 focus:ring-indigo-100 focus:border-indigo-600 transition-all outline-none font-bold text-slate-700"
                          placeholder="Contoh: Matematika, Bahasa Inggris"
                        />
                        {errors.mataPelajaran && <p className="mt-2 text-[9px] text-rose-500 font-black uppercase tracking-widest px-1">{errors.mataPelajaran.message as string}</p>}
                      </div>

                      <div>
                        <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-4 px-1">Tanggung Jawab di Sekolah</label>
                        <div className="grid grid-cols-2 gap-2">
                           <label className="cursor-pointer flex-1">
                             <input type="radio" {...register('isWaliKelas')} value="true" className="peer absolute opacity-0" />
                             <div className="p-3 border-2 border-slate-100 rounded-2xl text-center text-[10px] font-black uppercase tracking-widest text-slate-400 peer-checked:border-indigo-600 peer-checked:bg-indigo-50/50 peer-checked:text-indigo-600 transition-all">
                               Wali Kelas
                             </div>
                           </label>
                           <label className="cursor-pointer flex-1">
                             <input type="radio" {...register('isWaliKelas')} value="false" className="peer absolute opacity-0" />
                             <div className="p-3 border-2 border-slate-100 rounded-2xl text-center text-[10px] font-black uppercase tracking-widest text-slate-400 peer-checked:border-indigo-600 peer-checked:bg-indigo-50/50 peer-checked:text-indigo-600 transition-all">
                               Guru Mapel
                             </div>
                           </label>
                        </div>
                      </div>
                    </motion.div>
                  )}

                  {/* Class Selection Logic (Visible to Murid and Wali Kelas) */}
                  {(selectedRole === 'murid' || (isGuru && isWaliKelas)) && (
                    <motion.div 
                      key="class-logic"
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.95 }}
                      className="space-y-4"
                    >
                      <div className="flex items-center justify-between px-1">
                        <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest">
                          {isWaliKelas && isGuru ? 'Pilih/Buat Kelas Binaan' : 'Pilih Kelas Anda'}
                        </label>
                        {isGuru && isWaliKelas && (
                          <button 
                            type="button"
                            onClick={() => setIsCreatingClass(!isCreatingClass)}
                            className="text-[10px] font-black text-indigo-600 uppercase tracking-widest flex items-center gap-1.5 hover:underline"
                          >
                            {isCreatingClass ? 'Batal' : <><PlusCircle className="w-3.5 h-3.5" /> Buat Kelas Baru</>}
                          </button>
                        )}
                      </div>

                      {isCreatingClass && isWaliKelas ? (
                        <div className="grid grid-cols-3 gap-2">
                           <div className="space-y-1">
                             <label className="block text-[8px] font-black text-slate-400 uppercase tracking-widest px-1">Tingkat</label>
                             <select 
                               {...register('level')}
                               className="w-full px-4 py-3 bg-indigo-50/30 border border-indigo-100 rounded-xl font-bold text-slate-700 outline-none"
                             >
                               <option value="X">X</option>
                               <option value="XI">XI</option>
                               <option value="XII">XII</option>
                             </select>
                           </div>
                           <div className="space-y-1">
                             <label className="block text-[8px] font-black text-slate-400 uppercase tracking-widest px-1">Jurusan</label>
                             <select 
                               {...register('department')}
                               className="w-full px-4 py-3 bg-indigo-50/30 border border-indigo-100 rounded-xl font-bold text-slate-700 outline-none"
                             >
                               <option value="PPLG">PPLG</option>
                               <option value="AKL">AKL</option>
                               <option value="MP">MP</option>
                               <option value="BR">BR</option>
                               <option value="DKV">DKV</option>
                             </select>
                           </div>
                           <div className="space-y-1">
                             <label className="block text-[8px] font-black text-slate-400 uppercase tracking-widest px-1">Nama</label>
                             <select 
                               {...register('classNameSuffix')}
                               className="w-full px-4 py-3 bg-indigo-50/30 border border-indigo-100 rounded-xl font-bold text-slate-700 outline-none"
                             >
                               <option value="A">A</option>
                               <option value="B">B</option>
                             </select>
                           </div>
                        </div>
                      ) : (
                        <div className="relative">
                          <select 
                            {...register('classId', { required: !isCreatingClass })}
                            className="w-full px-5 py-4 bg-slate-50 border border-slate-100 rounded-2xl focus:ring-4 focus:ring-indigo-100 focus:border-indigo-600 transition-all outline-none font-bold text-slate-700 appearance-none cursor-pointer"
                          >
                            <option value="">-- PILIH KELAS --</option>
                            {classes.map(c => (
                              <option key={c.id} value={c.id}>{c.full_name}</option>
                            ))}
                          </select>
                          <ChevronDown className="absolute right-5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none w-5 h-5" />
                        </div>
                      )}
                      {errors.classId && <p className="mt-2 text-[9px] text-rose-500 font-black uppercase tracking-widest px-1">{errors.classId.message as string}</p>}
                    </motion.div>
                  )}
                </AnimatePresence>
              </section>
            </div>

            {/* Submission */}
            <div className="pt-10 flex flex-col items-center gap-6">
              <button
                type="submit"
                disabled={loading}
                className="w-full py-5 bg-indigo-600 text-white rounded-[1.75rem] font-black uppercase tracking-widest text-[11px] hover:bg-indigo-700 transition-all shadow-xl shadow-indigo-100 disabled:opacity-70 disabled:cursor-wait flex items-center justify-center gap-3 active:scale-[0.98]"
              >
                {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <>Daftar Akun EduClass <CheckCircle2 className="w-5 h-5" /></>}
              </button>

              <p className="text-center text-slate-500 text-sm font-medium">
                Sudah punya akun?{' '}
                <Link to="/login" className="text-indigo-600 font-black hover:underline uppercase tracking-widest text-[11px]">Masuk Sekarang</Link>
              </p>
            </div>
          </form>
        </motion.div>
      </div>
    </div>
  );
}
