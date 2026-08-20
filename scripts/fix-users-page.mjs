import { readFile, writeFile } from "node:fs/promises";

const workspacePath = "client/src/pages/Workspace.tsx";
const homePath = "client/src/pages/Home.tsx";
const testPath = "client/src/pages/Workspace.test.tsx";

let workspace = await readFile(workspacePath, "utf8");
workspace = workspace.replace(
  "type WorkspaceProps = { active: string; onBack: () => void; onCreateRequest: () => void; isAdmin: boolean };",
  "type WorkspaceProps = { active: string; onBack: () => void; onCreateRequest: () => void; isAdmin?: boolean };"
);
workspace = workspace.replace(
  "export default function Workspace({ active, onBack, onCreateRequest, isAdmin }: WorkspaceProps) {",
  "export default function Workspace({ active, onBack, onCreateRequest, isAdmin = false }: WorkspaceProps) {"
);
const usersHeader = '{active === "users" && <div className="space-y-5"><div className="rounded-2xl border bg-card p-8"><ShieldCheck className="text-primary" size={28}/><h3 className="mt-4 font-display text-xl font-extrabold">المستخدم الحالي والصلاحيات</h3>';
const usersHeaderIndex = workspace.indexOf(usersHeader);
if (usersHeaderIndex < 0) throw new Error("users header not found");
const errorStart = workspace.indexOf('{currentUser.error ?', usersHeaderIndex);
const errorEnd = workspace.indexOf('</div>{currentUser.data?.role === "admin"', errorStart);
if (errorStart < 0 || errorEnd < 0) throw new Error("current user block not found");
const replacement = '<p className="mt-3 text-sm text-muted-foreground">تُدار صلاحيات هذه الصفحة من خلال جلسة الدخول الحالية. حالة مدير النظام: <span className="font-bold text-primary">{isAdmin ? "مفعّلة" : "غير مفعّلة"}</span></p></div>{isAdmin';
workspace = workspace.slice(0, errorStart) + replacement + workspace.slice(errorEnd + '</div>{currentUser.data?.role === "admin"'.length);
await writeFile(workspacePath, workspace);

let home = await readFile(homePath, "utf8");
if (!home.includes('isAdmin={user?.role === "admin"}')) throw new Error("Home prop not found");
await writeFile(homePath, home);

let test = await readFile(testPath, "utf8");
if (!test.includes("isAdmin")) await writeFile(testPath, test);
