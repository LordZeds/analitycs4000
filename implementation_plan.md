# Authentication Implementation Plan

## Goal

Implement Supabase Authentication to protect the dashboard and provide a login interface.

## User Review Required

- **Credentials**: Ensure the provided credentials in `.env.local` are correct and have the necessary permissions.
- **Auth Method**: Assuming Email/Password login.

## Proposed Changes

### Supabase Helpers

Create utility functions to handle Supabase client creation in different contexts (Server, Client, Middleware).

#### [NEW] [server.ts](file:///d:/Apps/Analitycs/src/utils/supabase/server.ts)

#### [NEW] [client.ts](file:///d:/Apps/Analitycs/src/utils/supabase/client.ts)

#### [NEW] [middleware.ts](file:///d:/Apps/Analitycs/src/utils/supabase/middleware.ts)

### Middleware

Implement middleware to protect the `/dashboard` route.

#### [NEW] [middleware.ts](file:///d:/Apps/Analitycs/src/middleware.ts)

### Login Page

Create a login page with a form to authenticate users.

#### [NEW] [page.tsx](file:///d:/Apps/Analitycs/src/app/login/page.tsx)

#### [NEW] [actions.ts](file:///d:/Apps/Analitycs/src/app/login/actions.ts)

### Dashboard

Add a "Sign Out" button to the dashboard.

#### [MODIFY] [DashboardClient.tsx](file:///d:/Apps/Analitycs/src/components/dashboard/DashboardClient.tsx)

## Verification Plan

### Manual Verification

1. **Access Protection**: Try to access `/dashboard` without logging in. Should redirect to `/login`.
2. **Login**: Enter valid credentials on `/login`. Should redirect to `/dashboard`.
3. **Persistence**: Refresh the page on `/dashboard`. Should stay logged in.
4. **Sign Out**: Click "Sign Out". Should redirect to `/login`.
