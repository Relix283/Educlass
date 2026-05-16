import { useState, useEffect } from 'react';
import { useAuth } from '@/src/context/AuthContext';
import { supabase } from '@/src/lib/supabase';
import { 
  Loader2, 
  Trophy, 
  Search,
  ChevronDown,
  ArrowUpDown,
  Printer,
  BookOpen
} from 'lucide-react';
import { motion } from 'motion/react';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

export default function GradeRecapPage() {
  const { profile, currentClass } = useAuth();
  const [selectedClassId, setSelectedClassId] = useState<string>('');
  const [classes, setClasses] = useState<any[]>([]);
  const [students, setStudents] = useState<any[]>([]);
  const [columns, setColumns] = useState<any[]>([]);
  const [grades, setGrades] = useState<Record<string, Record<string, any>>>({});
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState<'name' | 'average'>('average');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  useEffect(() => {
    if (profile) {
      if (profile.role === 'guru' || profile.is_wali_kelas) {
        fetchClasses();
      }
    }
  }, [profile]);

  useEffect(() => {
    const classId = selectedClassId || currentClass?.id;
    if (classId) {
      fetchRecapData(classId);
    }
  }, [selectedClassId, currentClass]);

  const fetchClasses = async () => {
    const { data } = await supabase.from('classes').select('*').order('full_name');
    if (data) setClasses(data);
  };

  const fetchRecapData = async (classId: string) => {
    if (!classId || classId === 'undefined') return;
    setLoading(true);
    try {
      let columnsQuery = supabase
        .from('gradebook_columns')
        .select('*, category:grade_categories(*)')
        .eq('class_id', classId);
      
      if (!(profile?.is_wali_kelas && profile?.class_id === classId)) {
        columnsQuery = columnsQuery.eq('teacher_id', profile?.id);
      }

      const [{ data: studentsData }, { data: columnsData }] = await Promise.all([
        supabase.from('profiles').select('*').eq('class_id', classId).eq('role', 'murid').order('full_name'),
        columnsQuery.order('created_at')
      ]);

      if (columnsData && columnsData.length > 0) {
        const { data: gradesData } = await supabase
          .from('student_grades')
          .select('*')
          .in('column_id', columnsData.map(c => c.id));
        
        const gradesMap: Record<string, Record<string, any>> = {};
        gradesData?.forEach(g => {
          if (!gradesMap[g.student_id]) gradesMap[g.student_id] = {};
          gradesMap[g.student_id][g.column_id] = g;
        });
        setGrades(gradesMap);
      }

      setStudents(studentsData || []);
      setColumns(columnsData || []);
    } catch (err) {
      console.error('Fetch recap error:', err);
    } finally {
      setLoading(false);
    }
  };

  const calculateStudentStats = (studentId: string) => {
    const studentGrades = grades[studentId] || {};
    let totalScore = 0;
    let count = 0;

    columns.forEach(col => {
      const score = studentGrades[col.id]?.score;
      if (score !== undefined && score !== null) {
        totalScore += parseFloat(score);
        count++;
      }
    });

    const average = count > 0 ? Math.round(totalScore / count) : 0;
    return { average, count, totalScore };
  };

  const processedStudents = students.map(s => ({
    ...s,
    stats: calculateStudentStats(s.id)
  })).sort((a, b) => {
    if (sortBy === 'name') return sortOrder === 'asc' ? a.full_name.localeCompare(b.full_name) : b.full_name.localeCompare(a.full_name);
    if (sortBy === 'average') return sortOrder === 'asc' ? a.stats.average - b.stats.average : b.stats.average - a.stats.average;
    return 0;
  });

  const rankings = [...processedStudents]
    .sort((a, b) => b.stats.average - a.stats.average)
    .map((s, idx) => ({ id: s.id, rank: idx + 1 }));

  const exportToPDF = () => {
    const doc = new jsPDF();
    const activeClass = classes.find(c => c.id === (selectedClassId || currentClass?.id));
    const className = activeClass?.full_name || 'Seluruh Kelas';

    doc.setFontSize(20);
    doc.text('EDUCLASS - REKAP NILAI SISWA', 105, 15, { align: 'center' });
    doc.setFontSize(10);
    doc.text(`Kelas: ${className}`, 14, 25);
    doc.text(`Guru: ${profile?.full_name}`, 14, 30);
    doc.text(`Mata Pelajaran: Semua Mata Pelajaran`, 14, 35);
    doc.text(`Tanggal Cetak: ${new Date().toLocaleDateString('id-ID')}`, 14, 40);
    doc.line(14, 45, 196, 45);

    const tableData = processedStudents.map((s, i) => [
      i + 1,
      s.full_name,
      s.username,
      s.stats.count,
      s.stats.average,
      rankings.find(r => r.id === s.id)?.rank || '-'
    ]);

    autoTable(doc, {
      startY: 50,
      head: [['No', 'Nama Siswa', 'Username', 'Tugas', 'Rata-rata', 'Ranking']],
      body: tableData,
      theme: 'grid',
      headStyles: { fillColor: '#4F46E5', textColor: 255, fontStyle: 'bold' },
      alternateRowStyles: { fillColor: '#F9FAFB' }
    });

    const finalY = (doc as any).lastAutoTable.finalY + 20;
    doc.setFontSize(10);
    doc.text('Mengetahui,', 20, finalY);
    doc.text('Wali Kelas / Guru Pengampu', 20, finalY + 25);
    doc.text(`(${profile?.full_name})`, 20, finalY + 30);

    doc.save(`Rekap_Nilai_${className}.pdf`);
  };

  const statsAggregated = {
    classAverage: processedStudents.reduce((acc, s) => acc + s.stats.average, 0) / (processedStudents.length || 1),
    maxAverage: Math.max(...processedStudents.map(s => s.stats.average), 0),
    totalSubmissions: processedStudents.reduce((acc, s) => acc + s.stats.count, 0)
  };

  return (
    <div className="max-w-[1200px] mx-auto p-4 md:p-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-8">
        <div>
           <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center text-white shadow-lg shadow-blue-100">
                <Trophy className="w-6 h-6" />
              </div>
              <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight">Rekap Nilai</h1>
           </div>
           <div className="flex items-center gap-2">
             <select 
               value={selectedClassId || currentClass?.id || ''}
               onChange={(e) => setSelectedClassId(e.target.value)}
               className="bg-transparent border-none p-0 text-blue-600 font-bold focus:ring-0 cursor-pointer"
             >
               {classes.map(c => (
                 <option key={c.id} value={c.id}>{c.full_name}</option>
               ))}
             </select>
             <span className="text-slate-400 font-medium">•</span>
             <p className="text-slate-500 font-medium italic">Ringkasan pencapaian akademik berbasis akun</p>
           </div>
        </div>

        <button onClick={exportToPDF} className="primary-button bg-blue-600">
          <Printer className="w-4 h-4" />
          Cetak PDF
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 mb-8">
         <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="bento-card p-6 bg-indigo-600 text-white border-none">
            <p className="text-[10px] font-black text-indigo-100 uppercase tracking-widest mb-1">Rata-rata Kelas</p>
            <h3 className="text-4xl font-black">{Math.round(statsAggregated.classAverage)}</h3>
            <div className="mt-4 flex items-center gap-2">
              <div className="w-full bg-white/20 h-1.5 rounded-full overflow-hidden text-right">
                <div className="bg-white h-full" style={{ width: `${statsAggregated.classAverage}%` }} />
              </div>
            </div>
         </motion.div>
         <div className="bento-card p-6 border-l-4 border-l-amber-500">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Nilai Tertinggi</p>
            <h3 className="text-4xl font-black text-slate-800">{statsAggregated.maxAverage}</h3>
         </div>
         <div className="bento-card p-6 border-l-4 border-l-blue-500">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Total Penilaian</p>
            <h3 className="text-4xl font-black text-slate-800">{statsAggregated.totalSubmissions}</h3>
         </div>
      </div>

      <div className="flex flex-col md:flex-row items-center justify-between gap-4 mb-6">
        <div className="relative w-full md:w-96">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input 
            type="text"
            placeholder="Cari nama atau username..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-11 pr-4 py-3 bg-white border border-slate-100 rounded-2xl outline-none focus:ring-4 focus:ring-blue-100/50 transition-all text-sm font-medium"
          />
        </div>
        <div className="flex gap-2">
           <button 
             onClick={() => { setSortBy('average'); setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc'); }}
             className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest border transition-all flex items-center gap-2 ${sortBy === 'average' ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-slate-400 border-slate-100 hover:border-blue-200'}`}
           >
             <ArrowUpDown className="w-3 h-3" />
             Rata-rata {sortOrder === 'asc' ? '↑' : '↓'}
           </button>
           <button 
             onClick={() => { setSortBy('name'); setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc'); }}
             className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest border transition-all flex items-center gap-2 ${sortBy === 'name' ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-slate-400 border-slate-100 hover:border-blue-200'}`}
           >
             <ArrowUpDown className="w-3 h-3" />
             Nama {sortOrder === 'asc' ? '↑' : '↓'}
           </button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4">
        {loading ? (
          <div className="py-20 flex justify-center"><Loader2 className="animate-spin text-blue-600" /></div>
        ) : (
          processedStudents
            .filter(s => s.full_name.toLowerCase().includes(searchTerm.toLowerCase()) || s.username.toLowerCase().includes(searchTerm.toLowerCase()))
            .map((student) => {
              const rank = rankings.find(r => r.id === student.id)?.rank;
              return (
                <div key={student.id} className="bento-card p-6 flex flex-col md:flex-row md:items-center justify-between gap-6 hover:shadow-lg transition-all">
                  <div className="flex items-center gap-6">
                    <div className={`w-12 h-12 rounded-2xl flex items-center justify-center font-black text-lg ${rank === 1 ? 'bg-amber-100 text-amber-600' : rank === 2 ? 'bg-slate-100 text-slate-400' : rank === 3 ? 'bg-orange-100 text-orange-600' : 'bg-slate-50 text-slate-300'}`}>
                      {rank}
                    </div>
                    <div>
                      <h4 className="text-lg font-bold text-slate-800">{student.full_name}</h4>
                      <div className="flex items-center gap-3 mt-1">
                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest font-mono">@{student.username}</span>
                        <span className="w-1 h-1 bg-slate-200 rounded-full" />
                        <span className="text-[10px] font-black text-blue-600 uppercase tracking-widest">{student.stats.count} Tugas</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-8">
                     <div className="text-right">
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Rata-rata</p>
                        <p className={`text-2xl font-black ${student.stats.average >= 80 ? 'text-green-600' : student.stats.average >= 70 ? 'text-blue-600' : 'text-rose-500'}`}>
                          {student.stats.average}
                        </p>
                     </div>
                     <div className="h-10 w-px bg-slate-100" />
                     <button className="p-3 bg-slate-50 text-slate-400 rounded-xl">
                        <ChevronDown className="w-5 h-5" />
                     </button>
                  </div>
                </div>
              );
            })
        )}
      </div>

      {students.length === 0 && !loading && (
        <div className="py-20 text-center bento-card">
           <BookOpen className="w-12 h-12 text-slate-200 mx-auto mb-4" />
           <p className="text-slate-400 font-bold uppercase tracking-widest text-xs">Belum ada akun siswa terdaftar untuk rekap nilai ini</p>
        </div>
      )}
    </div>
  );
}
