export type Role = 'guru' | 'murid';
export type Jabatan = 'ketua' | 'wakil' | 'bendahara' | 'keamanan_kebersihan' | 'sekretaris' | null;
export type ClassLevel = 'X' | 'XI' | 'XII';
export type Department = 'PPLG' | 'AKL' | 'MP' | 'BR' | 'DKV';
export type AttendanceStatus = 'hadir' | 'izin' | 'sakit' | 'alpha';

export interface Class {
  id: string;
  level: ClassLevel;
  department: Department;
  class_name: 'A' | 'B';
  full_name: string;
}

export interface Profile {
  id: string;
  full_name: string;
  username: string;
  role: Role;
  class_id?: string;
  is_wali_kelas?: boolean;
  jabatan_pengurus?: Jabatan;
  created_at: string;
}

export interface ClassStudent {
  id: string;
  class_id: string;
  full_name: string;
  nisn?: string;
  created_at: string;
}

export interface UserContextType {
  profile: Profile | null;
  user: any | null;
  currentClass: Class | null;
  loading: boolean;
  refreshProfile: () => Promise<void>;
}
