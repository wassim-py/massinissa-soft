import {
  can,
  cannot,
  isOwner,
  isBranchAdmin,
  isAdmin,
  normalizeRole,
  canAccessMenuItem,
  canAccessRoute,
  getActionState,
  getAvailableActions,
} from "../src/lib/permissions";

let failures = 0;

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ FAILED: ${message}`);
    failures++;
  } else {
    console.log(`✅ PASSED: ${message}`);
  }
}

console.log("\n=================== 1. ROLE NORMALIZATION & IDENTIFICATION ===================");
assert(normalizeRole("owner") === "owner", "normalizeRole('owner') === 'owner'");
assert(normalizeRole("admin") === "owner", "normalizeRole('admin') === 'owner'");
assert(normalizeRole("OWNER") === "owner", "normalizeRole('OWNER') === 'owner'");
assert(normalizeRole("ADMIN") === "owner", "normalizeRole('ADMIN') === 'owner'");
assert(normalizeRole("branch_admin") === "branch_admin", "normalizeRole('branch_admin') === 'branch_admin'");
assert(normalizeRole("branch") === "branch_admin", "normalizeRole('branch') === 'branch_admin'");
assert(normalizeRole("BRANCH_ADMIN") === "branch_admin", "normalizeRole('BRANCH_ADMIN') === 'branch_admin'");
assert(normalizeRole("teacher") === "teacher", "normalizeRole('teacher') === 'teacher'");
assert(normalizeRole("student") === "student", "normalizeRole('student') === 'student'");
assert(normalizeRole("parent") === "parent", "normalizeRole('parent') === 'parent'");
assert(normalizeRole("") === "guest", "normalizeRole('') === 'guest'");
assert(normalizeRole(undefined) === "guest", "normalizeRole(undefined) === 'guest'");

assert(isOwner("owner") === true, "isOwner('owner') === true");
assert(isOwner("admin") === true, "isOwner('admin') === true");
assert(isOwner("branch_admin") === false, "isOwner('branch_admin') === false");

assert(isBranchAdmin("branch_admin") === true, "isBranchAdmin('branch_admin') === true");
assert(isBranchAdmin("branch") === true, "isBranchAdmin('branch') === true");
assert(isBranchAdmin("owner") === false, "isBranchAdmin('owner') === false");

assert(isAdmin("owner") === true, "isAdmin('owner') === true");
assert(isAdmin("branch_admin") === true, "isAdmin('branch_admin') === true");
assert(isAdmin("teacher") === false, "isAdmin('teacher') === false");

console.log("\n=================== 2. GENERAL PRINCIPLE: DEFAULT-DENY ===================");
// Unknown or unlisted permissions default to OWNER-ONLY
assert(can("owner", "custom_action" as any, "custom_resource" as any) === true, "Owner has access to unknown/unlisted permissions");
assert(can("branch_admin", "custom_action" as any, "custom_resource" as any) === false, "Branch admin defaults to DENIED for unknown/unlisted permissions");
assert(cannot("branch_admin", "custom_action" as any, "custom_resource" as any) === true, "cannot() returns true for denied permission");

console.log("\n=================== 3. HOMEPAGE ===================");
assert(can("owner", "view", "home") === true, "Owner can view homepage");
assert(can("branch_admin", "view", "home") === true, "Branch admin can view homepage");

console.log("\n=================== 4. TEACHERS & TEACHER PROFILE ===================");
// Both see list
assert(can("owner", "view", "teachers") === true, "Owner can view teachers list");
assert(can("branch_admin", "view", "teachers") === true, "Branch admin can view teachers list");

// Add teacher action is OWNER-ONLY
assert(can("owner", "create", "teachers") === true, "Owner can create teachers ('Add teacher')");
assert(can("branch_admin", "create", "teachers") === false, "Branch admin CANNOT create teachers ('Add teacher' is owner-only)");

// Branch admin gets restricted action set instead of full edit/delete
assert(can("owner", "update", "teachers") === true, "Owner can update teachers");
assert(can("branch_admin", "update", "teachers") === false, "Branch admin CANNOT update teachers");
assert(can("owner", "delete", "teachers") === true, "Owner can delete teachers");
assert(can("branch_admin", "delete", "teachers") === false, "Branch admin CANNOT delete teachers");
assert(can("branch_admin", "restricted_actions", "teachers") === true, "Branch admin CAN access restricted action set on teachers");

// Teacher profile page is OWNER-ONLY, not visible to branch admin at all
assert(can("owner", "view_profile", "teachers") === true, "Owner can view teacher profile");
assert(can("branch_admin", "view_profile", "teachers") === false, "Branch admin CANNOT view teacher profile");
assert(can("owner", "view", "teacher_profile") === true, "Owner can view teacher_profile resource");
assert(can("branch_admin", "view", "teacher_profile") === false, "Branch admin CANNOT view teacher_profile resource");

console.log("\n=================== 5. STUDENTS & STUDENT PROFILE ===================");
// Both roles, same page, same actions
assert(can("owner", "view", "students") === true, "Owner can view students list");
assert(can("branch_admin", "view", "students") === true, "Branch admin can view students list");
assert(can("owner", "create", "students") === true, "Owner can create students");
assert(can("branch_admin", "create", "students") === true, "Branch admin can create students");
assert(can("owner", "update", "students") === true, "Owner can update students");
assert(can("branch_admin", "update", "students") === true, "Branch admin can update students");
assert(can("owner", "delete", "students") === true, "Owner can delete students");
assert(can("branch_admin", "delete", "students") === true, "Branch admin can delete students");
// Student profile: both roles see it
assert(can("owner", "view", "student_profile") === true, "Owner can view student profile");
assert(can("branch_admin", "view", "student_profile") === true, "Branch admin can view student profile");
assert(can("owner", "view_profile", "students") === true, "Owner can view_profile on students");
assert(can("branch_admin", "view_profile", "students") === true, "Branch admin can view_profile on students");

console.log("\n=================== 6. PARENTS ===================");
assert(can("owner", "view", "parents") === true, "Owner can view parents");
assert(can("branch_admin", "view", "parents") === true, "Branch admin can view parents");
assert(can("owner", "create", "parents") === true, "Owner can create parents");
assert(can("branch_admin", "create", "parents") === true, "Branch admin can create parents");
assert(can("owner", "update", "parents") === true, "Owner can update parents");
assert(can("branch_admin", "update", "parents") === true, "Branch admin can update parents");
assert(can("owner", "delete", "parents") === true, "Owner can delete parents");
assert(can("branch_admin", "delete", "parents") === true, "Branch admin can delete parents");

console.log("\n=================== 7. SUBJECTS ===================");
// Both roles see list; ALL action buttons (add/edit/delete) are OWNER-ONLY. Branch admins get read-only view.
assert(can("owner", "view", "subjects") === true, "Owner can view subjects");
assert(can("branch_admin", "view", "subjects") === true, "Branch admin can view subjects");
assert(can("owner", "create", "subjects") === true, "Owner can create subjects");
assert(can("branch_admin", "create", "subjects") === false, "Branch admin CANNOT create subjects");
assert(can("owner", "update", "subjects") === true, "Owner can update subjects");
assert(can("branch_admin", "update", "subjects") === false, "Branch admin CANNOT update subjects");
assert(can("owner", "delete", "subjects") === true, "Owner can delete subjects");
assert(can("branch_admin", "delete", "subjects") === false, "Branch admin CANNOT delete subjects");

console.log("\n=================== 8. GROUPS (CLASSES) ===================");
// Both roles see list; ALL action buttons are OWNER-ONLY
assert(can("owner", "view", "groups") === true, "Owner can view groups");
assert(can("branch_admin", "view", "groups") === true, "Branch admin can view groups");
assert(can("owner", "view", "classes") === true, "Owner can view classes (alias)");
assert(can("branch_admin", "view", "classes") === true, "Branch admin can view classes (alias)");
assert(can("owner", "create", "groups") === true, "Owner can create groups");
assert(can("branch_admin", "create", "groups") === false, "Branch admin CANNOT create groups");
assert(can("owner", "update", "groups") === true, "Owner can update groups");
assert(can("branch_admin", "update", "groups") === false, "Branch admin CANNOT update groups");
assert(can("owner", "delete", "groups") === true, "Owner can delete groups");
assert(can("branch_admin", "delete", "groups") === false, "Branch admin CANNOT delete groups");

console.log("\n=================== 9. LESSONS / SCHEDULE ===================");
assert(can("owner", "view", "lessons") === true, "Owner can view lessons");
assert(can("branch_admin", "view", "lessons") === true, "Branch admin can view lessons");
assert(can("owner", "create", "lessons") === true, "Owner can create lessons");
assert(can("branch_admin", "create", "lessons") === true, "Branch admin can create lessons");
assert(can("owner", "update", "lessons") === true, "Owner can update lessons");
assert(can("branch_admin", "update", "lessons") === true, "Branch admin can update lessons");
assert(can("owner", "delete", "lessons") === true, "Owner can delete lessons");
assert(can("branch_admin", "delete", "lessons") === true, "Branch admin can delete lessons");
assert(can("owner", "filter_branches", "lessons") === true, "Owner can filter branches on lessons");
assert(can("branch_admin", "filter_branches", "lessons") === true, "Branch admin can filter branches on lessons");

console.log("\n=================== 10. ATTENDANCE & RECORDS ===================");
assert(can("owner", "view", "attendance") === true, "Owner can view attendance");
assert(can("branch_admin", "view", "attendance") === true, "Branch admin can view attendance");
assert(can("owner", "take", "attendance") === true, "Owner can take attendance");
assert(can("branch_admin", "take", "attendance") === true, "Branch admin can take attendance");
// Scoping: branch admin only sees own branch, owner has all-branches view
assert(can("owner", "view_all_branches", "attendance") === true, "Owner can view all branches for attendance");
assert(can("branch_admin", "view_all_branches", "attendance") === false, "Branch admin CANNOT view all branches for attendance");

console.log("\n=================== 11. PAYMENTS / VOUCHERS ===================");
assert(can("owner", "view", "payments") === true, "Owner can view payments");
assert(can("branch_admin", "view", "payments") === true, "Branch admin can view payments");
assert(can("owner", "create", "payments") === true, "Owner can create payments");
assert(can("branch_admin", "create", "payments") === true, "Branch admin can create payments");
assert(can("owner", "update", "payments") === true, "Owner can edit payments");
assert(can("branch_admin", "update", "payments") === true, "Branch admin can edit payments");
// Scoping & special actions:
assert(can("owner", "view_all_branches", "payments") === true, "Owner has all-school payments view");
assert(can("branch_admin", "view_all_branches", "payments") === false, "Branch admin does NOT have all-school payments view");
assert(can("owner", "filter_all_school", "payments") === true, "Owner can filter whole school on payments");
assert(can("branch_admin", "filter_all_school", "payments") === false, "Branch admin CANNOT filter whole school on payments");
assert(can("owner", "override_inscription_fee", "payments") === true, "Owner CAN override inscription fee");
assert(can("branch_admin", "override_inscription_fee", "payments") === false, "Branch admin CANNOT override inscription fee (OWNER-ONLY)");

console.log("\n=================== 12. ANNOUNCEMENTS, WORKSHOPS, FORMATIONS ===================");
assert(can("owner", "view", "announcements") === true, "Owner can view announcements");
assert(can("branch_admin", "view", "announcements") === true, "Branch admin can view announcements");
assert(can("branch_admin", "create", "announcements") === true, "Branch admin can create announcements");

assert(can("owner", "view", "workshops") === true, "Owner can view workshops");
assert(can("branch_admin", "view", "workshops") === true, "Branch admin can view workshops");
assert(can("branch_admin", "create", "workshops") === true, "Branch admin can create workshops");

assert(can("owner", "view", "formations") === true, "Owner can view formations");
assert(can("branch_admin", "view", "formations") === true, "Branch admin can view formations");
assert(can("branch_admin", "create", "formations") === true, "Branch admin can create formations");

console.log("\n=================== 13. FINANCE REPORT & PAYROLL ===================");
// OWNER-ONLY, not visible to branch admins at all
assert(can("owner", "view", "finance") === true, "Owner can view finance");
assert(can("branch_admin", "view", "finance") === false, "Branch admin CANNOT view finance");
assert(can("owner", "view", "reports") === true, "Owner can view reports");
assert(can("branch_admin", "view", "reports") === false, "Branch admin CANNOT view reports");
assert(can("owner", "view", "payroll") === true, "Owner can view payroll");
assert(can("branch_admin", "view", "payroll") === false, "Branch admin CANNOT view payroll");
assert(can("owner", "view", "revenue") === true, "Owner can view revenue");
assert(can("branch_admin", "view", "revenue") === false, "Branch admin CANNOT view revenue");
assert(can("branch_admin", "export", "finance") === false, "Branch admin CANNOT export finance");

console.log("\n=================== 14. NAVIGATION MENU VISIBILITY ===================");
assert(canAccessMenuItem("owner", "home") === true, "Menu: home visible to owner");
assert(canAccessMenuItem("branch_admin", "home") === true, "Menu: home visible to branch admin");
assert(canAccessMenuItem("branch_admin", "teachers") === true, "Menu: teachers visible to branch admin");
assert(canAccessMenuItem("branch_admin", "students") === true, "Menu: students visible to branch admin");
assert(canAccessMenuItem("branch_admin", "parents") === true, "Menu: parents visible to branch admin");
assert(canAccessMenuItem("branch_admin", "subjects") === true, "Menu: subjects visible to branch admin");
assert(canAccessMenuItem("branch_admin", "classes") === true, "Menu: classes visible to branch admin");
assert(canAccessMenuItem("branch_admin", "lessons") === true, "Menu: lessons visible to branch admin");
assert(canAccessMenuItem("branch_admin", "attendance") === true, "Menu: attendance visible to branch admin");
assert(canAccessMenuItem("branch_admin", "payments") === true, "Menu: payments visible to branch admin");
assert(canAccessMenuItem("branch_admin", "announcements") === true, "Menu: announcements visible to branch admin");
assert(canAccessMenuItem("branch_admin", "workshops") === true, "Menu: workshops visible to branch admin");
assert(canAccessMenuItem("branch_admin", "formations") === true, "Menu: formations visible to branch admin");

// Finance report + Payroll: page/nav item itself shouldn't appear for a branch admin
assert(canAccessMenuItem("owner", "finance") === true, "Menu: finance visible to owner");
assert(canAccessMenuItem("branch_admin", "finance") === false, "Menu: finance HIDDEN from branch admin");
assert(canAccessMenuItem("owner", "reports") === true, "Menu: reports visible to owner");
assert(canAccessMenuItem("branch_admin", "reports") === false, "Menu: reports HIDDEN from branch admin");
assert(canAccessMenuItem("owner", "payroll") === true, "Menu: payroll visible to owner");
assert(canAccessMenuItem("branch_admin", "payroll") === false, "Menu: payroll HIDDEN from branch admin");

console.log("\n=================== 15. ROUTE ACCESS / MIDDLEWARE CHECKS ===================");
// Branch admin blocked from finance and payroll routes
assert(canAccessRoute("owner", "/list/finance") === true, "Route: /list/finance allowed for owner");
assert(canAccessRoute("branch_admin", "/list/finance") === false, "Route: /list/finance blocked for branch admin");
assert(canAccessRoute("branch_admin", "/fr/list/finance") === false, "Route: /fr/list/finance blocked for branch admin");
assert(canAccessRoute("branch_admin", "/ar/list/finance") === false, "Route: /ar/list/finance blocked for branch admin");
assert(canAccessRoute("branch_admin", "/list/reports") === false, "Route: /list/reports blocked for branch admin");
assert(canAccessRoute("branch_admin", "/fr/list/reports") === false, "Route: /fr/list/reports blocked for branch admin");
assert(canAccessRoute("branch_admin", "/list/payroll") === false, "Route: /list/payroll blocked for branch admin");
assert(canAccessRoute("branch_admin", "/fr/list/payroll") === false, "Route: /fr/list/payroll blocked for branch admin");
assert(canAccessRoute("branch_admin", "/list/revenue") === false, "Route: /list/revenue blocked for branch admin");

// Teacher profile page is OWNER-ONLY
assert(canAccessRoute("owner", "/list/teachers/teacher-123") === true, "Route: /list/teachers/123 allowed for owner");
assert(canAccessRoute("branch_admin", "/list/teachers/teacher-123") === false, "Route: /list/teachers/123 blocked for branch admin");
assert(canAccessRoute("branch_admin", "/fr/list/teachers/teacher-123") === false, "Route: /fr/list/teachers/123 blocked for branch admin");

// Teacher list is accessible to both
assert(canAccessRoute("owner", "/list/teachers") === true, "Route: /list/teachers allowed for owner");
assert(canAccessRoute("branch_admin", "/list/teachers") === true, "Route: /list/teachers allowed for branch admin");

// Student profile is accessible to both
assert(canAccessRoute("owner", "/list/students/student-123") === true, "Route: /list/students/123 allowed for owner");
assert(canAccessRoute("branch_admin", "/list/students/student-123") === true, "Route: /list/students/123 allowed for branch admin");

console.log("\n=================== 16. UI ACTION STATE & AVAILABLE ACTIONS ===================");
const stateHide = getActionState("branch_admin", "create", "teachers", "hide");
assert(stateHide.allowed === false && stateHide.hidden === true && stateHide.disabled === false, "getActionState with 'hide' produces hidden: true");

const stateDisable = getActionState("branch_admin", "create", "teachers", "disable");
assert(stateDisable.allowed === false && stateDisable.hidden === false && stateDisable.disabled === true && typeof stateDisable.reason === "string", "getActionState with 'disable' produces disabled: true with Arabic reason");

const branchAdminTeacherActions = getAvailableActions("branch_admin", "teachers");
assert(branchAdminTeacherActions.includes("view"), "getAvailableActions includes 'view' for teachers");
assert(branchAdminTeacherActions.includes("restricted_actions"), "getAvailableActions includes 'restricted_actions' for teachers");
assert(!branchAdminTeacherActions.includes("create"), "getAvailableActions excludes 'create' for teachers on branch admin");

console.log("\n==================================================================");
if (failures === 0) {
  console.log("🎉 ALL PERMISSION TESTS PASSED PERFECTLY!");
  process.exit(0);
} else {
  console.error(`💥 ${failures} TEST(S) FAILED!`);
  process.exit(1);
}
