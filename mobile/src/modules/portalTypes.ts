export interface StudentCard {
  id: number;
  admission_no?: string;
  first_name?: string;
  last_name?: string;
  full_name?: string;
  class_name?: string;
  section?: string;
  roll_no?: string;
  photo_url?: string;
  student_status?: string;
  house?: string;
}

export interface StudentSummary {
  student: StudentCard;
  guardian?: {
    father_name?: string;
    mother_name?: string;
    guardian_name?: string;
  };
  current_academic_year?: string;
  current_enrollment?: {
    academic_year?: string;
    class_name?: string;
    section?: string;
    roll_no?: string;
  };
}

export interface AttendanceCounts {
  Present?: number;
  Absent?: number;
  Late?: number;
  "Half Day"?: number;
}

export interface AttendanceRecord {
  date?: string;
  status?: string;
  academic_year?: string;
  remarks?: string;
}

export interface AttendanceResponse {
  total_days: number;
  counts: AttendanceCounts;
  attendance_percentage?: number | null;
  records: AttendanceRecord[];
}

export interface SubjectMark {
  subject?: string;
  marks_obtained?: number;
  max_marks?: number;
  grade?: string;
}

export interface ExamResult {
  exam_name?: string;
  academic_year?: string;
  subjects: SubjectMark[];
  total_obtained?: number;
  total_max?: number;
  percentage?: number;
}

export interface MarksResponse {
  exams: ExamResult[];
}

export interface FeeTotals {
  total_amount: number;
  total_paid: number;
  total_due: number;
}

export interface Fee {
  id: number;
  fee_type?: string;
  academic_year?: string;
  total_amount?: number;
  paid_amount?: number;
  due_amount?: number;
  payment_status?: string;
  payment_date?: string;
  receipt_no?: string;
  remarks?: string;
}

export interface FeesResponse {
  totals: FeeTotals;
  fees: Fee[];
}

export interface UpiPaymentDetails {
  upi_id: string;
  payee_name: string;
  amount: number;
  currency: string;
  note?: string;
  uri: string;
}

export function studentDisplayName(s: StudentCard) {
  return s.full_name || [s.first_name, s.last_name].filter(Boolean).join(" ") || s.admission_no || `Student #${s.id}`;
}
