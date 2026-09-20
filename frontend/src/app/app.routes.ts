import { Routes } from '@angular/router';
import { CustomersComponent } from './pages/customers/customers.component';
import { OrdersComponent } from './pages/orders/orders.component';
import { RoutePlanningComponent } from './pages/route-planning/route-planning.component';
import { RiderJobComponent } from './pages/rider-job/rider-job.component';

export const routes: Routes = [
  { path: '', redirectTo: 'customers', pathMatch: 'full' },
  { path: 'customers', component: CustomersComponent, data: { title: 'ลูกค้า' } },
  { path: 'orders', component: OrdersComponent, data: { title: 'ออเดอร์' } },
  { path: 'route-planning', component: RoutePlanningComponent, data: { title: 'จัดเส้นทาง' } },
  { path: 'rider', component: RiderJobComponent, data: { hideLayout: true } },
  { path: '**', redirectTo: 'customers' },
];
