export interface LoginUserDto {
  email: string;
  password: string;
}

export interface RegisterUserDto {
  name: string;
  nickname?: string | null;
  email: string;
  birthDate: string;
  password: string;
  roles: string[];
  status?: string;
  phone?: string | null;
  photoURL?: string | null;
  joinedAt?: string;
  instruments?: string[];
  experience?: string | null;
  notes?: string | null;
  canLeadWorship?: boolean;
}
