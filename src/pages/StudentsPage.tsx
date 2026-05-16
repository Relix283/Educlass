import { useState, useEffect } from 'react';
import { useAuth } from '@/src/context/AuthContext';
import { supabase } from '@/src/lib/supabase';
import { Profile, Jabatan, Class, Role } from '@/src/types/database';
import { 
  Users, 
  Download, 
  Trash2, 
  Edit3, 
  Search, 
  Check, 
  X,
  Loader2
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

export default function StudentsPage() {
  const { currentClass, profile, refreshProfile } = useAuth();
  const [students, setStudents] = useState<Profile[]>([]);
  const [classes, setClasses] = useState<Class[]>([]);
  const [selectedClassId, setSelectedClassId] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  // Edit states
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingStudent, setEditingStudent] = useState<Profile | null>(null);
  const [editForm, setEditForm] = useState({ full_name: '', username: '' });
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    fetchClasses();
  }, []);

  useEffect(() => {
    if (currentClass) {
      setSelectedClassId(currentClass.id);
    }
  }, [currentClass]);

  useEffect(() => {
    if (selectedClassId) {
      fetchStudents();
    }
  }, [selectedClassId]);

  const fetchClasses = async () => {
    const { data } = await supabase.from('classes').select('*').order('full_name');
    if (data) setClasses(data);
  };

  const fetchStudents = async () => {
    if (!selectedClassId || selectedClassId === 'undefined') return;
    setLoading(true);
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .eq('class_id', selectedClassId)
      .eq('role', 'murid')
      .order('full_name');
    if (data) setStudents(data);
    setLoading(false);
  };

  const handleClassChange = async (classId: string) => {
    setSelectedClassId(classId);
  };

  const updateJabatan = async (studentId: string, jabatan: Jabatan) => {
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ 
          jabatan_pengurus: jabatan || null
        })
        .eq('id', studentId);
      if (error) {
        if (error.message.includes('row-level security') || error.message.includes('permission')) {
          alert('Gagal: Kebijakan Keamanan (RLS) Supabase membatasi pengeditan. Wali Kelas harus memiliki izin untuk mengedit profil di dashboard Supabase.');
        } else {
          alert('Gagal update pengurus: ' + error.message);
        }
        return;
      }
      fetchStudents();
    } catch (err: any) {
      console.error(err);
      alert('Terjadi kesalahan: ' + err.message);
    }
  };

  const updateRole = async (studentId: string, role: Role) => {
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ role })
        .eq('id', studentId);
      if (error) throw error;
      fetchStudents();
      alert(`Role berhasil diubah menjadi ${role}!`);
    } catch (err: any) {
      console.error(err);
      alert('Gagal update role: ' + (err.message || 'Error tidak dikenal'));
    }
  };

  const filteredStudents = students.filter(s => 
    s.full_name.toLowerCase().includes(search.toLowerCase()) || 
    s.username.toLowerCase().includes(search.toLowerCase())
  );

  const handleEditClick = (student: Profile) => {
    setEditingStudent(student);
    setEditForm({ full_name: student.full_name, username: student.username });
    setShowEditModal(true);
  };

  const handleUpdateStudent = async () => {
    if (!editingStudent) return;
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ 
          full_name: editForm.full_name,
          username: editForm.username
        })
        .eq('id', editingStudent.id);

      if (error) throw error;
      
      setShowEditModal(false);
      setEditingStudent(null);
      fetchStudents();
      alert('Profil siswa berhasil diperbarui!');
    } catch (err: any) {
      console.error(err);
      alert('Gagal memperbarui profil: ' + err.message);
    }
  };

  const handleDeleteStudent = async (student: Profile) => {
    if (!window.confirm(`Hapus akun ${student.full_name}? Tindakan ini tidak dapat dibatalkan.`)) return;
    setDeleting(true);
    try {
      const { error } = await supabase.from('profiles').delete().eq('id', student.id);
      if (error) throw error;
      fetchStudents();
      alert('Akun siswa berhasil dihapus.');
    } catch (err: any) {
      console.error(err);
      alert('Gagal menghapus akun: ' + err.message);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="max-w-6xl mx-auto">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-8">
        <div>
          <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight">Manajemen Akun Siswa</h1>
          <div className="flex items-center gap-2 mt-1">
             <p className="text-slate-500 font-medium">Bina Kelas:</p>
             <select 
               value={selectedClassId}
               onChange={(e) => handleClassChange(e.target.value)}
               disabled={profile?.is_wali_kelas}
               className="bg-transparent border-none p-0 text-blue-600 font-bold focus:ring-0 cursor-pointer disabled:cursor-not-allowed"
             >
               <option value="" disabled>Pilih Kelas</option>
               {classes.map(c => (
                 <option key={c.id} value={c.id}>{c.full_name}</option>
               ))}
             </select>
          </div>
        </div>
        <div className="flex gap-3">
          <div className="px-4 py-2 bg-blue-50 text-blue-700 rounded-xl border border-blue-100 flex items-center gap-2 text-sm font-bold">
             <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse" />
             {profile?.is_wali_kelas ? 'Status: Wali Kelas' : 'Status: Guru MaPel'}
          </div>
        </div>
      </div>

      {/* Table Card */}
      <div className="bento-card overflow-hidden">
        <div className="p-4 md:p-6 border-b border-slate-50 flex flex-col sm:flex-row items-center justify-between gap-4">
           <div className="relative w-full sm:max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input 
                type="text" 
                placeholder="Cari nama atau username..."
                className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-100 rounded-xl text-sm outline-none focus:ring-4 focus:ring-blue-100 transition-all font-medium"
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
           </div>
          <div className="hidden sm:flex items-center gap-2 text-slate-400 text-[10px] font-black uppercase tracking-widest">
             <Users className="w-3 h-3" />
             <span>{filteredStudents.length} SISWA TERDAFTAR</span>
           </div>
        </div>

        <div className="overflow-x-auto scrollbar-thin scrollbar-thumb-slate-200">
          <table className="w-full text-left min-w-[700px]">
            <thead>
              <tr className="bg-slate-50/50 text-[10px] font-black uppercase tracking-widest text-slate-400 border-b border-slate-50">
                <th className="px-4 md:px-6 py-4 font-bold">Akun</th>
                <th className="px-4 md:px-6 py-4 font-bold">Username</th>
                <th className="px-4 md:px-6 py-4 font-bold text-center">Status</th>
                <th className="px-4 md:px-6 py-4 font-bold text-center">Jabatan</th>
                <th className="px-4 md:px-6 py-4 font-bold text-right">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {loading ? (
                <tr><td colSpan={5} className="p-12 text-center"><Loader2 className="animate-spin inline-block text-blue-600" /></td></tr>
              ) : filteredStudents.map((student) => (
                <tr key={student.id} className="hover:bg-slate-50/50 transition-colors group">
                  <td className="px-4 md:px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 md:w-9 md:h-9 bg-indigo-50 text-indigo-600 rounded-full flex items-center justify-center font-black border-2 border-white shadow-sm text-[10px] md:text-xs shrink-0">
                        {student.full_name.charAt(0)}
                      </div>
                      <div className="flex flex-col min-w-0">
                        <span className="font-bold text-slate-700 group-hover:text-blue-600 transition-colors text-xs md:text-sm truncate">{student.full_name}</span>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 md:px-6 py-4 text-slate-400 font-medium text-[10px] md:text-xs">@{student.username}</td>
                  <td className="px-4 md:px-6 py-4 text-center">
                    <div className="flex justify-center">
                      {student.jabatan_pengurus ? (
                        <span className="px-1.5 md:px-2 py-0.5 md:py-1 bg-emerald-50 text-emerald-600 text-[8px] md:text-[9px] font-black rounded-lg border border-emerald-100 uppercase">PENGURUS</span>
                      ) : (
                        <span className="px-1.5 md:px-2 py-0.5 md:py-1 bg-slate-100 text-slate-500 text-[8px] md:text-[9px] font-black rounded-lg border border-slate-200 uppercase">SISWA</span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 md:px-6 py-4 text-center">
                    <select 
                      value={student.jabatan_pengurus || ''}
                      onChange={(e) => updateJabatan(student.id, e.target.value as Jabatan)}
                      disabled={!profile?.is_wali_kelas || student.role === 'guru'}
                      className="bg-white border border-slate-200 text-slate-600 text-[10px] font-black uppercase tracking-tight md:tracking-widest rounded-lg px-2 md:px-3 py-1 md:py-1.5 outline-none focus:ring-4 focus:ring-blue-100 transition-all appearance-none cursor-pointer hover:border-blue-300 disabled:opacity-50 disabled:cursor-not-allowed mx-auto"
                    >
                      <option value="">User Biasa</option>
                      <option value="ketua">Ketua Kelas</option>
                      <option value="wakil">Wakil Ketua</option>
                      <option value="bendahara">Bendahara</option>
                      <option value="sekretaris">Sekretaris</option>
                      <option value="keamanan_kebersihan">Keamanan</option>
                    </select>
                  </td>
                  <td className="px-4 md:px-6 py-4 text-right">
                    <div className="flex items-center justify-end gap-1 px-1">
                       {profile?.is_wali_kelas && student.class_id === profile?.class_id && (
                         <>
                           <button 
                             onClick={() => handleEditClick(student)}
                             className="p-1.5 md:p-2 text-slate-400 hover:text-blue-600 hover:bg-white rounded-lg transition-all shadow-sm shadow-transparent hover:shadow-slate-100"
                           >
                             <Edit3 className="w-3.5 h-3.5 md:w-4 md:h-4" />
                           </button>
                           <button 
                             onClick={() => handleDeleteStudent(student)}
                             disabled={deleting}
                             className="p-1.5 md:p-2 text-slate-400 hover:text-red-600 hover:bg-white rounded-lg transition-all shadow-sm shadow-transparent hover:shadow-red-50"
                           >
                             <Trash2 className="w-3.5 h-3.5 md:w-4 md:h-4" />
                           </button>
                         </>
                       )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!loading && filteredStudents.length === 0 && (
            <div className="p-20 text-center flex flex-col items-center">
               <Users className="w-12 h-12 text-slate-200 mb-4" />
               <p className="text-slate-400 font-medium">Belum ada data siswa di kelas ini.</p>
            </div>
          )}
        </div>
      </div>

      {/* Edit Modal */}
      <AnimatePresence>
        {showEditModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
             <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setShowEditModal(false)} className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" />
             <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }} className="relative bg-white w-full max-w-md rounded-3xl shadow-2xl p-8">
                <div className="flex items-center justify-between mb-8">
                  <div className="flex items-center gap-3">
                    <div className="p-3 bg-blue-50 text-blue-600 rounded-2xl"><Edit3 className="w-6 h-6" /></div>
                    <h2 className="text-2xl font-bold text-slate-900">Edit Akun Siswa</h2>
                  </div>
                  <button onClick={() => setShowEditModal(false)} className="p-2 hover:bg-slate-100 rounded-full"><X className="w-6 h-6" /></button>
                </div>

                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">Nama Lengkap</label>
                    <input 
                      type="text" 
                      value={editForm.full_name}
                      onChange={(e) => setEditForm(prev => ({ ...prev, full_name: e.target.value }))}
                      className="w-full px-4 py-3 bg-slate-50 border border-slate-100 rounded-2xl focus:ring-4 focus:ring-blue-100 outline-none transition-all font-medium"
                      placeholder="Nama lengkap..."
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">Username</label>
                    <input 
                      type="text" 
                      value={editForm.username}
                      onChange={(e) => setEditForm(prev => ({ ...prev, username: e.target.value }))}
                      className="w-full px-4 py-3 bg-slate-50 border border-slate-100 rounded-2xl focus:ring-4 focus:ring-blue-100 outline-none transition-all font-medium"
                      placeholder="Username..."
                    />
                  </div>

                  <div className="pt-4 flex gap-3">
                    <button onClick={() => setShowEditModal(false)} className="flex-1 py-3 bg-slate-100 text-slate-600 rounded-2xl font-bold">Batal</button>
                    <button onClick={handleUpdateStudent} className="flex-[2] py-3 bg-blue-600 text-white rounded-2xl font-bold shadow-lg shadow-blue-200">Simpan Perubahan</button>
                  </div>
                </div>
             </motion.div>
          </div>
        )}
      </AnimatePresence>

    </div>
  );
}
