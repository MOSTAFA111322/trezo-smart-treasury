# Login and employee reactivation verification

- Preview URL checked: `https://3000-i0jus5clppx0hpm0qs6gw-b24296b2.us4.manus.computer/?from_webdev=1`
- Unauthenticated TREZO gate rendered in Arabic RTL with a visible `تسجيل الدخول` button.
- Clicking the button navigated to the Manus OAuth portal (`/app-auth`) for TREZO Smart Treasury.
- Manus portal rendered Google, Microsoft, Apple, email, and passkey options; the flow is a same-tab OAuth navigation, not a local username/password popup.
- No credentials were entered and no account data was changed.
- Internal employee reactivation still requires an authenticated admin session for interactive confirmation; the code path now exposes `تفعيل الموظف` for inactive employees and calls `employees.update` with `isActive: true`.
