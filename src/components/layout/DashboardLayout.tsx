import { useState, ReactNode } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '@/src/context/AuthContext';
import { supabase } from '@/src/lib/supabase';
import { 
  LayoutDashboard, 
  ClipboardList, 
  Users, 
  Calendar, 
  Wallet, 
  Bell, 
  LogOut, 
  Menu, 
  X,
  UserCircle2,
  Settings,
  GraduationCap,
  BookOpen
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface NavItem {
  label: string;
  href: string;
  icon: ReactNode;
  allowedRoles?: ('guru' | 'murid')[];
  requireWaliKelas?: boolean;
  waliKelasAlso?: boolean;
}

export default function DashboardLayout({ children }: { children: ReactNode }) {
  const { profile, currentClass } = useAuth();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const navigate = useNavigate();

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate('/login');
  };

  const navItems: NavItem[] = [
    { label: 'Dashboard', href: '/dashboard', icon: <LayoutDashboard className="w-5 h-5" /> },
    { label: 'Absensi', href: '/attendance', icon: <ClipboardList className="w-5 h-5" />, allowedRoles: ['guru'] },
    { label: 'Tugas', href: '/tasks', icon: <BookOpen className="w-5 h-5" /> },
    { label: 'Buku Nilai', href: '/grades', icon: <ClipboardList className="w-5 h-5" />, allowedRoles: ['guru'] },
    { label: 'Rekap Nilai', href: '/grades-recap', icon: <GraduationCap className="w-5 h-5" />, allowedRoles: ['guru'] },
    { label: 'Data Siswa', href: '/students', icon: <Users className="w-5 h-5" />, requireWaliKelas: true },
    { label: 'Kas Kelas', href: '/finance', icon: <Wallet className="w-5 h-5" />, allowedRoles: ['murid'], waliKelasAlso: true },
    { label: 'Jadwal Piket', href: '/piket', icon: <Calendar className="w-5 h-5" /> },
    { label: 'Pengumuman', href: '/announcements', icon: <Bell className="w-5 h-5" /> },
  ];

  const isPengurus = !!profile?.jabatan_pengurus;

  const filteredNav = navItems.filter(item => {
    if (item.allowedRoles && !item.allowedRoles.includes(profile?.role || 'murid')) {
      if (!(item.waliKelasAlso && profile?.is_wali_kelas)) return false;
    }
    
    // Data Siswa is only for Wali Kelas
    if (item.requireWaliKelas && !profile?.is_wali_kelas) return false;
    
    return true;
  });

  const SidebarContent = () => (
    <div className="flex flex-col h-full bg-white border-r border-slate-200">
      <div className="p-6">
        <div className="flex items-center gap-3 mb-8">
          <div className="h-9 w-9 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-xl flex items-center justify-center shadow-lg shadow-blue-100">
            <span className="text-white font-bold text-xl italic">E</span>
          </div>
          <span className="text-xl font-bold tracking-tight gradient-text">EduClass</span>
        </div>

        <nav className="space-y-1">
          {filteredNav.map((item) => (
            <NavLink
              key={item.href}
              to={item.href}
              className={({ isActive }) => 
                `sidebar-link ${isActive ? 'sidebar-link-active' : ''}`
              }
            >
              {item.icon}
              <span className="font-medium">{item.label}</span>
            </NavLink>
          ))}
        </nav>
      </div>

      <div className="mt-auto p-4 border-t border-slate-100">
        <div className="p-3 bg-slate-50 rounded-2xl flex items-center gap-3 mb-4">
          <div className="w-10 h-10 bg-indigo-100 rounded-full flex items-center justify-center text-indigo-600 font-bold border-2 border-white shadow-sm">
            {profile?.full_name?.charAt(0) || 'U'}
          </div>
          <div className="overflow-hidden flex-1">
            <p className="text-sm font-bold text-slate-800 truncate">{profile?.full_name}</p>
            <div className="flex items-center gap-1">
              <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider truncate">
                {profile?.role === 'guru' 
                  ? (profile?.is_wali_kelas ? `Wali ${currentClass?.full_name || ''}` : `Guru ${profile?.mata_pelajaran || 'Mapel'}`) 
                  : (profile?.jabatan_pengurus ? `${profile.jabatan_pengurus} Kelas` : `Siswa ${currentClass?.full_name || ''}`)}
              </p>
            </div>
          </div>
          <button 
            onClick={handleLogout}
            className="ml-auto p-1.5 hover:bg-white rounded-lg text-slate-400 hover:text-red-500 transition-colors"
            title="Keluar"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="flex min-h-screen bg-slate-50">
      {/* Desktop Sidebar */}
      <aside className="hidden lg:block w-72 h-screen sticky top-0">
        <SidebarContent />
      </aside>

      {/* Mobile Backdrop */}
      <AnimatePresence>
        {isMobileMenuOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setIsMobileMenuOpen(false)}
            className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-40 lg:hidden"
          />
        )}
      </AnimatePresence>

      {/* Mobile Sidebar */}
      <AnimatePresence>
        {isMobileMenuOpen && (
          <motion.aside
            initial={{ x: -280 }}
            animate={{ x: 0 }}
            exit={{ x: -280 }}
            className="fixed inset-y-0 left-0 w-72 bg-white z-50 lg:hidden shadow-2xl"
          >
            <SidebarContent />
          </motion.aside>
        )}
      </AnimatePresence>

      {/* Main Content */}
      <main className="flex-1 w-full relative min-w-0">
        {/* Header */}
        <header className="h-16 bg-white/70 backdrop-blur-md border-b border-slate-200 flex items-center justify-between px-4 md:px-6 sticky top-0 z-30 lg:z-10">
          <div className="flex items-center gap-3">
            <button 
              onClick={() => setIsMobileMenuOpen(true)}
              className="lg:hidden p-2 -ml-2 text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
            >
              <Menu className="w-6 h-6" />
            </button>
            <div className="flex items-center gap-2 lg:hidden">
               <div className="h-7 w-7 bg-indigo-600 rounded-lg flex items-center justify-center">
                 <span className="text-white font-bold text-sm italic">E</span>
               </div>
               <span className="text-sm font-bold tracking-tight">EduClass</span>
            </div>
          </div>
          
          <div className="flex items-center gap-2 md:gap-4">
            <button className="relative p-2 text-slate-600 hover:bg-slate-100 rounded-full transition-colors">
              <Bell className="w-5 h-5" />
              <span className="absolute top-2 right-2 w-2 h-2 bg-red-500 rounded-full border-2 border-white"></span>
            </button>
            <div className="h-6 w-px bg-slate-200 hidden xs:block"></div>
            <div className="hidden xs:flex flex-col items-end">
              <span className="text-xs md:text-sm font-bold text-slate-800 truncate max-w-[120px] md:max-w-none">{currentClass?.full_name || 'Tanpa Kelas'}</span>
              <span className="text-[9px] md:text-[10px] text-slate-500 font-medium">{new Date().toLocaleDateString('id-ID', { weekday: 'short', day: 'numeric', month: 'short' })}</span>
            </div>
          </div>
        </header>

        <div className="p-4 md:p-8">
           {children}
        </div>
      </main>
    </div>
  );
}
