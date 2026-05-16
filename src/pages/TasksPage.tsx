import { useState, useEffect } from 'react';
import { useAuth } from '@/src/context/AuthContext';
import { supabase } from '@/src/lib/supabase';
import { 
  Plus, 
  FileText, 
  Calendar, 
  Users, 
  CheckCircle2, 
  Clock, 
  Loader2, 
  Image as ImageIcon, 
  Link as LinkIcon,
  Edit,
  Trash2,
  Settings,
  Send,
  X,
  ChevronRight,
  FolderOpen
} from 'lucide-react';
import { useForm } from 'react-hook-form';
import { motion, AnimatePresence } from 'motion/react';

export default function TasksPage() {
  const { profile, currentClass } = useAuth();
  const [tasks, setTasks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [showSubmitModal, setShowSubmitModal] = useState(false);
  const [selectedTaskForSubmit, setSelectedTaskForSubmit] = useState<any>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [editingTask, setEditingTask] = useState<any>(null);
  const [showGradingModal, setShowGradingModal] = useState(false);
  const [selectedTaskForGrading, setSelectedTaskForGrading] = useState<any>(null);
  const [submissionsToGrade, setSubmissionsToGrade] = useState<any[]>([]);
  const [gradingForm, setGradingForm] = useState<any>({ student_id: '', grade: '', feedback: '' });
  const [classes, setClasses] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [submissions, setSubmissions] = useState<any[]>([]);
  const [view, setView] = useState<'list' | 'draft'>('list');
  const [explorerView, setExplorerView] = useState<{ 
    type: 'classes' | 'tasks' | 'submissions', 
    classId?: string, 
    className?: string,
    taskId?: string,
    taskName?: string 
  }>({ type: 'classes' });
  const [explorerData, setExplorerData] = useState<any[]>([]);
  const [taskToDelete, setTaskToDelete] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const { register, handleSubmit, reset, watch, setValue } = useForm({
    defaultValues: {
      category_id: '',
      sequence_number: 1,
      title: '',
      description: '',
      deadline: '',
      link: '',
      selectedClasses: [],
      submission_link: ''
    } as any
  });

  const watchCategory = watch('category_id');
  const watchSequence = watch('sequence_number');

  // Sync title when category or sequence changes
  useEffect(() => {
    if (watchCategory && watchSequence) {
      const cat = categories.find(c => c.id === watchCategory);
      if (cat) {
        setValue('title', `${cat.name} ${watchSequence}`);
      }
    }
  }, [watchCategory, watchSequence, categories, setValue]);

  useEffect(() => {
    if (profile) {
      fetchTasks();
      if (profile.role === 'guru' || profile.is_wali_kelas) {
        fetchClasses();
        fetchCategories();
      }
    }
  }, [profile, currentClass]);

  const fetchCategories = async () => {
    const { data } = await supabase.from('grade_categories').select('*').order('name');
    if (data) setCategories(data);
  };

  const fetchTasks = async () => {
    if (!profile) return;
    setLoading(true);
    const profileClassId = profile?.class_id;
    const globalClassId = currentClass?.id;
    const targetClassId = profileClassId || globalClassId;
    
    try {
      console.log('Fetching tasks with details:', { 
        profileId: profile.id, 
        profileClassId, 
        globalClassId, 
        targetClassId 
      });

      if (profile.role === 'guru' || profile.is_wali_kelas) {
        // Teachers only see their own tasks
        const { data: myTasks, error: myTasksError } = await supabase
          .from('tasks')
          .select(`
            *,
            task_assignments(
              class:classes(full_name)
            )
          `)
          .eq('teacher_id', profile.id)
          .order('created_at', { ascending: false });
        
        if (myTasksError) throw myTasksError;
        setTasks(myTasks || []);
      } else if (targetClassId) {
        // SISWA VIEW
        const { data: assignments, error: assignError } = await supabase
          .from('task_assignments')
          .select('*, task:tasks(*)')
          .eq('class_id', targetClassId);
        
        if (assignError) throw assignError;

        if (assignments) {
          const fetchedTasks = assignments.map((a: any) => a.task).filter(Boolean);
          console.log('Final tasks for student:', fetchedTasks);
          setTasks(fetchedTasks);

          const { data: subData } = await supabase
            .from('task_submissions')
            .select('*')
            .eq('student_id', profile.id);
          
          if (subData) setSubmissions(subData);
        }
      } else {
        console.warn('No class ID found for student!');
      }
    } catch (err: any) {
      console.error('Fetch error:', err.message);
    } finally {
      setLoading(false);
    }
  };

  const fetchClasses = async () => {
    const { data } = await supabase.from('classes').select('*').order('full_name');
    if (data) setClasses(data);
  };

  const onSubmitTask = async (data: any) => {
    if (!data.selectedClasses || data.selectedClasses.length === 0) {
      alert('Pilih minimal satu kelas tujuan!');
      return;
    }

    // Verify teacher permissions client-side before trying to insert
    if (!profile || (profile.role !== 'guru' && !profile.is_wali_kelas)) {
      alert('Hanya Guru atau Wali Kelas yang dapat membuat tugas!');
      console.error('Permission denied: User profile does not have guru/wali_kelas role.', profile);
      return;
    }

    try {
      console.log('Submitting task with classes:', data.selectedClasses);
      console.log('Teacher ID:', profile.id);
      if (editingTask) {
        const { error: taskError } = await supabase.from('tasks').update({
          title: data.title,
          description: data.description,
          deadline: data.deadline,
          link: data.link,
          category_id: data.category_id || null,
          sequence_number: data.sequence_number || 1
        }).eq('id', editingTask.id);
        if (taskError) throw taskError;

        // Update corresponding gradebook columns if they exist
        const selectedCat = categories.find(c => c.id === data.category_id);
        const columnTitle = selectedCat ? `${selectedCat.name} ${data.sequence_number}` : data.title;
        
        await supabase.from('gradebook_columns').update({
          title: columnTitle,
          category_id: data.category_id || null
        }).eq('task_id', editingTask.id);

      } else {
        // 1. Create task
        const { data: taskData, error: taskError } = await supabase.from('tasks').insert({
          title: data.title,
          description: data.description,
          deadline: data.deadline,
          link: data.link,
          teacher_id: profile?.id,
          category_id: data.category_id || null,
          sequence_number: data.sequence_number || 1
        }).select().single();

        if (taskError) throw taskError;

        // 2. Assign to classes and Create Gradebook Columns
        const assignments = data.selectedClasses.map((id: string) => ({
          task_id: taskData.id,
          class_id: id
        }));

        const { error: assignError } = await supabase.from('task_assignments').insert(assignments);
        if (assignError) throw assignError;

        // Create Gradebook Column for each class
        const selectedCat = categories.find(c => c.id === data.category_id);
        const columnTitle = selectedCat ? `${selectedCat.name} ${data.sequence_number}` : data.title;

        const gradebookCols = data.selectedClasses.map((id: string) => ({
          class_id: id,
          teacher_id: profile?.id,
          title: columnTitle,
          category_id: data.category_id || null,
          task_id: taskData.id
        }));

        const { error: colError } = await supabase.from('gradebook_columns').insert(gradebookCols);
        if (colError) console.error('Error creating gradebook columns:', colError);
      }

      setShowModal(false);
      setEditingTask(null);
      reset();
      fetchTasks();
      alert('Tugas berhasil ' + (editingTask ? 'diperbarui!' : 'dibagikan!'));
    } catch (err: any) {
      console.error(err);
      alert('Gagal menyimpan tugas: ' + err.message);
    }
  };

  const handleEditTask = (task: any) => {
    setEditingTask(task);
    reset({
      title: task.title,
      description: task.description,
      deadline: task.deadline ? new Date(task.deadline).toISOString().slice(0, 16) : '',
      link: task.link || '',
      category_id: task.category_id || '',
      sequence_number: task.sequence_number || 1,
      selectedClasses: [] // Assignments are usually kept as is for simplicity in this edit
    });
    setShowModal(true);
  };

  const handleExplorerClick = async (type: 'classes' | 'tasks' | 'submissions', id?: string, name?: string) => {
    setExplorerData([]); 
    
    try {
      if (type === 'classes') {
        setExplorerView({ type: 'classes' });
        // Classes are already loaded in 'classes' state, but we don't need explorerData for the root
      } else if (type === 'tasks') {
        const targetId = id || explorerView.classId;
        if (!targetId || targetId === 'undefined') {
          console.warn('Cannot fetch tasks: invalid class ID');
          return;
        }

        setExplorerView(prev => ({ 
          type: 'tasks', 
          classId: targetId, 
          className: name || prev.className,
          taskId: undefined,
          taskName: undefined
        }));
        
        // Only show tasks assigned to this class AND created by the current teacher
        const { data, error } = await supabase
          .from('task_assignments')
          .select('*, task:tasks!inner(*)')
          .eq('class_id', targetId)
          .eq('task.teacher_id', profile.id);
        
        if (error) throw error;
        if (data) setExplorerData(data.map((a: any) => a.task).filter(Boolean));
      } else if (type === 'submissions') {
        const targetTaskId = id;
        if (!targetTaskId || targetTaskId === 'undefined') {
          console.warn('Cannot fetch submissions: invalid task ID');
          return;
        }

        setExplorerView(prev => ({ 
          type: 'submissions', 
          classId: prev.classId, 
          className: prev.className,
          taskId: targetTaskId,
          taskName: name 
        }));

        const { data, error } = await supabase
          .from('task_submissions')
          .select('*, student:profiles(*)')
          .eq('task_id', targetTaskId);
        
        if (error) {
          console.error('FETCH ERROR:', error);
          throw error;
        }

        console.log('FETCH SUCCESS. Rows found:', data?.length);
        console.log('Rows data:', data);
        if (data) {
          setExplorerData(data);
        }
        console.log('--- END SUBMISSION FETCH ---');
      }
    } catch (err: any) {
      console.error('Explorer fetch error:', err.message);
      alert('Gagal memuat data: ' + err.message);
    }
  };

  const handleGradeSubmission = async (subId: string, grade: number, feedback: string, publish: boolean = false) => {
    try {
      const { data: subData } = await supabase
        .from('task_submissions')
        .select('*, student:profiles(*), task:tasks(*)')
        .eq('id', subId)
        .single();

      if (!subData) throw new Error('Submission not found');

      const { error } = await supabase
        .from('task_submissions')
        .update({ 
          grade, 
          feedback, 
          is_published: publish,
          status: 'submitted' 
        })
        .eq('id', subId);
      
      if (error) throw error;
      
      // Sync to Activities if published
      if (publish) {
        await supabase.from('activities').insert({
          student_id: subData.student_id,
          class_id: subData.student?.class_id,
          type: 'tugas',
          title: 'Tugas Dinilai',
          description: `Tugas "${subData.task?.title}" Anda telah dinilai: ${grade}`
        });

        // AUTO-SYNC TO BUKU NILAI
        // 1. Find the gradebook column for this task and class
        const studentClassId = subData.student?.class_id || explorerView.classId;
        const { data: colData } = await supabase
          .from('gradebook_columns')
          .select('id')
          .eq('task_id', subData.task_id)
          .eq('class_id', studentClassId)
          .maybeSingle(); // Changed from single() to avoid error if col not found
        
        if (colData) {
          // AUTO-SYNC TO BUKU NILAI (Account-based)
          await supabase.from('student_grades').upsert({
            column_id: colData.id,
            student_id: subData.student_id, // This is already the profile ID
            score: grade,
            comment: feedback,
            updated_at: new Date().toISOString()
          }, { onConflict: 'column_id,student_id' });
          console.log('Syncing grade to gradebook successful');
        }
      }

      // Refresh explorer data
      if (explorerView.taskId) {
        const { data } = await supabase
          .from('task_submissions')
          .select('*, student:profiles(*)')
          .eq('task_id', explorerView.taskId);
        if (data) setExplorerData(data);
      }
      
      setShowGradingModal(false);
      alert(publish ? 'Nilai dipublikasikan!' : 'Nilai disimpan sebagai draft.');
    } catch (err: any) {
      console.error(err);
      alert('Gagal menyimpan nilai: ' + err.message);
    }
  };

  const handleTaskSubmit = async (data: any) => {
    if (!selectedTaskForSubmit) return;
    setIsSubmitting(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('User not authenticated');

      const { error } = await supabase.from('task_submissions').upsert({
        task_id: selectedTaskForSubmit.id,
        student_id: user.id,
        file_url: data.submission_link,
        status: 'submitted',
        submitted_at: new Date().toISOString()
      }, { onConflict: 'task_id,student_id' });

      if (error) throw error;
      
      // Sync to Activities
      await supabase.from('activities').insert({
        student_id: user.id,
        class_id: currentClass?.id,
        type: 'tugas',
        title: 'Tugas Dikirim',
        description: `Siswa telah mengirimkan pengumpulan untuk tugas "${selectedTaskForSubmit.title}"`
      });
      
      alert('Tugas berhasil dikirim!');
      setShowSubmitModal(false);
      fetchTasks();
    } catch (err: any) {
      console.error('Submission error:', err);
      alert('Gagal mengirim tugas: ' + (err.message || 'Terjadi kesalahan internal'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteTask = async () => {
    if (!taskToDelete) return;
    
    setIsDeleting(true);
    try {
      console.log('Attempting to delete task:', taskToDelete);
      const { error } = await supabase.from('tasks').delete().eq('id', taskToDelete);
      
      if (error) {
        console.error('Supabase delete error:', error);
        throw error;
      }

      // Update local state immediately
      setTasks(prev => prev.filter(t => t.id !== taskToDelete));
      setExplorerData(prev => prev.filter(t => t.id !== taskToDelete));
      
      // Refresh background data
      await fetchTasks();
      if (explorerView.type === 'tasks' && explorerView.classId) {
        await handleExplorerClick('tasks', explorerView.classId, explorerView.className);
      }
      
      setTaskToDelete(null);
      alert('Tugas berhasil dihapus dari sistem');
    } catch (err: any) {
      console.error('Delete error:', err);
      alert('Gagal menghapus tugas: ' + (err.message || 'Mungkin tugas ini masih memiliki data terkait yang tidak bisa dihapus otomatis.'));
    } finally {
      setIsDeleting(false);
    }
  };

  const getStatus = (taskId: string) => {
    const sub = submissions.find(s => s.task_id === taskId);
    if (!sub) return { label: 'Belum Dikerjakan', color: 'bg-red-50 text-red-600' };
    if (sub.status === 'draft') return { label: 'Sedang Dikerjakan', color: 'bg-amber-50 text-amber-600' };
    return { label: 'Sudah Dikirim', color: 'bg-green-50 text-green-600' };
  };

  const TeacherView = () => (
    <div>
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-8">
        <div>
          <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight">Tugas {profile?.is_wali_kelas ? 'Wali Kelas' : 'Guru'}</h1>
          <p className="text-slate-500 font-medium">Manajemen tugas untuk seluruh kelas binaan</p>
        </div>
        <div className="flex gap-3">
          <button 
            onClick={() => setView(view === 'list' ? 'draft' : 'list')}
            className="secondary-button"
          >
            {view === 'list' ? <FolderOpen className="w-5 h-5" /> : <FileText className="w-5 h-5" />}
            {view === 'list' ? 'Draft Tugas' : 'Daftar'}
          </button>
          <button 
            onClick={() => { setEditingTask(null); reset(); setShowModal(true); }}
            className="primary-button"
          >
            <Plus className="w-5 h-5" />
            Buat Tugas
          </button>
        </div>
      </div>

      {view === 'list' ? (
        <div className="space-y-4">
          {tasks.map((task) => (
            <div key={task.id} className="bento-card p-6 flex flex-col md:flex-row md:items-center justify-between gap-6 group hover:translate-x-2 transition-all duration-300">
              <div className="flex items-center gap-6 flex-1 min-w-0">
                <div className="w-14 h-14 bg-blue-50 rounded-2xl flex items-center justify-center text-blue-600 border border-blue-100 shrink-0 group-hover:bg-blue-600 group-hover:text-white transition-all">
                  <FileText className="w-7 h-7" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <h3 className="text-lg font-bold text-slate-800 truncate">{task.title}</h3>
                    {task.task_assignments && task.task_assignments.map((ta: any, idx: number) => (
                      <span key={idx} className="px-2 py-0.5 bg-indigo-50 text-indigo-600 text-[9px] font-black uppercase tracking-widest rounded-md border border-indigo-100">
                        {ta.class?.full_name}
                      </span>
                    ))}
                  </div>
                  <p className="text-xs text-slate-500 line-clamp-1 font-medium mb-2">{task.description}</p>
                  <div className="flex items-center gap-4">
                    <span className="flex items-center gap-1.5 text-[10px] text-slate-400 font-bold uppercase tracking-wider">
                      <Calendar className="w-3.5 h-3.5" />
                      Deadline: {new Date(task.deadline).toLocaleDateString('id-ID')}
                    </span>
                    <span className="flex items-center gap-1.5 text-[10px] text-emerald-500 font-bold uppercase tracking-widest">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      Aktif
                    </span>
                  </div>
                </div>
              </div>
              
              <div className="flex items-center gap-3 shrink-0">
                <div className="flex gap-2">
                  <button 
                    onClick={() => handleEditTask(task)}
                    className="p-2.5 bg-white text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-xl border border-slate-100 shadow-sm transition-all active:scale-95"
                    title="Edit Tugas"
                  >
                    <Edit className="w-4 h-4" />
                  </button>
                  <button 
                    onClick={() => setTaskToDelete(task.id)}
                    className="p-2.5 bg-white text-rose-400 hover:text-white hover:bg-rose-600 rounded-xl border border-rose-50 shadow-sm transition-all active:scale-95"
                    title="Hapus Tugas"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
                <div className="w-[1px] h-8 bg-slate-100 mx-1 hidden md:block" />
                <button 
                  onClick={() => {
                    setView('draft');
                    handleExplorerClick('submissions', task.id, task.title);
                  }}
                  className="px-5 py-2.5 bg-slate-900 text-white rounded-xl text-xs font-black uppercase tracking-widest hover:bg-slate-800 transition-all flex items-center gap-2"
                >
                  Detail <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
          {tasks.length === 0 && (
            <div className="col-span-full py-20 text-center bento-card">
              <Plus className="w-12 h-12 text-slate-200 mx-auto mb-4" />
              <p className="text-slate-400 font-bold uppercase tracking-widest text-xs">Anda belum membuat tugas apapun.</p>
              <p className="text-[10px] text-slate-400 mt-2 font-medium">Gunakan tombol "Buat Tugas" untuk memulai.</p>
            </div>
          )}
        </div>
      ) : (
        <div className="bento-card p-8 min-h-[400px]">
          <div className="flex items-center gap-2 text-slate-400 text-[10px] font-black uppercase tracking-widest mb-8 overflow-hidden whitespace-nowrap">
            <span 
              className="hover:text-blue-600 cursor-pointer transition-colors"
              onClick={() => handleExplorerClick('classes')}
            >Semua Kelas</span>
            {explorerView.className && (
              <>
                <ChevronRight className="w-3 h-3 text-slate-300" />
                <span 
                  className={`cursor-pointer transition-colors ${explorerView.type === 'tasks' ? 'text-blue-600' : 'hover:text-blue-600'}`}
                  onClick={() => handleExplorerClick('tasks', explorerView.classId, explorerView.className)}
                >{explorerView.className}</span>
              </>
            )}
            {explorerView.taskName && (
              <>
                <ChevronRight className="w-3 h-3 text-slate-300" />
                <span className="text-blue-600 truncate max-w-[150px]">{explorerView.taskName}</span>
              </>
            )}
          </div>

          {explorerView.type === 'submissions' && (
            <div className="mb-6 p-4 bg-slate-50 rounded-2xl border border-slate-100 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-slate-800">Daftar Pengumpulan</h3>
                <p className="text-[10px] text-slate-500 font-medium uppercase tracking-widest">Tugas: {explorerView.taskName}</p>
              </div>
              <div className="flex gap-2">
                <button 
                  onClick={() => handleExplorerClick('submissions', explorerView.taskId, explorerView.taskName)}
                  className="p-2 text-slate-400 hover:text-blue-600 transition-colors"
                  title="Refresh Data"
                >
                  <Clock className="w-4 h-4" />
                </button>
                <button 
                  onClick={() => handleExplorerClick('tasks', explorerView.classId, explorerView.className)}
                  className="text-[10px] font-black text-blue-600 uppercase tracking-widest hover:underline"
                >
                  Kembali ke Daftar Tugas
                </button>
              </div>
            </div>
          )}

          {explorerView.type === 'classes' && (
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-6">
              {classes.map(c => (
                <div 
                  key={c.id} 
                  onClick={() => handleExplorerClick('tasks', c.id, c.full_name)}
                  className="flex flex-col items-center gap-3 cursor-pointer group"
                >
                  <div className="w-20 h-20 bg-amber-50/50 rounded-2xl flex items-center justify-center text-amber-500 group-hover:bg-amber-100/50 border border-amber-100/30 transition-all shadow-sm group-hover:shadow-lg group-hover:shadow-amber-100 group-hover:-translate-y-1">
                    <FolderOpen className="w-10 h-10" />
                  </div>
                  <span className="text-xs font-bold text-slate-600 text-center uppercase tracking-wider group-hover:text-amber-600 transition-colors">{c.full_name}</span>
                </div>
              ))}
            </div>
          )}

          {explorerView.type === 'tasks' && (
            <div className="space-y-4">
              {explorerData.map(t => (
                <div 
                  key={t.id} 
                  className="bento-card p-6 flex flex-col md:flex-row md:items-center justify-between gap-6 group hover:translate-x-2 transition-all duration-300"
                >
                  <div className="flex items-center gap-6 flex-1 min-w-0">
                    <div 
                      onClick={() => handleExplorerClick('submissions', t.id, t.title)}
                      className="w-14 h-14 bg-blue-50 rounded-2xl flex items-center justify-center text-blue-600 border border-blue-100 shrink-0 group-hover:bg-blue-600 group-hover:text-white transition-all cursor-pointer"
                    >
                      <FileText className="w-7 h-7" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div 
                        onClick={() => handleExplorerClick('submissions', t.id, t.title)}
                        className="cursor-pointer"
                      >
                        <h4 className="text-lg font-bold text-slate-800 truncate group-hover:text-blue-600 transition-colors">{t.title}</h4>
                        <div className="flex items-center gap-4 mt-1">
                          <span className="flex items-center gap-1.5 text-[10px] text-slate-400 font-bold uppercase tracking-wider">
                            <Calendar className="w-3.5 h-3.5" />
                            Deadline: {new Date(t.deadline).toLocaleDateString('id-ID')}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-3 shrink-0">
                    <div className="flex gap-2">
                      <button 
                        onClick={() => handleEditTask(t)}
                        className="p-2.5 bg-white text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-xl border border-slate-100 shadow-sm transition-all active:scale-95"
                        title="Edit Tugas"
                      >
                        <Edit className="w-4 h-4" />
                      </button>
                      <button 
                        onClick={() => setTaskToDelete(t.id)}
                        className="p-2.5 bg-white text-rose-400 hover:text-white hover:bg-rose-600 rounded-xl border border-rose-50 shadow-sm transition-all active:scale-95"
                        title="Hapus Tugas"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                    <div className="w-[1px] h-8 bg-slate-100 mx-1 hidden md:block" />
                    <button 
                      onClick={() => handleExplorerClick('submissions', t.id, t.title)}
                      className="px-5 py-2.5 bg-blue-600 text-white rounded-xl text-xs font-black uppercase tracking-widest hover:bg-blue-700 transition-all flex items-center gap-2"
                    >
                      Lihat <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
              {explorerData.length === 0 && (
                <div className="col-span-full py-12 text-center text-slate-400 font-bold uppercase text-[10px] bento-card">Belum ada tugas untuk kelas ini</div>
              )}
            </div>
          )}

          {explorerView.type === 'submissions' && (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="text-left border-b border-slate-100 italic">
                    <th className="pb-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Siswa</th>
                    <th className="pb-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Status</th>
                    <th className="pb-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">Nilai</th>
                    <th className="pb-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {explorerData.map(sub => (
                    <tr key={sub.id} className="group">
                      <td className="py-4">
                        <div className="font-bold text-slate-800">{sub.student?.full_name || 'Mahasiswa/Siswa'}</div>
                        <div className="text-[10px] text-slate-400">
                          {sub.submitted_at ? new Date(sub.submitted_at).toLocaleString() : 'Waktu tidak tercatat'} 
                          { !sub.student && <span className="ml-2 text-rose-500 font-bold">(Data Profil Hilang: {sub.student_id})</span>}
                        </div>
                      </td>
                      <td className="py-4">
                        <span className={`px-2 py-1 rounded-md text-[9px] font-bold uppercase tracking-widest ${sub.grade ? 'bg-green-50 text-green-600' : 'bg-amber-50 text-amber-600'}`}>
                          {sub.grade ? 'Dinilai' : 'Menunggu'}
                        </span>
                      </td>
                      <td className="py-4 text-center">
                        <div className={`inline-flex items-center justify-center w-10 h-10 rounded-xl font-black text-sm ${sub.grade >= 80 ? 'bg-green-50 text-green-600' : sub.grade ? 'bg-blue-50 text-blue-600' : 'bg-slate-50 text-slate-400'}`}>
                          {sub.grade || '-'}
                        </div>
                      </td>
                      <td className="py-4 text-right">
                        <button 
                          onClick={() => {
                            setSelectedTaskForGrading(sub);
                            setGradingForm({ 
                              id: sub.id, 
                              grade: sub.grade || '', 
                              feedback: sub.feedback || '',
                              is_published: sub.is_published || false
                            });
                            setShowGradingModal(true);
                          }}
                          className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${sub.is_published ? 'bg-green-600 text-white' : 'bg-blue-600 text-white'}`}
                        >
                          {sub.grade ? (sub.is_published ? 'Terbit' : 'Draft Nilai') : 'Beri Nilai'}
                        </button>
                      </td>
                    </tr>
                  ))}
                  {explorerData.length === 0 && (
                    <tr>
                      <td colSpan={4} className="py-12 text-center text-slate-400 font-bold uppercase text-[10px]">Belum ada pengumpulan</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );

  const StudentView = () => (
    <div>
      <div className="mb-8">
        <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight">Tugas Kelas</h1>
        <p className="text-slate-500 font-medium">Jangan biarkan tugas menumpuk, kerjakan sekarang!</p>
      </div>
      <div className="space-y-4">
        {tasks.map((task) => {
          const status = getStatus(task.id);
          return (
            <div key={task.id} className="bento-card p-6 flex flex-col md:flex-row md:items-center justify-between gap-6 hover:translate-x-2 transition-transform duration-300">
              <div className="flex items-center gap-6">
                <div className={`w-14 h-14 rounded-2xl flex items-center justify-center border border-current/10 ${status.color}`}>
                  <FileText className="w-7 h-7" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-slate-800">{task.title}</h3>
                  <div className="flex items-center gap-4 mt-1.5">
                    <span className="flex items-center gap-1.5 text-[11px] text-slate-400 font-bold uppercase tracking-wider">
                      <Calendar className="w-3.5 h-3.5" />
                      Deadline: {new Date(task.deadline).toLocaleDateString()}
                    </span>
                    <span className={`px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-widest border border-current/10 ${status.color}`}>
                      {status.label}
                    </span>
                    {submissions.find(s => s.task_id === task.id)?.grade && submissions.find(s => s.task_id === task.id)?.is_published && (
                      <span className="px-2.5 py-1 bento-card bg-green-600 text-white text-[10px] font-black uppercase tracking-widest border-none">
                        Nilai: {submissions.find(s => s.task_id === task.id)?.grade}
                      </span>
                    )}
                  </div>
                </div>
              </div>
              <button 
                onClick={() => {
                  setSelectedTaskForSubmit(task);
                  setShowSubmitModal(true);
                  const existingSub = submissions.find(s => s.task_id === task.id);
                  reset({ submission_link: existingSub?.file_url || '' });
                }}
                className="px-6 py-2.5 bg-slate-900 text-white rounded-xl font-bold hover:bg-slate-800 transition-all text-xs uppercase tracking-widest shadow-lg shadow-slate-200"
              >
                {status.label === 'Sudah Dikirim' ? 'Lihat/Update' : 'Kirim Tugas'}
              </button>
            </div>
          );
        })}
        {tasks.length === 0 && (
          <div className="py-20 text-center bento-card">
             <FileText className="w-12 h-12 text-slate-200 mx-auto mb-4" />
             <p className="text-slate-400 font-bold uppercase tracking-widest text-xs">Belum ada tugas untuk kelas {currentClass?.full_name || 'Anda'}.</p>
             <p className="text-[10px] text-slate-400 mt-2">Hubungi guru mata pelajaran atau wali kelas jika ini adalah kesalahan.</p>
             <button onClick={() => fetchTasks()} className="mt-6 text-indigo-600 text-[10px] font-black uppercase tracking-[0.2em] hover:underline">Refresh Tugas</button>
          </div>
        )}
      </div>
    </div>
  );

  return (
    <div className="max-w-6xl mx-auto">
      {loading ? (
        <div className="py-20 flex justify-center"><Loader2 className="animate-spin text-blue-600" /></div>
      ) : (
        (profile?.role === 'guru' || profile?.is_wali_kelas) ? <TeacherView /> : <StudentView />
      )}

      {/* Modal Buat Tugas */}
      <AnimatePresence>
        {showModal && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
            <motion.div 
               initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
               onClick={() => setShowModal(false)}
               className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
              className="relative bg-white w-full max-w-2xl rounded-3xl shadow-2xl p-8 overflow-hidden"
            >
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-2xl font-bold text-slate-900">{editingTask ? 'Edit Tugas' : 'Buat Tugas Baru'}</h2>
                <button onClick={() => setShowModal(false)} className="p-2 hover:bg-slate-100 rounded-full"><X className="w-6 h-6" /></button>
              </div>
              <form onSubmit={handleSubmit(onSubmitTask)} className="space-y-5">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-bold text-slate-700 mb-2">Jenis Tugas</label>
                    <select {...register('category_id')} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-100 font-medium">
                      <option value="">Pilih Kategori</option>
                      {categories.map(cat => (
                        <option key={cat.id} value={cat.id}>{cat.name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-slate-700 mb-2">Tugas Ke-</label>
                    <input type="number" {...register('sequence_number')} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-100 font-medium" placeholder="1" />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-2">Judul Tugas</label>
                  <input {...register('title')} 
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-100 font-bold" 
                    placeholder="Contoh: Membuat Algoritma Sorting" required />
                </div>
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-2">Deskripsi</label>
                  <textarea {...register('description')} rows={3} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-100" placeholder="Berikan instruksi detail tugas..." />
                </div>
                <div className="grid grid-cols-2 gap-4">
                   <div>
                      <label className="block text-sm font-bold text-slate-700 mb-2">Deadline</label>
                      <input type="datetime-local" {...register('deadline')} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-100" />
                   </div>
                   <div>
                      <label className="block text-sm font-bold text-slate-700 mb-2">Link Tambahan (Opsional)</label>
                      <input {...register('link')} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-100" placeholder="https://..." />
                   </div>
                </div>
                {!editingTask && (
                  <div>
                    <label className="block text-sm font-bold text-slate-700 mb-2">Pilih Kelas Tujuan</label>
                    <div className="grid grid-cols-3 gap-2 h-40 overflow-y-auto p-4 bg-slate-50 rounded-xl border border-slate-200">
                        {classes.map(c => (
                          <label key={c.id} className="flex items-center gap-2 text-sm cursor-pointer hover:text-blue-600 font-medium">
                            <input type="checkbox" value={c.id} {...register('selectedClasses')} className="w-4 h-4 accent-blue-600" />
                            {c.full_name}
                          </label>
                        ))}
                    </div>
                  </div>
                )}
                <button type="submit" className="w-full py-4 bg-blue-600 text-white rounded-xl font-bold text-lg hover:shadow-xl hover:shadow-blue-100 transition-all mt-4">
                  {editingTask ? 'Simpan Perubahan' : 'Bagikan Tugas'}
                </button>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Modal Grading */}
      <AnimatePresence>
        {showGradingModal && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
            <motion.div 
               initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
               onClick={() => setShowGradingModal(false)}
               className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ scale: 0.95, opacity: 0, y: 20 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ scale: 0.95, opacity: 0, y: 20 }}
              className="relative bg-white w-full max-w-md rounded-[2rem] shadow-2xl p-8 overflow-hidden"
            >
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h2 className="text-xl font-black text-slate-900 uppercase tracking-tight">Beri Nilai</h2>
                  <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-1">Siswa: {selectedTaskForGrading?.student?.full_name}</p>
                </div>
                <button onClick={() => setShowGradingModal(false)} className="p-2 hover:bg-slate-100 rounded-full transition-colors"><X className="w-5 h-5 text-slate-400" /></button>
              </div>

              <div className="space-y-6">
                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Nilai (0 - 100)</label>
                  <input 
                    type="number" 
                    value={gradingForm.grade}
                    onChange={(e) => setGradingForm({ ...gradingForm, grade: e.target.value })}
                    className="w-full px-5 py-4 bg-slate-50 border border-slate-100 rounded-2xl outline-none focus:ring-4 focus:ring-blue-100/50 font-black text-lg text-slate-800 transition-all" 
                    placeholder="85"
                    min="0"
                    max="100"
                  />
                </div>

                <div>
                   <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Feedback / Catatan</label>
                   <textarea 
                    value={gradingForm.feedback}
                    onChange={(e) => setGradingForm({ ...gradingForm, feedback: e.target.value })}
                    className="w-full px-5 py-4 bg-slate-50 border border-slate-100 rounded-2xl outline-none focus:ring-4 focus:ring-blue-100/50 text-sm font-medium transition-all" 
                    placeholder="Kerja bagus! Perbaiki sedikit di bagian..."
                    rows={3}
                   />
                </div>

                <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100 flex items-center justify-between">
                  <div>
                    <p className="text-[11px] font-black text-slate-800 uppercase tracking-tight">Terbitkan Nilai</p>
                    <p className="text-[9px] text-slate-400 font-medium leading-tight">Siswa dapat melihat nilai di dashboard mereka.</p>
                  </div>
                  <button 
                    onClick={() => setGradingForm({ ...gradingForm, is_published: !gradingForm.is_published })}
                    className={`w-12 h-6 rounded-full transition-all flex items-center p-1 ${gradingForm.is_published ? 'bg-green-500 justify-end' : 'bg-slate-300 justify-start'}`}
                  >
                    <div className="w-4 h-4 bg-white rounded-full shadow-sm" />
                  </button>
                </div>

                <div className="flex gap-3">
                  <button 
                    onClick={() => handleGradeSubmission(gradingForm.id, Number(gradingForm.grade), gradingForm.feedback, false)}
                    className="flex-1 py-4 bg-slate-100 text-slate-600 rounded-2xl font-black text-[11px] uppercase tracking-widest hover:bg-slate-200 transition-all"
                  >
                    Simpan Draft
                  </button>
                  <button 
                    onClick={() => handleGradeSubmission(gradingForm.id, Number(gradingForm.grade), gradingForm.feedback, true)}
                    className="flex-1 py-4 bg-blue-600 text-white rounded-2xl font-black text-[11px] uppercase tracking-widest hover:shadow-xl hover:shadow-blue-200 transition-all"
                  >
                    Terbitkan
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Modal Submit Tugas */}
      <AnimatePresence>
        {showSubmitModal && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
            <motion.div 
               initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
               onClick={() => setShowSubmitModal(false)}
               className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
              className="relative bg-white w-full max-w-lg rounded-3xl shadow-2xl p-8 overflow-hidden"
            >
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h2 className="text-2xl font-bold text-slate-900">Kirim Tugas</h2>
                  <p className="text-sm text-slate-500 font-medium">{selectedTaskForSubmit?.title}</p>
                </div>
                <button onClick={() => setShowSubmitModal(false)} className="p-2 hover:bg-slate-100 rounded-full"><X className="w-6 h-6" /></button>
              </div>
              
              <div className="mb-6 p-4 bg-blue-50 rounded-2xl border border-blue-100">
                <p className="text-xs font-bold text-blue-700 uppercase tracking-widest mb-1">Instruksi Guru:</p>
                <p className="text-sm text-blue-600 font-medium leading-relaxed">{selectedTaskForSubmit?.description}</p>
              </div>

              <form onSubmit={handleSubmit(handleTaskSubmit)} className="space-y-5">
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-2 italic">Tautan Pengumpulan (Google Drive / GitHub / Link Lainnya)</label>
                  <div className="relative">
                    <LinkIcon className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input 
                      {...register('submission_link')} 
                      className="w-full pl-11 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-100 text-sm" 
                      placeholder="https://..." 
                      required 
                    />
                  </div>
                  <p className="text-[10px] text-slate-400 mt-2 font-medium">Pastikan link dapat diakses oleh guru pengajar.</p>
                </div>
                <button 
                  disabled={isSubmitting}
                  type="submit" 
                  className="w-full py-4 bg-indigo-600 text-white rounded-xl font-bold text-lg hover:shadow-xl hover:shadow-indigo-100 transition-all flex items-center justify-center gap-2"
                >
                  {isSubmitting ? <Loader2 className="animate-spin w-5 h-5" /> : <><Send className="w-5 h-5" /> Kirim Sekarang</>}
                </button>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Modal Konfirmasi Hapus */}
      <AnimatePresence>
        {taskToDelete && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div 
               initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
               onClick={() => setTaskToDelete(null)}
               className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ scale: 0.95, opacity: 0, y: 20 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ scale: 0.95, opacity: 0, y: 20 }}
              className="relative bg-white w-full max-w-sm rounded-[2rem] shadow-2xl p-8 text-center"
            >
              <div className="w-16 h-16 bg-rose-50 text-rose-600 rounded-2xl flex items-center justify-center mx-auto mb-6">
                <Trash2 className="w-8 h-8" />
              </div>
              <h2 className="text-xl font-black text-slate-900 uppercase tracking-tight mb-2">Hapus Tugas?</h2>
              <p className="text-xs text-slate-500 font-medium leading-relaxed mb-8">
                Tindakan ini tidak dapat dibatalkan. Semua data nilai dan pengumpulan siswa terkait tugas ini akan ikut terhapus secara permanen.
              </p>
              <div className="flex gap-3">
                <button 
                  onClick={() => setTaskToDelete(null)}
                  className="flex-1 py-3 text-slate-500 font-black text-[10px] uppercase tracking-[0.2em] hover:bg-slate-50 rounded-xl transition-all"
                >
                  Batal
                </button>
                <button 
                  onClick={handleDeleteTask}
                  disabled={isDeleting}
                  className="flex-1 py-3 bg-rose-600 text-white rounded-xl font-black text-[10px] uppercase tracking-[0.2em] shadow-lg shadow-rose-100 hover:shadow-rose-200 transition-all flex items-center justify-center"
                >
                  {isDeleting ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Hapus Sekarang'}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
