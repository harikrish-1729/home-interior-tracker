# Home Interior Tracker

A mobile-friendly shared interior-progress tracker backed by Supabase.

## Included
- Email/password authentication
- Project setup with default areas: Kitchen, Bedroom 1, Bedroom 2, Bathroom 1, Bathroom 2, Hall, Balcony
- Activities with status, expected date, actual completion, remarks, pending-with-me and pending details
- Dashboard with overall progress, room progress, overdue work, pending actions, upcoming deadlines and recent updates
- Shared invite code
- Owner approval for collaborators
- Editor and Viewer roles
- Supabase Row Level Security

## Run locally
Because the app uses ES modules, serve the folder rather than opening index.html directly.

Python:
`python -m http.server 8080`

Then open http://localhost:8080

## Deploy
This is a static website. You can deploy the folder as-is to GitHub Pages, Netlify, Cloudflare Pages, Vercel or any static web host.

No private Supabase secret is included. The browser uses the project publishable key; access is protected by Supabase Auth and RLS.

## First use
1. Open the deployed site.
2. Choose Create account.
3. Confirm the email if Supabase email confirmation is enabled.
4. Sign in.
5. Choose Create Project. The seven default areas are created automatically.
6. Add activities.
7. Share the invite code from Team & Access with collaborators.
8. Collaborators create their own account, enter the invite code and request access.
9. Approve them from Team & Access.
