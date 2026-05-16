import { useState, useEffect } from 'react';
import { useAuth } from '@/src/context/AuthContext';
import { supabase } from '@/src/lib/supabase';
import { 
  Bell, 
  Plus, 
  Trash2, 
  Clock, 
  User, 
  X,
  Loader2,
  Megaphone
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

export default function AnnouncementsPage() {
  const { profile } = useAuth();
  const [announcements, setAnnouncements] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [content, setContent] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetchAnnouncements();
  }, []);

  const fetchAnnouncements = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('announcements')
      .select('*, author:profiles(full_name, role)')
      .order('created_at', { ascending: false });
    if (data) setAnnouncements(data);
    setLoading(false);
  };

  const handlePost = async () => {
    if (!content.trim()) return;
    setSubmitting(true);
    try {
      const { error } = await supabase.from('announcements').insert({
        content,
        author_id: profile?.id
      });
      if (error) throw error;
      setContent('');
      setShowModal(false);
      fetchAnnouncements();
    } catch (err) {
      console.error(err);
    } finally {
      setSubmitting(false);
    }
  };

  const deleteAnnouncement = async (id: string) => {
    try {
      await supabase.from('announcements').delete().eq('id', id);
      fetchAnnouncements();
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="max-w-4xl mx-auto">
      <div className="flex items-center justify-between gap-6 mb-8">
        <div>
          <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight">Pengumuman</h1>
          <p className="text-slate-500 font-medium">Informasi terkini untuk seluruh anggota kelas.</p>
        </div>
        {profile?.role === 'guru' && (
          <button 
            onClick={() => setShowModal(true)}
            className="primary-button"
          >
            <Plus className="w-5 h-5" />
            Buat Baru
          </button>
        )}
      </div>

      <div className="space-y-6">
        {loading ? (
          <div className="flex justify-center p-12"><Loader2 className="animate-spin text-blue-600" /></div>
        ) : announcements.length > 0 ? announcements.map((ann) => (
          <motion.div 
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            key={ann.id} 
            className="bento-card p-6 relative group"
          >
            <div className="flex items-start gap-4">
               <div className={`p-3 rounded-2xl border ${ann.author?.role === 'guru' ? 'bg-blue-50/50 border-blue-100 text-blue-600' : 'bg-slate-50/50 border-slate-100 text-slate-500'}`}>
                  <Megaphone className="w-6 h-6" />
               </div>
               <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                     <span className="font-bold text-slate-800">{ann.author?.full_name}</span>
                     {ann.author?.role === 'guru' && <span className="px-2 py-0.5 bg-blue-100/50 text-blue-700 text-[9px] font-black uppercase rounded-lg tracking-widest border border-blue-100">Guru</span>}
                  </div>
                  <p className="text-slate-600 leading-relaxed mb-4 text-sm font-medium">{ann.content}</p>
                  <div className="flex items-center gap-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">
                     <div className="flex items-center gap-1.5"><Clock className="w-3 h-3" /> {new Date(ann.created_at).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}</div>
                     <div>{new Date(ann.created_at).toLocaleDateString('id-ID', { day: 'numeric', month: 'long' })}</div>
                  </div>
               </div>
            </div>

            {(profile?.role === 'guru' || profile?.id === ann.author_id) && (
              <button 
                onClick={() => deleteAnnouncement(ann.id)}
                className="absolute top-6 right-6 p-2 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all md:opacity-0 md:group-hover:opacity-100"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}
          </motion.div>
        )) : (
          <div className="p-20 text-center bento-card">
             <Bell className="w-12 h-12 text-slate-200 mx-auto mb-4" />
             <p className="text-slate-400 font-bold uppercase tracking-widest text-[10px]">Belum ada pengumuman hari ini</p>
          </div>
        )}
      </div>

      {/* Modal */}
      <AnimatePresence>
        {showModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
             <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setShowModal(false)} className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" />
             <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }} className="relative bg-white w-full max-w-xl rounded-3xl shadow-2xl p-8">
                <div className="flex items-center justify-between mb-8">
                   <h2 className="text-2xl font-bold text-slate-900">Buat Pengumuman</h2>
                   <button onClick={() => setShowModal(false)} className="p-2 hover:bg-slate-100 rounded-full"><X className="w-6 h-6" /></button>
                </div>
                <div className="space-y-6">
                   <textarea 
                     value={content}
                     onChange={e => setContent(e.target.value)}
                     placeholder="Tuliskan informasi yang ingin Anda sampaikan..."
                     rows={5}
                     className="w-full px-6 py-4 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:ring-2 focus:ring-blue-100 transition-all text-slate-700"
                   />
                   <div className="flex gap-4">
                      <button onClick={() => setShowModal(false)} className="flex-1 py-4 font-bold text-slate-500">Batal</button>
                      <button 
                        onClick={handlePost} 
                        disabled={submitting || !content.trim()}
                        className="flex-[2] py-4 bg-blue-600 text-white rounded-2xl font-bold shadow-xl shadow-blue-100 disabled:opacity-50"
                      >
                         {submitting ? 'Memposting...' : 'Post Pengumuman'}
                      </button>
                   </div>
                </div>
             </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
