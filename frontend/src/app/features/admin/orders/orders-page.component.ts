import { Component, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { OrderService } from '../../../core/services/order.service';
import { AddOrderModalComponent } from './add-order-modal.component';
import { SimulateOrderModalComponent } from './simulate-order-modal.component';

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

  deleteOrder(id: string) {
    this.orderService.deleteOrder(id);
  }
}
