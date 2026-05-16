import { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/src/context/AuthContext';
import { supabase } from '@/src/lib/supabase';
import { ClassLevel, Department, Class } from '@/src/types/database';
import { Loader2, ArrowRight, CheckCircle2 } from 'lucide-react';

export default function OnboardingPage() {
  const { profile, refreshProfile, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [classes, setClasses] = useState<Class[]>([]);
  
  // Selection
  const [step, setStep] = useState(1);
  const [isWaliKelas, setIsWaliKelas] = useState(false);
  const [selectedClassId, setSelectedClassId] = useState('');

  useEffect(() => {
    if (!authLoading && !profile) {
      const checkAuth = async () => {
        const { data } = await supabase.auth.getSession();
        if (!data.session) navigate('/login');
      };
      checkAuth();
    }
    const needsOnboarding = profile?.role === 'murid' ? !profile?.class_id : (profile?.is_wali_kelas && !profile?.class_id);
    if (!needsOnboarding && profile) navigate('/dashboard');
    
    const fetchClasses = async () => {
      const { data } = await supabase.from('classes').select('*').order('full_name');
      if (data) setClasses(data);
    };
    fetchClasses();
  }, [profile, authLoading]);

  const handleSubmit = async () => {
    if (!selectedClassId && !(!isWaliKelas && profile?.role === 'guru')) return;
    setLoading(true);
    try {
       const user = (await supabase.auth.getUser()).data.user;
       if (!user) throw new Error('User not found');

        const userRole = isWaliKelas ? 'guru' : (profile?.role || user.user_metadata?.role || 'murid');
        const userIsWaliKelas = isWaliKelas;

        const updateData: any = {
          id: user.id,
          full_name: profile?.full_name || user.user_metadata?.full_name || 'User',
          username: profile?.username || user.user_metadata?.username || user.email?.split('@')[0],
          class_id: selectedClassId || null,
          role: userRole,
          is_wali_kelas: userIsWaliKelas
        };

        const { error } = await supabase
          .from('profiles')
          .upsert(updateData, { onConflict: 'id' });

        if (error) throw error;

        // Auto-link to class_students for automatic grade syncing
        if (userRole === 'murid' && selectedClassId) {
          // Try to find a matching student record in class_students
          const { data: studentMatch } = await supabase
            .from('class_students')
            .select('id')
            .eq('class_id', selectedClassId)
            // Try matching by NISN (username) first, then fallback to full name
            .or(`nisn.eq."${updateData.username}",full_name.eq."${updateData.full_name}"`)
            .maybeSingle();
          
          if (studentMatch) {
            await supabase
              .from('class_students')
              .update({ profile_id: user.id })
              .eq('id', studentMatch.id);
          }
        }

        await refreshProfile();
        navigate('/dashboard');
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  if (authLoading) return <div className="min-h-screen flex items-center justify-center bg-slate-50"><Loader2 className="animate-spin text-indigo-600" /></div>;

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6 text-slate-900">
      <div className="w-full max-w-xl bg-white rounded-[2rem] shadow-2xl p-10 md:p-14 overflow-hidden relative border border-slate-100">
        <div className="absolute top-0 left-0 w-full h-1.5 bg-slate-100">
          <motion.div 
            className="h-full bg-indigo-600" 
            initial={{ width: 0 }}
            animate={{ width: step === 1 ? '50%' : '100%' }}
            transition={{ type: 'spring', stiffness: 50 }}
          />
        </div>

        {step === 1 ? (
          <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}>
             <h1 className="text-4xl font-black mb-4 tracking-tight">Satu langkah lagi...</h1>
             <p className="text-slate-500 font-medium mb-10 leading-relaxed">Beri tahu kami posisi Anda di sekolah agar kami dapat menyesuaikan pengalaman Anda.</p>
             
             {profile?.role === 'guru' ? (
                <div className="space-y-4">
                  <div 
                    onClick={() => setIsWaliKelas(false)} 
                    className={`p-6 border-2 rounded-3xl cursor-pointer transition-all duration-300 ${!isWaliKelas ? 'border-indigo-600 bg-indigo-50/50 ring-4 ring-indigo-100' : 'border-slate-100 hover:border-indigo-200 bg-white'}`}
                  >
                    <h3 className={`font-black text-lg mb-1 ${!isWaliKelas ? 'text-indigo-600' : 'text-slate-700'}`}>Guru Mata Pelajaran</h3>
                    <p className="text-xs text-slate-500 font-medium font-mono uppercase tracking-widest leading-loose">Hanya mengelola tugas & pengumuman</p>
                  </div>
                  <div 
                    onClick={() => setIsWaliKelas(true)} 
                    className={`p-6 border-2 rounded-3xl cursor-pointer transition-all duration-300 ${isWaliKelas ? 'border-indigo-600 bg-indigo-50/50 ring-4 ring-indigo-100' : 'border-slate-100 hover:border-indigo-200 bg-white'}`}
                  >
                    <h3 className={`font-black text-lg mb-1 ${isWaliKelas ? 'text-indigo-600' : 'text-slate-700'}`}>Wali Kelas</h3>
                    <p className="text-xs text-slate-500 font-medium font-mono uppercase tracking-widest leading-loose">Manajer Data Siswa, Kas, & Piket</p>
                  </div>
                  <button onClick={() => setStep(2)} className="w-full py-5 mt-8 bg-indigo-600 text-white rounded-2xl font-black uppercase tracking-widest text-xs flex items-center justify-center gap-3 hover:bg-indigo-700 transition-all shadow-xl shadow-indigo-100 group active:scale-[0.98]">
                    Lanjut <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                  </button>
                </div>
             ) : (
                <div className="space-y-6">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-4">Pilih Kelas Anda</p>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    {classes.map((c) => (
                      <div 
                       key={c.id} 
                       onClick={() => setSelectedClassId(c.id)}
                       className={`p-4 border-2 rounded-2xl text-center cursor-pointer transition-all duration-300 text-sm ${selectedClassId === c.id ? 'border-indigo-600 bg-indigo-50/50 text-indigo-600 font-black ring-4 ring-indigo-100' : 'border-slate-50 hover:border-indigo-200 bg-slate-50/30 text-slate-500 font-bold'}`}
                      >
                        {c.full_name}
                      </div>
                    ))}
                  </div>
                  <button 
                    disabled={!selectedClassId} 
                    onClick={handleSubmit} 
                    className="w-full py-5 mt-8 bg-indigo-600 text-white rounded-2xl font-black uppercase tracking-widest text-xs disabled:opacity-50 flex items-center justify-center gap-3 hover:bg-indigo-700 transition-all shadow-xl shadow-indigo-100 active:scale-[0.98]"
                  >
                    {loading ? <Loader2 className="animate-spin" /> : <>Selesaikan <CheckCircle2 className="w-5 h-5" /></>}
                  </button>
                </div>
             )}
          </motion.div>
        ) : (
          <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}>
             <h1 className="text-4xl font-black mb-4 tracking-tight">Pilih Kelas Binaan</h1>
             <p className="text-slate-500 font-medium mb-10 leading-relaxed">Sebagai wali kelas, pilih kelas yang Anda bina saat ini.</p>
             <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {classes.map((c) => (
                  <div 
                    key={c.id} 
                    onClick={() => setSelectedClassId(c.id)}
                    className={`p-4 border-2 rounded-2xl text-center cursor-pointer transition-all duration-300 text-sm ${selectedClassId === c.id ? 'border-indigo-600 bg-indigo-50/50 text-indigo-600 font-black ring-4 ring-indigo-100' : 'border-slate-50 hover:border-indigo-200 bg-slate-50/30 text-slate-500 font-bold'}`}
                  >
                    {c.full_name}
                  </div>
                ))}
            </div>
            <div className="flex gap-4 mt-10">
              <button 
                onClick={() => setStep(1)} 
                className="flex-1 py-5 bg-slate-50 text-slate-500 rounded-2xl font-black uppercase tracking-widest text-xs hover:bg-slate-100 transition-colors"
                >Kembali</button>
              <button 
                disabled={!selectedClassId && isWaliKelas} 
                onClick={handleSubmit} 
                className="flex-[2] py-5 bg-indigo-600 text-white rounded-2xl font-black uppercase tracking-widest text-xs disabled:opacity-50 hover:bg-indigo-700 transition-all shadow-xl shadow-indigo-100"
              >
                {loading ? <Loader2 className="animate-spin" /> : 'Selesai & Masuk'}
              </button>
            </div>
          </motion.div>
        )}
      </div>
    </div>
  );
}
