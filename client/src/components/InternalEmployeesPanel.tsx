import { useState } from "react";
import { trpc } from "@/lib/trpc";

const roleLabels = { accountant: "محاسب", reviewer: "مراجع", cfo: "مدير مالي", gm: "مدير عام", auditor: "مدقق" } as const;
type OperationalRole = keyof typeof roleLabels;
type EmployeeForm = { employeeNo: string; fullName: string; department: string; jobTitle: string; phone: string; operationalRole: OperationalRole };
const emptyForm: EmployeeForm = { employeeNo: "", fullName: "", department: "", jobTitle: "", phone: "", operationalRole: "accountant" };

export function InternalEmployeesPanel() {
  const [form, setForm] = useState<EmployeeForm>(emptyForm);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [message, setMessage] = useState("");
  const employees = trpc.employees.list.useQuery();
  const createEmployee = trpc.employees.create.useMutation({ onSuccess: () => { setForm(emptyForm); setMessage("تمت إضافة الموظف إلى السجل الداخلي."); void employees.refetch(); }, onError: (error) => setMessage(`تعذر الحفظ: ${error.message}`) });
  const updateEmployee = trpc.employees.update.useMutation({ onSuccess: () => { setEditingId(null); setForm(emptyForm); setMessage("تم تحديث بيانات الموظف."); void employees.refetch(); }, onError: (error) => setMessage(`تعذر التحديث: ${error.message}`) });
  const submit = () => {
    if (editingId) updateEmployee.mutate({ id: editingId, ...form, isActive: employees.data?.find((employee) => employee.id === editingId)?.isActive ?? true });
    else createEmployee.mutate(form);
  };
  const edit = (employee: NonNullable<typeof employees.data>[number]) => { setEditingId(employee.id); setForm({ employeeNo: employee.employeeNo, fullName: employee.fullName, department: employee.department ?? "", jobTitle: employee.jobTitle ?? "", phone: employee.phone ?? "", operationalRole: employee.operationalRole as OperationalRole }); setMessage(""); };
  const deactivate = (employee: NonNullable<typeof employees.data>[number]) => updateEmployee.mutate({ id: employee.id, employeeNo: employee.employeeNo, fullName: employee.fullName, department: employee.department ?? undefined, jobTitle: employee.jobTitle ?? undefined, phone: employee.phone ?? undefined, operationalRole: employee.operationalRole as OperationalRole, isActive: false });
  const setField = (field: keyof EmployeeForm, value: string) => setForm((current) => ({ ...current, [field]: value }));
  return <section className="space-y-5 rounded-2xl border bg-card p-5">
    <div><h3 className="font-display text-lg font-extrabold">سجل الموظفين الداخلي</h3><p className="mt-1 text-sm leading-6 text-muted-foreground">أضف أسماء الموظفين وأرقامهم الوظيفية بدون بريد إلكتروني. هذا السجل للتنظيم وتعيين الدور، ولا ينشئ حساب دخول تلقائياً.</p></div>
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      <input value={form.employeeNo} onChange={(event) => setField("employeeNo", event.target.value)} placeholder="الرقم الوظيفي *" className="rounded-xl border bg-background px-3 py-2 text-sm" />
      <input value={form.fullName} onChange={(event) => setField("fullName", event.target.value)} placeholder="اسم الموظف *" className="rounded-xl border bg-background px-3 py-2 text-sm" />
      <input value={form.department} onChange={(event) => setField("department", event.target.value)} placeholder="القسم" className="rounded-xl border bg-background px-3 py-2 text-sm" />
      <input value={form.jobTitle} onChange={(event) => setField("jobTitle", event.target.value)} placeholder="المسمى الوظيفي" className="rounded-xl border bg-background px-3 py-2 text-sm" />
      <input value={form.phone} onChange={(event) => setField("phone", event.target.value)} placeholder="رقم الهاتف (اختياري)" className="rounded-xl border bg-background px-3 py-2 text-sm" />
      <select value={form.operationalRole} onChange={(event) => setField("operationalRole", event.target.value)} className="rounded-xl border bg-background px-3 py-2 text-sm">{Object.entries(roleLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
    </div>
    <div className="flex flex-wrap gap-2"><button type="button" onClick={submit} disabled={createEmployee.isPending || updateEmployee.isPending || !form.employeeNo.trim() || !form.fullName.trim()} className="rounded-xl bg-primary px-4 py-2 text-sm font-bold text-primary-foreground">{editingId ? "حفظ التعديل" : "إضافة الموظف"}</button>{editingId ? <button type="button" onClick={() => { setEditingId(null); setForm(emptyForm); }} className="rounded-xl border px-4 py-2 text-sm font-bold">إلغاء</button> : null}</div>
    {message ? <p className="text-sm font-semibold text-primary">{message}</p> : null}
    {employees.isLoading ? <p className="text-sm text-muted-foreground">جارٍ تحميل سجل الموظفين…</p> : employees.error ? <p className="text-sm text-destructive">تعذر تحميل سجل الموظفين: {employees.error.message}</p> : employees.data?.length ? <div className="divide-y rounded-xl border">{employees.data.map((employee) => <div key={employee.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between"><div><p className="font-bold">{employee.fullName} <span className="text-xs font-normal text-muted-foreground">({employee.employeeNo})</span></p><p className="text-xs text-muted-foreground">{[employee.department, employee.jobTitle, employee.phone].filter(Boolean).join(" · ") || "بيانات وظيفية غير مكتملة"}</p><p className="mt-1 text-xs font-semibold text-primary">{roleLabels[employee.operationalRole as OperationalRole]} · {employee.isActive ? "نشط" : "غير نشط"}</p></div><div className="flex flex-wrap gap-2"><button type="button" onClick={() => edit(employee)} className="rounded-lg border px-3 py-1.5 text-xs font-bold">تعديل</button>{employee.isActive ? <button type="button" onClick={() => deactivate(employee)} className="rounded-lg border border-destructive/40 px-3 py-1.5 text-xs font-bold text-destructive">تعطيل</button> : null}</div></div>)}</div> : <div className="rounded-xl bg-secondary p-4 text-sm text-muted-foreground">لا يوجد موظفون مضافون بعد. ابدأ بإضافة أول موظف بالرقم الوظيفي والاسم.</div>}
  </section>;
}
