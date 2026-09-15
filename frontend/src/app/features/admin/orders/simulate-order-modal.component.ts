import { Component, EventEmitter, Output, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { CustomerService } from '../../../core/services/customer.service';
import { OrderService } from '../../../core/services/order.service';

@Component({
  selector: 'app-simulate-order-modal',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './simulate-order-modal.component.html',
  styleUrl: './simulate-order-modal.component.css'
})
export class SimulateOrderModalComponent {
  @Output() close = new EventEmitter<void>();
  @Output() simulated = new EventEmitter<number>();

  constructor(private customerService: CustomerService, private orderService: OrderService) {}

  searchTerm = signal('');
  orderCount = signal(25);
  deadline = signal('12:30 น.');

  onStart() {
    const names = this.customerService.customers().map(c => c.name);
    const generated = this.orderService.addSimulatedOrders(this.orderCount(), names);
    this.simulated.emit(generated.length);
  }
}
