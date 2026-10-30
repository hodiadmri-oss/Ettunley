import { initializeApp } from 'firebase-admin/app'
import { setGlobalOptions } from 'firebase-functions/v2'

// Tel Aviv, next to the data. maxInstances keeps a runaway client from running up the bill.
setGlobalOptions({ region: 'me-west1', maxInstances: 5 })
initializeApp()

export { approveTeacher, listTeachers, rejectTeacher } from './teachers'
export { cancelJoinRequest, joinTeacher, regenerateInviteCode, removeStudent, respondToStudent } from './linking'
export {
  approveParentConsent,
  getParentConsentInfo,
  getParentManageInfo,
  manageParentConsent,
  sendParentConsent,
} from './consent'
export { adminDeleteUser, adminLookupUser, deleteMyAccount } from './accounts'
export { adminListFiles, adminListStudents, adminReadFile, adminRemoveFile, deleteAssignment } from './files'
export { trackReplyAlerts } from './replies'
export { deleteMyRecording, trackPracticeLog, trackRecordingAlerts, verifyUpload } from './recordings'
export { dailyRetention } from './retention'
