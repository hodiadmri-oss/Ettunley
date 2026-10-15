import { FieldValue } from 'firebase-admin/firestore'

// What changes on a student's profile when they stop being linked to a teacher.
// A minor's parent consent names one particular teacher, so it ends with the link:
// the parent has to approve again for the next teacher. An adult's consent is
// "my teacher" in general and stays.
export function unlinkUpdate(student: FirebaseFirestore.DocumentData): Record<string, unknown> {
  const update: Record<string, unknown> = {
    teacherId: FieldValue.delete(),
    teacherName: FieldValue.delete(),
    linkStatus: FieldValue.delete(),
  }
  if (consentEndsWithLink(student)) {
    update.consentBy = FieldValue.delete()
    update.consentAt = FieldValue.delete()
  }
  return update
}

export function consentEndsWithLink(student: FirebaseFirestore.DocumentData): boolean {
  return student.isMinor === true && student.consentBy === 'parent'
}
