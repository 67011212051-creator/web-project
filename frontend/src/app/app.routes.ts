import { Routes } from '@angular/router';
import { AdminLayoutComponent } from './layouts/admin-layout/admin-layout.component';

export const routes: Routes = [
  { path: '', redirectTo: 'admin/customers', pathMatch: 'full' },

  // ---- Admin flow (มี sidebar ซ้าย เชื่อมกันเองทุกหน้า) ----
  {
    path: 'admin',
    component: AdminLayoutComponent,
    children: [
      { path: '', redirectTo: 'customers', pathMatch: 'full' },
      {
        path: 'customers',
        loadComponent: () =>
          import('./features/admin/customers/customers-page.component').then(m => m.CustomersPageComponent)
      },
      {
        path: 'orders',
        loadComponent: () =>
          import('./features/admin/orders/orders-page.component').then(m => m.OrdersPageComponent)
      },
      {
        path: 'route-planning',
        loadComponent: () =>
          import('./features/admin/route-planning/route-planning-page.component').then(m => m.RoutePlanningPageComponent)
      }
    ]
  },

  // ---- Rider flow (มือถือ แยกอิสระ ไม่เชื่อมกับ admin) ----
  {
    path: 'rider',
    children: [
      { path: '', redirectTo: 'lookup', pathMatch: 'full' },
      {
        path: 'lookup',
        loadComponent: () =>
          import('./features/rider/job-lookup/job-lookup-page.component').then(m => m.JobLookupPageComponent)
      },
      {
        path: 'job/:jobCode',
        loadComponent: () =>
          import('./features/rider/job-detail/job-detail-page.component').then(m => m.JobDetailPageComponent)
      },
      {
        path: 'job/:jobCode/navigate/:stopId',
        loadComponent: () =>
          import('./features/rider/navigation/navigation-page.component').then(m => m.NavigationPageComponent)
      }
    ]
  },

  { path: '**', redirectTo: 'admin/customers' }
];
