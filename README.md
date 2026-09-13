# Home Interior Tracker v2

Static GitHub Pages app backed by Supabase.

## Added in this version
- Project Settings for owner/admin: name, location, start date, target date, project notes
- Manage areas/rooms: add, rename, delete unused area
- Clickable Dashboard cards and area progress links
- Quick filters: Pending With Me, Overdue, Upcoming, Completed
- Excel `.xlsx` export for filtered activities and Pending With Me
- Print-friendly Dashboard, Activities and Pending With Me views
- Owner is shown as Admin; owner can approve/reject users and set Editor/Viewer roles
- Explicit Supabase email confirmation redirect to GitHub Pages URL

Upload `index.html`, `app.js`, and `styles.css` to the repository root.

## Admin security (v3)
- Project admins can create another admin from Team & Access using an email address and temporary password.
- Newly created admins are email-confirmed by the secure Supabase Edge Function and are forced to change the temporary password on first login.
- Admins can reset another admin's password to a temporary password; the target admin must change it immediately after login.
- The login screen includes Forgot password, which uses Supabase's email recovery flow.
- There is deliberately no permanent master/bypass password. Keeping at least two admins plus working recovery email access prevents lockout without creating a backdoor.
