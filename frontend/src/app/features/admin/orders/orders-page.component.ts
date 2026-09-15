import { Component, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { OrderService } from '../../../core/services/order.service';
import { AddOrderModalComponent } from './add-order-modal.component';
import { SimulateOrderModalComponent } from './simulate-order-modal.component';
import { OrderStatus } from '../../../core/models/order.model';

@Component({
  selector: 'app-orders-page',
  standalone: true,
  imports: [CommonModule, AddOrderModalComponent, SimulateOrderModalComponent],
  templateUrl: './orders-page.component.html',
  styleUrl: './orders-page.component.css'
})
export class OrdersPageComponent {
  showAddModal = signal(false);
  showSimulateModal = signal(false);

  constructor(public orderService: OrderService) {}

  badgeClass(status: OrderStatus): string {
    switch (status) {
      case 'รอจัดเส้นทาง': return 'badge badge-waiting';
      case 'จัดเส้นทางแล้ว': return 'badge badge-planned';
      case 'กำลังเตรียม': return 'badge badge-preparing';
      case 'ส่งสำเร็จ': return 'badge badge-done';
    }
  }

  deleteOrder(id: string) {
    this.orderService.deleteOrder(id);
  }
}
