import { useState, useEffect } from 'react';
import { useAuth } from '@/src/context/AuthContext';
import { supabase } from '@/src/lib/supabase';
import { 
  Wallet, 
  TrendingUp, 
  TrendingDown, 
  Plus, 
  ArrowUpRight, 
  ArrowDownRight, 
  MoreVertical, 
  Calendar,
  Loader2,
  Trash2,
  PieChart as PieIcon,
  Download,
  X
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { useForm } from 'react-hook-form';

export default function FinancePage() {
  const { profile, currentClass } = useAuth();
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [classes, setClasses] = useState<any[]>([]);
  const [selectedClassId, setSelectedClassId] = useState<string>('');

  const isAllowed = profile?.role === 'murid' || profile?.is_wali_kelas;
  const isOfficer = !!profile?.jabatan_pengurus || profile?.is_wali_kelas;

  const { register, handleSubmit, reset } = useForm();

  useEffect(() => {
    if (!loading && !isAllowed) {
      // Redirect or handled by UI
    }
    fetchClasses();
  }, [loading, isAllowed]);

  useEffect(() => {
    if (currentClass && !selectedClassId) {
      setSelectedClassId(currentClass.id);
    }
  }, [currentClass]);

  useEffect(() => {
    if (selectedClassId) {
      fetchFinance();
    }
  }, [selectedClassId]);

  const fetchClasses = async () => {
    const { data } = await supabase.from('classes').select('*').order('full_name');
    if (data) setClasses(data);
  };

  const fetchFinance = async () => {
    if (!selectedClassId) return;
    setLoading(true);
    const { data: finData } = await supabase
      .from('class_funds')
      .select('*')
      .eq('class_id', selectedClassId)
      .order('date', { ascending: false });
    if (finData) setData(finData);
    setLoading(false);
  };

  const onSubmit = async (vals: any) => {
    try {
      const { error } = await supabase.from('class_funds').insert({
        class_id: selectedClassId,
        amount: parseFloat(vals.amount),
        transaction_type: vals.type,
        description: vals.description,
        date: vals.date,
        treasurer_id: profile?.id
      });
      if (error) throw error;

      // Sync to Activities
      await supabase.from('activities').insert({
        student_id: profile?.id,
        class_id: currentClass?.id,
        type: 'kas',
        title: vals.type === 'masuk' ? 'Uang Kas Masuk' : 'Pengeluaran Kas',
        description: `${vals.description} - Sejumlah Rp ${parseFloat(vals.amount).toLocaleString('id-ID')}`
      });

      setShowModal(false);
      reset();
      fetchFinance();
    } catch (err) {
      console.error(err);
    }
  };

  const totals = data.reduce((acc, curr) => {
    if (curr.transaction_type === 'masuk') acc.in += curr.amount;
    else acc.out += curr.amount;
    return acc;
  }, { in: 0, out: 0 });

  const balance = totals.in - totals.out;

  const chartData = [...data].reverse().map(d => ({
    date: new Date(d.date).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' }),
    amount: d.transaction_type === 'masuk' ? d.amount : -d.amount,
  })).reduce((acc: any[], curr) => {
    const last = acc[acc.length - 1]?.total || 0;
    acc.push({ ...curr, total: last + curr.amount });
    return acc;
  }, []);

  if (!isAllowed) {
    return (
      <div className="py-20 text-center">
        <div className="bg-white p-12 rounded-[3rem] shadow-xl border border-slate-100 max-w-2xl mx-auto">
          <Wallet className="w-16 h-16 text-slate-200 mx-auto mb-6" />
          <h2 className="text-2xl font-black mb-4">Akses Terbatas</h2>
          <p className="text-slate-500 mb-8 font-medium">Fitur Kas Kelas hanya tersedia untuk Siswa, Pengurus Kelas, dan Wali Kelas.</p>
          <button onClick={() => window.history.back()} className="px-8 py-4 bg-indigo-600 text-white rounded-2xl font-black uppercase tracking-widest text-[11px]">Kembali</button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto pb-12">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-8">
        <div>
          <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight">Kas Kelas</h1>
          <div className="flex items-center gap-2 mt-1">
             <p className="text-slate-500 font-medium text-sm">Kelas:</p>
             <select 
               value={selectedClassId}
               onChange={(e) => setSelectedClassId(e.target.value)}
               className="bg-transparent border-none p-0 text-blue-600 font-bold focus:ring-0 cursor-pointer text-sm"
             >
               <option value="" disabled>Pilih Kelas</option>
               {classes.map(c => (
                 <option key={c.id} value={c.id}>{c.full_name}</option>
               ))}
             </select>
          </div>
        </div>
        {isOfficer && (
          <button 
            onClick={() => setShowModal(true)}
            className="primary-button"
          >
            <Plus className="w-5 h-5" />
            Transaksi Baru
          </button>
        )}
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-10">
         <div className="bento-card p-6">
           <div className="flex items-center gap-4 mb-4">
              <div className="p-3 bg-blue-50 text-blue-600 rounded-2xl"><Wallet className="w-6 h-6" /></div>
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest opacity-70">Saldo Saat Ini</span>
           </div>
           <p className="text-3xl font-black text-slate-900">Rp {balance.toLocaleString('id-ID')}</p>
         </div>
         <div className="bento-card p-6 border-emerald-50">
           <div className="flex items-center gap-4 mb-4">
              <div className="p-3 bg-emerald-50 text-emerald-600 rounded-2xl"><TrendingUp className="w-6 h-6" /></div>
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest opacity-70">Total Pemasukan</span>
           </div>
           <p className="text-3xl font-black text-emerald-600">Rp {totals.in.toLocaleString('id-ID')}</p>
         </div>
         <div className="bento-card p-6 border-rose-50">
           <div className="flex items-center gap-4 mb-4">
              <div className="p-3 bg-rose-50 text-rose-600 rounded-2xl"><TrendingDown className="w-6 h-6" /></div>
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest opacity-70">Total Pengeluaran</span>
           </div>
           <p className="text-3xl font-black text-rose-600">Rp {totals.out.toLocaleString('id-ID')}</p>
         </div>
      </div>

      {/* Chart Section */}
      <div className="bento-card p-8 mb-10 overflow-hidden">
         <div className="flex items-center justify-between mb-8">
            <h3 className="text-xl font-bold text-slate-900 tracking-tight">Grafik Keuangan</h3>
            <div className="px-4 py-1.5 bg-slate-50 text-slate-500 text-[10px] font-black uppercase tracking-widest rounded-full border border-slate-100">30 Hari Terakhir</div>
         </div>
         <div className="min-h-[288px] w-full relative">
            {chartData.length > 0 && (
               <ResponsiveContainer width="100%" height={288}>
                  <AreaChart data={chartData}>
                    <defs>
                      <linearGradient id="colorTotal" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.15}/>
                        <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f8fafc" />
                    <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{fill: '#94a3b8', fontSize: 10, fontWeight: 700}} dy={15} />
                    <YAxis hide domain={['auto', 'auto']} />
                    <Tooltip 
                       contentStyle={{ borderRadius: '20px', border: 'none', boxShadow: '0 20px 25px -5px rgb(0 0 0 / 0.1)', padding: '12px' }}
                       itemStyle={{ fontWeight: 800, fontSize: '14px' }}
                       labelStyle={{ fontWeight: 700, color: '#64748b', marginBottom: '4px', fontSize: '12px' }}
                       formatter={(value: any) => [`Rp ${value.toLocaleString('id-ID')}`, 'Saldo']}
                    />
                    <Area type="monotone" dataKey="total" stroke="#3b82f6" strokeWidth={4} fillOpacity={1} fill="url(#colorTotal)" />
                  </AreaChart>
               </ResponsiveContainer>
            )}
         </div>
      </div>

      {/* History Table */}
      <div className="bento-card overflow-hidden">
         <div className="p-6 border-b border-slate-50 flex items-center justify-between">
            <h3 className="font-bold text-slate-800 tracking-tight">Riwayat Transaksi</h3>
            <button className="text-slate-400 hover:text-slate-600 p-2 transition-colors"><Download className="w-5 h-5" /></button>
         </div>
         <div className="overflow-x-auto text-sm text-left">
            <table className="w-full">
               <thead className="bg-slate-50/50">
                  <tr className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                     <th className="px-6 py-4 font-bold">Keterangan</th>
                     <th className="px-6 py-4 font-bold">Tanggal</th>
                     <th className="px-6 py-4 font-bold text-right">Nominal</th>
                  </tr>
               </thead>
               <tbody className="divide-y divide-slate-50">
                  {loading ? (
                    <tr><td colSpan={3} className="p-12 text-center"><Loader2 className="animate-spin inline-block text-blue-600" /></td></tr>
                  ) : data.map((item) => (
                    <tr key={item.id} className="hover:bg-slate-50/50 transition-colors group">
                       <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                             <div className={`p-2.5 rounded-xl border-2 border-white shadow-sm ${item.transaction_type === 'masuk' ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'}`}>
                                {item.transaction_type === 'masuk' ? <ArrowUpRight className="w-4 h-4" /> : <ArrowDownRight className="w-4 h-4" />}
                             </div>
                             <span className="font-bold text-slate-700 group-hover:text-blue-600 transition-colors">{item.description}</span>
                          </div>
                       </td>
                       <td className="px-6 py-4 text-slate-400 font-medium">{new Date(item.date).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}</td>
                       <td className={`px-6 py-4 font-black flex justify-end ${item.transaction_type === 'masuk' ? 'text-emerald-500' : 'text-rose-500'}`}>
                         <span className={`px-2 py-1 rounded-lg ${item.transaction_type === 'masuk' ? 'bg-emerald-50' : 'bg-rose-50'}`}>
                          {item.transaction_type === 'masuk' ? '+' : '-'} Rp {item.amount.toLocaleString('id-ID')}
                         </span>
                       </td>
                    </tr>
                  ))}
               </tbody>
            </table>
         </div>
      </div>

      {/* Transaction Modal */}
      <AnimatePresence>
        {showModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
             <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setShowModal(false)} className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" />
             <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }} className="relative bg-white w-full max-w-md rounded-3xl shadow-2xl p-8">
                <div className="flex items-center justify-between mb-8">
                   <h2 className="text-2xl font-bold text-slate-900">Tambah Transaksi</h2>
                   <button onClick={() => setShowModal(false)} className="p-2 hover:bg-slate-100 rounded-full"><X className="w-6 h-6" /></button>
                </div>
                <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
                   <div>
                      <label className="block text-sm font-bold text-slate-700 mb-2">Jenis Transaksi</label>
                      <div className="grid grid-cols-2 gap-4">
                         <label className="cursor-pointer">
                            <input type="radio" value="masuk" {...register('type')} className="peer sr-only" defaultChecked />
                            <div className="p-4 border-2 border-slate-100 rounded-2xl text-center font-bold peer-checked:border-emerald-600 peer-checked:bg-emerald-50 peer-checked:text-emerald-600 transition-all">Pemasukan</div>
                         </label>
                         <label className="cursor-pointer">
                            <input type="radio" value="keluar" {...register('type')} className="peer sr-only" />
                            <div className="p-4 border-2 border-slate-100 rounded-2xl text-center font-bold peer-checked:border-rose-600 peer-checked:bg-rose-50 peer-checked:text-rose-600 transition-all">Pengeluaran</div>
                         </label>
                      </div>
                   </div>
                   <div>
                      <label className="block text-sm font-bold text-slate-700 mb-2">Nominal (Rp)</label>
                      <input type="number" {...register('amount')} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl font-bold text-lg focus:ring-2 focus:ring-blue-100 outline-none" placeholder="0" required />
                   </div>
                   <div>
                      <label className="block text-sm font-bold text-slate-700 mb-2">Keterangan</label>
                      <input type="text" {...register('description')} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none" placeholder="Beli sapu, Uang kas mingguan, dll" required />
                   </div>
                   <div>
                      <label className="block text-sm font-bold text-slate-700 mb-2">Tanggal</label>
                      <input type="date" {...register('date')} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none" defaultValue={new Date().toISOString().split('T')[0]} />
                   </div>
                   <button type="submit" className="w-full py-4 bg-blue-600 text-white rounded-2xl font-bold text-lg hover:shadow-xl hover:shadow-blue-100 transition-all mt-4">Simpan Transaksi</button>
                </form>
             </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
