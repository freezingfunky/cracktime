export type Severity = "critical" | "high" | "medium" | "low" | "safe";
export type Grade = "A+" | "A" | "B" | "C" | "D" | "F";
export type StatusColor = "green" | "yellow" | "red";

export interface ThreatVector {
  name: string;
  label: string;
  detail: string;
  severity: Severity;
  score: number;
}

export interface ScanResult {
  grade: Grade;
  color: StatusColor;
  hexColor: string;
  overallScore: number;
  crackTime: string;
  crackSeconds: number;
  threats: ThreatVector[];
  entropy: number;
  suggestion: string;
}

export interface FieldReport {
  url: string;
  fieldId: string;
  result: ScanResult;
  timestamp: number;
}

export interface PageReport {
  url: string;
  fields: FieldReport[];
  worstGrade: Grade;
  worstColor: StatusColor;
}
