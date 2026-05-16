import React, { useState, useEffect } from 'react';
import { useAuth } from '@/src/context/AuthContext';
import { supabase } from '@/src/lib/supabase';
import { 
  Loader2, 
  Download, 
  Upload, 
  Plus, 
  Trash2, 
  Search,
  Check,
  CheckCircle,
  X,
  FileSpreadsheet,
  AlertCircle,
  HelpCircle,
  RefreshCw,
  Save,
  Users
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import * as XLSX from 'xlsx';

export default function GradebookPage() {
  const { profile, currentClass } = useAuth();
  const [selectedClassId, setSelectedClassId] = useState<string>('');
  const [classes, setClasses] = useState<any[]>([]);
  const [students, setStudents] = useState<any[]>([]);
  const [columns, setColumns] = useState<any[]>([]);
  const [grades, setGrades] = useState<Record<string, Record<string, any>>>({});
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [showImportModal, setShowImportModal] = useState(false);
  const [showAttendanceModal, setShowAttendanceModal] = useState(false);
  const [attendanceRecaps, setAttendanceRecaps] = useState<any[]>([]);
  const [selectedRecapId, setSelectedRecapId] = useState<string>('');
  const [importData, setImportData] = useState<any[] | null>(null);
  const [categories, setCategories] = useState<any[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [editingCell, setEditingCell] = useState<{ studentId: string, columnId: string } | null>(null);
  const [editValue, setEditValue] = useState<string>('');

  useEffect(() => {
    if (profile) {
      if (profile.role === 'guru' || profile.is_wali_kelas) {
        fetchClasses();
        fetchCategories();
      }
    }
  }, [profile]);

  useEffect(() => {
    const classId = selectedClassId || currentClass?.id;
    if (classId) {
      fetchGradebookData(classId);
    }
  }, [selectedClassId, currentClass]);

  const fetchClasses = async () => {
    const { data } = await supabase.from('classes').select('*').order('full_name');
    if (data) setClasses(data);
  };

  const fetchCategories = async () => {
    const { data } = await supabase.from('grade_categories').select('*').order('name');
    if (data) setCategories(data);
  };

  const fetchAttendanceRecaps = async () => {
    const classId = selectedClassId || currentClass?.id;
    if (!classId) return;
    
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('attendance_recaps')
        .select('*')
        .eq('class_id', classId)
        .eq('status', 'draft')
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      setAttendanceRecaps(data || []);
      setShowAttendanceModal(true);
    } catch (err) {
      console.error(err);
      alert('Gagal mengambil draft absensi.');
    } finally {
      setLoading(false);
    }
  };

  const importAttendanceToGrades = async () => {
    if (!selectedRecapId) return;
    const recap = attendanceRecaps.find(r => r.id === selectedRecapId);
    if (!recap) return;

    setIsSaving(true);
    const classId = selectedClassId || currentClass?.id;
    const cat = categories.find(c => c.name.toLowerCase() === 'kehadiran');

    try {
      // 1. Create Column
      const { data: col, error: colErr } = await supabase
        .from('gradebook_columns')
        .insert({
          class_id: classId,
          teacher_id: profile?.id,
          title: `Kehadiran - ${new Date(recap.year, recap.month - 1).toLocaleString('id-ID', { month: 'long' })}`,
          category_id: cat?.id
        })
        .select()
        .single();
      
      if (colErr) throw colErr;

      // 2. Insert Grades
      const gradesToInsert = recap.data.map((item: any) => ({
        column_id: col.id,
        student_id: item.student_id,
        score: item.percentage
      }));

      const { error: gradeErr } = await supabase.from('student_grades').insert(gradesToInsert);
      if (gradeErr) throw gradeErr;

      // 3. Mark recap as final
      await supabase.from('attendance_recaps').update({ status: 'final' }).eq('id', recap.id);

      alert('Nilai kehadiran berhasil diimport!');
      setShowAttendanceModal(false);
      fetchGradebookData(classId!);
    } catch (err: any) {
      alert('Gagal import kehadiran: ' + err.message);
    } finally {
      setIsSaving(false);
    }
  };

  const fetchGradebookData = async (classId: string) => {
    if (!classId || classId === 'undefined') return;
    setLoading(true);
    try {
      // 1. Fetch Students from Profiles
      const { data: studentsData } = await supabase
        .from('profiles')
        .select('*')
        .eq('class_id', classId)
        .eq('role', 'murid')
        .order('full_name');
      
      // 2. Fetch Columns
      let columnsQuery = supabase
        .from('gradebook_columns')
        .select('*, category:grade_categories(*)')
        .eq('class_id', classId);
      
      if (!(profile?.is_wali_kelas && profile?.class_id === classId)) {
        columnsQuery = columnsQuery.eq('teacher_id', profile?.id);
      }

      const { data: columnsData } = await columnsQuery.order('created_at');
      
      // 3. Fetch Grades
      if (columnsData && columnsData.length > 0) {
        const columnIds = columnsData.map(c => c.id);
        const { data: gradesData } = await supabase
          .from('student_grades')
          .select('*')
          .in('column_id', columnIds);
        
        const gradesMap: Record<string, Record<string, any>> = {};
        gradesData?.forEach(g => {
          if (!gradesMap[g.student_id]) gradesMap[g.student_id] = {};
          gradesMap[g.student_id][g.column_id] = g;
        });
        setGrades(gradesMap);
      } else {
        setGrades({});
      }

      setStudents(studentsData || []);
      setColumns(columnsData || []);
    } catch (err) {
      console.error('Fetch gradebook error:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateGrade = async (studentId: string, columnId: string, score: string) => {
    const numScore = parseFloat(score);
    if (isNaN(numScore) || numScore < 0 || numScore > 100) return;

    try {
      const { error } = await supabase
        .from('student_grades')
        .upsert({
          column_id: columnId,
          student_id: studentId,
          score: numScore,
          updated_at: new Date().toISOString()
        }, { onConflict: 'column_id,student_id' });
      
      if (error) throw error;
      
      setGrades(prev => ({
        ...prev,
        [studentId]: {
          ...prev[studentId],
          [columnId]: { score: numScore }
        }
      }));
      setEditingCell(null);
    } catch (err) {
      console.error('Update grade error:', err);
    }
  };

  const handleAddColumn = async () => {
    const title = prompt('Masukkan Judul Kolom (cth: Quiz 1):');
    if (!title) return;
    
    const classId = selectedClassId || currentClass?.id;
    if (!classId) return;

    try {
      const { data, error } = await supabase
        .from('gradebook_columns')
        .insert({
          class_id: classId,
          teacher_id: profile?.id,
          title
        })
        .select()
        .single();
      
      if (error) throw error;
      if (data) setColumns(prev => [...prev, data]);
    } catch (err) {
      console.error('Add column error:', err);
    }
  };

  const handleDeleteColumn = async (id: string) => {
    if (!confirm('Hapus kolom nilai ini? Semua nilai di dalamnya akan ikut terhapus.')) return;
    try {
      const { error } = await supabase.from('gradebook_columns').delete().eq('id', id);
      if (error) throw error;
      setColumns(prev => prev.filter(c => c.id !== id));
    } catch (err) {
      console.error('Delete column error:', err);
    }
  };

  const downloadTemplate = () => {
    const data = students.map((s, index) => ({
      'No Absen': index + 1,
      'Username': s.username,
      'Nama Siswa': s.full_name,
      'Nilai': ''
    }));

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Template Nilai');
    XLSX.writeFile(wb, `Template_Nilai_${currentClass?.full_name || 'Kelas'}.xlsx`);
  };

  const handleExcelImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      const bstr = evt.target?.result;
      const wb = XLSX.read(bstr, { type: 'binary' });
      const wsname = wb.SheetNames[0];
      const ws = wb.Sheets[wsname];
      const data = XLSX.utils.sheet_to_json(ws);
      setImportData(data);
      setShowImportModal(true);
    };
    reader.readAsBinaryString(file);
  };

  const confirmImport = async () => {
    if (!importData) return;
    setIsSaving(true);
    
    const classId = selectedClassId || currentClass?.id;
    const title = prompt('Berikan judul untuk data yang diimport (cth: Ulangan Harian 1):');
    if (!title) {
        setIsSaving(false);
        return;
    }

    try {
      const { data: col, error: colErr } = await supabase
        .from('gradebook_columns')
        .insert({
          class_id: classId,
          teacher_id: profile?.id,
          title
        })
        .select()
        .single();
      
      if (colErr) throw colErr;

      const gradesToInsert: any[] = [];
      for (const row of importData) {
        const username = row['Username']?.toString();
        const score = parseFloat(row['Nilai']);
        if (isNaN(score)) continue;

        const student = students.find(s => s.username === username || s.full_name === row['Nama Siswa']);
        if (student) {
          gradesToInsert.push({
            column_id: col.id,
            student_id: student.id,
            score
          });
        }
      }

      if (gradesToInsert.length > 0) {
        const { error: gradeErr } = await supabase.from('student_grades').insert(gradesToInsert);
        if (gradeErr) throw gradeErr;
      }

      alert(`Berhasil mengimport ${gradesToInsert.length} nilai.`);
      setShowImportModal(false);
      fetchGradebookData(classId!);
    } catch (err: any) {
      alert('Gagal import: ' + err.message);
    } finally {
      setIsSaving(false);
    }
  };

  const filteredStudents = students.filter(s => 
    s.full_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    s.username.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="max-w-[1600px] mx-auto p-4 md:p-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-8">
        <div>
           <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center text-white shadow-lg shadow-indigo-100">
                <FileSpreadsheet className="w-6 h-6" />
              </div>
              <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight">Buku Nilai</h1>
           </div>
           <div className="flex items-center gap-2">
             <select 
               value={selectedClassId || currentClass?.id || ''}
               onChange={(e) => setSelectedClassId(e.target.value)}
               className="bg-transparent border-none p-0 text-indigo-600 font-bold focus:ring-0 cursor-pointer"
             >
               {classes.map(c => (
                 <option key={c.id} value={c.id}>{c.full_name}</option>
               ))}
             </select>
             <span className="text-slate-400 font-medium">•</span>
             <p className="text-slate-500 font-medium italic">Kelola nilai akademik siswa berbasis akun</p>
           </div>
        </div>

        <div className="flex flex-wrap gap-3">
          <button onClick={downloadTemplate} className="secondary-button bg-white">
            <Download className="w-4 h-4" />
            Template Excel
          </button>
          <label className="secondary-button bg-white cursor-pointer">
            <Upload className="w-4 h-4" />
            Import Excel
            <input type="file" accept=".xlsx" onChange={handleExcelImport} className="hidden" />
          </label>
          <button onClick={fetchAttendanceRecaps} className="secondary-button bg-emerald-50 text-emerald-700 border-emerald-100">
            <RefreshCw className="w-4 h-4" />
            Tarik Absensi
          </button>
          <button onClick={handleAddColumn} className="primary-button bg-indigo-600">
            <Plus className="w-4 h-4" />
            Tambah Kolom
          </button>
        </div>
      </div>

      <AnimatePresence>
        {showAttendanceModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => setShowAttendanceModal(false)} />
            <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }} className="relative bg-white w-full max-w-lg rounded-[2.5rem] shadow-2xl p-8 overflow-hidden">
              <div className="flex items-center justify-between mb-8">
                <div>
                  <h2 className="text-xl font-black text-slate-900 uppercase tracking-tight">Tarik Nilai Kehadiran</h2>
                  <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-1">Gunakan persentase absensi sebagai nilai</p>
                </div>
                <button onClick={() => setShowAttendanceModal(false)} className="p-2 hover:bg-slate-100 rounded-full transition-colors"><X className="w-5 h-5 text-slate-400" /></button>
              </div>

              <div className="space-y-4 mb-8">
                {attendanceRecaps.length === 0 ? (
                  <div className="py-8 text-center bg-slate-50 rounded-2xl border border-dashed border-slate-200">
                    <p className="text-sm text-slate-400 font-medium">Belum ada draft rekap absensi.<br/>Simpan draft di halaman Absensi terlebih dahulu.</p>
                  </div>
                ) : (
                  attendanceRecaps.map(recap => (
                    <label key={recap.id} className="flex items-center p-4 bg-slate-50 border border-slate-100 rounded-2xl cursor-pointer hover:border-indigo-300 transition-all">
                      <input 
                        type="radio" 
                        name="recap" 
                        className="w-4 h-4 text-indigo-600 mr-4" 
                        onChange={() => setSelectedRecapId(recap.id)}
                        checked={selectedRecapId === recap.id}
                      />
                      <div className="flex-1">
                        <p className="text-sm font-bold text-slate-700"> {new Date(recap.year, recap.month - 1).toLocaleString('id-ID', { month: 'long', year: 'numeric' })}</p>
                        <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">{recap.subject || 'Umum'}</p>
                      </div>
                      <div className="text-right">
                        <span className="text-xs font-black text-indigo-600">{recap.data.length} Siswa</span>
                      </div>
                    </label>
                  ))
                )}
              </div>

              <div className="flex gap-4">
                <button onClick={() => setShowAttendanceModal(false)} className="flex-1 py-4 text-slate-500 font-black text-[11px] uppercase tracking-[0.2em] rounded-2xl border border-slate-200">Batal</button>
                <button 
                  onClick={importAttendanceToGrades} 
                  disabled={isSaving || !selectedRecapId} 
                  className="flex-[2] py-4 bg-emerald-600 text-white rounded-2xl font-black text-[11px] uppercase tracking-[0.2em] flex items-center justify-center gap-3 disabled:opacity-50"
                >
                  {isSaving ? <Loader2 className="w-5 h-5 animate-spin" /> : <><CheckCircle className="w-5 h-5" /> Import Nilai Kehadiran</>}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <div className="flex flex-col md:flex-row items-center justify-between gap-4 mb-6">
        <div className="relative w-full md:w-96">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input 
            type="text"
            placeholder="Cari nama atau username..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-11 pr-4 py-3 bg-white border border-slate-200 rounded-2xl outline-none focus:ring-4 focus:ring-indigo-100 transition-all text-sm font-medium"
          />
        </div>
        <div className="flex items-center gap-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">
           <div className="flex items-center gap-2">
              <div className="w-3 h-3 bg-emerald-500 rounded-sm" />
              <span>Akun Terverifikasi</span>
           </div>
        </div>
      </div>

      <div className="bento-card border-none shadow-xl shadow-slate-100 bg-white">
        {loading ? (
          <div className="py-20 flex flex-col items-center justify-center gap-4">
            <Loader2 className="animate-spin text-indigo-600 w-10 h-10" />
            <p className="text-xs font-black text-slate-400 uppercase tracking-widest italic">Menyusun buku nilai...</p>
          </div>
        ) : (
          <div className="overflow-x-auto scrollbar-thin scrollbar-thumb-slate-200">
            <table className="w-full border-collapse min-w-[800px]">
              <thead>
                <tr className="bg-slate-50/50 border-b border-slate-100">
                  <th className="sticky left-0 z-20 bg-slate-50 p-4 md:p-6 text-left min-w-[200px] md:min-w-[300px]">
                    <div className="flex items-center gap-2 text-[9px] md:text-[10px] font-black text-slate-500 uppercase tracking-[0.1em] md:tracking-[0.2em]">
                      <Users className="w-3 h-3 md:w-4 md:h-4" />
                      Daftar Siswa
                    </div>
                  </th>
                  {columns.map(col => (
                    <th key={col.id} className="p-4 md:p-6 text-center min-w-[100px] md:min-w-[120px] border-l border-slate-100">
                      <div className="flex flex-col items-center gap-1 md:gap-2">
                         <div className="flex items-center gap-1 md:gap-2 group">
                            <span className="text-[10px] md:text-[11px] font-black text-slate-700 uppercase tracking-tight truncate max-w-[80px] md:max-w-none">{col.title}</span>
                            <button onClick={() => handleDeleteColumn(col.id)} className="opacity-0 group-hover:opacity-100 p-1 text-rose-400 hover:text-rose-600 transition-all">
                               <Trash2 className="w-3 h-3" />
                            </button>
                         </div>
                         <span className="px-1.5 md:px-2 py-0.5 bg-slate-100 text-slate-400 text-[7px] md:text-[8px] font-black rounded uppercase tracking-widest border border-slate-200">
                           {col.category?.name || 'UMUM'}
                         </span>
                      </div>
                    </th>
                  ))}
                  <th className="p-4 md:p-6 text-center min-w-[100px] md:min-w-[120px] border-l border-slate-100 bg-indigo-50/30">
                    <div className="flex flex-col items-center gap-1">
                      <span className="text-[9px] md:text-[10px] font-black text-indigo-600 uppercase tracking-widest">Rata-rata</span>
                    </div>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {filteredStudents.map((student, idx) => {
                  let totalScore = 0;
                  let count = 0;

                  return (
                    <tr key={student.id} className="hover:bg-slate-50/50 transition-colors group">
                      <td className="sticky left-0 z-10 bg-white group-hover:bg-slate-50/50 p-4 md:p-6 shadow-[2px_0_5px_rgba(0,0,0,0.02)]">
                        <div className="flex items-center gap-3 md:gap-4">
                          <div className="w-8 h-8 md:w-10 md:h-10 bg-indigo-50 rounded-lg md:rounded-xl flex items-center justify-center font-black text-indigo-600 text-[10px] md:text-xs border border-indigo-100 shrink-0">
                            {idx + 1}
                          </div>
                          <div className="min-w-0">
                            <p className="font-bold text-slate-800 text-xs md:text-sm leading-tight truncate">{student.full_name}</p>
                            <p className="text-[9px] md:text-[10px] text-slate-400 font-medium uppercase tracking-widest mt-0.5 font-mono truncate">@{student.username}</p>
                          </div>
                        </div>
                      </td>
                      {columns.map(col => {
                        const grade = grades[student.id]?.[col.id];
                        if (grade?.score) {
                          totalScore += grade.score;
                          count++;
                        }
                        
                        const isEditing = editingCell?.studentId === student.id && editingCell?.columnId === col.id;

                        return (
                          <td 
                            key={col.id} 
                            className="p-4 md:p-6 text-center border-l border-slate-50 cursor-pointer hover:bg-white"
                            onClick={() => {
                              if (!isEditing) {
                                setEditingCell({ studentId: student.id, columnId: col.id });
                                setEditValue(grade?.score?.toString() || '');
                              }
                            }}
                          >
                            {isEditing ? (
                              <input 
                                autoFocus 
                                type="number"
                                value={editValue}
                                onChange={(e) => setEditValue(e.target.value)}
                                onBlur={() => handleUpdateGrade(student.id, col.id, editValue)}
                                onKeyDown={(e) => e.key === 'Enter' && handleUpdateGrade(student.id, col.id, editValue)}
                                className="w-12 md:w-16 px-2 py-1 bg-white border-2 border-indigo-500 rounded-lg outline-none text-center font-black text-xs md:text-sm"
                                min="0"
                                max="100"
                              />
                            ) : (
                              <span className={`text-xs md:text-sm font-black transition-all ${grade?.score ? 'text-slate-800' : 'text-slate-300'}`}>
                                {grade?.score || '-'}
                              </span>
                            )}
                          </td>
                        );
                      })}
                      <td className="p-4 md:p-6 text-center border-l border-indigo-100 bg-indigo-50/10">
                         <span className="text-xs md:text-sm font-black text-indigo-600">
                           {count > 0 ? Math.round(totalScore / count) : '-'}
                         </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        
        {students.length === 0 && !loading && (
          <div className="py-32 flex flex-col items-center justify-center text-center px-4">
             <div className="w-20 h-20 bg-slate-50 rounded-[2rem] flex items-center justify-center text-slate-200 mb-6">
                <Users className="w-10 h-10" />
             </div>
             <h3 className="text-lg font-bold text-slate-800 mb-2">Daftar Akun Siswa Kosong</h3>
             <p className="text-xs text-slate-400 font-medium max-w-sm leading-relaxed">
               Siswa harus mendaftar dan memilih kelas ini agar muncul di buku nilai.
             </p>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-8">
         <div className="bento-card p-6 border-l-4 border-l-emerald-400">
            <div className="flex items-center gap-3 mb-3">
               <div className="p-2 bg-emerald-50 text-emerald-500 rounded-lg"><Check className="w-5 h-5" /></div>
               <h4 className="text-sm font-black text-slate-800 uppercase tracking-tight">Akun Terverifikasi</h4>
            </div>
            <p className="text-[11px] text-slate-500 font-medium leading-relaxed">
               Semua nama yang muncul di sini berasal dari akun nyata yang sudah mendaftar.
            </p>
         </div>
      </div>

      <AnimatePresence>
        {showImportModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => setShowImportModal(false)} />
            <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }} className="relative bg-white w-full max-w-4xl rounded-[2.5rem] shadow-2xl p-8 overflow-hidden max-h-[80vh] flex flex-col">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h2 className="text-2xl font-black text-slate-900 uppercase tracking-tight">Preview Data Excel</h2>
                </div>
                <button onClick={() => setShowImportModal(false)} className="p-2 hover:bg-slate-100 rounded-full transition-colors"><X className="w-6 h-6 text-slate-400" /></button>
              </div>

              <div className="flex-1 overflow-auto bento-card border border-slate-100 mb-6 p-0">
                <table className="w-full text-left">
                  <thead className="bg-slate-50 sticky top-0 font-black text-[10px] text-slate-400 uppercase tracking-widest border-b border-slate-100">
                    <tr>
                      <th className="p-4">Nama Siswa (Excel)</th>
                      <th className="p-4">Username (Excel)</th>
                      <th className="p-4 text-center">Nilai</th>
                      <th className="p-4">Status Map</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-xs font-medium">
                    {importData?.map((row, i) => {
                      const student = students.find(s => s.username === row['Username']?.toString() || s.full_name === row['Nama Siswa']);
                      return (
                        <tr key={i} className="hover:bg-slate-50/50">
                          <td className="p-4 text-slate-700">{row['Nama Siswa']}</td>
                          <td className="p-4 text-slate-400">{row['Username']}</td>
                          <td className="p-4 text-center font-black text-indigo-600">{row['Nilai']}</td>
                          <td className="p-4">
                            {student ? (
                              <span className="text-green-600 flex items-center gap-1 font-bold"><Check className="w-3 h-3" /> Cocok</span>
                            ) : (
                              <span className="text-rose-500 flex items-center gap-1 font-bold"><X className="w-3 h-3" /> Tidak Ditemukan</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div className="flex gap-4">
                <button onClick={() => setShowImportModal(false)} className="flex-1 py-4 text-slate-500 font-black text-[11px] uppercase tracking-[0.2em] rounded-2xl border border-slate-200">Batal</button>
                <button onClick={confirmImport} disabled={isSaving} className="flex-[2] py-4 bg-indigo-600 text-white rounded-2xl font-black text-[11px] uppercase tracking-[0.2em] flex items-center justify-center gap-3">
                  {isSaving ? <Loader2 className="w-5 h-5 animate-spin" /> : <><Save className="w-5 h-5" /> Simpan ke Buku Nilai</>}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
