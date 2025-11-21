export interface JobQuestion {
  text: string;
  required: boolean;
}

export interface JobCompany {
  id: number | null;
  name: string | null;
  city?: string | null;
  country?: string | null;
  website?: string | null;
  logoUrl?: string | null;
  avatarUrl?: string | null;
}

export interface Job {
  id: number;
  companyId?: number | null;
  title: string | null;
  description: string | null;
  locationType: string | null;
  city: string | null;
  country: string | null;
  seniority: string | null;
  contractType: string | null;
  createdAt?: string | null;
  active?: boolean;
  totalApplicants?: number | null;
  questions: JobQuestion[];
  company?: JobCompany;
}

export interface ApplicationAnswer {
  question: string | null;
  answer: string | null;
}

export interface Application {
  id: number | null;
  offerId: number | null;
  userId?: number | null;
  applicantId?: number | null;
  applicantName?: string | null;
  applicantEmail?: string | null;
  applicantPhone?: string | null;
  applicantProfileSlug?: string | null;
  offerTitle?: string | null;
  status?: string | null;
  coverLetter?: string | null;
  submittedAt?: string | null;
  previousStatus?: string | null;
  answers?: ApplicationAnswer[];
  questions?: JobQuestion[];
}
