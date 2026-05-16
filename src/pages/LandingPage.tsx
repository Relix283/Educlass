import { motion } from 'motion/react';
import { BookOpen, GraduationCap, Users, Calendar, Wallet, ClipboardCheck, ArrowRight } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '@/src/context/AuthContext';
import { useEffect } from 'react';

export default function LandingPage() {
  const { user } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (user) {
      navigate('/dashboard');
    }
  }, [user, navigate]);

  const features = [
    { icon: <ClipboardCheck className="w-6 h-6" />, title: 'Tugas Digital', desc: 'Berikan dan kumpulkan tugas dengan mudah langsung dari platform.' },
    { icon: <Users className="w-6 h-6" />, title: 'Manajemen Siswa', desc: 'Kelola data siswa, absensi, dan pengurus kelas secara transparan.' },
    { icon: <Wallet className="w-6 h-6" />, title: 'Kas Kelas', desc: 'Pantau pemasukan dan pengeluaran uang kas dengan grafik informatif.' },
    { icon: <Calendar className="w-6 h-6" />, title: 'Jadwal Piket', desc: 'Atur jadwal kebersihan kelas disertai dokumentasi foto.' },
  ];

  return (
    <div className="min-h-screen bg-slate-50 overflow-x-hidden">
      {/* Navbar */}
      <nav className="fixed top-0 w-full z-50 bg-white/70 backdrop-blur-md border-b border-slate-50">
        <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-indigo-600 p-2 rounded-xl shadow-lg shadow-indigo-100">
              <BookOpen className="w-6 h-6 text-white" />
            </div>
            <span className="text-2xl font-black tracking-tight text-slate-900">EduClass</span>
          </div>
          <div className="flex items-center gap-2">
            <Link to="/login" className="px-6 py-2.5 text-sm font-black text-slate-500 hover:text-indigo-600 transition-colors uppercase tracking-widest">Masuk</Link>
            <Link to="/register" className="primary-button">Daftar</Link>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="pt-40 pb-20 px-6">
        <div className="max-w-7xl mx-auto text-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
          >
            <span className="px-4 py-1.5 bg-indigo-50 text-indigo-600 rounded-full text-[10px] font-black uppercase tracking-[0.2em] border border-indigo-100">Future of Learning</span>
            <h1 className="mt-8 text-6xl md:text-8xl font-black tracking-tighter text-slate-900 leading-[0.95]">
              Masa Depan Kelas <br />
              <span className="gradient-text">Era Digital Modern</span>
            </h1>
            <p className="mt-8 text-lg text-slate-500 max-w-2xl mx-auto font-medium leading-relaxed">
              EduClass adalah platform all-in-one untuk manajemen kelas sekolah. Mudahkan interaksi guru dan siswa dalam satu ekosistem yang bersih dan transparan.
            </p>
            <div className="mt-12 flex flex-col sm:flex-row items-center justify-center gap-4">
              <Link to="/register" className="primary-button h-14 px-10 text-base">
                Mulai Gratis 
                <ArrowRight className="w-5 h-5" />
              </Link>
              <a href="#features" className="secondary-button h-14 px-10 text-base">
                Lihat Fitur
              </a>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.8, delay: 0.2 }}
            className="mt-24 relative px-4"
          >
            <div className="max-w-5xl mx-auto bento-card p-2">
              <div className="aspect-video bg-slate-50 rounded-2xl flex items-center justify-center overflow-hidden border border-slate-100 italic font-black uppercase tracking-widest text-slate-300 text-sm">
                <div className="absolute inset-0 bg-[url('https://images.unsplash.com/photo-1516321318423-f06f85e504b3?q=80&w=2070&auto=format&fit=crop')] bg-cover bg-center opacity-10" />
                <GraduationCap className="w-16 h-16 mb-2 opacity-20" />
                Preview Dashboard
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="py-32 bg-white">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center mb-20">
            <h2 className="text-4xl font-black text-slate-900 tracking-tight">Kebutuhan Kelas Terpenuhi</h2>
            <p className="mt-4 text-slate-500 font-medium">Dirancang khusus untuk mendukung KBM jarak jauh maupun tatap muka.</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
            {features.map((f, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.1 }}
                className="bento-card p-10 flex flex-col items-center text-center group"
              >
                <div className="w-16 h-16 bg-gradient-to-br from-indigo-500 to-blue-600 rounded-2xl flex items-center justify-center text-white mb-8 shadow-xl shadow-indigo-100 group-hover:scale-110 transition-transform">
                  {f.icon}
                </div>
                <h3 className="text-xl font-bold text-slate-900 mb-4">{f.title}</h3>
                <p className="text-slate-500 text-sm leading-relaxed font-medium">{f.desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-12 border-t border-slate-100 bg-slate-50">
        <div className="max-w-7xl mx-auto px-4 text-center">
          <div className="flex items-center justify-center gap-2 mb-4">
            <BookOpen className="w-6 h-6 text-blue-600" />
            <span className="text-lg font-bold text-slate-800">EduClass</span>
          </div>
          <p className="text-slate-500 text-sm">© {new Date().getFullYear()} EduClass. Dibuat untuk masa depan pendidikan Indonesia.</p>
        </div>
      </footer>
    </div>
  );
}
