import { useState, useEffect } from 'react';
import { useAuth } from '@/src/context/AuthContext';
import { supabase } from '@/src/lib/supabase';
import { motion } from 'motion/react';
import { 
  ClipboardList, 
  BookOpen, 
  Wallet, 
  ArrowRight,
  TrendingUp,
  Clock,
  Sparkles,
  Loader2,
  Bell,
  ArrowUpRight,
  Plus,
  School,
  Users,
  ChevronRight,
  Camera,
  Trash2
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

export default function DashboardHome() {
  const { profile, currentClass } = useAuth();
  const [stats, setStats] = useState({ tasks: 0, attendance: 0, finance: 0 });
  const [recentAnnouncements, setRecentAnnouncements] = useState<any[]>([]);
  const [recentTasks, setRecentTasks] = useState<any[]>([]);
  const [todayPiket, setTodayPiket] = useState<any[]>([]);
  const [recentFinance, setRecentFinance] = useState<any[]>([]);
  const [recentDocs, setRecentDocs] = useState<any[]>([]);
  const [studentActivity, setStudentActivity] = useState<any[]>([]);
  const [performanceData, setPerformanceData] = useState<any[]>([]);
  const [availableClasses, setAvailableClasses] = useState<any[]>([]);
  const [selectedClassId, setSelectedClassId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (profile?.role === 'guru' || profile?.is_wali_kelas) {
      fetchAvailableClasses();
    }
  }, [profile]);

  useEffect(() => {
    if (currentClass && !selectedClassId) {
      setSelectedClassId(currentClass.id);
    }
  }, [currentClass]);

  useEffect(() => {
    if (profile) {
      fetchStats();
      if (selectedClassId) {
        fetchStudentActivity();
        fetchPerformance();
      }
    } else if (!profile && !loading) {
      // Just in case profile is lost but it's not loading anymore
    }
    
    // Set a timeout as a fail-safe to stop loading after 5 seconds
    const timer = setTimeout(() => {
      setLoading(false);
    }, 5000);

    // REAL-TIME SUBSCRIPTION
    const channel = supabase.channel('dashboard_realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'attendance' }, () => { fetchStats(); fetchPerformance(); })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'task_submissions' }, () => { fetchStats(); fetchPerformance(); })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'announcements' }, () => fetchStats())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'class_funds' }, () => fetchStats())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'activities' }, () => fetchStudentActivity())
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
      clearTimeout(timer);
    };
  }, [selectedClassId, profile]);

  const [showDeleteConfirm, setShowDeleteConfirm] = useState<{id: string, type: 'schedule' | 'doc', name?: string} | null>(null);
  const [deleting, setDeleting] = useState(false);

  const confirmDelete = async () => {
    if (!showDeleteConfirm) return;
    setDeleting(true);
    try {
      const table = showDeleteConfirm.type === 'schedule' ? 'piket_schedule' : 'piket_documentation';
      const { error } = await supabase.from(table).delete().eq('id', showDeleteConfirm.id);
      
      if (error) {
        alert('Gagal menghapus: ' + error.message);
      } else {
        fetchStats();
        setShowDeleteConfirm(null);
      }
    } catch (err: any) {
      alert('Terjadi kesalahan: ' + err.message);
    } finally {
      setDeleting(false);
    }
  };

  const fetchAvailableClasses = async () => {
    const { data } = await supabase.from('classes').select('*').order('full_name');
    if (data) setAvailableClasses(data);
  };

  const fetchPerformance = async () => {
    if (!selectedClassId || selectedClassId === 'undefined') return;
    try {
      const { data: profiles } = await supabase
        .from('profiles')
        .select('*')
        .eq('class_id', selectedClassId)
        .eq('role', 'murid');
      
      if (!profiles || profiles.length === 0) {
        setPerformanceData([]);
        return;
      }

      const { data: attendance } = await supabase.from('attendance').select('*').eq('class_id', selectedClassId);
      
      // Filter submissions by current teacher's tasks
      const { data: submissions } = await supabase
        .from('task_submissions')
        .select('*, task:tasks!inner(*)')
        .eq('task.teacher_id', profile.id);

      const { count: totalTasks } = await supabase
        .from('task_assignments')
        .select('task_id, task:tasks!inner(*)', { count: 'exact', head: true })
        .eq('class_id', selectedClassId)
        .eq('task.teacher_id', profile.id);

      const perf = profiles.map(p => {
        const studentAtt = attendance?.filter(a => a.student_id === p.id) || [];
        const hadir = studentAtt.filter(a => a.status === 'hadir').length;
        const attRate = studentAtt.length > 0 ? (hadir / studentAtt.length) * 100 : 0;

        const studentSub = submissions?.filter(s => s.student_id === p.id) || [];
        const grades = studentSub.map(s => s.grade).filter(g => g !== null && g !== undefined) as number[];
        const gradeAvg = grades.length > 0 ? grades.reduce((a, b) => a + b, 0) / grades.length : 0;
        
        const taskRate = totalTasks && totalTasks > 0 ? (studentSub.length / totalTasks) * 100 : 0;

        return {
          id: p.id,
          name: p.full_name,
          avatar: null,
          attendance: Math.round(attRate),
          grade: Math.round(gradeAvg),
          tasks: Math.round(taskRate)
        };
      }).sort((a, b) => b.grade - a.grade);

      setPerformanceData(perf.slice(0, 5));
    } catch (err) {
      console.error('Fetch performance error:', err);
    }
  };

  const fetchStudentActivity = async () => {
    if (!selectedClassId || selectedClassId === 'undefined') return;
    try {
      const { data, error } = await supabase
        .from('activities')
        .select('*, student:profiles(full_name)')
        .eq('class_id', selectedClassId)
        .order('created_at', { ascending: false })
        .limit(20); // Fetch more to allow filtering
      
      if (error) throw error;
      
      // Filter out 'kas' activities for Guru Mapel
      const filteredData = profile?.role === 'guru' && !profile?.is_wali_kelas
        ? (data || []).filter(act => act.type !== 'kas')
        : (data || []);

      setStudentActivity(filteredData.slice(0, 10));
    } catch (err) {
      console.error('Fetch activities error:', err);
    }
  };

  const [activeTab, setActiveTab] = useState<'performance' | 'logs'>('performance');

  const exportActivityToPDF = () => {
    const doc = new jsPDF();
    doc.text(`Laporan Keaktifan Siswa - ${currentClass?.full_name}`, 14, 20);
    autoTable(doc, {
      startY: 30,
      head: [['Nama', 'Absensi (%)', 'Tugas (%)', 'Nilai Rata-rata']],
      body: performanceData.map(s => [s.name, s.attendance, s.tasks, s.grade]),
    });
    doc.save(`Laporan_Keaktifan_${currentClass?.full_name}.pdf`);
  };

  const fetchStats = async () => {
    setLoading(true);
    try {
      const targetClassId = selectedClassId || currentClass?.id;
      if (!targetClassId || targetClassId === 'undefined') {
        setLoading(false);
        return;
      }
      const [tasksRes, financeRes, annRes] = await Promise.all([
        profile?.role === 'guru' 
          ? supabase.from('tasks').select('id', { count: 'exact', head: true }).eq('teacher_id', profile.id)
          : (targetClassId 
              ? supabase.from('task_assignments').select('task_id', { count: 'exact', head: true }).eq('class_id', targetClassId)
              : Promise.resolve({ count: 0, data: [] })),
        targetClassId 
          ? supabase.from('class_funds').select('amount, transaction_type').eq('class_id', targetClassId)
          : Promise.resolve({ data: [] }),
        supabase.from('announcements').select('*, author:profiles(full_name)').limit(2).order('created_at', { ascending: false })
      ]);

      const balance = financeRes.data?.reduce((acc: any, curr: any) => {
        return curr.transaction_type === 'masuk' ? acc + curr.amount : acc - curr.amount;
      }, 0) || 0;

      let taskList: any[] = [];
      if (profile?.role === 'guru') {
        const { data: guruTasks } = await supabase.from('tasks').select('*').eq('teacher_id', profile.id).limit(2).order('created_at', { ascending: false });
        taskList = guruTasks || [];
      } else if (targetClassId) {
        const { data: assignments } = await supabase
          .from('task_assignments')
          .select('task:tasks(*)')
          .eq('class_id', targetClassId)
          .limit(2);
        taskList = assignments?.map((a: any) => a.task).filter(Boolean) || [];
      }

      let piketData: any[] = [];
      let docData: any[] = [];
      
      if (targetClassId) {
        const today = new Date().getDay();
        const { data: pData } = await supabase
          .from('piket_schedule')
          .select('*, student:profiles(full_name)')
          .eq('class_id', targetClassId)
          .eq('day_of_week', today);
        piketData = pData || [];

        const { data: dData } = await supabase
          .from('piket_documentation')
          .select('*')
          .eq('class_id', targetClassId)
          .order('date', { ascending: false })
          .limit(4);
        docData = dData || [];
      }

      let attendancePercent = 0;
      if (targetClassId) {
        if (profile?.role === 'guru' || profile?.is_wali_kelas) {
          const { count: attCount } = await supabase.from('attendance').select('id', { count: 'exact', head: true }).eq('class_id', targetClassId).eq('date', new Date().toISOString().split('T')[0]).eq('status', 'hadir');
          const { count: totalCount } = await supabase.from('class_students').select('id', { count: 'exact', head: true }).eq('class_id', targetClassId);
          attendancePercent = totalCount && totalCount > 0 ? Math.round((attCount || 0) / totalCount * 100) : 0;
        } else {
          const { data: studentAtt } = await supabase.from('attendance').select('status').eq('student_id', profile?.id);
          if (studentAtt && studentAtt.length > 0) {
            const hadir = studentAtt.filter(a => a.status === 'hadir').length;
            attendancePercent = Math.round((hadir / studentAtt.length) * 100);
          }
        }
      }
      
      setStats({
        tasks: tasksRes.count || 0,
        attendance: attendancePercent,
        finance: balance
      });

      setRecentTasks(taskList);
      setTodayPiket(piketData);
      setRecentFinance(financeRes.data?.slice(0, 2) || []);
      setRecentDocs(docData);

      if (annRes.data) {
        setRecentAnnouncements(annRes.data);
      }
    } catch (err) {
      console.error('Fetch stats error:', err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <div className="min-h-[60vh] flex items-center justify-center"><Loader2 className="animate-spin text-indigo-600 w-10 h-10" /></div>;

  if (!currentClass && profile?.role !== 'guru') {
     return (
       <div className="py-20 text-center">
         <div className="bg-white p-12 rounded-[3rem] shadow-xl border border-slate-100 max-w-2xl mx-auto">
            <School className="w-16 h-16 text-indigo-600 mx-auto mb-6" />
            <h2 className="text-2xl font-black mb-4">Kelas Tidak Ditemukan</h2>
            <p className="text-slate-500 mb-8 font-medium">Akun Anda belum terhubung dengan kelas manapun. Silakan hubungi Wali Kelas Anda untuk mendaftarkan akun Anda ke kelas.</p>
            <button onClick={() => window.location.reload()} className="px-8 py-4 bg-indigo-600 text-white rounded-2xl font-black uppercase tracking-widest text-[11px]">Refresh Halaman</button>
         </div>
       </div>
     );
  }

  return (
    <div className="grid grid-cols-12 auto-rows-min gap-6">
      {/* Header Card */}
      <div className="col-span-12 bg-gradient-to-r from-indigo-600 to-blue-700 rounded-[2.5rem] p-8 md:p-10 flex flex-col md:flex-row md:items-center justify-between shadow-2xl shadow-indigo-100 overflow-hidden relative group">
        <div className="absolute top-0 right-0 p-8 opacity-10 group-hover:opacity-20 transition-opacity">
          <Sparkles className="w-48 h-48" />
        </div>
        <div className="text-white relative z-10 max-w-xl">
          <h1 className="text-3xl md:text-4xl font-black mb-2 tracking-tight">Selamat Pagi, {profile?.full_name?.split(' ')[0]}! 👋</h1>
          <p className="opacity-90 text-sm md:text-lg font-medium leading-relaxed">
            {profile?.role === 'guru' && profile?.mata_pelajaran 
              ? `Guru ${profile.mata_pelajaran}. ` 
              : ''}
            {currentClass 
              ? `Semua sistem berjalan lancar untuk kelas ${currentClass.full_name} hari ini.`
              : 'Selamat datang di dashboard EduClass. Mulailah mengelola pembelajaran Anda hari ini.'}
          </p>
        </div>
        
        {currentClass && (
          <div className="mt-6 md:mt-0 flex gap-4 relative z-10">
            {stats.attendance > 0 && (
              <div className="bg-white/15 backdrop-blur-xl px-5 py-3 rounded-2xl text-white text-sm border border-white/20 shadow-xl">
                <span className="opacity-70 font-medium">
                  {profile?.role === 'guru' || profile?.is_wali_kelas ? 'Kehadiran Kelas:' : 'Kehadiran Saya:'}
                </span> 
                <span className="font-black ml-1">{stats.attendance}%</span>
              </div>
            )}
            {(profile?.role === 'murid' || profile?.is_wali_kelas) && (
              <div className="bg-white/15 backdrop-blur-xl px-5 py-3 rounded-2xl text-white text-sm border border-white/20 shadow-xl">
                <span className="opacity-70 font-medium">Saldo Kas:</span> <span className="font-black ml-1">Rp {stats.finance.toLocaleString('id-ID')}</span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Quick Stats Bento Area */}
      <div className="col-span-12 lg:col-span-8 grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Active Tasks Bento */}
        <div className="md:col-span-2 bento-card p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-bold text-slate-700">Tugas Terbaru</h3>
            <Link to="/tasks" className="text-xs text-blue-600 font-bold hover:underline flex items-center gap-1 group">
              Lihat Semua <ArrowUpRight className="w-3 h-3 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
            </Link>
          </div>
          <div className="space-y-3">
            {recentTasks.map((task, idx) => (
              <div key={task.id || `task-${idx}`} className="p-3 bg-slate-50 rounded-xl flex items-center gap-3">
                <div className="h-10 w-10 bg-blue-100 text-blue-600 rounded-lg flex items-center justify-center font-bold">
                  {task.title?.charAt(0)}
                </div>
                <div className="flex-1 overflow-hidden">
                  <p className="text-sm font-bold truncate">{task.title}</p>
                  <p className="text-[11px] text-slate-500">Deadline: {new Date(task.deadline).toLocaleDateString()}</p>
                </div>
              </div>
            ))}
            {recentTasks.length === 0 && (
              <div className="py-6 text-center text-slate-400 text-xs italic">Belum ada tugas baru.</div>
            )}
          </div>
        </div>

        {/* Announcements Bento (Wide) */}
        <div className="md:col-span-2 bento-card p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-bold text-slate-700">Pengumuman Penting</h3>
            <Link to="/announcements" className="text-xs text-blue-600 font-bold hover:underline">Semua Info</Link>
          </div>
          <div className="flex gap-4 overflow-x-auto pb-2 scrollbar-hide">
            {recentAnnouncements.map((ann, idx) => (
              <div key={ann.id || `ann-${idx}`} className="min-w-[260px] md:min-w-[300px] p-4 bg-gradient-to-br from-indigo-50/50 to-blue-50/50 border border-blue-50 rounded-2xl">
                <div className="flex items-center gap-2 mb-2">
                   <span className="bg-indigo-600 text-white text-[9px] px-2 py-0.5 rounded-full uppercase font-bold tracking-wider">Info</span>
                   <span className="text-[10px] text-slate-400 font-medium">{new Date(ann.created_at).toLocaleDateString()}</span>
                </div>
                <p className="text-sm font-semibold text-slate-800 leading-snug line-clamp-2">{ann.content}</p>
                <p className="text-[10px] text-slate-400 mt-2 font-bold uppercase tracking-widest">{ann.author?.full_name}</p>
              </div>
            ))}
            {recentAnnouncements.length === 0 && (
              <div className="w-full text-center py-4 bg-slate-50 rounded-2xl text-slate-400 text-sm italic">
                Belum ada pengumuman hari ini.
              </div>
            )}
          </div>
        </div>

        {/* Aktivitas & Performa Siswa Bento */}
        <div className="md:col-span-2 bento-card p-6 min-h-[500px] flex flex-col">
          <div className="flex flex-col md:flex-row md:items-center justify-between mb-6 gap-4">
            <div>
              <h3 className="font-black text-slate-800 uppercase tracking-tight text-sm">Aktivitas Siswa</h3>
              <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Pantau progres dan kegiatan kelas</p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              {(profile?.role === 'guru' || profile?.is_wali_kelas) && (
                <div className="relative group/select">
                  <select 
                    value={selectedClassId || ''} 
                    onChange={(e) => setSelectedClassId(e.target.value)}
                    className="appearance-none bg-slate-50 border border-slate-200 rounded-xl px-4 py-2 pr-10 text-[10px] font-black uppercase tracking-widest text-indigo-600 outline-none focus:ring-2 focus:ring-indigo-100 transition-all cursor-pointer"
                  >
                    <option value="">Pilih Kelas</option>
                    {availableClasses.map((c, idx) => (
                      <option key={c.id || `class-${idx}`} value={c.id}>{c.full_name}</option>
                    ))}
                  </select>
                  <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-indigo-400">
                    <ChevronRight className="w-3 h-3 rotate-90" />
                  </div>
                </div>
              )}
              <div className="flex items-center bg-slate-100 p-1 rounded-xl">
                <button 
                  onClick={() => setActiveTab('performance')}
                  className={`px-4 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === 'performance' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-400'}`}
                >
                  Performa
                </button>
                <button 
                  onClick={() => setActiveTab('logs')}
                  className={`px-4 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === 'logs' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-400'}`}
                >
                  Log Terbaru
                </button>
              </div>
            </div>
          </div>

          <div className="flex-1">
            {activeTab === 'performance' ? (
              <div className="space-y-6 max-h-[600px] overflow-y-auto pr-2 scrollbar-thin scrollbar-thumb-indigo-100 scrollbar-track-transparent">
                {performanceData.map((s, idx) => (
                  <div key={s.id || `perf-${idx}`} className="p-4 bg-slate-50/50 rounded-2xl border border-slate-100 hover:border-indigo-200 transition-all group">
                    <div className="flex items-center gap-3 mb-4">
                      <div className="relative">
                        <div className="h-12 w-12 rounded-2xl bg-indigo-100 flex items-center justify-center text-[12px] font-black text-indigo-600 uppercase border-2 border-white shadow-md overflow-hidden shrink-0">
                          {s.avatar ? <img src={s.avatar} className="w-full h-full object-cover" referrerPolicy="no-referrer" /> : s.name.charAt(0)}
                        </div>
                        {performanceData.indexOf(s) === 0 && (
                          <div className="absolute -top-2 -left-2 bg-amber-400 text-white p-1 rounded-lg shadow-lg rotate-[-15deg]">
                            <Sparkles className="w-3 h-3" />
                          </div>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-black text-slate-800 tracking-tight truncate">{s.name}</p>
                          {performanceData.indexOf(s) === 0 && <span className="text-[7px] font-black uppercase text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded-md border border-amber-100">Top 1</span>}
                        </div>
                        <div className="flex items-center gap-1.5 mt-0.5">
                           <span className={`text-[8px] font-black uppercase px-2 py-0.5 rounded-full ${
                             s.grade >= 85 ? 'bg-emerald-100 text-emerald-600' :
                             s.grade >= 75 ? 'bg-blue-100 text-blue-600' :
                             'bg-amber-100 text-amber-600'
                           }`}>
                             {s.grade >= 85 ? 'Sangat Baik' : s.grade >= 75 ? 'Baik' : 'Butuh Perhatian'}
                           </span>
                           <span className="text-[8px] font-black uppercase text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">
                             {s.attendance >= 90 ? 'Rajin' : 'Normal'}
                           </span>
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="bg-white px-3 py-1.5 rounded-xl shadow-sm border border-slate-100">
                          <p className={`text-sm font-black leading-none ${s.grade >= 75 ? 'text-indigo-600' : 'text-rose-500'}`}>{s.grade}</p>
                          <p className="text-[7px] text-slate-400 font-bold uppercase tracking-widest mt-1 text-center">Avg</p>
                        </div>
                      </div>
                    </div>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-8 p-4 bg-white rounded-[1.5rem] border border-slate-100 shadow-sm relative overflow-hidden">
                      <div className="absolute top-0 right-0 p-2 opacity-[0.03]">
                        <TrendingUp className="w-12 h-12" />
                      </div>
                      {/* Attendance Bar */}
                      <div className="relative z-10">
                        <div className="flex justify-between items-center mb-2">
                          <div className="flex items-center gap-1.5">
                            <Clock className="w-3 h-3 text-slate-400" />
                            <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Kehadiran</p>
                          </div>
                          <p className={`text-[10px] font-black ${s.attendance >= 80 ? 'text-emerald-600' : 'text-slate-800'}`}>{s.attendance}%</p>
                        </div>
                        <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
                          <motion.div 
                            initial={{ width: 0 }}
                            animate={{ width: `${s.attendance}%` }}
                            className={`h-full rounded-full ${s.attendance >= 90 ? 'bg-indigo-500' : s.attendance >= 75 ? 'bg-emerald-500' : 'bg-amber-500'}`}
                          />
                        </div>
                      </div>

                      {/* Grade Capacity Bar */}
                      <div className="relative z-10">
                        <div className="flex justify-between items-center mb-2">
                          <div className="flex items-center gap-1.5">
                            <BookOpen className="w-3 h-3 text-slate-400" />
                            <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Target Nilai</p>
                          </div>
                          <p className="text-[10px] font-black text-slate-800">{Math.min(100, Math.round((s.grade / 80) * 100))}%</p>
                        </div>
                        <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
                          <motion.div 
                            initial={{ width: 0 }}
                            animate={{ width: `${Math.min(100, (s.grade / 80) * 100)}%` }}
                            className={`h-full rounded-full ${s.grade >= 80 ? 'bg-indigo-500' : s.grade >= 70 ? 'bg-blue-500' : 'bg-amber-500'}`}
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
                {performanceData.length === 0 && (
                  <div className="py-20 text-center">
                    <Users className="w-12 h-12 text-slate-200 mx-auto mb-4" />
                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Belum ada data siswa</p>
                  </div>
                )}
                {profile?.role === 'guru' || profile?.is_wali_kelas ? (
                  <button 
                    onClick={exportActivityToPDF}
                    className="w-full py-4 mt-2 bg-slate-100 hover:bg-slate-200 rounded-2xl text-[10px] font-black uppercase tracking-widest text-slate-500 transition-all border border-dashed border-slate-300"
                  >
                    Unduh Rekapan Nilai (PDF)
                  </button>
                ) : null}
              </div>
            ) : (
              <div className="space-y-4 max-h-[600px] overflow-y-auto pr-2 scrollbar-thin scrollbar-thumb-indigo-100 scrollbar-track-transparent">
                {studentActivity.map((act, idx) => (
                  <div key={act.id || `act-${idx}`} className="flex items-start gap-4 p-4 bg-slate-50/50 rounded-2xl border border-slate-100 hover:border-indigo-200 hover:bg-white hover:shadow-sm transition-all group">
                    <div className="relative shrink-0">
                      <div className={`p-3 rounded-xl ${
                        act.type === 'tugas' ? 'bg-blue-100/50 text-blue-600 shadow-sm shadow-blue-50' : 
                        act.type === 'absensi' ? 'bg-amber-100/50 text-amber-600 shadow-sm shadow-amber-50' : 
                        act.type === 'kas' ? 'bg-emerald-100/50 text-emerald-600 shadow-sm shadow-emerald-50' :
                        act.type === 'piket' ? 'bg-rose-100/50 text-rose-600 shadow-sm shadow-rose-50' :
                        'bg-indigo-100/50 text-indigo-600 shadow-sm shadow-indigo-50'
                      }`}>
                        {act.type === 'tugas' ? <BookOpen className="w-5 h-5" /> : 
                         act.type === 'absensi' ? <Clock className="w-5 h-5" /> :
                         act.type === 'kas' ? <Wallet className="w-5 h-5" /> :
                         act.type === 'piket' ? <Sparkles className="w-5 h-5" /> :
                         <ClipboardList className="w-5 h-5" />}
                      </div>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-1 gap-2">
                        <h4 className="text-sm font-black text-slate-800 group-hover:text-indigo-600 transition-colors truncate">
                          {act.student?.full_name ? `${act.student.full_name} • ` : ''}{act.title}
                        </h4>
                        <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest whitespace-nowrap">
                          {new Date(act.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                      <p className="text-xs text-slate-500 font-medium leading-relaxed line-clamp-2">{act.description}</p>
                    </div>
                  </div>
                ))}
                {studentActivity.length === 0 && (
                  <div className="py-20 text-center">
                    <ClipboardList className="w-12 h-12 text-slate-200 mx-auto mb-4" />
                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Belum ada aktivitas tercatat</p>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Right Sidebar Bento Column */}
      <div className="col-span-12 lg:col-span-4 flex flex-col gap-6">
        {/* Piket Card */}
        <div className="bento-card p-6 flex-1">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-bold text-slate-700">Piket Hari Ini</h3>
            <Link to="/piket" className="text-xs text-blue-600 font-bold hover:underline">Jadwal</Link>
          </div>
          <div className="space-y-4">
             {todayPiket.map((p, idx) => (
               <div key={p.id || `piket-${idx}`} className="flex items-center gap-3 group">
                 <div className="h-8 w-8 rounded-full bg-slate-200 border-2 border-white shadow-sm flex items-center justify-center text-[10px] font-bold text-slate-500 uppercase">
                    {p.student?.full_name?.charAt(0)}
                 </div>
                  <p className="text-sm font-medium flex-1 text-slate-700">{p.student?.full_name}</p>
                  <div className="flex items-center gap-2">
                    {(profile?.role === 'guru' || profile?.is_wali_kelas || profile?.jabatan_pengurus) && (
                      <button 
                        onClick={() => setShowDeleteConfirm({ id: p.id, type: 'schedule', name: p.student?.full_name })}
                        className="p-1.5 text-rose-500 hover:bg-rose-50 rounded-lg md:opacity-0 group-hover:opacity-100 transition-all border border-rose-100 bg-rose-50/30"
                        title="Hapus dari jadwal"
                      >
                       <Trash2 className="w-4 h-4" />
                     </button>
                   )}
                   <div className="w-2 h-2 rounded-full bg-green-500 shadow-sm shadow-green-100"></div>
                  </div>
               </div>
             ))}
             {todayPiket.length === 0 && (
               <div className="py-10 text-center text-slate-400 text-xs italic">Tidak ada petugas piket hari ini.</div>
             )}
          </div>
          
          <div className="mt-6">
            <div className="p-3 bg-blue-50/50 border border-blue-100/50 rounded-2xl">
              <p className="text-[10px] text-blue-600 font-bold uppercase tracking-wider mb-2">Dokumentasi Terkini</p>
              <div className="grid grid-cols-2 gap-2">
                {recentDocs.length > 0 ? recentDocs.map((doc, idx) => (
                  <div key={doc.id || `doc-${idx}`} className="aspect-square bg-slate-200 rounded-lg overflow-hidden border border-white shadow-sm relative group cursor-pointer">
                    <img 
                      src={doc.image_url} 
                      alt="Bukti Piket" 
                      className="w-full h-full object-cover transition-transform group-hover:scale-110" 
                      referrerPolicy="no-referrer"
                      loading="lazy"
                      onError={(e) => {
                        const target = e.target as HTMLImageElement;
                        // Use a consistent fallback classroom photo
                        target.src = `https://images.unsplash.com/photo-1522202176988-66273c2fd55f?auto=format&fit=crop&w=400&q=60`;
                        target.onerror = null;
                      }}
                    />
                    {(profile?.id === doc.uploader_id || profile?.role === 'guru' || profile?.is_wali_kelas || profile?.jabatan_pengurus) && (
                      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center p-2">
                        <button 
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            setShowDeleteConfirm({ id: doc.id, type: 'doc' });
                          }}
                          className="w-10 h-10 bg-rose-500 text-white rounded-xl hover:bg-rose-600 transition-colors shadow-lg flex items-center justify-center"
                          title="Hapus Dokumentasi"
                        >
                          <Trash2 className="w-5 h-5" />
                        </button>
                      </div>
                    )}
                  </div>
                )) : (
                  <div className="col-span-2 py-4 flex flex-col items-center justify-center text-slate-300 border-2 border-dashed border-slate-100 rounded-xl">
                    <Camera className="w-4 h-4 mb-1 opacity-40" />
                    <span className="text-[8px] font-black uppercase tracking-widest">Belum Ada</span>
                  </div>
                )}
                {recentDocs.length > 0 && recentDocs.length < 2 && (
                   <div className="aspect-square border-2 border-dashed border-slate-200 rounded-lg flex items-center justify-center text-slate-300">
                      <Plus className="w-4 h-4 opacity-50" />
                   </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Class Fund Bento Card (Dark) - Only shown for Students or Homeroom Teachers */}
        {(profile?.role === 'murid' || profile?.is_wali_kelas) && (
          <div className="bento-card-dark flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-bold opacity-70 flex items-center gap-2">
                  <Wallet className="w-4 h-4" /> Kas Kelas
                </h3>
                <span className="text-[10px] bg-emerald-500/20 text-emerald-400 px-2 py-0.5 rounded-full font-bold border border-emerald-500/20">+12% Bulan Ini</span>
              </div>
              <p className="text-3xl font-black mb-1">Rp {stats.finance.toLocaleString('id-ID')}</p>
              <p className="text-[11px] opacity-40 mb-6 font-medium">Data terupdate: {new Date().toLocaleDateString()}</p>
            </div>
            
            <div className="space-y-2.5">
              {recentFinance.map((f, idx) => (
                <div key={f.id || `fin-${idx}`} className={`flex justify-between text-xs ${idx === 0 ? 'border-b border-white/5 pb-2' : ''}`}>
                  <span className="opacity-40 truncate pr-4">{f.description}</span>
                  <span className={`font-bold shrink-0 ${f.transaction_type === 'masuk' ? 'text-emerald-400' : 'text-rose-400'}`}>
                    {f.transaction_type === 'masuk' ? '+' : '-'} Rp {f.amount >= 1000 ? `${(f.amount / 1000).toFixed(0)}k` : f.amount}
                  </span>
                </div>
              ))}
              {recentFinance.length === 0 && (
                <div className="py-4 text-center text-white/20 text-[10px] italic">Belum ada transaksi.</div>
              )}
              <Link to="/finance" className="block text-center mt-4 py-2 bg-white/5 hover:bg-white/10 rounded-xl text-[11px] font-bold transition-colors">
                Rincian Transaksi
              </Link>
            </div>
          </div>
        )}
      </div>

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div onClick={() => !deleting && setShowDeleteConfirm(null)} className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" />
          <motion.div 
            initial={{ scale: 0.95, opacity: 0 }} 
            animate={{ scale: 1, opacity: 1 }} 
            className="relative bg-white w-full max-w-sm rounded-[2rem] shadow-2xl p-8 text-center"
          >
            <div className="w-16 h-16 bg-rose-50 text-rose-500 rounded-full flex items-center justify-center mx-auto mb-4">
              <Trash2 className="w-8 h-8" />
            </div>
            <h3 className="text-xl font-black text-slate-800 mb-2">Konfirmasi Hapus</h3>
            <p className="text-sm text-slate-500 mb-8">
              {showDeleteConfirm.type === 'schedule' 
                ? `Hapus ${showDeleteConfirm.name} dari jadwal piket?` 
                : 'Hapus foto dokumentasi ini secara permanen?'
              }
            </p>
            <div className="flex flex-col gap-3">
              <button 
                onClick={confirmDelete}
                disabled={deleting}
                className="w-full py-4 bg-rose-600 text-white rounded-2xl font-bold hover:bg-rose-700 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {deleting ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Ya, Hapus'}
              </button>
              <button 
                onClick={() => setShowDeleteConfirm(null)}
                disabled={deleting}
                className="w-full py-4 bg-slate-100 text-slate-600 rounded-2xl font-bold hover:bg-slate-200 transition-all disabled:opacity-50"
              >
                Batal
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
}
