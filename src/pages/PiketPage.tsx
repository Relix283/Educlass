import { useState, useEffect, useRef, ChangeEvent } from 'react';
import { useAuth } from '@/src/context/AuthContext';
import { supabase } from '@/src/lib/supabase';
import { Profile } from '@/src/types/database';
import { 
  Calendar, 
  Users, 
  Camera, 
  Plus, 
  Trash2, 
  CheckCircle2, 
  AlertCircle,
  Clock,
  FolderOpen,
  X,
  Loader2,
  Upload
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

export default function PiketPage() {
  const { profile, currentClass } = useAuth();
  const [schedule, setSchedule] = useState<any[]>([]);
  const [docs, setDocs] = useState<any[]>([]);
  const [students, setStudents] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [selectedDay, setSelectedDay] = useState(1);
  const [selectedStudent, setSelectedStudent] = useState('');
  const [reporting, setReporting] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deletingItem, setDeletingItem] = useState<{id: string, type: 'schedule' | 'doc', name?: string} | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [classes, setClasses] = useState<any[]>([]);
  const [selectedClassId, setSelectedClassId] = useState<string>('');

  const canManage = (profile?.is_wali_kelas || !!profile?.jabatan_pengurus) && profile?.class_id === selectedClassId;

  const days = [
    { id: 1, label: 'Senin' },
    { id: 2, label: 'Selasa' },
    { id: 3, label: 'Rabu' },
    { id: 4, label: 'Kamis' },
    { id: 5, label: 'Jumat' },
  ];

  useEffect(() => {
    fetchClasses();
  }, []);

  useEffect(() => {
    if (currentClass && !selectedClassId) {
      setSelectedClassId(currentClass.id);
    }
  }, [currentClass]);

  useEffect(() => {
    if (profile && selectedClassId) {
      fetchData();
    }
  }, [selectedClassId, profile]);

  const fetchClasses = async () => {
    const { data } = await supabase.from('classes').select('*').order('full_name');
    if (data) setClasses(data);
  };

  const fetchData = async () => {
    const targetClassId = selectedClassId;
    if (!targetClassId || targetClassId === 'undefined') {
      console.log('No valid class ID found, skipping piket fetch');
      setLoading(false);
      return;
    }
    
    setLoading(true);
    try {
      // 1. Fetch Schedule with implicit relationship
      const { data: schedData, error: schedError } = await supabase
        .from('piket_schedule')
        .select(`
          *,
          student:profiles(full_name)
        `)
        .eq('class_id', targetClassId);
      
      if (schedError) {
        console.error('Schedule fetch error:', schedError);
      } else {
        setSchedule(schedData || []);
      }

      // 2. Fetch Documentation (Always fetch for the class)
      const { data: docData, error: docError } = await supabase
        .from('piket_documentation')
        .select('*')
        .eq('class_id', targetClassId)
        .order('date', { ascending: false });
      
      if (docError) {
        console.error('Docs fetch error:', docError);
      } else if (docData) {
        setDocs(docData || []);
      }

      // 3. Fetch Students for assignment (Officers only)
      if (profile?.role === 'guru' || profile?.jabatan_pengurus || profile?.is_wali_kelas) {
        const { data: studData } = await supabase
          .from('profiles')
          .select('*')
          .eq('class_id', targetClassId)
          .eq('role', 'murid')
          .order('full_name');
        if (studData) setStudents(studData);
      }
    } catch (err) {
      console.error('Data fetching exception:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleAddMember = async () => {
    if (!selectedStudent || !selectedDay) return;
    try {
      const { error } = await supabase.from('piket_schedule').insert({
        class_id: selectedClassId,
        day_of_week: selectedDay,
        student_id: selectedStudent
      });
      if (error) throw error;
      fetchData();
      setShowAddModal(false);
    } catch (err: any) {
      console.error(err);
      if (err.code === '23505') {
        alert('Siswa sudah ada di jadwal hari tersebut.');
      } else if (err.code === '42501') {
        alert('Gagal: Anda tidak memiliki izin untuk mengatur jadwal piket.');
      } else {
        alert('Terjadi kesalahan saat menyimpan jadwal.');
      }
    }
  };

  const handleConfirmDelete = async () => {
    if (!deletingItem) return;
    setDeleting(true);
    console.log('Attempting to delete:', deletingItem.type, deletingItem.id);
    try {
      const table = deletingItem.type === 'schedule' ? 'piket_schedule' : 'piket_documentation';
      const { error } = await supabase.from(table).delete().eq('id', deletingItem.id);
      
      if (error) {
        console.error('Delete error:', error);
        throw error;
      }
      
      console.log('Item deleted successfully');
      setShowDeleteModal(false);
      setDeletingItem(null);
      fetchData();
      alert(deletingItem.type === 'schedule' ? 'Siswa berhasil dihapus dari jadwal.' : 'Dokumentasi berhasil dihapus.');
    } catch (err: any) {
      console.error('Delete exception:', err);
      if (err.code === '42501') {
        alert('Gagal: Anda tidak memiliki izin untuk melakukan tindakan ini.');
      } else {
        alert('Terjadi kesalahan: ' + err.message);
      }
    } finally {
      setDeleting(false);
    }
  };

  const handleReport = async (studentName: string) => {
    setReporting(true);
    // In a real app, we would insert into a 'piket_reports' table
    // For now, we simulate the report and notify the user
    setTimeout(async () => {
      await supabase.from('activities').insert({
        student_id: profile?.id,
        class_id: selectedClassId,
        type: 'piket',
        title: 'Laporan Piket',
        description: `Petugas piket "${studentName}" dilaporkan tidak melaksanakan tugas.`
      });
      alert(`Laporan berhasil dikirim ke Wali Kelas: Student "${studentName}" dilaporkan tidak melaksanakan piket.`);
      setReporting(false);
    }, 1000);
  };

  const handlePhotoUpload = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !selectedClassId || !profile) return;

    // Check file size (limit to 2MB for base64 storage)
    if (file.size > 2 * 1024 * 1024) {
      alert('Ukuran file terlalu besar. Maksimal 2MB untuk upload ini.');
      return;
    }

    setUploading(true);
    try {
      const reader = new FileReader();
      
      const uploadPromise = new Promise((resolve, reject) => {
        reader.onload = async () => {
          try {
            const base64String = reader.result as string;
            
            const { error } = await supabase.from('piket_documentation').insert({
              class_id: selectedClassId,
              uploader_id: profile.id,
              image_url: base64String, // Store base64 data URL
              date: new Date().toISOString().split('T')[0]
            });

            if (error) throw error;
            resolve(true);
          } catch (err) {
            reject(err);
          }
        };
        reader.onerror = () => reject(new Error('Gagal membaca file'));
        reader.readAsDataURL(file);
      });

      await uploadPromise;
      
      alert('Bukti piket berhasil diunggah!');
      fetchData();
    } catch (err: any) {
      console.error(err);
      alert('Gagal mengunggah dokumentasi: ' + err.message);
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleDeleteClick = (id: string, name: string) => {
    setDeletingItem({ id, type: 'schedule', name });
    setShowDeleteModal(true);
  };

  const handleDeleteDoc = (docId: string) => {
    setDeletingItem({ id: docId, type: 'doc' });
    setShowDeleteModal(true);
  };

  const isMyPiketDay = () => {
    const today = new Date().getDay(); // 0 is Sun, 1 is Mon
    return schedule.some(s => s.student_id === profile?.id && s.day_of_week === today);
  };

  const currentDay = new Date().getDay();

  return (
    <div className="max-w-6xl mx-auto">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-8">
        <div>
          <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight">Jadwal Piket</h1>
          <div className="flex items-center gap-2 mt-1">
             <p className="text-slate-500 font-medium text-xs">Kelas:</p>
             <select 
               value={selectedClassId}
               onChange={(e) => setSelectedClassId(e.target.value)}
               className="bg-transparent border-none p-0 text-blue-600 font-bold focus:ring-0 cursor-pointer text-xs"
             >
               <option value="" disabled>Pilih Kelas</option>
               {classes.map(c => (
                 <option key={c.id} value={c.id}>{c.full_name}</option>
               ))}
             </select>
          </div>
        </div>
        <div className="flex items-center gap-4">
           <p className="text-slate-500 font-medium hidden md:block">Kebersihan sebagian dari iman <span className="text-blue-600 font-bold">✨</span></p>
           {canManage && (
             <button 
               onClick={() => setShowAddModal(true)}
               className="primary-button"
             >
               <Plus className="w-5 h-5" />
               Atur Jadwal
             </button>
           )}
        </div>
      </div>

      {isMyPiketDay() && (
        <motion.div 
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="mb-8 p-8 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-[2rem] shadow-xl shadow-blue-100 flex flex-col sm:flex-row items-center justify-between gap-8 relative overflow-hidden group"
        >
          <div className="absolute top-0 right-0 p-8 opacity-10 group-hover:scale-110 transition-transform">
            <Camera className="w-32 h-32" />
          </div>
          <div className="flex items-center gap-6 relative z-10">
             <div className="p-4 bg-white/20 rounded-2xl backdrop-blur-md border border-white/20 shadow-inner"><Calendar className="w-8 h-8" /></div>
             <div>
                <h3 className="text-2xl font-black tracking-tight">Hari ini Giliran Kamu!</h3>
                <p className="text-blue-50/80 text-sm font-medium">Yuk bersihkan kelas dan upload buktinya sekarang.</p>
             </div>
          </div>
          <input 
            type="file" 
            ref={fileInputRef} 
            className="hidden" 
            accept="image/*"
            onChange={handlePhotoUpload}
          />
          <button 
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="px-8 py-4 bg-white text-blue-600 rounded-2xl font-black uppercase tracking-widest text-xs flex items-center gap-3 hover:bg-blue-50 transition-all shadow-lg relative z-10 disabled:opacity-70"
          >
             {uploading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Camera className="w-5 h-5" />}
             {uploading ? 'Mengunggah...' : 'Ambil Foto'}
          </button>
        </motion.div>
      )}

      {/* Grid Schedule */}
      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-6 mb-12">
        {days.map((day) => {
          const members = schedule.filter(s => s.day_of_week === day.id);
          const isToday = currentDay === day.id;

          return (
            <div key={day.id} className={`flex flex-col bento-card border transition-all ${isToday ? 'ring-4 ring-blue-100 border-blue-200' : ''}`}>
              <div className={`px-4 py-3 text-center font-black uppercase tracking-widest text-[10px] ${isToday ? 'bg-blue-600 text-white' : 'bg-slate-50 text-slate-400 border-b border-slate-100'}`}>
                {day.label}
              </div>
              <div className="p-5 flex-1 space-y-3">
                 {members.length > 0 ? members.map(m => (
                   <div key={m.id} className="flex items-center justify-between group py-1.5 border-b border-slate-50 last:border-0 border-dashed">
                      <span className="text-xs font-bold text-slate-700">{m.student?.full_name}</span>
                      <div className="flex items-center gap-1">
                        {canManage && isToday && m.student_id !== profile?.id && (
                          <button 
                            onClick={() => handleReport(m.student?.full_name)}
                            disabled={reporting}
                            className="p-1.5 text-slate-300 hover:text-amber-500 hover:bg-amber-50 rounded-md transition-all group-hover:opacity-100 opacity-0"
                            title="Laporkan tidak piket"
                          >
                            <AlertCircle className="w-3.5 h-3.5" />
                          </button>
                        )}
                        {canManage && (
                          <button 
                            onClick={(e) => { 
                              e.preventDefault();
                              e.stopPropagation(); 
                              handleDeleteClick(m.id, m.student?.full_name); 
                            }} 
                            className="p-2 text-rose-500 hover:text-white hover:bg-rose-600 rounded-lg transition-all border border-rose-100 bg-rose-50 border-dashed"
                            title="Hapus dari jadwal"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                   </div>
                 )) : (
                   <div className="py-6 flex flex-col items-center justify-center opacity-40">
                      <Users className="w-6 h-6 text-slate-300 mb-2" />
                      <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Kosong</p>
                   </div>
                 )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Documentation Section */}
      <div className="bento-card p-8">
         <div className="flex items-center justify-between mb-8">
            <div>
              <h3 className="text-xl font-black text-slate-900 tracking-tight flex items-center gap-2">
                 <Camera className="w-6 h-6 text-blue-500" />
                 Galeri Kebersihan
              </h3>
              <p className="text-xs text-slate-400 font-bold uppercase tracking-widest mt-1">Bukti visual piket kelas</p>
            </div>
            <button className="text-[10px] font-black text-blue-600 uppercase tracking-widest hover:bg-blue-50 px-4 py-2 rounded-lg transition-colors">Lihat Semua</button>
         </div>
         
         <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-6">
            {docs.map(doc => (
              <div key={doc.id} className="aspect-square bg-slate-50 rounded-3xl overflow-hidden relative group cursor-pointer border border-slate-100 shadow-sm hover:shadow-xl transition-all">
                 <img 
                  src={doc.image_url} 
                  alt="Documentation" 
                  className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110" 
                  referrerPolicy="no-referrer"
                  onError={(e) => {
                    const target = e.target as HTMLImageElement;
                    // Fallback to a reliable teaching/learning environment photo if cleaning photo fails
                    target.src = `https://images.unsplash.com/photo-1522202176988-66273c2fd55f?auto=format&fit=crop&w=400&q=60`;
                    target.onerror = null;
                  }}
                 />
                 <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent flex flex-col justify-end p-4 opacity-0 group-hover:opacity-100 transition-all">
                    <div className="flex items-center justify-between">
                      <p className="text-white text-[10px] font-black uppercase tracking-widest flex items-center gap-2">
                        <Clock className="w-3 h-3" />
                        {new Date(doc.date).toLocaleDateString()}
                      </p>
                      {canManage && (
                        <button 
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteDoc(doc.id);
                          }}
                          className="p-1.5 bg-rose-500 text-white rounded-lg hover:bg-rose-600 transition-colors"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                 </div>
              </div>
            ))}
            {docs.length === 0 && (
              <div className="col-span-full py-16 flex flex-col items-center justify-center text-slate-300 border-2 border-dashed border-slate-100 rounded-[2rem]">
                 <AlertCircle className="w-12 h-12 mb-4 opacity-20" />
                 <p className="font-black uppercase tracking-widest text-xs opacity-50">Belum ada dokumentasi terunggah</p>
              </div>
            )}
         </div>
      </div>

      {/* Add Modal */}
      <AnimatePresence>
        {showAddModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
             <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setShowAddModal(false)} className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" />
             <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }} className="relative bg-white w-full max-w-md rounded-3xl shadow-2xl p-8">
                <div className="flex items-center justify-between mb-8">
                   <h2 className="text-2xl font-bold text-slate-900">Atur Jadwal Piket</h2>
                   <button onClick={() => setShowAddModal(false)} className="p-2 hover:bg-slate-100 rounded-full"><X className="w-6 h-6" /></button>
                </div>
                <div className="space-y-6">
                   <div>
                      <label className="block text-sm font-bold text-slate-700 mb-2">Pilih Hari</label>
                      <div className="grid grid-cols-3 gap-2">
                        {days.map(d => (
                          <button 
                            key={d.id} 
                            onClick={() => setSelectedDay(d.id)}
                            className={`p-3 text-xs font-bold rounded-xl border-2 transition-all ${selectedDay === d.id ? 'border-blue-600 bg-blue-50 text-blue-600' : 'border-slate-100 text-slate-500'}`}
                          >
                            {d.label}
                          </button>
                        ))}
                      </div>
                   </div>
                   <div>
                      <label className="block text-sm font-bold text-slate-700 mb-2">Pilih Siswa</label>
                      <select 
                        value={selectedStudent}
                        onChange={e => setSelectedStudent(e.target.value)}
                        className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none"
                      >
                         <option value="">Pilih Siswa...</option>
                         {students.map(s => (
                           <option key={s.id} value={s.id}>{s.full_name}</option>
                         ))}
                      </select>
                   </div>
                   <button 
                    onClick={handleAddMember}
                    disabled={!selectedStudent}
                    className="w-full py-4 bg-blue-600 text-white rounded-2xl font-bold text-lg hover:shadow-xl hover:shadow-blue-100 transition-all disabled:opacity-50"
                   >
                     Tambahkan ke Jadwal
                   </button>
                </div>
             </motion.div>
          </div>
        )}
      </AnimatePresence>
      {/* Delete Confirmation Modal */}
      <AnimatePresence>
        {showDeleteModal && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
             <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setShowDeleteModal(false)} className="absolute inset-0 bg-slate-900/60 backdrop-blur-md" />
             <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }} className="relative bg-white w-full max-w-sm rounded-3xl shadow-2xl p-8 text-center">
                <div className="w-20 h-20 bg-rose-50 text-rose-600 rounded-full flex items-center justify-center mx-auto mb-6">
                  <Trash2 className="w-10 h-10" />
                </div>
                <h2 className="text-2xl font-bold text-slate-900 mb-2">Konfirmasi Hapus</h2>
                <p className="text-slate-500 mb-8 leading-relaxed">
                  {deletingItem?.type === 'schedule' 
                    ? <span>Apakah Anda yakin ingin menghapus <span className="font-bold text-slate-900">{deletingItem?.name}</span> dari jadwal piket?</span>
                    : 'Apakah Anda yakin ingin menghapus dokumentasi ini secara permanen?'
                  }
                </p>

                <div className="flex flex-col gap-3">
                  <button 
                    onClick={handleConfirmDelete}
                    disabled={deleting}
                    className="w-full py-4 bg-rose-600 text-white rounded-2xl font-bold shadow-lg shadow-rose-200 flex items-center justify-center gap-2"
                  >
                    {deleting ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Ya, Hapus'}
                  </button>
                  <button 
                    onClick={() => setShowDeleteModal(false)}
                    className="w-full py-4 bg-slate-100 text-slate-600 rounded-2xl font-bold"
                  >
                    Batal
                  </button>
                </div>
             </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
