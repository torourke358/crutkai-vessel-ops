// Accounts that exist for admin/developer reasons and should NOT appear in the
// "assign to" task-assignment pickers (maintenance tasks, yard tasks, defects).
// These users keep full admin access and stay `active` — they are only hidden
// from the assignee dropdowns. Name-resolution lookups elsewhere are
// intentionally NOT filtered by this, so records these users authored still
// render their name.
//
// Tim O'Rourke is the developer/admin on this build, not boat crew, so he asked
// to be removed from the assignment lists while remaining an admin.
export const HIDDEN_CREW_ID = "9f7596b7-7861-4cb8-a93b-eebba74bd7f4";
