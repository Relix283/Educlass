-- SUPABASE SCHEMA FOR EDUCLASS

-- 1. Classes Table
CREATE TABLE IF NOT EXISTS public.classes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    level TEXT NOT NULL CHECK (level IN ('X', 'XI', 'XII')),
    department TEXT NOT NULL CHECK (department IN ('PPLG', 'AKL', 'MP', 'BR', 'DKV')),
    class_name CHAR(1) NOT NULL CHECK (class_name IN ('A', 'B')),
    full_name TEXT GENERATED ALWAYS AS (level || ' ' || department || ' ' || class_name) STORED,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    UNIQUE (level, department, class_name)
);

-- 2. Profiles Table (Linked to Auth users)
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    full_name TEXT NOT NULL,
    username TEXT UNIQUE NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('guru', 'murid')),
    class_id UUID REFERENCES public.classes(id) ON DELETE SET NULL,
    avatar_url TEXT,
    mata_pelajaran TEXT,
    is_wali_kelas BOOLEAN DEFAULT false,
    jabatan_pengurus TEXT CHECK (jabatan_pengurus IN ('ketua', 'wakil', 'bendahara', 'keamanan_kebersihan', 'sekretaris', NULL)),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Ensure columns exist
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='profiles' AND column_name='avatar_url') THEN
        ALTER TABLE public.profiles ADD COLUMN avatar_url TEXT;
    END IF;
END $$;

-- 3. Tasks Table
CREATE TABLE IF NOT EXISTS public.tasks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT NOT NULL,
    description TEXT,
    image_url TEXT,
    link TEXT,
    deadline TIMESTAMP WITH TIME ZONE,
    teacher_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    category_id UUID, -- References grade_categories
    sequence_number INTEGER DEFAULT 1,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 11. Grade Categories
CREATE TABLE IF NOT EXISTS public.grade_categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL UNIQUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 12. Gradebook Columns
CREATE TABLE IF NOT EXISTS public.gradebook_columns (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    class_id UUID REFERENCES public.classes(id) ON DELETE CASCADE,
    teacher_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    title TEXT NOT NULL,
    category_id UUID REFERENCES public.grade_categories(id) ON DELETE SET NULL,
    task_id UUID REFERENCES public.tasks(id) ON DELETE SET NULL,
    weight INTEGER DEFAULT 1,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 13. Student Grades
CREATE TABLE IF NOT EXISTS public.student_grades (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    column_id UUID REFERENCES public.gradebook_columns(id) ON DELETE CASCADE,
    student_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    score DECIMAL CHECK (score >= 0 AND score <= 100),
    comment TEXT,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    UNIQUE (column_id, student_id)
);

-- Migration helper for existing grades to ensure full profile link
DO $$ 
BEGIN 
    -- If there are conflicts, truncate the table to start fresh with account-based logic
    -- as the old data used mock student IDs
    IF EXISTS (
        SELECT 1 FROM public.student_grades sg 
        LEFT JOIN public.profiles p ON sg.student_id = p.id 
        WHERE p.id IS NULL
    ) THEN
        TRUNCATE TABLE public.student_grades;
    END IF;
    
    ALTER TABLE public.student_grades DROP CONSTRAINT IF EXISTS student_grades_student_id_fkey;
    ALTER TABLE public.student_grades ADD CONSTRAINT student_grades_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
END $$;

-- 14. Grade Logs
CREATE TABLE IF NOT EXISTS public.grade_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    grade_id UUID REFERENCES public.student_grades(id) ON DELETE CASCADE,
    old_score DECIMAL,
    new_score DECIMAL,
    changed_by UUID REFERENCES public.profiles(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Seed Categories
INSERT INTO public.grade_categories (name) VALUES 
('Tugas'), ('Quiz'), ('Ulangan Harian'), ('Projek'), ('UTS'), ('UAS')
ON CONFLICT DO NOTHING;

-- RLS for new tables
ALTER TABLE public.grade_categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "grade_categories_select" ON public.grade_categories FOR SELECT USING (true);

ALTER TABLE public.gradebook_columns ENABLE ROW LEVEL SECURITY;
CREATE POLICY "gradebook_columns_select" ON public.gradebook_columns FOR SELECT USING (true);
CREATE POLICY "gradebook_columns_manage" ON public.gradebook_columns FOR ALL USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND (role = 'guru' OR is_wali_kelas = true))
);

ALTER TABLE public.student_grades ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "student_grades_select" ON public.student_grades;
CREATE POLICY "student_grades_select" ON public.student_grades FOR SELECT USING (true);

DROP POLICY IF EXISTS "student_grades_manage" ON public.student_grades;
CREATE POLICY "student_grades_manage" ON public.student_grades FOR ALL USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND (role = 'guru' OR is_wali_kelas = true))
) WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND (role = 'guru' OR is_wali_kelas = true))
);

-- Rest of RLS...
CREATE TABLE IF NOT EXISTS public.task_assignments (
    task_id UUID REFERENCES public.tasks(id) ON DELETE CASCADE,
    class_id UUID REFERENCES public.classes(id) ON DELETE CASCADE,
    PRIMARY KEY (task_id, class_id)
);

-- 5. Task Submissions
CREATE TABLE IF NOT EXISTS public.task_submissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    task_id UUID REFERENCES public.tasks(id) ON DELETE CASCADE,
    student_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    file_url TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('draft', 'submitted')) DEFAULT 'draft',
    grade INTEGER CHECK (grade >= 0 AND grade <= 100),
    feedback TEXT,
    is_published BOOLEAN DEFAULT false,
    submitted_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    UNIQUE (task_id, student_id)
);

-- Ensure published column exists
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='task_submissions' AND column_name='is_published') THEN
        ALTER TABLE public.task_submissions ADD COLUMN is_published BOOLEAN DEFAULT false;
    END IF;
END $$;

-- 5.7 Activities Table (For student records)
CREATE TABLE IF NOT EXISTS public.activities (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    class_id UUID REFERENCES public.classes(id) ON DELETE CASCADE,
    type TEXT NOT NULL, -- 'tugas', 'absensi', 'kas', 'piket'
    title TEXT NOT NULL,
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 5.5. Class Students (Imported list)
CREATE TABLE IF NOT EXISTS public.class_students (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    class_id UUID REFERENCES public.classes(id) ON DELETE CASCADE,
    full_name TEXT NOT NULL,
    nisn TEXT, -- Optional, can be used as unique identifier in import
    profile_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Ensure profile_id column exists
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='class_students' AND column_name='profile_id') THEN
        ALTER TABLE public.class_students ADD COLUMN profile_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL;
    END IF;
END $$;

-- 6. Attendance Table
CREATE TABLE IF NOT EXISTS public.attendance (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    class_id UUID REFERENCES public.classes(id) ON DELETE CASCADE,
    date DATE NOT NULL DEFAULT CURRENT_DATE,
    status TEXT NOT NULL CHECK (status IN ('hadir', 'izin', 'sakit', 'alpha')),
    teacher_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    UNIQUE (student_id, date)
);

-- Backward compatibility & migration helper for existing attendance table
DO $$ 
BEGIN 
    -- If student_id doesn't exist, add it
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='attendance' AND column_name='student_id') THEN
        ALTER TABLE public.attendance ADD COLUMN student_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE;
    END IF;

    -- Check if there are orphaned records that would prevent adding the foreign key/unique constraint
    IF EXISTS (
        SELECT 1 FROM public.attendance att 
        LEFT JOIN public.profiles p ON att.student_id = p.id 
        WHERE p.id IS NULL
    ) THEN
        TRUNCATE TABLE public.attendance;
    END IF;

    -- Drop old unique constraint if it exists to replace with student_id based one
    ALTER TABLE public.attendance DROP CONSTRAINT IF EXISTS attendance_class_student_id_date_key;
    
    -- Add new unique constraint
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'attendance_student_id_date_key') THEN
        ALTER TABLE public.attendance ADD CONSTRAINT attendance_student_id_date_key UNIQUE (student_id, date);
    END IF;
END $$;

-- 7. Announcements
CREATE TABLE IF NOT EXISTS public.announcements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    content TEXT NOT NULL,
    author_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 8. Class Funds (Kas)
CREATE TABLE IF NOT EXISTS public.class_funds (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    class_id UUID REFERENCES public.classes(id) ON DELETE CASCADE,
    amount DECIMAL NOT NULL,
    transaction_type TEXT NOT NULL CHECK (transaction_type IN ('masuk', 'keluar')),
    description TEXT,
    date DATE NOT NULL DEFAULT CURRENT_DATE,
    treasurer_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 9. Piket Schedule
CREATE TABLE IF NOT EXISTS public.piket_schedule (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    class_id UUID REFERENCES public.classes(id) ON DELETE CASCADE,
    day_of_week INTEGER NOT NULL CHECK (day_of_week BETWEEN 1 AND 5), -- 1: Monday, 5: Friday
    student_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    UNIQUE (class_id, day_of_week, student_id)
);

-- 10. Piket Documentation
CREATE TABLE IF NOT EXISTS public.piket_documentation (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    class_id UUID REFERENCES public.classes(id) ON DELETE CASCADE,
    date DATE NOT NULL DEFAULT CURRENT_DATE,
    image_url TEXT NOT NULL,
    uploader_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 11. Seed Classes
INSERT INTO public.classes (level, department, class_name)
SELECT l, d, c
FROM 
    (SELECT unnest(ARRAY['X', 'XI', 'XII']) as l) levels,
    (SELECT unnest(ARRAY['PPLG', 'AKL', 'MP', 'BR', 'DKV']) as d) depts,
    (SELECT unnest(ARRAY['A', 'B']) as c) cohorts
ON CONFLICT DO NOTHING;

-- RLS RULES
ALTER TABLE public.classes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Classes are viewable by everyone" ON public.classes;
CREATE POLICY "Classes are viewable by everyone" ON public.classes FOR SELECT USING (true);

DROP POLICY IF EXISTS "Authenticated users can create classes" ON public.classes;
CREATE POLICY "Authenticated users can create classes" ON public.classes FOR INSERT WITH CHECK (auth.role() = 'authenticated');

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public profiles are viewable by everyone" ON public.profiles;
DROP POLICY IF EXISTS "Profiles viewable by class members" ON public.profiles;
DROP POLICY IF EXISTS "Profiles are viewable by everyone" ON public.profiles;
CREATE POLICY "profiles_select_policy" ON public.profiles FOR SELECT USING (true);

DROP POLICY IF EXISTS "Users can insert their own profile" ON public.profiles;
CREATE POLICY "Users can insert their own profile" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE USING (
    auth.uid() = id OR 
    EXISTS (
        SELECT 1 FROM public.profiles p2 
        WHERE p2.id = auth.uid() 
        AND p2.is_wali_kelas = true 
        AND p2.class_id = public.profiles.class_id
    )
);

DROP POLICY IF EXISTS "Wali Kelas can delete students" ON public.profiles;
CREATE POLICY "Wali Kelas can delete students" ON public.profiles 
FOR DELETE 
USING (
    EXISTS (
        SELECT 1 FROM public.profiles p2 
        WHERE p2.id = auth.uid() 
        AND (p2.role = 'guru' OR p2.is_wali_kelas = true)
        AND (p2.class_id = public.profiles.class_id OR p2.role = 'guru')
    )
);

ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Tasks are viewable by everyone in the class" ON public.tasks;
CREATE POLICY "Tasks are viewable by everyone in the class" ON public.tasks FOR SELECT USING (true);

DROP POLICY IF EXISTS "Teachers can manage tasks" ON public.tasks;
CREATE POLICY "Teachers can manage tasks" ON public.tasks 
FOR ALL 
USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND (role = 'guru' OR is_wali_kelas = true))
)
WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND (role = 'guru' OR is_wali_kelas = true))
);

ALTER TABLE public.class_students ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Class students are viewable by everyone" ON public.class_students;
CREATE POLICY "Class students are viewable by everyone" ON public.class_students FOR SELECT USING (true);

DROP POLICY IF EXISTS "Wali kelas can manage their students" ON public.class_students;
CREATE POLICY "Wali kelas can manage their students" ON public.class_students 
FOR ALL 
USING (
    EXISTS (
        SELECT 1 FROM public.profiles 
        WHERE id = auth.uid() 
        AND (role = 'guru' OR is_wali_kelas = true)
    )
);

ALTER TABLE public.attendance ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Attendance is viewable by everyone" ON public.attendance;
CREATE POLICY "Attendance is viewable by everyone" ON public.attendance FOR SELECT USING (true);

DROP POLICY IF EXISTS "Teachers can manage attendance" ON public.attendance;
CREATE POLICY "Teachers can manage attendance" ON public.attendance FOR ALL USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND (role = 'guru' OR is_wali_kelas = true))
) WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND (role = 'guru' OR is_wali_kelas = true))
);

ALTER TABLE public.announcements ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Announcements are viewable by everyone" ON public.announcements;
CREATE POLICY "Announcements are viewable by everyone" ON public.announcements FOR SELECT USING (true);

DROP POLICY IF EXISTS "Teachers can create announcements" ON public.announcements;
CREATE POLICY "Teachers can create announcements" ON public.announcements FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND (role = 'guru' OR is_wali_kelas = true OR jabatan_pengurus IS NOT NULL))
);

-- Additional RLS
ALTER TABLE public.task_assignments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Viewable by everyone" ON public.task_assignments;
CREATE POLICY "Viewable by everyone" ON public.task_assignments FOR SELECT USING (true);
DROP POLICY IF EXISTS "Manageable by teachers" ON public.task_assignments;
CREATE POLICY "Manageable by teachers" ON public.task_assignments 
FOR ALL 
USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND (role = 'guru' OR is_wali_kelas = true))
)
WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND (role = 'guru' OR is_wali_kelas = true))
);

ALTER TABLE public.task_submissions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Viewable by self and guru" ON public.task_submissions;
CREATE POLICY "Viewable by student teacher or wali kelas" ON public.task_submissions 
FOR SELECT 
USING (
    auth.uid() = student_id OR 
    EXISTS (
        SELECT 1 FROM public.tasks 
        WHERE public.tasks.id = public.task_submissions.task_id 
        AND (
            public.tasks.teacher_id = auth.uid() OR
            EXISTS (
                SELECT 1 FROM public.profiles teacher_p
                WHERE teacher_p.id = auth.uid() 
                AND teacher_p.is_wali_kelas = true 
                AND teacher_p.class_id = (
                    SELECT class_id FROM public.profiles WHERE id = public.task_submissions.student_id
                )
            )
        )
    )
);
DROP POLICY IF EXISTS "Manageable by self" ON public.task_submissions;
CREATE POLICY "Manageable by self" ON public.task_submissions 
FOR ALL 
USING (auth.uid() = student_id)
WITH CHECK (auth.uid() = student_id);

DROP POLICY IF EXISTS "Guru can update for grading" ON public.task_submissions;
CREATE POLICY "Guru can update for grading" ON public.task_submissions 
FOR UPDATE 
USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND (role = 'guru' OR is_wali_kelas = true))
)
WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND (role = 'guru' OR is_wali_kelas = true))
);

ALTER TABLE public.class_funds ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Viewable by class members" ON public.class_funds;
CREATE POLICY "Viewable by class members" ON public.class_funds FOR SELECT USING (true);

DROP POLICY IF EXISTS "Manageable by officers" ON public.class_funds;
CREATE POLICY "Manageable by officers" ON public.class_funds FOR ALL USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND (role = 'guru' OR is_wali_kelas = true OR jabatan_pengurus IS NOT NULL))
) WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND (role = 'guru' OR is_wali_kelas = true OR jabatan_pengurus IS NOT NULL))
);

ALTER TABLE public.piket_schedule ENABLE ROW LEVEL SECURITY;

-- 1. DROP ALL POTENTIAL DUPLICATES
DROP POLICY IF EXISTS "piket_schedule_select" ON public.piket_schedule;
DROP POLICY IF EXISTS "piket_schedule_officer_all" ON public.piket_schedule;
DROP POLICY IF EXISTS "Viewable by everyone" ON public.piket_schedule;
DROP POLICY IF EXISTS "Manageable by officers" ON public.piket_schedule;
DROP POLICY IF EXISTS "Everyone can read schedule" ON public.piket_schedule;
DROP POLICY IF EXISTS "Officers can manage schedule" ON public.piket_schedule;
DROP POLICY IF EXISTS "piket_schedule_select_all" ON public.piket_schedule;
DROP POLICY IF EXISTS "piket_schedule_manage_officers" ON public.piket_schedule;

-- 2. CREATE CLEAN POLICIES
DO $$ 
BEGIN
    DROP POLICY IF EXISTS "piket_schedule_select_policy" ON public.piket_schedule;
    DROP POLICY IF EXISTS "piket_schedule_insert_policy" ON public.piket_schedule;
    DROP POLICY IF EXISTS "piket_schedule_update_policy" ON public.piket_schedule;
    DROP POLICY IF EXISTS "piket_schedule_delete_policy" ON public.piket_schedule;
END $$;

CREATE POLICY "piket_schedule_select_policy" ON public.piket_schedule 
FOR SELECT TO authenticated USING (true);

CREATE POLICY "piket_schedule_insert_policy" ON public.piket_schedule 
FOR INSERT TO authenticated 
WITH CHECK (
    EXISTS (
        SELECT 1 FROM public.profiles 
        WHERE id = auth.uid() 
        AND (
            (is_wali_kelas = true AND class_id = public.piket_schedule.class_id) 
            OR (jabatan_pengurus IS NOT NULL AND class_id = public.piket_schedule.class_id)
        )
    )
);

CREATE POLICY "piket_schedule_update_policy" ON public.piket_schedule 
FOR UPDATE TO authenticated 
USING (
    EXISTS (
        SELECT 1 FROM public.profiles 
        WHERE id = auth.uid() 
        AND (
            (is_wali_kelas = true AND class_id = public.piket_schedule.class_id) 
            OR (jabatan_pengurus IS NOT NULL AND class_id = public.piket_schedule.class_id)
        )
    )
);

CREATE POLICY "piket_schedule_delete_policy" ON public.piket_schedule 
FOR DELETE TO authenticated 
USING (
    EXISTS (
        SELECT 1 FROM public.profiles 
        WHERE id = auth.uid() 
        AND (
            (is_wali_kelas = true AND class_id = public.piket_schedule.class_id) 
            OR (jabatan_pengurus IS NOT NULL AND class_id = public.piket_schedule.class_id)
        )
    )
);

-- 10. Piket Documentation
ALTER TABLE public.piket_documentation ENABLE ROW LEVEL SECURITY;

DO $$ 
BEGIN
    DROP POLICY IF EXISTS "piket_doc_read_policy" ON public.piket_documentation;
    DROP POLICY IF EXISTS "piket_doc_insert_policy" ON public.piket_documentation;
    DROP POLICY IF EXISTS "piket_doc_delete_policy" ON public.piket_documentation;
    DROP POLICY IF EXISTS "piket_doc_update_policy" ON public.piket_documentation;
    DROP POLICY IF EXISTS "piket_doc_manage_policy" ON public.piket_documentation;
    DROP POLICY IF EXISTS "piket_documentation_select_all" ON public.piket_documentation;
    DROP POLICY IF EXISTS "piket_documentation_select" ON public.piket_documentation;
    DROP POLICY IF EXISTS "piket_documentation_insert" ON public.piket_documentation;
    DROP POLICY IF EXISTS "Manageable by uploader" ON public.piket_documentation;
END $$;

-- Allow all authenticated users to view
CREATE POLICY "piket_doc_read_policy" ON public.piket_documentation 
FOR SELECT TO authenticated USING (true);

-- Allow authenticated users to insert their own documentation
CREATE POLICY "piket_doc_insert_policy" ON public.piket_documentation 
FOR INSERT TO authenticated 
WITH CHECK (auth.uid() = uploader_id);

-- Allow uploader OR officers to delete
CREATE POLICY "piket_doc_delete_policy" ON public.piket_documentation 
FOR DELETE TO authenticated 
USING (
    auth.uid() = uploader_id 
    OR EXISTS (
        SELECT 1 FROM public.profiles 
        WHERE id = auth.uid() 
        AND (
            (is_wali_kelas = true AND class_id = public.piket_documentation.class_id)
            OR (jabatan_pengurus IS NOT NULL AND class_id = public.piket_documentation.class_id)
        )
    )
);

-- Allow uploader OR officers to update
CREATE POLICY "piket_doc_update_policy" ON public.piket_documentation 
FOR UPDATE TO authenticated 
USING (
    auth.uid() = uploader_id 
    OR EXISTS (
        SELECT 1 FROM public.profiles 
        WHERE id = auth.uid() 
        AND (
            (is_wali_kelas = true AND class_id = public.piket_documentation.class_id)
            OR (jabatan_pengurus IS NOT NULL AND class_id = public.piket_documentation.class_id)
        )
    )
);

ALTER TABLE public.activities ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Activities are viewable by everyone in class" ON public.activities;
CREATE POLICY "Activities are viewable by everyone in class" ON public.activities FOR SELECT USING (true);

    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND (role = 'guru' OR is_wali_kelas = true OR jabatan_pengurus IS NOT NULL))
);

-- 15. Attendance Recaps Table (for monthly summaries and drafts)
CREATE TABLE IF NOT EXISTS public.attendance_recaps (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    class_id UUID REFERENCES public.classes(id) ON DELETE CASCADE,
    teacher_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    month INTEGER NOT NULL CHECK (month BETWEEN 1 AND 12),
    year INTEGER NOT NULL,
    subject TEXT, -- for Guru Mapel subject context
    status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'final')),
    data JSONB NOT NULL, -- [{ student_id, attendance_percentage, total_days, present_days }]
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    UNIQUE (class_id, teacher_id, month, year, subject)
);

ALTER TABLE public.attendance_recaps ENABLE ROW LEVEL SECURITY;
CREATE POLICY "attendance_recaps_select" ON public.attendance_recaps FOR SELECT USING (true);
CREATE POLICY "attendance_recaps_manage" ON public.attendance_recaps FOR ALL USING (
    auth.uid() = teacher_id OR 
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_wali_kelas = true AND class_id = public.attendance_recaps.class_id)
);

-- Seed Attendance Category if not exists
INSERT INTO public.grade_categories (name) VALUES ('Kehadiran') ON CONFLICT DO NOTHING;
