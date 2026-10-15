import { initializeApp } from 'firebase-admin/app'
import { setGlobalOptions } from 'firebase-functions/v2'

// Tel Aviv, next to the data. maxInstances keeps a runaway client from running up the bill.
setGlobalOptions({ region: 'me-west1', maxInstances: 5 })
initializeApp()

export { approveTeacher, listTeachers, rejectTeacher } from './teachers'
export { joinTeacher, regenerateInviteCode, removeStudent, respondToStudent } from './linking'
