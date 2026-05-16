import { useState, useEffect } from 'react';
import { useAuth } from '@/src/context/AuthContext';
import { supabase } from '@/src/lib/supabase';
import { AttendanceStatus, Class, Profile } from '@/src/types/database';
import { 
  Users, 
  Search, 
  Download, 
  CheckCircle, 
  XCircle, 
  Clock, 
  AlertCircle,
  Info,
  Loader2,
  CalendarDays,
  FileText,
  Save,
} from 'lucide-react';
import * as XLSX from 'xlsx';

export default function AttendancePage() {
  const { profile, currentClass } = useAuth();
  const [students, setStudents] = useState<Profile[]>([]);
  const [classes, setClasses] = useState<Class[]>([]);
  const [selectedClassId, setSelectedClassId] = useState<string>('');
  const [attendance, setAttendance] = useState<Record<string, AttendanceStatus>>({});
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  
  // Recap states
  const [activeTab, setActiveTab] = useState<'daily' | 'recap'>('daily');
  const [recapMonth, setRecapMonth] = useState(new Date().getMonth() + 1);
  const [recapYear, setRecapYear] = useState(new Date().getFullYear());
  const [recapData, setRecapData] = useState<any[]>([]);
  const [recapLoading, setRecapLoading] = useState(false);

  const canEdit = (profile?.role === 'guru' || profile?.is_wali_kelas);

  useEffect(() => {
    fetchClasses();
  }, []);

  useEffect(() => {
    if (currentClass) {
      setSelectedClassId(currentClass.id);
    }
  }, [currentClass]);

  useEffect(() => {
    if (selectedClassId && activeTab === 'daily') {
      fetchData();
    } else if (selectedClassId && activeTab === 'recap') {
      fetchRecap();
    }
  }, [date, selectedClassId, activeTab, recapMonth, recapYear]);

  const fetchClasses = async () => {
    const { data } = await supabase.from('classes').select('*').order('full_name');
    if (data) setClasses(data);
  };

  const fetchData = async () => {
    if (!selectedClassId || selectedClassId === 'undefined') return;
    setLoading(true);
    try {
      const { data: studentsData } = await supabase
        .from('profiles')
        .select('*')
        .eq('role', 'murid')
        .eq('class_id', selectedClassId)
        .order('full_name');
      
      if (studentsData) setStudents(studentsData);

      const { data: attendanceData } = await supabase
        .from('attendance')
        .select('*')
        .eq('date', date)
        .eq('class_id', selectedClassId);
      
      const attMap: Record<string, AttendanceStatus> = {};
      attendanceData?.forEach((a: any) => {
        attMap[a.student_id] = a.status;
      });
      setAttendance(attMap);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const fetchRecap = async () => {
    if (!selectedClassId) return;
    setRecapLoading(true);
    try {
      // 1. Fetch students
      const { data: studentsData } = await supabase
        .from('profiles')
        .select('*')
        .eq('role', 'murid')
        .eq('class_id', selectedClassId)
        .order('full_name');
      
      if (!studentsData) return;

      // 2. Fetch all attendance for this month
      const startDate = `${recapYear}-${String(recapMonth).padStart(2, '0')}-01`;
      const endDate = new Date(recapYear, recapMonth, 0).toISOString().split('T')[0];

      const { data: attRecords } = await supabase
        .from('attendance')
        .select('*')
        .eq('class_id', selectedClassId)
        .gte('date', startDate)
        .lte('date', endDate);

      // 3. Process data
      const processed = studentsData.map(student => {
        const studentAtt = attRecords?.filter(r => r.student_id === student.id) || [];
        const total = studentAtt.length;
        const hadir = studentAtt.filter(r => r.status === 'hadir').length;
        const izin = studentAtt.filter(r => r.status === 'izin').length;
        const sakit = studentAtt.filter(r => r.status === 'sakit').length;
        const alpha = studentAtt.filter(r => r.status === 'alpha').length;
        
        return {
          ...student,
          stats: { total, hadir, izin, sakit, alpha, percentage: total > 0 ? Math.round((hadir / total) * 100) : 0 }
        };
      });

      setRecapData(processed);
    } catch (err) {
      console.error(err);
    } finally {
      setRecapLoading(false);
    }
  };

  const handleSaveRecapDraft = async () => {
    if (!selectedClassId || recapData.length === 0) return;
    setSaving(true);
    try {
      const recapDraft = recapData.map(item => ({
        student_id: item.id,
        percentage: item.stats.percentage,
        hadir: item.stats.hadir,
        alpha: item.stats.alpha,
        total: item.stats.total
      }));

      const { error } = await supabase
        .from('attendance_recaps')
        .upsert({
          class_id: selectedClassId,
          teacher_id: profile?.id,
          month: recapMonth,
          year: recapYear,
          subject: profile?.mata_pelajaran || 'Umum',
          data: recapDraft,
          status: 'draft'
        }, { onConflict: 'class_id,teacher_id,month,year,subject' });

      if (error) throw error;
      alert('Draft rekap absensi berhasil disimpan!');
    } catch (err) {
      console.error(err);
      alert('Gagal menyimpan draft rekap.');
    } finally {
      setSaving(false);
    }
  };

  const handleClassChange = async (classId: string) => {
    setSelectedClassId(classId);
  };

  const handleStatusChange = (studentId: string, status: AttendanceStatus) => {
    setAttendance(prev => ({ ...prev, [studentId]: status }));
  };

  const handleSave = async () => {
    if (!selectedClassId) return;
    setSaving(true);
    try {
      const records = Object.entries(attendance).map(([studentId, status]) => ({
        student_id: studentId,
        class_id: selectedClassId,
        date,
        status,
        teacher_id: profile?.id
      }));

      if (records.length === 0) {
        alert('Tidak ada data absensi untuk disimpan.');
        setSaving(false);
        return;
      }

      // Upsert records
      const { error } = await supabase
        .from('attendance')
        .upsert(records, { onConflict: 'student_id,date' });

      if (error) throw error;

      // Sync to Activities
      const hadirCount = records.filter(r => r.status === 'hadir').length;
      if (hadirCount > 0) {
        await supabase.from('activities').insert({
          student_id: profile?.id, // Teacher who records the attendance
          class_id: selectedClassId,
          type: 'absensi',
          title: 'Rekap Absensi',
          description: `${hadirCount} siswa hadir pada tanggal ${new Date(date).toLocaleDateString()}`
        });
      }

      alert('Absensi berhasil disimpan!');
    } catch (err) {
      console.error(err);
      alert('Gagal menyimpan absensi.');
    } finally {
      setSaving(false);
    }
  };

  const exportToExcel = () => {
    const data = students.map(s => ({
      'Nama Siswa': s.full_name,
      'Username': s.username,
      'Status': attendance[s.id]?.toUpperCase() || 'BELUM ABSEN',
      'Tanggal': date
    }));
    const worksheet = XLSX.utils.json_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Absensi");
    XLSX.writeFile(workbook, `Absensi_${currentClass?.full_name}_${date}.xlsx`);
  };

  const filteredStudents = students.filter(s => 
    s.full_name.toLowerCase().includes(search.toLowerCase())
  );

  const stats = {
    hadir: Object.values(attendance).filter(v => v === 'hadir').length,
    izin: Object.values(attendance).filter(v => v === 'izin').length,
    sakit: Object.values(attendance).filter(v => v === 'sakit').length,
    alpha: Object.values(attendance).filter(v => v === 'alpha').length,
  };

  return (
    <div className="max-w-6xl mx-auto">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-8">
        <div>
          <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight">Kelola Absensi</h1>
          <div className="flex items-center gap-2 mt-1">
             <p className="text-slate-500 font-medium">Kelas:</p>
             <select 
               value={selectedClassId}
               onChange={(e) => handleClassChange(e.target.value)}
               disabled={profile?.role === 'murid'}
               className="bg-transparent border-none p-0 text-blue-600 font-bold focus:ring-0 cursor-pointer disabled:cursor-not-allowed"
             >
               <option value="" disabled>Pilih Kelas</option>
               {classes.map(c => (
                 <option key={c.id} value={c.id}>{c.full_name}</option>
               ))}
             </select>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {activeTab === 'daily' ? (
            <input 
              type="date" 
              value={date} 
              onChange={(e) => setDate(e.target.value)}
              className="px-4 py-2 bg-white border border-slate-200 rounded-xl outline-none focus:ring-4 focus:ring-blue-100 transition-all font-medium text-slate-600"
            />
          ) : (
            <div className="flex items-center gap-2">
              <select 
                value={recapMonth}
                onChange={(e) => setRecapMonth(Number(e.target.value))}
                className="px-3 py-2 bg-white border border-slate-200 rounded-xl outline-none text-sm font-bold text-slate-600"
              >
                {Array.from({ length: 12 }, (_, i) => (
                  <option key={i+1} value={i+1}>{new Date(2000, i).toLocaleString('id-ID', { month: 'long' })}</option>
                ))}
              </select>
              <select 
                value={recapYear}
                onChange={(e) => setRecapYear(Number(e.target.value))}
                className="px-3 py-2 bg-white border border-slate-200 rounded-xl outline-none text-sm font-bold text-slate-600"
              >
                {[2024, 2025, 2026].map(y => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
            </div>
          )}
          <button 
            onClick={exportToExcel}
            className="secondary-button"
          >
            <Download className="w-4 h-4" />
            <span className="hidden sm:inline">Export Excel</span>
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-6 bg-slate-100 p-1 rounded-2xl w-fit">
        <button 
          onClick={() => setActiveTab('daily')}
          className={`px-6 py-2 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${activeTab === 'daily' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
        >
          <div className="flex items-center gap-2">
            <CalendarDays className="w-4 h-4" /> Harian
          </div>
        </button>
        <button 
          onClick={() => setActiveTab('recap')}
          className={`px-6 py-2 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${activeTab === 'recap' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
        >
          <div className="flex items-center gap-2">
            <FileText className="w-4 h-4" /> Rekap Bulanan
          </div>
        </button>
      </div>

      {activeTab === 'daily' ? (
        <>
          {/* Stats Grid */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
            {[
              { label: 'Hadir', value: stats.hadir, color: 'text-emerald-600', bg: 'bg-emerald-50' },
              { label: 'Izin', value: stats.izin, color: 'text-blue-600', bg: 'bg-blue-50' },
              { label: 'Sakit', value: stats.sakit, color: 'text-amber-600', bg: 'bg-amber-50' },
              { label: 'Alpha', value: stats.alpha, color: 'text-rose-600', bg: 'bg-rose-50' },
            ].map((s, i) => (
              <div key={i} className={`p-5 rounded-2xl ${s.bg} border border-white shadow-sm transition-transform hover:scale-[1.02]`}>
                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-1 opacity-70">{s.label}</p>
                <p className={`text-3xl font-black ${s.color}`}>{s.value}</p>
              </div>
            ))}
          </div>

          {/* Table Section */}
          <div className="bento-card overflow-hidden">
            <div className="p-6 border-b border-slate-50 flex flex-col sm:flex-row gap-4 items-center justify-between">
              <div className="relative w-full sm:w-72">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input 
                  type="text" 
                  placeholder="Cari nama siswa..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-100 rounded-xl text-sm outline-none focus:ring-4 focus:ring-blue-100 transition-all"
                />
              </div>
              {canEdit && (
                <button 
                  onClick={handleSave}
                  disabled={saving}
                  className="primary-button w-full sm:w-auto"
                >
                  {saving ? 'Menyimpan...' : 'Simpan Absensi'}
                </button>
              )}
            </div>

            <div className="overflow-x-auto scrollbar-thin scrollbar-thumb-slate-200">
              {loading ? (
                <div className="p-12 flex flex-col items-center justify-center gap-4">
                  <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
                  <p className="text-slate-400 font-medium">Memuat data siswa...</p>
                </div>
              ) : (
                <table className="w-full text-left min-w-[500px]">
                  <thead>
                    <tr className="bg-slate-50/50">
                      <th className="px-4 md:px-6 py-4 text-xs md:text-sm font-bold text-slate-600 uppercase tracking-wider">Nama Siswa / Akun</th>
                      <th className="px-4 md:px-6 py-4 text-xs md:text-sm font-bold text-slate-600 uppercase tracking-wider text-center">Status Kehadiran</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredStudents.map((student) => (
                      <tr key={student.id} className="hover:bg-slate-50/50 transition-colors">
                        <td className="px-4 md:px-6 py-4">
                          <div className="flex items-center gap-2 md:gap-3">
                            <div className="w-7 h-7 md:w-8 md:h-8 bg-blue-100 rounded-full flex items-center justify-center text-blue-600 font-bold text-[10px] md:text-xs shrink-0">
                              {student.full_name.charAt(0)}
                            </div>
                            <div className="flex flex-col min-w-0">
                              <span className="font-semibold text-slate-700 text-xs md:text-sm truncate">{student.full_name}</span>
                              <span className="text-[9px] md:text-[10px] text-slate-400 font-mono uppercase tracking-widest truncate">{student.username}</span>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 md:px-6 py-4">
                          <div className="flex items-center justify-center gap-1 md:gap-2">
                            {[
                              { id: 'hadir', label: 'H', color: 'peer-checked:bg-green-600 peer-checked:text-white text-green-600 bg-green-50' },
                              { id: 'izin', label: 'I', color: 'peer-checked:bg-blue-600 peer-checked:text-white text-blue-600 bg-blue-50' },
                              { id: 'sakit', label: 'S', color: 'peer-checked:bg-amber-600 peer-checked:text-white text-amber-600 bg-amber-50' },
                              { id: 'alpha', label: 'A', color: 'peer-checked:bg-red-600 peer-checked:text-white text-red-600 bg-red-50' },
                            ].map((btn) => (
                              <label key={btn.id} className="cursor-pointer">
                                <input 
                                  type="radio" 
                                  name={`att-${student.id}`} 
                                  className="peer sr-only"
                                  disabled={!canEdit}
                                  checked={attendance[student.id] === btn.id as AttendanceStatus}
                                  onChange={() => handleStatusChange(student.id, btn.id as AttendanceStatus)}
                                />
                                <div className={`w-8 h-8 md:w-10 md:h-10 flex items-center justify-center rounded-lg md:rounded-xl transition-all font-bold text-[10px] md:text-xs ring-1 ring-inset ring-black/5 shadow-sm ${btn.color}`}>
                                  {btn.label}
                                </div>
                              </label>
                            ))}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              {!loading && filteredStudents.length === 0 && (
                <div className="p-12 text-center text-slate-400">
                  <Users className="w-12 h-12 mx-auto mb-4 opacity-20" />
                  <p>Belum ada akun siswa terdaftar di kelas ini.</p>
                  <p className="text-xs mt-1">Siswa harus menyelesaikan pendaftaran (onboarding) terlebih dahulu.</p>
                </div>
              )}
            </div>
          </div>
        </>
      ) : (
        <div className="bento-card overflow-hidden">
          <div className="p-6 border-b border-slate-50 flex justify-between items-center bg-indigo-50/30">
            <div>
              <h3 className="font-black text-slate-800 uppercase tracking-wider text-sm flex items-center gap-2">
                <FileText className="w-4 h-4 text-indigo-600" /> Rekap Absensi Bulanan
              </h3>
              <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mt-1">Status: <span className="text-amber-600">Draft Otomatis</span></p>
            </div>
            {canEdit && (
              <button 
                onClick={handleSaveRecapDraft}
                disabled={saving || recapLoading}
                className="flex items-center gap-2 px-6 py-2.5 bg-indigo-600 text-white rounded-xl text-xs font-black uppercase tracking-widest hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-200 disabled:opacity-50"
              >
                {saving ? (
                  <Loader2 className="w-3 h-3 animate-spin" />
                ) : (
                  <Save className="w-3 h-3" />
                )}
                Simpan ke Draft Nilai
              </button>
            )}
          </div>

          <div className="overflow-x-auto">
            {recapLoading ? (
              <div className="p-12 flex flex-col items-center justify-center gap-4">
                <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
                <p className="text-slate-400 font-medium text-sm">Menghitung persentase kehadiran...</p>
              </div>
            ) : (
              <table className="w-full text-left min-w-[600px]">
                <thead>
                  <tr className="bg-slate-50/50 text-[10px] font-black text-slate-500 uppercase tracking-widest">
                    <th className="px-6 py-4">Nama Siswa</th>
                    <th className="px-6 py-4 text-center">Hadir</th>
                    <th className="px-6 py-4 text-center">Izin/Sakit</th>
                    <th className="px-6 py-4 text-center">Alpha</th>
                    <th className="px-6 py-4 text-center">Total Hari</th>
                    <th className="px-6 py-4 text-right">Persentase</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {recapData.map((item) => (
                    <tr key={item.id} className="hover:bg-slate-50/40 transition-colors">
                      <td className="px-6 py-4">
                        <div className="flex flex-col">
                          <span className="font-bold text-slate-700 text-sm">{item.full_name}</span>
                          <span className="text-[9px] text-slate-400 font-mono tracking-tighter uppercase">{item.username}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-center">
                        <span className="font-bold text-emerald-600 text-sm">{item.stats.hadir}</span>
                      </td>
                      <td className="px-6 py-4 text-center">
                        <span className="font-bold text-blue-600 text-sm">{item.stats.izin + item.stats.sakit}</span>
                      </td>
                      <td className="px-6 py-4 text-center">
                        <span className="font-bold text-rose-600 text-sm">{item.stats.alpha}</span>
                      </td>
                      <td className="px-6 py-4 text-center">
                        <span className="font-bold text-slate-400 text-sm">{item.stats.total}</span>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex items-center justify-end gap-3">
                          <div className="w-24 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                            <div 
                              className={`h-full transition-all ${
                                item.stats.percentage > 80 ? 'bg-emerald-500' : 
                                item.stats.percentage > 50 ? 'bg-amber-500' : 'bg-rose-500'
                              }`} 
                              style={{ width: `${item.stats.percentage}%` }}
                            />
                          </div>
                          <span className="font-black text-slate-900 text-sm w-10">{item.stats.percentage}%</span>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {!recapLoading && recapData.length === 0 && (
              <div className="p-12 text-center text-slate-400">
                <p>Tidak ada data absensi untuk periode ini.</p>
              </div>
            )}
          </div>
        </div>
      )}

      <div className="mt-8 p-6 bg-indigo-50 rounded-2xl border border-indigo-100 flex gap-4">
        <Info className="w-6 h-6 text-indigo-600 shrink-0" />
        <div className="text-sm text-indigo-700 leading-relaxed">
          <p className="font-bold mb-1 line-through opacity-40">Panduan Absensi Berbasis Akun:</p>
          <p className="font-bold mb-1">Fitur Rekap & Draft Nilai:</p>
          <ul className="list-disc list-inside space-y-1 opacity-80">
            <li>Gunakan tab **Rekap Bulanan** untuk melihat performa kehadiran siswa per bulan.</li>
            <li>Persentase dihitung otomatis berdasarkan data absensi harian yang sudah disimpan.</li>
            <li>Klik **Simpan ke Draft Nilai** agar data kehadiran dapat dimasukkan ke dalam Buku Nilai (Tugas/Extra Points).</li>
            <li>Data rekap disimpan per bulan dan per mata pelajaran pengajar.</li>
          </ul>
        </div>
      </div>

    </div>
  );
}
