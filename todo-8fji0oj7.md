# Project TODO

- [x] Review the current TREZO Smart Treasury implementation and identify the user's requested edit scope.
- [x] Implement the user's requested project changes.
- [x] Add or update automated tests for the implemented changes.
- [x] Save a delivery checkpoint for the verified updated experience.
- [x] Audit existing request lifecycle, dashboard calculations, empty states, and navigation behavior for high-impact improvements.
- [x] Improve the dashboard so its financial activity visualization and recent-request area derive from live treasury data.
- [x] Strengthen the request workflow with visible validation feedback, loading feedback, and user-safe error handling.
- [x] Improve workspace navigation and mobile interaction feedback for unfinished or unavailable sections.
- [x] Add targeted Vitest coverage for the new dashboard and request-workflow behavior.
- [x] Run type checks, automated tests, and responsive visual verification before delivery.
- [x] Fix multi-currency dashboard presentation so no visual or total incorrectly aggregates values under one currency label.
- [x] Add explicit feedback when a workspace section has no available data or configuration prerequisites.
- [x] Restore the request modal's true amount-in-words preview so its label and output remain consistent.
- [x] Add explicit feedback for unavailable workspace actions beyond calendar prerequisites, then re-validate navigation feedback.
- [x] Add component-level tests for the dashboard data presentation, request confirmation, empty-state CTA, and attachment feedback.
- [x] Add workflow component tests for the empty-state call to action, confirmation transition, and invalid attachment feedback.
- [x] Audit the latest checkpoint and identify the highest-value remaining treasury workflow gap.
- [x] Implement an exchange-rate readiness improvement so users can clearly act when a unified total lacks a required conversion rate.
- [x] Improve the selected operational workspace flow with clear, responsive feedback and no dead-end actions.
- [x] Make the dashboard unified-total warning directly navigate to exchange-rate settings and cover the handoff with a focused test.
- [x] Add and run focused Vitest coverage plus desktop and mobile verification for the new improvement set.
- [x] Save a delivery checkpoint for the continued improvement pass.
- [x] Visually verify the exchange-rate readiness banner and prefilling action in workspace settings on desktop and mobile.

- [x] Visually exercise the missing-rate handoff from the dashboard into workspace settings and confirm the readiness banner and exchange-rate action are visible on desktop.
- [x] Repeat the missing-rate handoff verification on a mobile viewport and capture the readiness banner and exchange-rate action state.
- [x] Prevent unsafe guessed exchange-rate pairs when an incomplete unified total has no named missing currency; show a prefilled correction action only for an actionable named currency.
- [x] Carry a named missing currency from the dashboard into settings and prefill its exchange-rate pair for correction.
- [x] Confirm the manual exchange-rate entry approach.
- [x] Confirm the daily owner-notification delivery method for overdue requests.
- [x] Add durable manual exchange-rate attribution and approval metadata without overwriting prior approved rates.
- [x] Add a scheduled, idempotent overdue-request alert workflow with visible delivery outcomes.
- [x] Configure the approved daily owner-alert job after deployment, using an explicit schedule and an idempotent callback.
- [x] Add exportable financial reports filtered by company and fiscal year.
- [x] Add focused tests and responsive verification for exchange rates, alerts, and report exports.
- [x] Save a delivery checkpoint for the treasury operations upgrade.
- [x] Add explicit approval status, approver, approval timestamp, and optional approval note to newly entered manual exchange-rate records, with tests.
- [x] Add notification-history visibility and an idempotent retry control for failed overdue alerts.
- [x] Add second-user approval workflow for manual exchange-rate records, including approval guards and audit metadata.
- [x] Add PDF export for filtered financial reports while preserving CSV export.
- [x] Validate the built-in notification configuration flag with a focused Vitest test.
- [x] Run full tests, type checks, and responsive visual verification for the three enhancements.
- [x] Save a delivery checkpoint for the three enhancements.

- [x] إضافة لوحة مؤشرات تشغيلية لصحة الإشعارات ومحاولات الإعادة ومعدلات الفشل.
- [x] إضافة تنبيهات واضحة لأسعار الصرف المعلقة مع ملخص حالات المراجعة والاعتماد.
- [x] تحسين التقارير الرسمية بإضافة ملخصات إجمالية وترويسة اعتماد ومعلومات نطاق التصفية.
- [x] تأكيد مركز التدقيق الموجود وربطه بإجراءات الاعتماد وإعادة الإرسال والتصدير في واجهة العمل.
- [x] تعزيز اختبارات التحسينات الجديدة والتحقق المتجاوب قبل إصدار checkpoint جديد.
- [x] حفظ checkpoint جديد بعد اكتمال حزمة المقترحات.

- [x] إضافة ترويسة اعتماد رسمية واضحة داخل PDF وواجهة التقارير، مع نطاق التصفية وبيانات الإنشاء والاعتماد، ثم تغطيتها باختبار.
- [x] ربط اعتماد سعر الصرف وإعادة إرسال التنبيه وتصدير التقرير بسجل التدقيق وعرضها في مركز التدقيق.
- [x] إضافة اختبارات UI/خادم خاصة بمؤشرات الإشعارات وملخصات أسعار الصرف والتقارير، ثم تنفيذ تحقق بصري متجاوب جديد.

- [x] إضافة مرشحات بحث وإجراء وزمن إلى مركز التدقيق مع حالات فارغة واضحة.
- [x] إضافة حماية تشغيلية لتصدير التقارير تشمل منع التصدير المتزامن ورسالة فشل قابلة للإعادة.
- [x] تحسين قائمة الاعتمادات والتنبيهات بإبراز العناصر التي تحتاج إجراءً فورياً.
- [x] إضافة اختبارات للحزمة الجديدة والتحقق البصري على سطح المكتب والهاتف.
- [x] حفظ checkpoint جديد بعد اكتمال المقترحات الجديدة.

- [x] إضافة حالة فارغة صريحة عندما لا تطابق نتائج التدقيق المرشحات أو البحث.
- [x] إبراز العناصر العاجلة مباشرة في لوحات الاعتمادات والتنبيهات مع دليل بصري واضح.
- [x] إضافة اختبارات موجهة لسلوك مرشحات التدقيق وحماية التصدير وحالة الخطأ القابلة للإعادة.

- [x] إضافة اختبار UI مركز لمرشحات التدقيق وحالة عدم وجود نتائج مطابقة.
- [x] إضافة اختبار موجه لمنع التصدير المتزامن ورسالة خطأ التصدير القابلة لإعادة المحاولة.
